const crypto = require('node:crypto');
const { put, del, list } = require('@vercel/blob');

/**
 * YUVA — Studio Gallery API
 *
 * Routes (single serverless function):
 *   GET    /api/gallery                      → public list of gallery items
 *   POST   /api/gallery  {action:'login'}    → admin login, returns signed token
 *   POST   /api/gallery  {images:[...]}      → admin-only upload
 *   DELETE /api/gallery?id=<id>              → admin-only delete
 *
 * Storage : Vercel Blob (public read, server-side write only)
 * Metadata: single JSON blob at gallery/metadata.json
 * Secrets : GALLERY_ADMIN_PASSWORD, GALLERY_ADMIN_SECRET, BLOB_READ_WRITE_TOKEN
 *           All read from server-side env. Never sent to the client.
 */
const METADATA_PATH = 'gallery/metadata.json';
const MEDIA_PREFIX = 'gallery/media/';
const THUMB_PREFIX = 'gallery/thumbs/';

// Client resizes/compresses before upload, so a decoded image should stay well
// under this. Keeps us clear of the platform request-body ceiling.
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;
const MAX_IMAGES_PER_REQUEST = 20;
const MAX_BATCH_BYTES = 5 * 1024 * 1024;

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const UPLOAD_WINDOW_MS = 60 * 1000;
const UPLOAD_MAX_REQUESTS = 30;

const loginHits = new Map();
const uploadHits = new Map();

/* ------------------------------------------------------------------ utils */

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (str) => {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
};

function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    'unknown'
  );
}

function hit(map, ip, windowMs, max) {
  const now = Date.now();
  const recent = (map.get(ip) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    map.set(ip, recent);
    return true;
  }
  recent.push(now);
  map.set(ip, recent);
  if (map.size > 20000) {
    for (const [key, times] of map) {
      if (!times.length || now - times[times.length - 1] >= windowMs) map.delete(key);
    }
  }
  return false;
}

/* ------------------------------------------------------------------ blob */

/**
 * Vercel Blob credentials.
 *
 * The SDK's own resolution order (resolveBlobAuth) is:
 *   options.token -> BLOB_STORE_ID/VERCEL_OIDC_TOKEN (OIDC) -> BLOB_READ_WRITE_TOKEN
 *
 * The OIDC branch only engages when a store id is available, so a project that
 * has VERCEL_OIDC_TOKEN but no BLOB_STORE_ID silently falls through to the
 * read-write token. When that token is stale or belongs to a different store,
 * the Blob API answers `forbidden` ("Access denied, please provide a valid
 * token for this resource").
 *
 * For a store connected to this project we therefore pass the OIDC token and
 * store id explicitly, so the project connection is used instead of the
 * read-write token. Both names are official and are read by the SDK itself
 * (BLOB_STORE_ID in resolveBlobAuth, VERCEL_OIDC_TOKEN via @vercel/oidc).
 * When either is absent this returns {}, and the SDK falls back to its default
 * behaviour unchanged.
 */
function blobAuth() {
  const oidcToken = (process.env.VERCEL_OIDC_TOKEN || '').trim();
  const storeId = (process.env.BLOB_STORE_ID || '').trim();
  if (oidcToken && storeId) {
    return { oidcToken, storeId };
  }
  return {};
}

const hasBlobCredentials = () => Object.keys(blobAuth()).length === 2 || !!process.env.BLOB_READ_WRITE_TOKEN;

function configError() {
  const missing = [];
  if (!hasBlobCredentials()) missing.push('BLOB_READ_WRITE_TOKEN or VERCEL_OIDC_TOKEN+BLOB_STORE_ID');
  if (!process.env.GALLERY_ADMIN_PASSWORD) missing.push('GALLERY_ADMIN_PASSWORD');
  if (!process.env.GALLERY_ADMIN_SECRET) missing.push('GALLERY_ADMIN_SECRET');
  return missing;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/* ------------------------------------------------------------------- auth */

function signToken() {
  const payload = b64url(
    JSON.stringify({ iat: Date.now(), exp: Date.now() + TOKEN_TTL_MS, scope: 'gallery:admin' })
  );
  const mac = b64url(
    crypto.createHmac('sha256', process.env.GALLERY_ADMIN_SECRET).update(payload).digest()
  );
  return { token: `${payload}.${mac}`, expiresAt: Date.now() + TOKEN_TTL_MS };
}

function verifyToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return false;

  const token = header.slice(7).trim();
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;

  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  const expected = crypto
    .createHmac('sha256', process.env.GALLERY_ADMIN_SECRET)
    .update(payload)
    .digest();

  let provided;
  try {
    provided = fromB64url(mac);
  } catch {
    return false;
  }

  if (provided.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(provided, expected)) return false;

  try {
    const claims = JSON.parse(fromB64url(payload).toString('utf8'));
    return claims.scope === 'gallery:admin' && typeof claims.exp === 'number' && claims.exp > Date.now();
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- metadata */

// Read-modify-write on the metadata blob is serialized in-process so two
// concurrent uploads cannot clobber each other's records.
let writeChain = Promise.resolve();
function serialize(task) {
  const run = writeChain.then(task, task);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readMetadata() {
  try {
    const { blobs } = await list({ prefix: METADATA_PATH, limit: 1, ...blobAuth() });
    const blob = blobs.find((b) => b.pathname === METADATA_PATH);
    if (!blob) return [];
    const res = await fetch(blob.url, { cache: 'no-store' });
    if (!res.ok) return [];
    const parsed = await res.json();
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('readMetadata failed:', err && err.message);
    return [];
  }
}

function writeMetadata(items) {
  return put(METADATA_PATH, JSON.stringify(items, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    ...blobAuth(),
  });
}

const publicView = (item) => ({
  id: item.id,
  media_url: item.media_url,
  thumbnail_url: item.thumbnail_url,
  media_type: item.media_type,
  uploaded_at: item.uploaded_at,
  width: item.width,
  height: item.height,
  size_bytes: item.size_bytes,
});

/** Blob pathnames are stored on the record so deletion never has to parse URLs. */
const blobPaths = (item) => [item.full_path, item.thumb_path].filter(Boolean);

/* ------------------------------------------------------------ image input */

function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  let buf;
  try {
    buf = Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
  if (!buf.length) return null;
  return { buffer: buf, type: match[1] === 'jpg' ? 'jpeg' : match[1] };
}

/* ----------------------------------------------------------------- handler */

async function handleList(res) {
  const items = await readMetadata();
  items.sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
  return res.status(200).json({ success: true, count: items.length, items: items.map(publicView) });
}

async function handleLogin(req, res) {
  const ip = clientIp(req);
  if (hit(loginHits, ip, LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS)) {
    return res.status(429).json({
      success: false,
      message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
    });
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const expected = process.env.GALLERY_ADMIN_PASSWORD || '';
  const given = Buffer.from(password, 'utf8');
  const want = Buffer.from(expected, 'utf8');

  // Length check first: timingSafeEqual throws on mismatched lengths.
  const ok = given.length === want.length && crypto.timingSafeEqual(given, want);
  if (!ok) {
    return res.status(401).json({ success: false, message: 'Incorrect admin password.' });
  }

  return res.status(200).json({ success: true, ...signToken() });
}

async function handleUpload(req, res) {
  const ip = clientIp(req);
  if (hit(uploadHits, ip, UPLOAD_WINDOW_MS, UPLOAD_MAX_REQUESTS)) {
    return res.status(429).json({
      success: false,
      message: 'Too many uploads from this device. Please wait a moment and try again.',
    });
  }

  const images = Array.isArray(req.body?.images) ? req.body.images : [];
  if (!images.length) {
    return res.status(400).json({ success: false, message: 'No images were provided.' });
  }
  if (images.length > MAX_IMAGES_PER_REQUEST) {
    return res.status(400).json({
      success: false,
      message: `Too many images in one request. Maximum ${MAX_IMAGES_PER_REQUEST}.`,
    });
  }

  const decoded = [];
  let batchBytes = 0;

  for (const entry of images) {
    const full = decodeDataUrl(entry?.full);
    const thumb = decodeDataUrl(entry?.thumb);

    if (!full) {
      return res.status(400).json({
        success: false,
        message: 'One or more images were not in a supported format (JPEG, PNG or WebP).',
      });
    }
    if (full.buffer.length > MAX_IMAGE_BYTES) {
      return res.status(413).json({
        success: false,
        message: 'An image was too large after optimization. Please try a smaller photo.',
      });
    }
    batchBytes += full.buffer.length + (thumb ? thumb.buffer.length : 0);
    if (batchBytes > MAX_BATCH_BYTES) {
      return res.status(413).json({
        success: false,
        message: 'This batch is too large. Please upload fewer photos at a time.',
      });
    }
    decoded.push({ full, thumb });
  }

  const created = await serialize(async () => {
    const existing = await readMetadata();
    const now = new Date().toISOString();
    const added = [];

    for (const { full, thumb } of decoded) {
      const id = `g_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
      const ext = full.type === 'jpeg' ? 'jpg' : full.type;
      const fullPath = `${MEDIA_PREFIX}${id}.${ext}`;
      const thumbPath = `${THUMB_PREFIX}${id}.jpg`;

      const fullBlob = await put(fullPath, full.buffer, {
        access: 'public',
        contentType: `image/${full.type}`,
        addRandomSuffix: false,
        cacheControlMaxAge: 31536000,
        ...blobAuth(),
      });

      let thumbUrl = fullBlob.url;
      if (thumb) {
        const thumbBlob = await put(thumbPath, thumb.buffer, {
          access: 'public',
          contentType: 'image/jpeg',
          addRandomSuffix: false,
          cacheControlMaxAge: 31536000,
          ...blobAuth(),
        });
        thumbUrl = thumbBlob.url;
      }

      const record = {
        id,
        media_url: fullBlob.url,
        thumbnail_url: thumbUrl,
        media_type: 'image',
        uploaded_at: now,
        uploaded_by: 'admin',
        width: Number(req.body.images[added.length]?.width) || null,
        height: Number(req.body.images[added.length]?.height) || null,
        size_bytes: full.buffer.length,
        full_path: fullPath,
        thumb_path: thumb ? thumbPath : null,
      };
      existing.push(record);
      added.push(record);
    }

    await writeMetadata(existing);
    return added;
  });

  return res.status(201).json({ success: true, count: created.length, items: created.map(publicView) });
}

async function handleDelete(req, res) {
  const id = typeof req.query?.id === 'string' ? req.query.id : '';
  if (!/^g_[a-z0-9]+_[a-f0-9]{12}$/.test(id)) {
    return res.status(400).json({ success: false, message: 'Invalid gallery item id.' });
  }

  const removed = await serialize(async () => {
    const existing = await readMetadata();
    const index = existing.findIndex((item) => item.id === id);
    if (index === -1) return null;

    const [record] = existing.splice(index, 1);

    // Remove metadata record even if blob cleanup fails, so the gallery never
    // keeps a reference to a file that is already gone.
    await writeMetadata(existing);

    for (const pathname of blobPaths(record)) {
      try {
        await del(pathname, blobAuth());
      } catch (err) {
        console.error('blob delete failed for', pathname, err && err.message);
      }
    }
    return record;
  });

  if (!removed) {
    return res.status(404).json({ success: false, message: 'That gallery item no longer exists.' });
  }
  return res.status(200).json({ success: true, id: removed.id });
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const missing = configError();
  if (missing.length) {
    console.error('Gallery API missing env vars:', missing.join(', '));
    return res.status(503).json({
      success: false,
      message: 'Studio Gallery is not configured yet. Please try again later.',
    });
  }

  try {
    if (req.method === 'GET') {
      return await handleList(res);
    }

    if (req.method === 'POST') {
      if (req.body?.action === 'login') {
        return await handleLogin(req, res);
      }
      if (!verifyToken(req)) {
        return res.status(401).json({ success: false, message: 'Admin session expired. Please sign in again.' });
      }
      return await handleUpload(req, res);
    }

    if (req.method === 'DELETE') {
      if (!verifyToken(req)) {
        return res.status(401).json({ success: false, message: 'Admin session expired. Please sign in again.' });
      }
      return await handleDelete(req, res);
    }

    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  } catch (err) {
    // Log which Blob auth path was in use: a `forbidden` ("Access denied") on the
    // readWrite path means the read-write token is not valid for this store, and a
    // different message means OIDC was used but rejected for this environment.
    console.error(
      'Gallery API error:',
      err && err.message,
      '| blob auth:',
      hasBlobCredentials() && Object.keys(blobAuth()).length === 2 ? 'oidc' : 'readWrite'
    );
    return res.status(500).json({
      success: false,
      message: 'Something went wrong on the server. Please try again.',
    });
  }
};
