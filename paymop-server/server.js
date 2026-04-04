import { google } from 'googleapis';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Redis from 'ioredis';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { validateImageFile } from './utils/imageValidator.js';
import jwt from 'jsonwebtoken';

// =================================================================
// 1. الإعدادات الأولية وتحميل متغيرات البيئة (يجب أن تكون في البداية)
// =================================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// تحميل متغيرات البيئة
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

// Development bypass token (only used when explicitly set in .env)
const DEV_BYPASS_TOKEN = process.env.DEV_BYPASS_TOKEN || null;

// =================================================================
// دوال التشفير ثنائي الاتجاه (AES Encryption)
// =================================================================

// مفتاح التشفير (يجب أن يكون 32 بايت في شكل hex => 64 حرف)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  console.error("⛔️ خطأ: يجب تعيين ENCRYPTION_KEY في متغيرات البيئة. ضع مفتاح AES-256 (32 bytes) في صيغة hex.");
  process.exit(1);
}

// تحقق من الطول (64 hex chars -> 32 bytes)
if (typeof ENCRYPTION_KEY !== 'string' || ENCRYPTION_KEY.length !== 64 || !/^[0-9a-fA-F]+$/.test(ENCRYPTION_KEY)) {
  console.error('⛔️ ENCRYPTION_KEY غير صحيحة. يجب أن تكون سلسلة hex بطول 64 (32 bytes).');
  process.exit(1);
}

console.log('✅ تم تحميل ENCRYPTION_KEY من متغيرات البيئة.');

// متجه التشفير (IV) - يجب أن يكون عشوائياً لكل عملية تشفير
const generateIV = () => crypto.randomBytes(12); // 96-bit nonce recommended for GCM

/**
 * تشفير النص باستخدام AES-256-GCM (يوفر مصادقة البيانات)
 * @param {string} text - النص المراد تشفيره
 * @returns {Object|null} - { encryptedData, iv, authTag } أو null
 */
const encryptAES = (text) => {
  if (text === null || text === undefined) return null;
  const iv = generateIV();
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedData: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
};

/**
 * فك تشفير النص باستخدام AES-256-GCM
 * @param {string} encryptedData - النص المشفر (hex)
 * @param {string} iv - متجه التشفير (hex)
 * @param {string} authTag - علامة المصادقة (hex)
 * @returns {string|null} - النص الأصلي
 */
const decryptAES = (encryptedData, iv, authTag) => {
  if (!encryptedData || !iv || !authTag) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedData, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
};

/**
 * تشفير كائن JSON وحفظه كسلسلة
 * @param {Object} obj - الكائن المراد تشفيره
 * @returns {string} - السلسلة المشفرة
 */
const encryptObject = (obj) => {
  if (obj === null || obj === undefined) return null;
  const jsonString = JSON.stringify(obj);
  return encryptAES(jsonString);
};

/**
 * فك تشفير سلسلة JSON واستعادتها ككائن
 * @param {string} encryptedData - السلسلة المشفرة
 * @param {string} iv - متجه التشفير
 * @returns {Object} - الكائن الأصلي
 */
const decryptObject = (encryptedData, iv, authTag) => {
  if (!encryptedData || !iv || !authTag) return null;
  const jsonString = decryptAES(encryptedData, iv, authTag);
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    return null;
  }
};

/**
 * دالة مساعدة لفك تشفير الحقل من قاعدة البيانات
 * @param {string} encryptedField - الحقل المشفر (قد يكون نص عادي أو JSON مشفر)
 * @returns {string|null} - القيمة الأصلية أو null إذا كان الحقل فارغ
 */
const decryptField = (encryptedField) => {
  if (!encryptedField) return null;

  // في حال كانت القيمة النصية "null" أو "undefined"
  if (typeof encryptedField === 'string' && (encryptedField.trim() === 'null' || encryptedField.trim() === 'undefined')) {
    return null;
  }

  // إذا كانت القيمة كائناً بالفعل (JSONB)، فك التشفير مباشرة
  if (typeof encryptedField === 'object') {
    if (!encryptedField) return null;
    const obj = encryptedField;
    if (obj.encryptedData && obj.iv && obj.authTag) {
      return decryptAES(obj.encryptedData, obj.iv, obj.authTag);
    }
    return null;
  }
  // محاولة دعم عدة أشكال للحقل المشفّر:
  // - JSON object (returned by JSONB)
  // - stringified JSON ("{...}")
  // - double-encoded / escaped JSON ("{\"encryptedData\":...}")
  if (typeof encryptedField === 'string') {
    const s = encryptedField.trim();

    // حاول التعامل مع stringified JSON أو escaped JSON
    if (s.startsWith('{') || s.startsWith('"') || s.includes('encryptedData')) {
      try {
        let candidate = s;
        // إذا كانت السلسلة مقتبسة مثل '"{...}"' فك الاقتباس أولاً
        if (candidate.startsWith('"')) {
          try {
            candidate = JSON.parse(candidate);
          } catch (e) {
            // تجاهل إذا لم تنجح عملية JSON.parse هنا
          }
        }

        // إذا تحتوي على مقاومات اقتباس داخلية، حاول إزالتها
        if (typeof candidate === 'string' && candidate.indexOf('\\"encryptedData\\"') !== -1) {
          candidate = candidate.replace(/\\"/g, '"');
        }

        // حاول تحليل JSON النهائي
        if (typeof candidate === 'string' && candidate.trim().startsWith('{')) {
          const parsed = JSON.parse(candidate);
          if (parsed && parsed.encryptedData && parsed.iv && parsed.authTag) {
            try {
              return decryptAES(parsed.encryptedData, parsed.iv, parsed.authTag);
            } catch (e) {
              if (process.env.NODE_ENV !== 'production') console.warn('[decryptField] decryptAES failed:', e);
              return null;
            }
          }
        }
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') console.debug('[decryptField] JSON parse attempt failed:', e);
        // استمر لمحاولات أخرى
      }
    }

    // إذا كانت السلسلة عبارة عن نص عادي (مثل IMEI غير مشفّر)، أعِدها كما هي
    // إذا كانت السلسلة تحتوي أرقام فقط فاعتبرها قيمة صالحة
    if (/^\d+$/.test(s)) return s;

    // في حال فشل التعرف على أي نموذج صالح، لا نُرجع النص المشفر الخام
    return null;
  }
  return null;
};


// =================================================================
// 2. تهيئة العملاء والخدمات (Clients & Services)
// =================================================================

// --- تهيئة Firebase Admin SDK ---
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'imeisafe-b2dd8';
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;

// تعريف auth في النطاق الرئيسي
let auth;

// إذا لم يتم تعريف المفتاح الخاص في متغيرات البيئة، استخدم ملف الخدمة
if (!PRIVATE_KEY) {
  console.log('استخدام ملف الخدمة للـ Firebase');
  const SERVICE_ACCOUNT_FILE = path.join(__dirname, 'firebase-service-account.json');
  auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_FILE,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });
} else {
  console.log('استخدام متغيرات البيئة للـ Firebase');
  // ⭐ إضافة تحقق للتأكد من وجود المفاتيح المطلوبة
  if (!CLIENT_EMAIL || !PRIVATE_KEY) {
    console.error("❌ خطأ: متغيرات البيئة FIREBASE_CLIENT_EMAIL أو FIREBASE_PRIVATE_KEY غير موجودة.");
    process.exit(1); // إيقاف الخادم إذا كانت المتغيرات ناقصة
  }
  auth = new google.auth.GoogleAuth({
    credentials: {
      type: "service_account",
      project_id: PROJECT_ID,
      client_email: CLIENT_EMAIL,
      private_key: PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });
}

// --- تهيئة Resend ---
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// If behind a proxy (Render, Heroku, etc.) trust proxy headers so req.secure and x-forwarded-proto work
app.set('trust proxy', true);

// Security headers with explicit HSTS in production
if (process.env.NODE_ENV === 'production') {
  app.use(helmet({
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    }
  }));
} else {
  app.use(helmet());
}

// Enforce HTTPS in production by redirecting HTTP requests to HTTPS
app.use((req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      const proto = req.headers['x-forwarded-proto'] || req.protocol;
      if (proto && String(proto).toLowerCase() !== 'https') {
        const host = req.headers.host || '';
        return res.redirect(301, `https://${host}${req.originalUrl}`);
      }
    }
  } catch (e) {
    // don't break requests if enforcement middleware fails
    console.warn('HTTPS enforcement middleware error', e);
  }
  return next();
});

// Global rate limiter: use Redis if available, otherwise fallback to in-memory map
const GLOBAL_RATE_WINDOW_MS = 60 * 1000; // 1 minute
const GLOBAL_RATE_MAX = 200;
const localGlobalRate = new Map();

const globalRateMiddleware = (req, res, next) => {
  if (redisClient) {
    // async handler using Redis
    (async () => {
      try {
        const key = `globalrl:${req.ip}`;
        const current = await redisClient.incr(key);
        if (current === 1) await redisClient.pexpire(key, GLOBAL_RATE_WINDOW_MS);
        if (current > GLOBAL_RATE_MAX) {
          res.status(429).json({ error: 'محظور: تجاوزت الحد الأقصى للمحاولات' });
          return;
        }
        next();
      } catch (e) {
        console.error('Redis rate limit error:', e);
        next();
      }
    })();
  } else {
    try {
      const key = req.ip;
      const now = Date.now();
      const entry = localGlobalRate.get(key) || { count: 0, start: now };
      if (now - entry.start > GLOBAL_RATE_WINDOW_MS) {
        entry.count = 0;
        entry.start = now;
      }
      entry.count += 1;
      localGlobalRate.set(key, entry);
      if (entry.count > GLOBAL_RATE_MAX) {
        res.status(429).json({ error: 'محظور: تجاوزت الحد الأقصى للمحاولات' });
        return;
      }
      next();
    } catch (e) {
      next();
    }
  }
};
app.use(globalRateMiddleware);

// Middleware: if incoming body is encrypted (encryptedData + iv + authTag), try to decrypt and replace req.body
app.use((req, res, next) => {
  try {
    const body = req.body;
    if (body && body.encryptedData && body.iv && body.authTag) {
      try {
        const decrypted = decryptObject(body.encryptedData, body.iv, body.authTag);
        if (decrypted) {
          // Replace body with decrypted object
          req.body = decrypted;
          if (process.env.NODE_ENV !== 'production') console.log('[decrypt-middleware] decrypted incoming payload');
        }
      } catch (e) {
        console.warn('[decrypt-middleware] failed to decrypt incoming payload', e);
        // fall through: keep original body
      }
    }
  } catch (e) {
    // ignore
  }
  return next();
});

// Optional Redis client for shared state (usedSignatures, rate-limits, etc.)
const REDIS_URL = process.env.REDIS_URL || null;
let redisClient = null;
if (REDIS_URL) {
  try {
    redisClient = new Redis(REDIS_URL);
    redisClient.on('error', (err) => console.error('Redis error:', err));
    console.log('Connected to Redis for shared state');
  } catch (e) {
    console.error('Failed to initialize Redis client:', e);
    redisClient = null;
  }
}

// Helper to log internal errors and return a generic message to clients
function sendError(res, status = 500, userMessage = 'حدث خطأ في الخادم', err = null, extra = {}) {
  try {
    if (err) console.error(err);
  } catch (logErr) {
    console.error('Failed to log error:', logErr);
  }
  if (res.headersSent) return; // avoid double responses
  return res.status(status).json({ ...extra, error: userMessage });
}

// ⭐ Endpoint لجلب mainimage_url من جدول ads_offar
app.get('/api/offers/mainimage', async (req, res) => {
  try {
    const adId = req.query.id;
    if (adId) {
      // جلب الصورة بناءً على الـ id المحدد
      const { data, error } = await supabase
        .from('ads_offar')
        .select('mainimage_url')
        .eq('id', adId)
        .single();
      if (error || !data || !data.mainimage_url) {
        return res.status(404).json({ mainimage_url: null, error: 'Not found' });
      }
      return res.json({ mainimage_url: data.mainimage_url });
    } else {
      // إذا لم يتم تمرير id، جلب أول صف كافتراضي
      const { data, error } = await supabase
        .from('ads_offar')
        .select('mainimage_url')
        .order('id', { ascending: true })
        .limit(1)
        .single();
      if (error || !data || !data.mainimage_url) {
        return res.status(404).json({ mainimage_url: null, error: 'Not found' });
      }
      return res.json({ mainimage_url: data.mainimage_url });
    }
  } catch (e) {
    return res.status(500).json({ mainimage_url: null, error: 'Server error' });
  }
});

// Endpoint بسيط لتشفير بيانات الدفع أو أي JSON حساس في الخلفية
app.post('/api/encrypt', async (req, res) => {
  try {
    const obj = req.body;
    if (!obj) return res.status(400).json({ error: 'No payload' });
    const encrypted = encryptObject(obj);
    if (!encrypted) return res.status(500).json({ error: 'Encryption failed' });
    return res.json(encrypted);
  } catch (e) {
    console.error('/api/encrypt error', e);
    return res.status(500).json({ error: 'Encryption error' });
  }
});

// --- تهيئة Supabase ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Endpoint: /api/lost-phones
// يعيد قائمة الهواتف المفقودة مع فك تشفير حقل imei و phone_type فقط
app.get('/api/lost-phones', async (req, res) => {
  try {
    // حماية بسيطة: يسمح بالوصول إذا تم تمرير x-api-key المطابق لـ DEV_BYPASS_TOKEN
    const apiKey = req.headers['x-api-key'];
    const authHeader = req.headers['authorization'];

    if (!authHeader && DEV_BYPASS_TOKEN && apiKey !== DEV_BYPASS_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // جلب الحقول المشفرة من قاعدة البيانات (اقتصر على 50 سجل لتفادي التحميل الزائد)
    const { data, error } = await supabase
      .from('phone_reports')
      .select('imei, phone_type, masked_imei, imei_hash')
      .eq('status', 'active')
      .order('report_date', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Supabase error fetching lost phones:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    // فك تشفير الحقول وإرجاع الشكل المطلوب
    const result = (data || []).map(row => {
      // حاول فك التشفير أولاً
      let imei = decryptField(row.imei);
      let phone_type = decryptField(row.phone_type);

      // إذا فشل فك التشفير للـ IMEI، حاول إنشاء قيمة مقنّعة بديلة
      if (!imei) {
        // 0) إذا كان هناك عمود masked_imei استخدمه مباشرة
        if (row.masked_imei && typeof row.masked_imei === 'string' && row.masked_imei.trim()) {
          imei = row.masked_imei;
        }
        // 1) إذا كان هناك عمود id_last6 استخدمه (قد يحتوي وصفًا أو آخر 6)
        else if (row.id_last6 && typeof row.id_last6 === 'string' && /\d/.test(row.id_last6)) {
          const digits = ('' + row.id_last6).replace(/\D/g, '');
          imei = digits ? (digits.slice(0, 6) + '*'.repeat(Math.max(0, Math.max(8, 15) - digits.length))) : '*************';
        } else {
          // 2) حاول استخراج أرقام من الحقل الخام (قد يكون نص يحتوي أرقام)
          try {
            const raw = (typeof row.imei === 'string' && row.imei.trim().startsWith('{')) ? JSON.parse(row.imei) : row.imei;
            const candidate = raw && (raw.encryptedData || raw) ? String(raw.encryptedData || raw) : '';
            const digits = candidate.replace(/\D/g, '');
            if (digits && digits.length >= 6) {
              imei = digits.slice(0, 6) + '*'.repeat(Math.max(0, digits.length - 6));
            } else if (digits) {
              imei = digits + '*'.repeat(15 - digits.length);
            } else {
              imei = '***************';
            }
          } catch (e) {
            imei = '***************';
          }
        }
      }

      // إذا لم يُفكّ phone_type، حاول استخدام القيمة الخام أو نص افتراضي
      if (!phone_type) {
        phone_type = (row.phone_type && typeof row.phone_type === 'string') ? row.phone_type : 'غير محدد';
      }

      return { imei, phone_type };
    }).filter(item => item.imei || item.phone_type);

    return res.json(result);
  } catch (err) {
    console.error('Error in /api/lost-phones:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// =================================================================
// 3. إعدادات Express و Middleware
// =================================================================
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

app.use((req, res, next) => {
  if (req.url.includes('//')) {
    req.url = req.url.replace(/\/+/g, '/');
  }
  next();
});

const allowedOrigins = [
  'http://localhost:8080',       // Your local dev server
  'http://127.0.0.1:8080',
  'http://localhost:8081',       // السماح للمنفذ 8081
  'https://imei-safe.me', // Your deployed server (for self-requests if any)
  'capacitor://localhost',       // Default Capacitor origin for iOS/Android
  'https://localhost'            // Capacitor Android origin (as seen in your error log)
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
};

app.use(cors(corsOptions));

// -----------------------------
// Rate limiter (simple in-memory)
// For production use a distributed store like Redis
// -----------------------------
const rateLimitStore = new Map();
const rateLimitMiddleware = ({ windowMs = 15 * 60 * 1000, max = 5 } = {}) => (req, res, next) => {
  try {
    const key = req.ip + '::' + req.path;
    const now = Date.now();
    const entry = rateLimitStore.get(key) || { count: 0, start: now };
    if (now - entry.start > windowMs) {
      // reset window
      entry.count = 0;
      entry.start = now;
    }
    entry.count += 1;
    rateLimitStore.set(key, entry);
    if (entry.count > max) {
      res.status(429).json({ error: 'محظور: تجاوزت الحد الأقصى للمحاولات' });
      return;
    }
    next();
  } catch (e) {
    next();
  }
};

// -----------------------------
// Global and endpoint-specific rate limiters using express-rate-limit
// -----------------------------
// Global limiter: prevents brute-force across the whole app (default: 200 requests per minute)
const globalLimiter = rateLimit({
  windowMs: Number(process.env.GLOBAL_RATE_WINDOW_MS) || 60 * 1000,
  max: Number(process.env.GLOBAL_RATE_MAX) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many requests, please try again later.' })
});

// Payment endpoints limiter: more strict
const paymentLimiter = rateLimit({
  windowMs: Number(process.env.PAYMENT_RATE_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.PAYMENT_RATE_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many payment attempts, please wait and try again.' })
});

// Apply global limiter to all requests
app.use(globalLimiter);

// -----------------------------
// HMAC signing / verification for payment requests
// -----------------------------
const PAYMENT_SIGNING_KEY = process.env.PAYMENT_SIGNING_KEY || null;
if (!PAYMENT_SIGNING_KEY) {
  console.warn('PAYMENT_SIGNING_KEY not set; sign/verify endpoints will fail until configured');
}

// Payment security & timeout settings
const PAYMENT_SIGNATURE_MAX_AGE_MS = Number(process.env.PAYMENT_SIGNATURE_MAX_AGE_MS) || 5 * 60 * 1000; // default 5 minutes
const PAYMENT_OP_TIMEOUT_MS = Number(process.env.PAYMENT_OP_TIMEOUT_MS) || 20 * 1000; // default 20s per payment operation

const usedSignatures = new Map(); // signature -> expiryTimestamp

const cleanUsedSignatures = () => {
  const now = Date.now();
  for (const [sig, exp] of usedSignatures.entries()) {
    if (exp <= now) usedSignatures.delete(sig);
  }
};
setInterval(cleanUsedSignatures, 60 * 1000);

const generateSignatureHmac = ({ merchantOrderId, amount, timestamp }) => {
  if (!PAYMENT_SIGNING_KEY) throw new Error('PAYMENT_SIGNING_KEY not configured');
  const h = crypto.createHmac('sha256', PAYMENT_SIGNING_KEY);
  const payload = `${merchantOrderId}|${amount}|${timestamp}`;
  h.update(payload);
  return h.digest('hex');
};

const verifySignatureHmac = async ({ merchantOrderId, amount, timestamp, signature, maxAgeMs = PAYMENT_SIGNATURE_MAX_AGE_MS }) => {
  try {
    if (!signature || !timestamp) return false;
    if (!PAYMENT_SIGNING_KEY) return false;

    const tsNum = Number(timestamp);
    if (isNaN(tsNum)) return false;

    const now = Date.now();
    const FUTURE_SKEW_MS = 60 * 1000;
    if (tsNum - now > FUTURE_SKEW_MS) return false;

    const age = Math.abs(now - tsNum);
    if (age > maxAgeMs) return false;

    if (!/^[0-9a-fA-F]{64}$/.test(String(signature))) return false;

    const expected = generateSignatureHmac({ merchantOrderId, amount, timestamp: tsNum });
    const expectedBuf = Buffer.from(expected, 'hex');
    const sigBuf = Buffer.from(String(signature), 'hex');
    if (expectedBuf.length !== sigBuf.length) return false;
    if (!crypto.timingSafeEqual(expectedBuf, sigBuf)) return false;

    // check replay using Redis if available, otherwise fallback to in-memory map
    if (redisClient) {
      const exists = await redisClient.get(`usedsig:${signature}`);
      if (exists) return false;
      // store with TTL based on maxAgeMs
      await redisClient.set(`usedsig:${signature}`, '1', 'PX', maxAgeMs);
    } else {
      if (usedSignatures.has(signature)) return false;
      usedSignatures.set(signature, tsNum + maxAgeMs);
    }

    return true;
  } catch (e) {
    console.error('verifySignatureHmac error:', e);
    return false;
  }
};

// Signing endpoint - server signs the payload and returns signature
app.post('/paymob/sign', paymentLimiter, rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  try {
    const { merchantOrderId, offerId, timestamp } = req.body || {};
    if (!merchantOrderId || !offerId || !timestamp) {
      return res.status(400).json({ error: 'merchantOrderId, offerId and timestamp are required' });
    }

    // Require authenticated user to request a signature
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized: missing token' });
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized: invalid token' });

    // Compute expected amount from provided offerData first, then fallback to offerId (ads_offar -> ads_price)
    let expectedAmount = null;
    try {
      const bodyOfferData = req.body?.offerData || null;
      // If client provided type/duration, prefer that for lookup (but normalize types)
      if (bodyOfferData && bodyOfferData.type) {
        const rawDuration = bodyOfferData.duration_days || bodyOfferData.duration || null;
        // Normalize and try both string and numeric forms to match DB column type
        const durationCandidates = [];
        if (rawDuration !== null && typeof rawDuration !== 'undefined') {
          durationCandidates.push(String(rawDuration));
          const asNumber = Number(rawDuration);
          if (!Number.isNaN(asNumber)) durationCandidates.push(asNumber);
        }

        // Debug (redacted minimal): type and duration candidate types
        try {
          console.log('/paymob/sign debug: offerId=', offerId, 'offerData_type=', bodyOfferData.type, 'durationCandidates=', durationCandidates);
        } catch (e) { }

        let found = false;
        for (const d of durationCandidates) {
          try {
            const { data: priceRow, error: priceErr } = await supabase
              .from('ads_price')
              .select('amount')
              .eq('type', bodyOfferData.type)
              .eq('duration_days', d)
              .limit(1)
              .single();
            if (!priceErr && priceRow && typeof priceRow.amount !== 'undefined') {
              expectedAmount = Number(priceRow.amount);
              found = true;
              break;
            }
          } catch (e) {
            // ignore and try next candidate
          }
        }

        // fallback to any price for the type if duration-specific lookup failed
        if (!found) {
          try {
            const { data: priceRow, error: priceErr } = await supabase
              .from('ads_price')
              .select('amount')
              .eq('type', bodyOfferData.type)
              .limit(1)
              .single();
            if (!priceErr && priceRow && typeof priceRow.amount !== 'undefined') expectedAmount = Number(priceRow.amount);
          } catch (e) { }
        }
      }

      // If still not found, fall back to lookup by offerId in ads_offar
      if (expectedAmount === null) {
        const { data: offerRow, error: offerErr } = await supabase
          .from('ads_offar')
          .select('price, type')
          .eq('id', offerId)
          .single();
        if (!offerErr && offerRow) {
          if (offerRow.price) expectedAmount = Number(offerRow.price);
          else if (offerRow.type) {
            const { data: priceRow, error: priceErr } = await supabase
              .from('ads_price')
              .select('amount')
              .eq('type', offerRow.type)
              .limit(1)
              .single();
            if (!priceErr && priceRow && typeof priceRow.amount !== 'undefined') expectedAmount = Number(priceRow.amount);
          }
        }
      }
    } catch (e) {
      console.error('Error computing expectedAmount in /paymob/sign:', e);
    }

    if (expectedAmount === null) {
      return res.status(400).json({ error: 'Unable to determine expected amount for offer' });
    }

    const sig = generateSignatureHmac({ merchantOrderId, amount: expectedAmount, timestamp });
    return res.json({ signature: sig, expectedAmount });
  } catch (e) {
    console.error('Error in /paymob/sign:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// =================================================================
// 4. الدوال المساعدة (Helper Functions)
// =================================================================

// --- دوال الإشعارات (FCM) ---
async function sendFCMNotificationV1({ token, title, body, data }) {
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  // تأكد أن الرسالة تحتوي على notification ليظهر الإشعار في الخارج
  const message = {
    message: {
      token,
      notification: { title, body }, // هذا المفتاح ضروري لظهور الإشعار في الخارج
      data: data || {},
    },
  };
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`FCM V1 Error: ${error}`);
  }
  return await res.json();
}

// --- دوال إخفاء البيانات (Data Masking Helpers) ---
const maskName = (name) => {
  if (!name) return '';
  const names = name.split(' ');
  return names.map(part => {
    if (part.length <= 1) return part;
    return part[0] + '*'.repeat(part.length - 1);
  }).join(' ');
};

const maskPhoneNumber = (phone) => {
  if (!phone) return '';
  return '*'.repeat(Math.max(0, phone.length - 2)) + phone.slice(-2);
};

const maskEmail = (email) => {
  if (!email) return '';
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const maskedName = name.length > 2 ? name[0] + '*'.repeat(name.length - 2) + name.slice(-1) : name;
  return maskedName + '@' + domain;
};

const maskIdLast6 = (id) => {
  if (!id) return '';
  if (id.length <= 2) return '*'.repeat(id.length);
  return '*'.repeat(id.length - 2) + id.slice(-2);
};
// Normalize IMEI/phone-like values: keep digits only for robust comparisons
const normalizeDigitsOnly = (s) => {
  if (s === null || s === undefined) return '';
  try {
    return String(s).replace(/\D/g, '');
  } catch (e) {
    return '';
  }
};

// دالة مساعدة للبحث عن FCM token باستخدام IMEI
async function getFCMTokenByImei(imei) {
  const { data, error } = await supabase
    .from('phone_reports')
    .select('fcm_token')
    .eq('imei', imei)
    .maybeSingle();

  if (error || !data) {
    console.error('Error fetching FCM token by IMEI:', error);
    return null;
  }

  return data.fcm_token;
}

// --- دوال Paymob ---
const paymobRequest = async (url, body, method = "POST", timeoutMs = PAYMENT_OP_TIMEOUT_MS) => {
  try {
    // تجنّب طباعة الحقول الحساسة بالكامل
    const redact = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      const copy = JSON.parse(JSON.stringify(obj));
      const sensitive = ['api_key', 'payment_token', 'token', 'card_number', 'cvv', 'password', 'authorization'];
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        for (const k of Object.keys(o)) {
          try {
            if (sensitive.includes(k)) o[k] = 'REDACTED';
            else if (typeof o[k] === 'object') walk(o[k]);
          } catch (e) { }
        }
      };
      walk(copy);
      return copy;
    };
    console.log(`Making ${method} request to Paymob API:`, url);
    console.log("Request body (redacted):", JSON.stringify(redact(body), null, 2));
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));
    
    console.log(`Response status: ${res.status}`);
    
    if (!res.ok) {
      let errorData;
      try {
        errorData = await res.json();
        console.log("Error response (redacted):", JSON.stringify(redact(errorData), null, 2));
      } catch (jsonError) {
        errorData = { message: res.statusText };
        console.log("Error parsing JSON, using status text:", res.statusText);
      }
      
      throw new Error(`Paymob API Error (${url}): ${errorData.message || res.statusText}`);
    }
    
    const data = await res.json();
    console.log("Success response (redacted):", JSON.stringify(redact(data), null, 2));
    return data;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      console.error(`Paymob request timed out: ${url}`);
      throw new Error('Paymob request timed out');
    }
    console.error(`Failed to make request to Paymob API (${url}):`, error.message || error);
    throw error;
  }
};

const getAuthToken = async () => {
  try {
    console.log("Requesting auth token from Paymob...");
    const authData = await paymobRequest("https://accept.paymob.com/api/auth/tokens", { 
      api_key: PAYMOB_API_KEY 
    });
    
    if (!authData || !authData.token) {
      console.error("Invalid auth response from Paymob:", JSON.stringify(authData, null, 2));
      throw new Error("فشل في الحصول على توكن المصادقة من Paymob - استجابة غير صالحة");
    }
    
    console.log("Successfully obtained auth token");
    return authData.token;
  } catch (error) {
    console.error("Error getting auth token:", error.message);
    throw new Error(`فشل في الحصول على توكن المصادقة من Paymob: ${error.message}`);
  }
};

const registerOrder = async (token, { amount, merchantOrderId }) => {
  try {
    console.log("Registering order with Paymob...");
    
    const amountCents = Math.round(Number(amount) * 100);
    if (isNaN(amountCents)) {
      throw new Error("المبلغ المرسل غير صالح");
    }
    
    const orderId = merchantOrderId || `ORD-${Date.now()}`;
    
    const orderData = await paymobRequest("https://accept.paymob.com/api/ecommerce/orders", {
      auth_token: token,
      delivery_needed: "false",
      amount_cents: amountCents,
      currency: "EGP",
      merchant_order_id: orderId,
      items: []
    });
    
    if (!orderData || !orderData.id) {
      console.error("Invalid order response from Paymob:", JSON.stringify(orderData, null, 2));
      throw new Error("فشل في إنشاء الطلب لدى Paymob - استجابة غير صالحة");
    }
    
    console.log(`Successfully registered order with ID: ${orderData.id}`);
    return orderData;
  } catch (error) {
    console.error("Error registering order:", error.message);
    throw new Error(`فشل في إنشاء الطلب لدى Paymob: ${error.message}`);
  }
};

// =================================================================
// 5. نقاط النهاية (API Endpoints)
// =================================================================

// --- نقاط نهاية الإشعارات ---
app.post('/api/send-fcm-v1', async (req, res) => {
  try {
    const { token, title, body, data } = req.body;
    const result = await sendFCMNotificationV1({ token, title, body, data });
    res.json({ success: true, result });
  } catch (err) {
    console.error('FCM V1 Error:', err);
    return sendError(res, 500, 'حدث خطأ في الخادم', err, { success: false });
  }
});

// نقطة نهاية لإرسال إشعارات باستخدام IMEI
app.post('/api/send-notification-by-imei', async (req, res) => {
  try {
    const { imei, title, body, data } = req.body;

    // التحقق من وجود البيانات المطلوبة
    if (!imei || !title || !body) {
      return res.status(400).json({ success: false, error: 'البيانات المطلوبة مفقودة (imei, title, body)' });
    }

    // البحث عن FCM token باستخدام IMEI
    const fcmToken = await getFCMTokenByImei(imei);

    if (!fcmToken) {
      return res.status(404).json({ success: false, error: 'لم يتم العثور على FCM token لهذا الـ IMEI' });
    }

    // إضافة معلومات إضافية إلى البيانات
    const notificationData = {
      ...data,
      imei,
      timestamp: new Date().toISOString()
    };

    // إرسال الإشعار
    let result;
    try {
      result = await sendFCMNotificationV1({
        token: fcmToken,
        title,
        body,
        data: notificationData
      });
    } catch (fcmError) {
      console.error('فشل إرسال الإشعار عبر FCM:', fcmError);
      // لا نرجع خطأ هنا، فقط نستمر في تسجيل الإشعار في قاعدة البيانات
    }

    // تسجيل الإشعار في قاعدة البيانات (اختياري)
    try {
      const { error: dbError } = await supabase
        .from('notifications')
        .insert([{
          imei,
          title,
          body,
          data: notificationData,
          status: result ? 'sent' : 'failed'
        }]);

      if (dbError) {
        console.error('خطأ في تسجيل الإشعار في قاعدة البيانات:', dbError);
      }
    } catch (dbErr) {
      console.error('خطأ في تسجيل الإشعار في قاعدة البيانات:', dbErr);
    }

    res.json({ 
      success: true, 
      result,
      message: result ? 'Notification sent successfully' : 'Notification recorded but failed to send'
    });
  } catch (err) {
    console.error('خطأ في إرسال الإشعار:', err);
    return sendError(res, 500, 'حدث خطأ في الخادم', err, { success: false });
  }
});

// نقطة نهاية للبحث عن IMEI
app.post('/api/search-imei', async (req, res) => {
  try {
    const { imei, userId } = req.body;
    
    if (!imei) {
      return res.status(400).json({ error: 'IMEI is required' });
    }
    
    // التحقق من صحة الـ IMEI (يجب أن يكون 14-15 رقم)
    if (!/^\d{14,15}$/.test(imei)) {
      return res.status(400).json({ error: 'Invalid IMEI format' });
    }
    
    // التحقق من صحة التوكن واستخراج userId منه
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
    
    // استخدام userId من التوكن بدلاً من الطلب
    const authenticatedUserId = user.id;
    
    // 1. البحث في الهواتف المسجلة
    // ملاحظة: لا يمكن البحث المباشر بالقيمة المشفرة لأن التشفير يستخدم IV عشوائي (قيم مختلفة لنفس الـ IMEI)
    // لذلك نجلب البيانات ونفك تشفيرها للمقارنة
    const { data: allPhones, error: regError } = await supabase
      .from('registered_phones')
      .select('imei, registration_date, status, user_id');

    if (regError) {
      console.error('Error searching for registered phone:', regError);
      throw regError;
    }

    // فك تشفير IMEI المخزن ومقارنته مع الـ IMEI المرسل (تطبيع إلى أرقام فقط)
    const normalizedIncoming = normalizeDigitsOnly(imei);
    const regPhone = allPhones ? allPhones.find(p => normalizeDigitsOnly(decryptField(p.imei)) === normalizedIncoming) : null;

    // 2. البحث في البلاغات
    const { data: allReports, error: reportError } = await supabase
      .from('phone_reports')
      .select('imei, status, report_date, updated_at, loss_location, loss_time, user_id')
      .in('status', ['active', 'resolved']);

    if (reportError) {
      console.error('Error searching for reported phone:', reportError);
      throw reportError;
    }

    // فك تشفير IMEI المخزن في البلاغات ومقارنته
        // Debug: طباعة كل البلاغات بعد فك التشفير
        const debugReports = allReports ? allReports.map(r => ({
          imei: decryptField(r.imei),
          status: r.status,
          user_id: r.user_id,
          report_date: r.report_date,
          updated_at: r.updated_at
        })) : [];
        console.log('DEBUG: allReports (decrypted):', debugReports);

    // ابحث عن أي بلاغ موجود: سنُظهر البلاغ فقط إذا كان "active" صريحاً
    // تحقق هل المستخدم هو المالك (بمقارنة userId فقط)
    let isOwner = false;
    if (regPhone && regPhone.user_id && authenticatedUserId && regPhone.user_id === authenticatedUserId) {
      isOwner = true;
    }
    // ابحث عن بلاغ active يطابق الـ IMEI
    const activeReportAny = allReports ? allReports.find(r => normalizeDigitsOnly(decryptField(r.imei)) === normalizedIncoming && r.status === 'active') : null;
    console.log('DEBUG: imei to search:', imei);
    console.log('DEBUG: authenticatedUserId:', authenticatedUserId);
    console.log('DEBUG: activeReportAny:', activeReportAny);

    if (activeReportAny) {
      // يوجد بلاغ فعال — نُظهره بغض النظر عن هوية المبلغ
      res.json({
        found: true,
        masked: true,
        isOwner: isOwner,
        status: activeReportAny.status,
        report_date: activeReportAny.report_date,
        resolved_date: activeReportAny.resolved_date || activeReportAny.updated_at,
        loss_location: activeReportAny.loss_location,
        loss_time: activeReportAny.loss_time,
        registered: !!regPhone,
        isRegistered: !!regPhone,
        registeredPhone: regPhone ? { registration_date: regPhone.registration_date, status: regPhone.status, user_id: regPhone.user_id } : null
      });
    } else if (regPhone && isOwner) {
      // الهاتف مسجل للمستخدم الحالي ولا يوجد بلاغ فعال
      res.json({
        found: false,
        masked: true,
        isOwner: true,
        registered: true,
        isRegistered: true,
        registeredPhone: { registration_date: regPhone.registration_date, status: regPhone.status, user_id: regPhone.user_id }
      });
    } else if (regPhone) {
      // الهاتف مسجل لمستخدم آخر
      res.json({
        found: false,
        masked: true,
        isOwner: false,
        registered: true,
        isRegistered: true,
        registeredPhone: { registration_date: regPhone.registration_date, status: regPhone.status, user_id: regPhone.user_id }
      });
    } else {
      // الهاتف غير مسجل ولا يوجد بلاغ
      res.json({
        found: false,
        masked: false,
        isOwner: false,
        registered: false
      });
    }
    
    // تسجيل البحث الناجح للتحليل وإحصائيات الاستخدام
    try {
      await supabase.from('search_history').insert({
        user_id: authenticatedUserId,
        imei: imei,
        found: !!activeReport || !!regPhone,
        created_at: new Date().toISOString()
      });
    } catch (logError) {
      // لا نوقف العملية إذا فشل تسجيل البحث
      console.error('Error logging search history:', logError);
    }
  } catch (error) {
    console.error('Error searching IMEI:', error);
    res.status(500).json({ error: 'Error searching IMEI' });
  }
});

// نقطة نهاية لإرسال إشعارات من هاتف لآخر
app.post('/api/send-notification', async (req, res) => {
  try {
    const { senderId, receiverToken, title, body, data } = req.body;

    // التحقق من وجود البيانات المطلوبة
    if (!receiverToken || !title || !body) {
      return res.status(400).json({ success: false, error: 'البيانات المطلوبة مفقودة (receiverToken, title, body)' });
    }

    // إضافة معلومات المرسل إلى البيانات
    const notificationData = {
      ...data,
      senderId,
      timestamp: new Date().toISOString()
    };

    // إرسال الإشعار
    const result = await sendFCMNotificationV1({
      token: receiverToken,
      title,
      body,
      data: notificationData
    });

    // تسجيل الإشعار في قاعدة البيانات (اختياري)
    if (senderId) {
      try {
        const { error: dbError } = await supabase
          .from('notifications')
          .insert([{
            sender_id: senderId,
            receiver_token: receiverToken,
            title,
            body,
            data: notificationData,
            status: 'sent'
          }]);

        if (dbError) {
          console.error('خطأ في تسجيل الإشعار في قاعدة البيانات:', dbError);
        }
      } catch (dbErr) {
        console.error('خطأ في تسجيل الإشعار في قاعدة البيانات:', dbErr);
      }
    }

    res.json({ success: true, result });
  } catch (err) {
    console.error('خطأ في إرسال الإشعار:', err);
    return sendError(res, 500, 'حدث خطأ في الخادم', err, { success: false });
  }
});

// --- نقاط نهاية Paymob ---

// نقطة نهاية لحفظ بلاغ فقدان الهاتف مع تشفير البيانات
app.post('/api/report-lost-phone', async (req, res) => {
  try {
    const data = req.body;


    // تحقق من روابط الصور (الفاتورة والمحضر) أنها روابط https صالحة أو فارغة (null/undefined)
    const isValidImageUrl = (url) => {
      if (!url) return false;
      if (typeof url !== 'string') return false;
      // يجب أن يبدأ الرابط بـ https:// ويحتوي على /storage/v1/object/public/
      return url.startsWith('https://') && url.includes('/storage/v1/object/public/');
    };

    // إذا لم تُرسل receipt_image_url أو كانت غير صالحة، ارفض الطلب مباشرة
    if (!('receipt_image_url' in data) || !data.receipt_image_url || !isValidImageUrl(data.receipt_image_url)) {
      return res.status(400).json({ success: false, error: 'يجب رفع صورة الفاتورة بشكل صحيح (رابط صالح).' });
    }
    if ('report_image_url' in data && data.report_image_url && !isValidImageUrl(data.report_image_url)) {
      return res.status(400).json({ success: false, error: 'رابط صورة المحضر غير صالح أو لم يتم رفع الصورة بشكل صحيح.' });
    }

    // التحقق مما إذا كان الهاتف مسجلاً ومنع غير المالك من تقديم البلاغ
    if (data.imei) {
      // تطبيع الـ IMEI الوارد (أزل كل غير الأرقام) لمطابقة أكثر مرونة
      const incomingImei = String(data.imei || '').replace(/\D/g, '');
      const { data: phones } = await supabase.from('registered_phones').select('*');
      const registeredPhone = phones ? phones.find(p => {
        const stored = decryptField(p.imei) || '';
        const normalizedStored = String(stored).replace(/\D/g, '');
        return normalizedStored === incomingImei;
      }) : null;

      if (registeredPhone) {
        // تحديد معرف المرسل: إذا جاء عبر التوكن استخدم req.user، وإلا احترم الحقل المرسَل (إن وُجد)
        const requesterId = (req && req.user && req.user.id) ? req.user.id : (data.user_id || null);

        // إذا كانت الحالة 'transferred' فالهاتف قد انتقلت ملكيته — فقط المالك الحالي يستطيع تقديم البلاغ
        if (registeredPhone.status === 'transferred') {
          // إن كان المسجل مرتبطاً بحساب مسجل
          if (registeredPhone.user_id) {
            if (!requesterId || registeredPhone.user_id !== requesterId) {
              return res.status(403).json({ success: false, error: 'الهاتف نُقلت ملكيته. فقط المالك الحالي يمكنه تقديم البلاغ.' });
            }
          } else {
            // حالة نقل الملكية لكن بدون owner account (user_id == null)
            // لا نسمح للغير بتقديم بلاغ باسم المالك القديم أو كطرف ثالث
            return res.status(403).json({ success: false, error: 'الهاتف نُقلت ملكيته ولا يمكن تقديم بلاغ من قبل طرف غير مرتبط.' });
          }
        } else {
          // الحالة الاعتيادية: تأكد أن المرسل هو المالك المسجّل
          if (!requesterId || registeredPhone.user_id !== requesterId) {
            return res.status(403).json({ success: false, error: 'فقط صاحب الهاتف يمكنه تقديم البلاغ' });
          }
        }
      }
    }
    // تشفير كلمة المرور قبل الحفظ
    if (data.password) {
      data.password = crypto.createHash('sha256').update(data.password).digest('hex');
    }

    // تشفير الحقول الحساسة
    if (data.imei) {
      // تسجيل هاش للايمي (SHA-256)
      const imeiHash = crypto.createHash('sha256').update(String(data.imei)).digest('hex');
      data.imei_hash = imeiHash;

      // حفظ نسخة مقنّعة قابلة للعرض (masked_imei)
      try {
        const digitsOnly = String(data.imei || '').replace(/\D/g, '');
        if (digitsOnly) {
          const shown = digitsOnly.slice(0, 6);
          const masked = shown + '*'.repeat(Math.max(0, 15 - shown.length));
          data.masked_imei = masked;
        }
      } catch (e) {
        console.warn('Warning: failed to compute masked_imei', e);
      }

      const encryptedImei = encryptAES(data.imei);
      if (!encryptedImei) {
        return res.status(400).json({ success: false, error: 'فشل تشفير رقم IMEI' });
      }
      data.imei = JSON.stringify({ encryptedData: encryptedImei.encryptedData, iv: encryptedImei.iv, authTag: encryptedImei.authTag });
    }
    if (data.ownerName) {
      const encryptedOwner = encryptAES(data.ownerName);
      if (!encryptedOwner) {
        return res.status(400).json({ success: false, error: 'فشل تشفير اسم المالك' });
      }
      data.owner_name = JSON.stringify({ encryptedData: encryptedOwner.encryptedData, iv: encryptedOwner.iv, authTag: encryptedOwner.authTag });
      delete data.ownerName;
    }
    if (data.phoneNumber) {
      const encryptedPhone = encryptAES(data.phoneNumber);
      if (!encryptedPhone) {
        return res.status(400).json({ success: false, error: 'فشل تشفير رقم الهاتف' });
      }
      data.phone_number = JSON.stringify({ encryptedData: encryptedPhone.encryptedData, iv: encryptedPhone.iv, authTag: encryptedPhone.authTag });
      delete data.phoneNumber;
    }
    if (data.idLast6) {
      const encryptedId = encryptAES(data.idLast6);
      if (!encryptedId) {
        return res.status(400).json({ success: false, error: 'فشل تشفير رقم الهوية' });
      }
      data.id_last6 = JSON.stringify({ encryptedData: encryptedId.encryptedData, iv: encryptedId.iv, authTag: encryptedId.authTag });
      delete data.idLast6;
    }
    if (data.email) {
      const encryptedEmail = encryptAES(data.email);
      if (!encryptedEmail) {
        return res.status(400).json({ success: false, error: 'فشل تشفير البريد الإلكتروني' });
      }
      data.email = JSON.stringify({ encryptedData: encryptedEmail.encryptedData, iv: encryptedEmail.iv, authTag: encryptedEmail.authTag });
    }
    // حفظ البلاغ في قاعدة البيانات
    const { data: inserted, error } = await supabase
      .from('phone_reports')
      .insert([data])
      .select();
    if (error) {
      console.error('Error saving report:', error);
      return sendError(res, 500, 'حدث خطأ في الخادم', error, { success: false });
    }
    res.json({ success: true, data: inserted });
  } catch (err) {
    console.error('Error in /api/report-lost-phone:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// متغيرات البيئة
const PAYMOB_API_KEY = process.env.PAYMOB_API_KEY;
const INTEGRATION_ID = process.env.PAYMOB_INTEGRATION_ID;
const IFRAME_ID = process.env.PAYMOB_IFRAME_ID;
const HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET;

// طباعة متغيرات Paymob للتحقق
console.log('Paymob variables check:');
console.log('PAYMOB_API_KEY:', PAYMOB_API_KEY ? 'Found' : 'Not found');
console.log('INTEGRATION_ID:', INTEGRATION_ID ? 'Found' : 'Not found');
console.log('IFRAME_ID:', IFRAME_ID ? 'Found' : 'Not found');
console.log('HMAC_SECRET:', HMAC_SECRET ? 'Found' : 'Not found');

// التحقق من متغيرات البيئة عند بدء التشغيل
if (!PAYMOB_API_KEY || !INTEGRATION_ID || !IFRAME_ID || !HMAC_SECRET) {
  console.error("❌ خطأ: متغيرات البيئة الخاصة بـ Paymob غير مكتملة. يرجى التحقق من ملف .env");
  process.exit(1); // إيقاف السيرفر إذا كانت المتغيرات ناقصة
}

// إرسال بريد إلكتروني للمالك عند العثور على الهاتف
app.post('/api/update-finder-phone-by-imei', async (req, res) => {
  console.log('POST request received at /api/update-finder-phone-by-imei');
  const { imei, ownerName, finderPhone } = req.body;

  if (!imei || !finderPhone) {
    return res.status(400).json({ error: 'IMEI and finderPhone are required' });
  }
  
  console.log(`Processing IMEI: ${imei}, Finder phone: ${finderPhone}, Owner name: ${ownerName || 'Not provided'}`);

  // مجموعة لتتبع الإشعارات المرسلة مؤخرًا لمنع التكرار
  const recentlyNotified = new Set();

  // --- ⭐ التحقق من فترة التهدئة (Cooldown) ---
  // إذا تم إرسال إشعار لهذا الـ IMEI مؤخرًا، تجاهل الطلب الحالي.
  if (recentlyNotified.has(imei)) {
    console.log(`[Cooldown] Blocked duplicate notification request for IMEI: ${imei}`);
    // أرسل ردًا ناجحًا لتجنب ظهور خطأ في الواجهة الأمامية
    return res.json({ ok: true, message: 'Notification already sent recently.' });
  }

  try {
    // 1. البحث عن الهاتف للحصول على معلومات المالك (بريد، اسم، وتوكن الإشعارات، ومعرف الواجد)
    console.log(`Searching for phone with IMEI: ${imei}`);
    const { data: allReports, error: reportError } = await supabase
      .from('phone_reports')
      .select('id, imei, email, owner_name, fcm_token, finder_user_id')
      .order('id', { ascending: true });

    if (reportError || !allReports || allReports.length === 0) {
      console.error(`No phone_reports found. Error:`, reportError);
      return res.status(404).json({ error: 'لم يتم العثور على الهاتف في البلاغات', imei });
    }

    // فك تشفير IMEI ومقارنته
    const normalizedIncoming = imei.replace(/\D/g, '');
    let foundReport = null;
    for (const r of allReports) {
      let decrypted = null;
      try {
        decrypted = decryptField(r.imei);
      } catch (e) {}
      if (decrypted && decrypted.replace(/\D/g, '') === normalizedIncoming) {
        foundReport = r;
        break;
      }
    }

    if (!foundReport) {
      console.error(`Phone not found for IMEI (decrypted match): ${imei}`);
      return res.status(404).json({ error: 'لم يتم العثور على الهاتف في البلاغات', imei });
    }

    const decryptedOwnerName = (() => {
      if (!foundReport.owner_name) return undefined;
      try {
        return decryptField(foundReport.owner_name) || foundReport.owner_name;
      } catch (e) {
        console.error('فشل فك تشفير owner_name:', e);
        return foundReport.owner_name;
      }
    })();

    const decryptedOwnerEmail = (() => {
      if (!foundReport.email) return undefined;
      try {
        return decryptField(foundReport.email) || foundReport.email;
      } catch (e) {
        console.error('فشل فك تشفير email:', e);
        return foundReport.email;
      }
    })();

    const decryptedImei = (() => {
      if (!foundReport.imei) return undefined;
      try {
        return decryptField(foundReport.imei) || foundReport.imei;
      } catch (e) {
        console.error('فشل فك تشفير IMEI:', e);
        return foundReport.imei;
      }
    })();

    const ownerLanguage = await (async () => {
      if (!decryptedOwnerEmail) return 'ar';
      try {
        const { data, error } = await supabase
          .from('users')
          .select('language')
          .ilike('email', decryptedOwnerEmail)
          .maybeSingle();
        if (error) {
          console.error('فشل جلب لغة المستخدم:', error);
          return 'ar';
        }
        return data?.language || 'ar';
      } catch (e) {
        console.error('خطأ أثناء جلب لغة المستخدم:', e);
        return 'ar';
      }
    })();

    const normalizedLang = String(ownerLanguage || 'ar').toLowerCase();
    const notificationsByLang = {
      ar: {
        title: 'تم العثور على هاتفك!',
        body: `مبروك! تم العثور على هاتفك. للتواصل مع الشخص الذي وجده، يرجى الاتصال على الرقم: ${finderPhone}.`,
        emailSubject: 'تهانينا! تم العثور على هاتفك المفقود',
        emailHtml: `<p>عزيزي ${ownerName || decryptedOwnerName || foundReport.owner_name || ''},</p>
          <p>مبروك! تم العثور على هاتفك المفقود (IMEI: ${decryptedImei || foundReport.imei || ''}).</p>
          <p>يرجى التواصل مع الشخص الذي وجد الهاتف على الرقم: <b>${finderPhone}</b> لاستلام هاتفك.</p>
          <p>نتمنى لك يوماً سعيداً!</p>`
      },
      en: {
        title: 'Your phone was found!',
        body: `Congratulations! Your phone was found. To contact the finder, please call: ${finderPhone}.`,
        emailSubject: 'Great news! Your lost phone was found',
        emailHtml: `<p>Dear ${ownerName || decryptedOwnerName || foundReport.owner_name || ''},</p>
          <p>Good news! Your lost phone was found (IMEI: ${decryptedImei || foundReport.imei || ''}).</p>
          <p>Please contact the finder at: <b>${finderPhone}</b> to retrieve your phone.</p>
          <p>Have a great day!</p>`
      },
      fr: {
        title: 'Votre téléphone a été retrouvé !',
        body: `Félicitations ! Votre téléphone a été retrouvé. Pour contacter la personne qui l'a trouvé, appelez : ${finderPhone}.`,
        emailSubject: 'Bonne nouvelle ! Votre téléphone a été retrouvé',
        emailHtml: `<p>Cher/Chère ${ownerName || decryptedOwnerName || foundReport.owner_name || ''},</p>
          <p>Bonne nouvelle ! Votre téléphone perdu a été retrouvé (IMEI : ${decryptedImei || foundReport.imei || ''}).</p>
          <p>Veuillez contacter la personne qui l'a trouvé au : <b>${finderPhone}</b> pour le récupérer.</p>
          <p>Bonne journée !</p>`
      },
      hi: {
        title: 'आपका फोन मिल गया है!',
        body: `बधाई हो! आपका फोन मिल गया है। खोजने वाले से संपर्क करने के लिए कॉल करें: ${finderPhone}.`,
        emailSubject: 'खुशखबरी! आपका खोया फोन मिल गया है',
        emailHtml: `<p>प्रिय ${ownerName || decryptedOwnerName || foundReport.owner_name || ''},</p>
          <p>खुशखबरी! आपका खोया हुआ फोन मिल गया है (IMEI: ${decryptedImei || foundReport.imei || ''}).</p>
          <p>कृपया फोन प्राप्त करने के लिए खोजने वाले से संपर्क करें: <b>${finderPhone}</b>.</p>
          <p>आपका दिन शुभ हो!</p>`
      }
    };

    const localizedContent = notificationsByLang[normalizedLang] || notificationsByLang.ar;

    // إرسال البريد الإلكتروني
    if (decryptedOwnerEmail) {
      const cleanEmail = decryptedOwnerEmail.trim();
      console.log('إرسال بريد إلكتروني إلى:', cleanEmail);

      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: cleanEmail,
        subject: localizedContent.emailSubject,
        html: localizedContent.emailHtml
      });
      console.log('Email sent successfully.');
      return res.json({ success: true, message: 'Email sent successfully' });
    } else {
      return res.status(400).json({ error: 'لم يتم العثور على بريد إلكتروني مسجل لهذا الهاتف' });
    }
  } catch (err) {
    console.error('خطأ في إرسال الإشعار البريدي:', err);
    res.status(500).json({ error: 'خطأ في إرسال الإشعار البريدي' });
  }
});

// نقطة نهاية للبحث عن الهواتف غير المطالب بها الخاصة بالمستخدم (Check Unclaimed Phones)
app.get('/api/check-unclaimed-phones', verifyJwtToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    console.log(`[Check Unclaimed] Checking for user: ${userEmail}`);
    
    // جلب الهواتف التي ليس لها user_id
    const { data: phones, error } = await supabase
      .from('registered_phones')
      .select('id, imei, phone_type, email')
      .is('user_id', null);

    if (error) throw error;

    const myPhones = [];
    
    if (phones && phones.length > 0) {
      console.log(`[Check Unclaimed] Found ${phones.length} phones with null user_id`);
      for (const phone of phones) {
        let decryptedEmail = decryptField(phone.email);
        
        // تحسين المقارنة: تجاهل حالة الأحرف والمسافات
        if (decryptedEmail && userEmail && 
            decryptedEmail.trim().toLowerCase() === userEmail.trim().toLowerCase()) {
          // فك تشفير البيانات الأخرى للعرض
          let decryptedImei = decryptField(phone.imei);
          
          myPhones.push({
            id: phone.id,
            imei: decryptedImei,
            phone_type: phone.phone_type
          });
        }
      }
    } else {
      console.log('[Check Unclaimed] No phones found with null user_id');
    }

    res.json({ success: true, phones: myPhones });

  } catch (error) {
    console.error('Error checking unclaimed phones:', error);
    return sendError(res, 500, 'حدث خطأ في الخادم', error);
  }
});

// نقطة نهاية لربط الهاتف بالمستخدم عن طريق البريد الإلكتروني (Claim Phone)
app.post('/api/claim-phone-by-email', verifyJwtToken, async (req, res) => {
  const { imei } = req.body;
  const user = req.user;

  if (!imei) {
    return res.status(400).json({ error: 'IMEI is required' });
  }

  try {
    // 1. التحقق من أن الهاتف موجود وليس له user_id
    // بما أن IMEI مشفر، نحتاج للبحث عنه. 
    // ملاحظة: البحث عن IMEI المشفر يتطلب أن يكون التشفير حتمي (Deterministic) أو البحث في الكل.
    // هنا سنفترض أننا سنبحث في الكل ونطابق (أو إذا كان العميل أرسل الـ IMEI الأصلي، سنبحث عنه في القائمة التي جلبناها سابقاً أو نعيد البحث).
    // للأمان، سنعيد البحث في الهواتف غير المطالب بها.
    
    const { data: phones, error: fetchError } = await supabase
      .from('registered_phones')
      .select('id, email, user_id, imei')
      .is('user_id', null);

    if (fetchError) throw fetchError;

    const targetPhone = phones.find(p => decryptField(p.imei) === imei && decryptField(p.email) === user.email);

    if (!targetPhone) {
      return res.status(404).json({ error: 'Phone not found or email mismatch' });
    }

    // 2. تحديث user_id
    const { error: updateError } = await supabase
      .from('registered_phones')
      .update({ user_id: user.id })
      .eq('id', targetPhone.id);

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Phone claimed successfully' });

  } catch (error) {
    console.error('Error claiming phone:', error);
    return sendError(res, 500, 'حدث خطأ في الخادم', error);
  }
});

// Middleware to verify JWT token
const verifyJwtToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('JWT verification failed:', error);
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }
};
