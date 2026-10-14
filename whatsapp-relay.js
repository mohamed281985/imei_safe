// هذا الكود يستقبل الرسائل من الرقم الوسيط ويعيد إرسالها إلى صاحب الهاتف

const express = require('express');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '10kb' }));

require('dotenv').config({ path: '../paymop-server/.env' });
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET;

if (!WHATSAPP_WEBHOOK_VERIFY_TOKEN || !WHATSAPP_WEBHOOK_SECRET) {
  throw new Error('Missing WHATSAPP_WEBHOOK_VERIFY_TOKEN or WHATSAPP_WEBHOOK_SECRET');
}

// استخدام Anon Key بدلاً من Service Key لاحترام RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Rate Limiting لجميع مسارات /webhook
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/webhook', webhookLimiter);

/**
 * التحقق من صحة رقم الهاتف بصيغة دولية
 * مثال صحيح: +201234567890
 */
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

// Endpoint للتحقق من Webhook (Verify Token)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && mode === 'subscribe' && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook لاستقبال الرسائل من واتساب
app.post('/webhook', async (req, res) => {
  // تحقق من السر عبر متغير البيئة (مقارنة آمنة)
  const providedSecret = req.body.secret;
  if (!providedSecret || typeof providedSecret !== 'string') {
    return res.status(403).json({ error: 'Forbidden: Invalid secret' });
  }
  // استخدام مقارنة آمنة لمنع timing attack
  if (!crypto.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(WHATSAPP_WEBHOOK_SECRET))) {
    return res.status(403).json({ error: 'Forbidden: Invalid secret' });
  }

  const message = req.body.messages?.[0];
  if (!message || !message.text) return res.sendStatus(200);

  // استخراج IMEI أو معرف البلاغ من الرسالة (يجب أن ترسل في الرسالة)
  // مثال: الرسالة تبدأ بـ IMEI:123456789012345
  const imeiMatch = message.text.body.match(/IMEI:(\d{15})/);
  if (!imeiMatch) return res.sendStatus(200);
  const imei = imeiMatch[1];

  // جلب رقم صاحب الهاتف من قاعدة البيانات
  const { data, error } = await supabase
    .from('phone_reports')
    .select('phone_number')
    .eq('imei', imei)
    .single();
  if (error || !data || !data.phone_number) return res.sendStatus(200);
  const ownerPhone = data.phone_number;

  // التحقق من صحة رقم الهاتف قبل الاستخدام
  if (!isValidPhone(ownerPhone)) {
    console.warn('Invalid phone number format, skipping:', ownerPhone);
    return res.sendStatus(200);
  }

  // إرسال الرسالة إلى صاحب الهاتف عبر واتساب بيزنس API
  await axios.post(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`, {
    messaging_product: 'whatsapp',
    to: ownerPhone,
    type: 'text',
    text: { body: message.text.body }
  }, {
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
  });

  res.sendStatus(200);
});

app.listen(3000, () => console.log('Webhook running on port 3000'));
