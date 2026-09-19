const fetch = require('node-fetch');

const FRANCHISE_TELEGRAM_BOT_TOKEN = process.env.FRANCHISE_TELEGRAM_BOT_TOKEN;
const FRANCHISE_TELEGRAM_CHAT_ID = process.env.FRANCHISE_TELEGRAM_CHAT_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_RECIPIENT_NUMBER = process.env.WHATSAPP_RECIPIENT_NUMBER;

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 5;
const OUTBOUND_TIMEOUT_MS = 10 * 1000;
const rateHits = new Map();

const validateEnv = () => {
  const missing = [];
  if (!FRANCHISE_TELEGRAM_BOT_TOKEN) missing.push('FRANCHISE_TELEGRAM_BOT_TOKEN');
  if (!FRANCHISE_TELEGRAM_CHAT_ID) missing.push('FRANCHISE_TELEGRAM_CHAT_ID');

  // WhatsApp Cloud API is OPTIONAL. If its credentials are absent, delivery
  // is simply skipped — Telegram still works and the handler still responds.
  if (!WHATSAPP_ACCESS_TOKEN) console.warn('WHATSAPP_ACCESS_TOKEN not set; WhatsApp delivery skipped.');
  if (!WHATSAPP_PHONE_NUMBER_ID) console.warn('WHATSAPP_PHONE_NUMBER_ID not set; WhatsApp delivery skipped.');
  if (!WHATSAPP_RECIPIENT_NUMBER) console.warn('WHATSAPP_RECIPIENT_NUMBER not set; WhatsApp delivery skipped.');

  if (missing.length > 0) {
    console.error('Missing environment variables:', missing.join(', '));
    return false;
  }
  return true;
};

const str = (v) => (typeof v === 'string' ? v.trim() : '');

function isRateLimited(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.headers['x-real-ip'] || 'unknown';
  const now = Date.now();
  const recent = (rateHits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    rateHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateHits.set(ip, recent);
  if (rateHits.size > 20000) {
    for (const [k, times] of rateHits) {
      if (!times.length || now - times[times.length - 1] >= RATE_WINDOW_MS) rateHits.delete(k);
    }
  }
  return false;
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function sendToTelegram(data) {
  const text = `
YUVA FITNESS — NEW FRANCHISE ENQUIRY

👤 Applicant:
${data.fullName}
📱 Phone: ${data.phone}
📧 Email: ${data.email}

🏙️ City: ${data.city}
📍 Area: ${data.area}
💰 Budget: ${data.budget}
📐 Space: ${data.space}
🏠 Property: ${data.property}
🗓️ Timeline: ${data.timeline}

💬 Message:
${data.message || '-'}

────────────────────
Submitted from: Franchise Enquiry — YUVA Website
  `.trim();

  const response = await fetchWithTimeout(
    `https://api.telegram.org/bot${FRANCHISE_TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: FRANCHISE_TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    },
    OUTBOUND_TIMEOUT_MS
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const safe = new Error('Telegram API error');
    safe.name = 'TelegramHttpError';
    safe.httpStatus = response.status;
    safe.telegramDescription = err && err.description ? err.description : '';
    safe.telegramErrorCode = err && err.error_code ? err.error_code : '';
    console.error('TELEGRAM_DELIVERY_ERROR: status=' + response.status + ' description=' + JSON.stringify(safe.telegramDescription) + ' errorCode=' + safe.telegramErrorCode);
    throw safe;
  }
  return response.json();
}

async function sendToWhatsApp(data) {
  const bodyText = `New Franchise Enquiry: ${data.fullName} | ${data.phone} | ${data.city} - ${data.area} | Budget ${data.budget} | Space ${data.space} | ${data.property} | ${data.timeline}`;
  const templateData = {
    messaging_product: 'whatsapp',
    to: WHATSAPP_RECIPIENT_NUMBER,
    type: 'template',
    template: {
      name: 'new_gym_enquiry',
      language: { code: 'en' },
      components: [{ type: 'body', parameters: [
        { type: 'text', text: data.fullName },
        { type: 'text', text: data.phone },
        { type: 'text', text: data.email },
        { type: 'text', text: `${data.city} - ${data.area}` },
        { type: 'text', text: bodyText.slice(0, 800) },
      ]}],
    },
  };
  const response = await fetchWithTimeout(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(templateData),
    },
    OUTBOUND_TIMEOUT_MS
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`WhatsApp API error: ${JSON.stringify(err)}`);
  }
  return response.json();
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  if (isRateLimited(req)) {
    return res.status(429).json({
      success: false,
      message: 'Too many submissions from this device. Please wait a moment and try again.',
    });
  }

  if (!validateEnv()) {
    return res.status(500).json({ success: false, message: 'Server configuration error.' });
  }

  try {
    const body = req.body || {};
    const website = str(body.website);

    // Honeypot: pretend success, do no work.
    if (website !== '') {
      return res.status(200).json({ success: true, message: 'Thank you! Your franchise enquiry has been received.' });
    }

    const fullName = str(body.fullName);
    const phone = str(body.phone);
    const email = str(body.email);
    const city = str(body.city);
    const area = str(body.area);
    const budget = str(body.budget);
    const space = str(body.space);
    const property = str(body.property);
    const timeline = str(body.timeline);
    const message = str(body.message);

    const errors = [];
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneDigits = phone.replace(/[\s\-\(\)]/g, '');
    const normalized = phoneDigits.replace(/^\+91/, '').replace(/^0/, '');
    const phoneOk = /^[6-9]\d{9}$/.test(normalized) && phoneDigits.replace(/\D/g, '').length >= 10;

    if (fullName.length < 2) errors.push('Full Name is required.');
    if (fullName.length > 100) errors.push('Full Name must be less than 100 characters.');
    if (!phone || !phoneOk) errors.push('Valid Indian phone number is required.');
    if (!email || !emailRe.test(email)) errors.push('Valid email is required.');
    if (email.length > 100) errors.push('Email must be less than 100 characters.');
    if (city.length < 2) errors.push('Proposed Franchise City is required.');
    if (city.length > 100) errors.push('City must be less than 100 characters.');
    if (area.length < 2) errors.push('Preferred Area / Locality is required.');
    if (area.length > 100) errors.push('Area must be less than 100 characters.');
    if (!budget) errors.push('Investment Budget is required.');
    if (!space) errors.push('Available Space is required.');
    if (!property) errors.push('Property Status is required.');
    if (!timeline) errors.push('Expected Opening Timeline is required.');
    if (message.length > 800) errors.push('Message must be under 800 characters.');

    const validBudgets = ['25-40L', '40-60L', '60L-1Cr', '1Cr+'];
    const validSpaces = ['2000-3500', '3500-5000', '5000-8500', '8500+'];
    const validProperties = ['owned', 'leased', 'looking'];
    const validTimelines = ['immediate', '1-3', '3-6', '6+'];
    if (budget && !validBudgets.includes(budget)) errors.push('Invalid budget.');
    if (space && !validSpaces.includes(space)) errors.push('Invalid space.');
    if (property && !validProperties.includes(property)) errors.push('Invalid property status.');
    if (timeline && !validTimelines.includes(timeline)) errors.push('Invalid timeline.');

    if (errors.length) return res.status(400).json({ success: false, errors });

    const data = { fullName, phone, email, city, area, budget, space, property, timeline, message };
    const results = { telegram: false, whatsapp: false };

    const outbound = [
      sendToTelegram(data).then(() => { results.telegram = true; }),
    ];

    // WhatsApp is optional — only attempt delivery if all credentials are present.
    if (WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_RECIPIENT_NUMBER) {
      outbound.push(sendToWhatsApp(data).then(() => { results.whatsapp = true; }));
    }

    await Promise.allSettled(outbound);

    if (results.telegram && results.whatsapp) return res.status(200).json({ success: true, message: 'Thank you! Your franchise enquiry has been received.' });
    if (results.telegram || results.whatsapp) return res.status(207).json({ success: true, partial: true, message: 'Enquiry received, one channel pending.' });
    return res.status(502).json({ success: false, message: 'Unable to send. Please try again or contact us directly.' });
  } catch (error) {
    const safeName = error && error.name ? error.name : 'UnknownError';
    const safeStatus = error && error.httpStatus ? String(error.httpStatus) : '';
    const safeDesc = error && error.telegramDescription ? String(error.telegramDescription) : (error && error.message ? String(error.message) : '');
    const safeDetail = safeStatus ? (' status=' + safeStatus + ' description=' + JSON.stringify(safeDesc)) : (' message=' + JSON.stringify(safeDesc));
    console.error('FRANCHISE_HANDLER_ERROR: name=' + safeName + safeDetail);
    return res.status(500).json({ success: false, message: 'Unable to send. Please try again.' });
  }
};