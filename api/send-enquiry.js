const fetch = require('node-fetch');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_RECIPIENT_NUMBER = process.env.WHATSAPP_RECIPIENT_NUMBER;

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 5;
const OUTBOUND_TIMEOUT_MS = 10 * 1000;
const rateHits = new Map();

const validateEnv = () => {
  const missing = [];
  if (!TELEGRAM_BOT_TOKEN) missing.push('TELEGRAM_BOT_TOKEN');
  if (!TELEGRAM_CHAT_ID) missing.push('TELEGRAM_CHAT_ID');

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

async function sendToTelegram(name, phone, email, fitnessGoal, message) {
  const text = `
YUVA FIT & PHYSIQUE — NEW ENQUIRY

👤 Name:
${name}

📱 Phone:
${phone}

📧 Email:
${email}

🎯 Fitness Goal:
${fitnessGoal}

💬 Message:
${message}

────────────────────

Submitted from:
YUVA FIT & PHYSIQUE Website
  `.trim();

  const response = await fetchWithTimeout(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    },
    OUTBOUND_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Telegram API error: ${JSON.stringify(errorData)}`);
  }

  return response.json();
}

async function sendToWhatsApp(name, phone, email, fitnessGoal, message) {
  const templateData = {
    messaging_product: 'whatsapp',
    to: WHATSAPP_RECIPIENT_NUMBER,
    type: 'template',
    template: {
      name: 'new_gym_enquiry',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: name },
            { type: 'text', text: phone },
            { type: 'text', text: email },
            { type: 'text', text: fitnessGoal },
            { type: 'text', text: message },
          ],
        },
      ],
    },
  };

  const response = await fetchWithTimeout(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(templateData),
    },
    OUTBOUND_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`WhatsApp API error: ${JSON.stringify(errorData)}`);
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
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use POST.',
    });
  }

  if (isRateLimited(req)) {
    return res.status(429).json({
      success: false,
      message: 'Too many submissions from this device. Please wait a moment and try again.',
    });
  }

  if (!validateEnv()) {
    return res.status(500).json({
      success: false,
      message: 'Server configuration error. Please check environment variables.',
    });
  }

  try {
    const body = req.body || {};
    const website = str(body.website);

    // Honeypot: pretend success, do no work.
    if (website !== '') {
      return res.status(200).json({
        success: true,
        message: 'Thank you! Your enquiry has been sent.',
      });
    }

    const name = str(body.name);
    const phone = str(body.phone);
    const email = str(body.email);
    const message = str(body.message);
    const fitnessGoal = typeof body.fitnessGoal === 'string' ? body.fitnessGoal.trim() : '';

    const errors = [];
    if (name.length < 2) errors.push('Name is required and must be at least 2 characters.');
    if (name.length > 100) errors.push('Name must be less than 100 characters.');
    if (!/^[0-9+\s\-()]{10,15}$/.test(phone)) errors.push('Phone number format is invalid.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Valid email address is required.');
    if (email.length > 100) errors.push('Email must be less than 100 characters.');

    const validGoals = [
      'Muscle Building',
      'Weight Loss',
      'Strength Training',
      'General Fitness',
      'Personal Training',
      'Cardio & Conditioning',
      'Functional Training',
      'Other',
    ];
    if (!validGoals.includes(fitnessGoal)) errors.push('Please select a valid fitness goal.');
    if (message.length < 10) errors.push('Message is required and must be at least 10 characters.');
    if (message.length > 500) errors.push('Message must be less than 500 characters.');

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const results = { telegram: false, whatsapp: false };

    const outbound = [
      sendToTelegram(name, phone, email, fitnessGoal, message).then(() => { results.telegram = true; }),
    ];

    // WhatsApp is optional — only attempt delivery if all credentials are present.
    if (WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_RECIPIENT_NUMBER) {
      outbound.push(sendToWhatsApp(name, phone, email, fitnessGoal, message).then(() => { results.whatsapp = true; }));
    }

    await Promise.allSettled(outbound);

    if (results.telegram && results.whatsapp) {
      return res.status(200).json({
        success: true,
        message: "Thank you! Your enquiry has been sent successfully. We'll contact you soon.",
        details: results,
      });
    }

    if (results.telegram || results.whatsapp) {
      return res.status(207).json({
        success: true,
        partial: true,
        message: 'Your enquiry was received, but one notification channel could not be delivered. Please try again or contact us directly.',
        details: results,
      });
    }

    return res.status(502).json({
      success: false,
      message: 'Unable to send your enquiry right now. Please try again or contact us directly.',
    });
  } catch (error) {
    const reason = error && error.name === 'AbortError' ? 'notification service timed out' : error.message;
    console.error('Handler error:', reason);
    return res.status(500).json({
      success: false,
      message: 'Unable to send your enquiry right now. Please try again or contact us directly.',
    });
  }
};