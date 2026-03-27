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
    const { data: reportData, error: reportError } = await supabase
      .from('phone_reports')
      .select('email, owner_name, imei, fcm_token, finder_user_id, id')
      .eq('imei', imei)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (reportError || !reportData) {
      console.error(`Phone not found for IMEI: ${imei}. Error:`, reportError);
      return res.status(404).json({ error: 'لم يتم العثور على الهاتف في البلاغات', imei });
    }
    
    console.log(`Phone found for IMEI: ${imei}. Owner: ${reportData.owner_name}`);

    // 2. تحديث حقل finder_phone باستخدام imei
    const { error: updateError } = await supabase
      .from('phone_reports')
      .update({ finder_phone: finderPhone })
      .eq('imei', imei)
      .order('id', { ascending: true })
      .limit(1);

    if (updateError) {
      console.error('فشل تحديث finder_phone في phone_reports:', updateError);
      // لا توقف العملية، فقط سجل الخطأ
    } else {
      console.log('Finder phone saved to database successfully');
    }

    // ⭐ 3. إرسال الإشعار والبريد الإلكتروني بعد التحديث الناجح
    if (reportData.fcm_token) {
      console.log(`Found FCM token, sending push notification to: ${reportData.fcm_token}`);
      try {
        const notificationBody = `مبروك! تم العثور على هاتفك. للتواصل مع الشخص الذي وجده، يرجى الاتصال على الرقم: ${finderPhone}.`;
        await sendFCMNotificationV1({
          token: reportData.fcm_token,
          title: 'تم العثور على هاتفك!',
          body: notificationBody,
          data: {
            type: 'phone_found',
            imei: reportData.imei
          }
        });
        console.log('Push notification sent successfully.');
      } catch (fcmError) {
        // لا توقف العملية كلها إذا فشل الإشعار، فقط سجل الخطأ
        console.error('Failed to send FCM notification:', fcmError);
      }
    } else {
      console.log('No FCM token found for this report, skipping push notification.');
    }

    // 4. إرسال البريد الإلكتروني (كما كان)
    if (reportData.email) {
      const cleanEmail = reportData.email.trim();
      console.log('إرسال بريد إلكتروني إلى:', cleanEmail);

      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: cleanEmail,
        subject: 'تهانينا! تم العثور على هاتفك المفقود',
        html: `<p>عزيزي ${ownerName || reportData.owner_name || ''},</p>
          <p>مبروك! تم العثور على هاتفك المفقود (IMEI: ${reportData.imei || ''}).</p>
          <p>يرجى التواصل مع الشخص الذي وجد الهاتف على الرقم: <b>${finderPhone}</b> لاستلام هاتفك.</p>
          <p>نتمنى لك يوماً سعيداً!</p>`
      });
      console.log('Email sent successfully.');
    } else {
      console.log('No email found for this report, skipping email notification.');
    }

    // إذا لم يكن هناك بريد إلكتروني أو توكن، قد يكون هناك مشكلة
    if (!reportData.fcm_token && !reportData.email) {
      return res.status(400).json({ error: 'لم يتم العثور على بريد إلكتروني أو توكن إشعارات مسجل لهذا الهاتف' });
    }

    // --- ⭐ بدء فترة التهدئة بعد الإرسال الناجح ---
    // أضف الـ IMEI إلى المجموعة وقم بإزالته بعد 30 ثانية.
    recentlyNotified.add(imei);
    setTimeout(() => {
      recentlyNotified.delete(imei);
    }, 30000); // 30 ثانية

    res.json({ success: true, message: 'Notifications sent.' });
  } catch (err) {
    console.error('خطأ في إرسال الإشعارات:', err);
    res.status(500).json({ error: 'خطأ في إرسال الإشعارات' });
  }
});

app.post('/api/get-finder-phone', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  let finderPhoneNumber = null;

  try {
    console.log(`البحث عن رقم هاتف للمستخدم بالمعرف: ${userId}`);

    // ⭐ إرسال طلبات البحث في كلا الجدولين في نفس الوقت
    const [userResult, businessResult] = await Promise.allSettled([
      supabase
        .from('users')
        .select('phone') // تصحيح: اسم العمود هو 'phone' وليس 'phone_number'
        .eq('id', userId)
        .single(),
      supabase
        .from('businesses')
        .select('phone') // تصحيح: اسم العمود هو 'phone' وليس 'phone_number'
        .eq('user_id', userId) // تصحيح: البحث باستخدام user_id بدلاً من id
        .single()
    ]);

    // ⭐ تحقق من نتيجة البحث في جدول users
    if (userResult.status === 'fulfilled' && userResult.value.data && !userResult.value.error) {
      finderPhoneNumber = userResult.value.data.phone;
      console.log('تم العثور على رقم هاتف في جدول users:', finderPhoneNumber);
    }

    // ⭐ إذا لم يتم العثوره في users، تحقق من نتيجة البحث في جدول businesses
    if (!finderPhoneNumber && businessResult.status === 'fulfilled' && businessResult.value.data && !businessResult.value.error) {
      finderPhoneNumber = businessResult.value.data.phone;
      console.log('تم العثور على رقم هاتف في جدول businesses:', finderPhoneNumber);
    }

    // إذا تم العثور على الرقم في أي من الجدولين، أرسله
    if (finderPhoneNumber) {
      res.status(200).json({ finderPhone: finderPhoneNumber });
    } else {
      // إذا لم يتم العثور عليه في أي من الجدولين
      console.log('لم يتم العثور على رقم هاتف للمستخدم في أي من الجدولين.');
      res.status(404).json({ error: 'Phone number not found for the given userId in users or businesses table.' });
    }

  } catch (err) {
    console.error('Error in /api/get-finder-phone:', err);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

// 🏠 الصفحة الرئيسية
app.get("/", (req, res) => {
  res.json({
    status: "✅ Paymob Server Running Successfully",
    message: "مرحباً! سيرفر Paymob يعمل بنجاح",
    server_info: {
      name: "Paymob Payment Server",
      version: "1.0.0",
      uptime: Math.floor(process.uptime()) + " seconds",
      node_version: process.version,
      platform: process.platform
    },
    endpoints: {
      health: "/health - فحص حالة السيرفر",
      create_payment: "POST /paymob/create-payment - إنشاء عملية دفع",
      create_invoice: "POST /paymob/create-invoice - إنشاء فاتورة",
      webhook: "POST /paymob/webhook - استقبال إشعارات الدفع",
      notify_owner_email: "POST /api/notify-owner-email - إرسال إشعار بالبريد الإلكتروني للمالك",
      send_fcm: "POST /api/send-fcm-v1 - إرسال إشعار FCM",
      send_notification: "POST /api/send-notification - إرسال إشعار من هاتف لآخر",
      send_notification_by_imei: "POST /api/send-notification-by-imei - إرسال إشعار باستخدام IMEI",
      get_finder_phone: "POST /api/get-finder-phone - جلب رقم هاتف الواجد",
      update_fcm_token: "POST /api/update-fcm-token - تحديث توكن الإشعارات للمستخدم",
      update_finder_phone_by_fcm: "POST /api/update-finder-phone-by-fcm - تحديث رقم هاتف الواجد باستخدام FCM",
      update_finder_phone_by_imei: "POST /api/update-finder-phone-by-imei - تحديث رقم هاتف الواجد باستخدام IMEI"
    },
    environment_status: {
      api_key: !!PAYMOB_API_KEY ? "✅ متوفر" : "❌ مفقود",
      integration_id: !!INTEGRATION_ID ? "✅ متوفر" : "❌ مفقود",
      iframe_id: !!IFRAME_ID ? "✅ متوفر" : "❌ مفقود",
      hmac_secret: !!HMAC_SECRET ? "✅ متوفر" : "❌ مفقود (مهم لأمان الـ webhook)"
    },
    test_payment_example: {
      description: "مثال لإنشاء عملية دفع",
      url: req.protocol + '://' + req.get('host') + '/paymob/create-payment',
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        amount: 100,
        email: "test@example.com",
        name: "أحمد محمد",
        phone: "01234567890",
        merchantOrderId: "TEST-001"
      }
    },
    test_invoice_example: {
      description: "مثال لإنشاء فاتورة",
      url: req.protocol + '://' + req.get('host') + '/paymob/create-invoice',
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        amount: 4000,
        currency: "EGP",
        shippingData: {
          first_name: "Test",
          last_name: "Account",
          phone_number: "01010101010",
          email: "test@account.com"
        },
        items: [
          {
            name: "ASC1525",
            amount_cents: "4000",
            quantity: "1",
            description: "Smart Watch"
          }
        ]
      }
    },
    timestamp: new Date().toISOString()
  });
});

// 2. تسجيل الفاتورة
const registerInvoice = async (token, { amount, currency, shippingData, items }) => {
  try {
    console.log("Registering invoice with Paymob...");
    
    const amountCents = Math.round(Number(amount) * 100);
    if (isNaN(amountCents)) {
      throw new Error("المبلغ المرسل غير صالح");
    }
    
    const currencyCode = currency || "EGP";
    const defaultShippingData = {
      first_name: "Test",
      last_name: "Account",
      phone_number: "01010101010",
      email: "test@account.com"
    };
    
    const orderData = await paymobRequest("https://accept.paymob.com/api/ecommerce/orders", {
      auth_token: token,
      api_source: "INVOICE",
      amount_cents: amountCents,
      currency: currencyCode,
      shipping_data: shippingData || defaultShippingData,
      items: items || [],
      delivery_needed: "false"
    });
    
    if (!orderData || !orderData.id) {
      console.error("Invalid invoice response from Paymob:", JSON.stringify(orderData, null, 2));
      throw new Error("فشل في إنشاء الفاتورة لدى Paymob - استجابة غير صالحة");
    }
    
    console.log(`Successfully registered invoice with ID: ${orderData.id}`);
    return orderData;
  } catch (error) {
    console.error("Error registering invoice:", error.message);
    throw new Error(`فشل في إنشاء الفاتورة لدى Paymob: ${error.message}`);
  }
};

// 3. الحصول على مفتاح الدفع
const getPaymentKey = async (token, { amount, orderId, email, name, phone, redirect_url, failed_redirect_url }) => {
  const billingData = {
    apartment: "NA",
    email: email || "user@example.com",
    floor: "NA",
    first_name: name ? name.split(' ')[0] : "User",
    street: "NA",
    building: "NA",
    phone_number: phone || "01000000000",
    shipping_method: "NA",
    postal_code: "NA",
    city: "Cairo",
    country: "EG",
    last_name: name ? name.split(' ').slice(1).join(' ') || "NA" : "NA",
    state: "NA",
  };

  // محاولة الحصول على مفتاح الدفع مع تجنب الأخطاء الشائعة
  try {
    // استخدام تكامل مبسط بدون خصومات أو قسائم
    const paymentKeyData = await paymobRequest("https://accept.paymob.com/api/acceptance/payment_keys", {
      auth_token: token,
      amount_cents: Math.round(Number(amount) * 100),
      expiration: 3600,
      order_id: orderId,
      currency: "EGP",
      integration_id: Number(INTEGRATION_ID),
      billing_data: billingData,
      // إعدادات لتجنب الأخطاء
      // تعطيل الخصومات والقسائم
      discount: null,
      coupons: [],
      // إضافة روابط إعادة التوجيه بشكل صريح
      redirect_url: redirect_url,
      failed_redirect_url: failed_redirect_url
    });
    
    if (!paymentKeyData.token) throw new Error("فشل في الحصول على مفتاح الدفع من Paymob");
    return paymentKeyData.token;
  } catch (error) {
    console.error("Error getting payment key:", error.message);
    
    // إذا فشل الاول، حاول بدون خصومات أو قسائم
    try {
      const paymentKeyData = await paymobRequest("https://accept.paymob.com/api/acceptance/payment_keys", {
        auth_token: token,
        amount_cents: Math.round(Number(amount) * 100),
        expiration: 3600,
        order_id: orderId,
        currency: "EGP",
        integration_id: Number(INTEGRATION_ID),
        billing_data: billingData,
        // إضافة روابط إعادة التوجيه بشكل صريح
        "redirect_url": redirect_url,
        "failed_redirect_url": failed_redirect_url
      });
      
      if (!paymentKeyData.token) throw new Error("فشل في الحصول على مفتاح الدفع من Paymob");
      return paymentKeyData.token;
    } catch (secondError) {
      console.error("Second attempt to get payment key failed:", secondError.message);
      throw new Error(`فشل في الحصول على مفتاح الدفع من Paymob: ${secondError.message}`);
    }
  }
};

app.post("/paymob/create-payment", paymentLimiter, rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  // per-operation timeout guard
  let _timedOut = false;
  const _timeoutHandle = setTimeout(() => {
    _timedOut = true;
    if (!res.headersSent) return sendError(res, 504, 'انتهت مهلة عملية الدفع');
  }, PAYMENT_OP_TIMEOUT_MS);

  const safeStatusJson = (status, payload) => {
    if (_timedOut || res.headersSent) return;
    clearTimeout(_timeoutHandle);
    return res.status(status).json(payload);
  };
  const safeJson = (payload) => {
    if (_timedOut || res.headersSent) return;
    clearTimeout(_timeoutHandle);
    return res.json(payload);
  };

  try {
    console.log("Received create-payment request:", JSON.stringify(req.body, null, 2));
    
    // ⭐ تعديل: استقبال adId للتمييز بين الإنشاء والتحديث
    const { amount, email, name, phone, merchantOrderId, adData, redirect_url_success, redirect_url_failed, isSpecialAd, adId, signature, timestamp } = req.body;

    // سيتم التحقق من التوقيع بعد تحديد المبلغ المتوقع من الخادم (أكثر أماناً)
    
    // التحقق من وجود البيانات المطلوبة
    if (!amount) {
      return res.status(400).json({ error: "المبلغ مطلوب" });
    }
    
    // ===== تحقق من المبلغ: لا تعتمد على مبلغ العميل دون تحقق من الخادم =====
    // حاول تحديد السعر المتوقع بناءً على بيانات الإعلان أو معرف الإعلان
    let expectedAmount = null;
    try {
      // إذا كان هناك adId، حاول جلب الإعلان الموجود
      if (adId) {
        const { data: existingAd, error: fetchError } = await supabase
          .from('ads_payment')
          .select('id, type, duration_days, amount')
          .eq('id', adId)
          .single();
        if (!fetchError && existingAd) {
          // إذا كان السجل يحتوي على amount مخزّن فاعتمده
          if (existingAd.amount) expectedAmount = Number(existingAd.amount);
          // وإلا حاول جلب السعر من جدول ads_price باستخدام النوع والمدد
          if (!expectedAmount && existingAd.type && existingAd.duration_days) {
            const { data: priceRows, error: priceErr } = await supabase
              .from('ads_price')
              .select('amount')
              .eq('type', existingAd.type)
              .eq('duration_days', existingAd.duration_days)
              .limit(1)
              .single();
            if (priceRows && priceRows.amount) expectedAmount = Number(priceRows.amount);
          }
        }
      }

      // إذا لم نحصل على سعر بعد، وحُدِثت بيانات الإعلان في الطلب، استخدمها
      if (!expectedAmount && adData && adData.type) {
        const durationDays = adData.duration_days || adData.duration || null;
        if (durationDays) {
          const { data: priceRows, error: priceErr } = await supabase
            .from('ads_price')
            .select('amount')
            .eq('type', adData.type)
            .eq('duration_days', durationDays)
            .limit(1)
            .single();
          if (priceRows && priceRows.amount) expectedAmount = Number(priceRows.amount);
        }
        // كملطفة: إذا كان adData يحتوي على amount الموثوق به من النظام الخلفي، استخدمه
        if (!expectedAmount && typeof adData.amount !== 'undefined') expectedAmount = Number(adData.amount);
      }

      // أخيرًا، إذا لم نستطع تحديد سعر متوقع، نفّذ فشل صريح
      if (expectedAmount === null) {
        console.warn('Unable to determine expected amount for payment verification', { adId, adData });
        return safeStatusJson(400, { error: 'تعذر التحقق من قيمة الدفع' });
      }

      // الآن نتحقق من التوقيع مقابل المبلغ المتوقع (أكثر صرامة)
      if (!(await verifySignatureHmac({ merchantOrderId, amount: expectedAmount, timestamp, signature }))) {
        console.warn('Rejected create-payment due to invalid/missing signature (post-amount)', { merchantOrderId, expectedAmount });
        return safeStatusJson(401, { error: 'Invalid or missing signature' });
      }

      // قارن السعر المتوقع بالمبلغ المرسل (تحقق صارم)
      const numericAmount = Number(amount);
      if (isNaN(numericAmount) || numericAmount !== expectedAmount) {
        console.warn('Payment amount mismatch', { expectedAmount, provided: amount, adId });
        return safeStatusJson(400, { error: 'قيمة الدفع غير مطابقة للسعر المتوقع' });
      }

    } catch (verifyErr) {
      console.error('Error during amount verification:', verifyErr);
      return safeStatusJson(500, { error: 'خطأ في التحقق من المبلغ' });
    }

    // 1. الحصول على توكن المصادقة
    console.log("Step 1: Getting auth token...");
    const token = await getAuthToken();
    
    // 2. تسجيل الطلب
    console.log("Step 2: Registering order...");
    const orderData = await registerOrder(token, { amount, merchantOrderId });
    
    // 3. الحصول على مفتاح الدفع
    console.log("Step 3: Getting payment key...");
    const paymentKey = await getPaymentKey(token, {
      amount,
      orderId: orderData.id,
      email,
      name,
      phone,      
      redirect_url: redirect_url_success,
      failed_redirect_url: redirect_url_failed
    });
    
  // 4. بناء رابط الدفع
  console.log("Step 4: Building iframe URL...");
  const iframe_url = `https://accept.paymob.com/api/acceptance/iframes/${IFRAME_ID}?payment_token=${paymentKey}`;
    
    // 5. حفظ بيانات الإعلان في قاعدة البيانات
    let newAdId = null;
    if (adId) { // حالة تحديث إعلان موجود
      console.log(`Step 5: Updating existing ad with ID: ${adId}`);
      const tableName = isSpecialAd ? 'ads_payment' : 'ads_payment';
      // adData هنا يحتوي فقط على الحقول المراد تحديثها
      const { error: updateError } = await supabase
        .from(tableName)
        .update({ ...adData, paymob_order_id: orderData.id }) // ربط طلب الدفع الجديد
        .eq('id', adId);

      if (updateError) {
        console.error(`خطأ في تحديث الإعلان في جدول ${tableName}:`, updateError);
        throw updateError;
      }
      console.log(`تم تحديث الإعلان بنجاح.`);
    } else if (adData) { // حالة إنشاء إعلان جديد
      console.log("Step 5: Saving new ad data to database...");
      const tableName = isSpecialAd ? 'ads_payment' : 'ads_payment';
      const adInsertData = {
        ...adData,
        paymob_order_id: orderData.id, // ربط الإعلان بطلب الدفع
        payment_status: 'pending', // ⭐ تغيير: حالة الدفع المبدئية
        is_paid: false
      };

      try {
        const { data: insertedAd, error: adError } = await supabase
          .from(tableName)
          .insert([adInsertData])
          .select('id')
          .single();

        if (adError) {
          console.error(`خطأ في حفظ الإعلان المبدئي في جدول ${tableName}:`, adError);
          throw adError;
        }
        newAdId = insertedAd.id;
        console.log(`تم حفظ الإعلان المبدئي بنجاح في جدول ${tableName} with ID: ${newAdId}`);
      } catch (insertError) {
        console.error(`خطأ في حفظ الإعلان المبدئي في جدول ${tableName}:`, insertError);
        throw insertError;
      }
    }
    
    // 6. إرسال الرد للواجهة الأمامية
    const response = {
      ok: true,
      payment_token: paymentKey,
      iframe_url,
      order_id: orderData.id,
      merchant_order_id: merchantOrderId || null,
      // ⭐ إرجاع adId سواء كان جديداً أو محدثاً
      adId: newAdId || adId || null
    };
    
    // سجل استجابة مُخفّطة لتجنب طباعة الحقول الحساسة مثل payment_token
    console.log("Sending response (redacted):", JSON.stringify(Object.assign({}, response, { payment_token: response.payment_token ? 'REDACTED' : null }), null, 2));
    return safeJson(response);
  } catch (e) {
    console.error("Error in create-payment:", e);
    if (_timedOut) return;
    return sendError(res, 500, 'حدث خطأ في الخادم', e);
  }
});

// نقطة نهاية لإنشاء الفواتير
app.post("/paymob/create-invoice", async (req, res) => {
  // per-operation timeout guard
  let _timedOut = false;
  const _timeoutHandle = setTimeout(() => {
    _timedOut = true;
    if (!res.headersSent) return sendError(res, 504, 'انتهت مهلة عملية الدفع');
  }, PAYMENT_OP_TIMEOUT_MS);

  const safeStatusJson = (status, payload) => {
    if (_timedOut || res.headersSent) return;
    clearTimeout(_timeoutHandle);
    return res.status(status).json(payload);
  };
  const safeJson = (payload) => {
    if (_timedOut || res.headersSent) return;
    clearTimeout(_timeoutHandle);
    return res.json(payload);
  };

  try {
    console.log("Received create-invoice request:", JSON.stringify(req.body, null, 2));
    
    const { amount, currency, shippingData, items, merchantOrderId } = req.body;
    
    // التحقق من وجود البيانات المطلوبة
    if (!amount) {
      return safeStatusJson(400, { error: "المبلغ مطلوب" });
    }
    
    // التحقق من صحة المبلغ
    const amountCents = Math.round(Number(amount) * 100);
    if (isNaN(amountCents)) {
      return safeStatusJson(400, { error: "المبلغ المرسل غير صالح" });
    }
    
    // 1. الحصول على توكن المصادقة
    console.log("Step 1: Getting auth token...");
    const token = await getAuthToken();
    
    // 2. تسجيل الفاتورة
    console.log("Step 2: Registering invoice...");
    const invoiceData = await registerInvoice(token, { 
      amount, 
      currency, 
      shippingData, 
      items 
    });
    
    // 3. بناء رابط الفاتورة
    console.log("Step 3: Building invoice URL...");
    let invoiceUrl = null;
    
    if (invoiceData && invoiceData.id) {
      invoiceUrl = `https://accept.paymob.com/api/ecommerce/invoices/${invoiceData.id}`;
    }
    
    const response = {
      ok: true,
      invoice_id: invoiceData.id || null,
      merchant_order_id: merchantOrderId || null,
      invoice_url: invoiceUrl
    };
    
    // سجل استجابة مُخفّطة لتجنب طباعة الحقول الحساسة
    console.log("Sending response (redacted):", JSON.stringify(Object.assign({}, response, { payment_token: response.payment_token ? 'REDACTED' : null }), null, 2));
    return safeJson(response);
  } catch (e) {
    console.error("Error in create-invoice:", e);
    if (_timedOut) return;
    return sendError(res, 500, 'حدث خطأ في الخادم', e);
  }
});

// نقطة نهاية دفع الاشتراك بالعرض (offers)
app.post('/paymob/create-offer-payment', paymentLimiter, rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
    // per-operation timeout guard
    let _timedOut = false;
    const _timeoutHandle = setTimeout(() => {
      _timedOut = true;
      if (!res.headersSent) return sendError(res, 504, 'انتهت مهلة عملية الدفع');
    }, PAYMENT_OP_TIMEOUT_MS);

    const safeStatusJson = (status, payload) => {
      if (_timedOut || res.headersSent) return;
      clearTimeout(_timeoutHandle);
      return res.status(status).json(payload);
    };
    const safeJson = (payload) => {
      if (_timedOut || res.headersSent) return;
      clearTimeout(_timeoutHandle);
      return res.json(payload);
    };

    try {
      // سجل الحدث بدون طباعة الحقول الحساسة
      console.log("Received create-offer-payment request:", JSON.stringify({ merchantOrderId: req.body?.merchantOrderId || null, offerId: req.body?.offerId || null, timestamp: req.body?.timestamp || null }));
      const { amount, email, name, phone, merchantOrderId, offerData, redirect_url_success, redirect_url_failed, offerId, signature, timestamp } = req.body;
      // الملاحظة: الآن يمكن للعميل ألا يرسل حقل `amount`؛ الخادم سيحسب المبلغ المتوقع من قاعدة البيانات


      // NOTE: signature verification will be performed after computing expectedAmount
      // to avoid relying on client-sent `amount`. (see below)

      // ===== تحقق من المبلغ المتوقع لعرض الـ offer =====
      let numericAmount = null;
      try {
        let expectedAmount = null;

        // حاول جلب السعر من جدول ads_price باستخدام نوع العرض و/أو مدة إذا كانت متوفرة
        if (offerData && offerData.type) {
          const durationDays = offerData.duration_days || offerData.duration || null;
          if (durationDays) {
            const { data: priceRow, error: priceErr } = await supabase
              .from('ads_price')
              .select('amount')
              .eq('type', offerData.type)
              .eq('duration_days', durationDays)
              .limit(1)
              .single();
            // Debug log: record result of price lookup for given type+duration
            console.log('ads_price lookup (by type+duration):', { type: offerData.type, durationDays, priceRow: priceRow || null, priceErr: priceErr || null });
            if (!priceErr && priceRow && typeof priceRow.amount !== 'undefined') expectedAmount = Number(priceRow.amount);
          }

          // كملطفة: إذا لم نجد من ads_price، استخدم السعر المرفق في offerData إذا وُجِد
          if (expectedAmount === null && typeof offerData.price !== 'undefined') expectedAmount = Number(offerData.price);
        }

        // إن فشلنا في الحصول على سعر متوقع، حاول جلب السعر من سجل العرض في قاعدة البيانات إذا كان offerId موجودًا
        if (expectedAmount === null && offerId) {
          // حاول جلب الحقول المحتملة: amount أو price، بالإضافة إلى type
          const { data: offerRow, error: offerErr } = await supabase
            .from('ads_offar')
            .select('amount, price, type')
            .eq('id', offerId)
            .single();
          if (!offerErr && offerRow) {
            // Debug log: show fetched offerRow
            console.log('ads_offar lookup result:', { offerId, offerRow: offerRow || null, offerErr: offerErr || null });
            // استخدم عمود amount إن وُجد، وإلا عمود price
            if (typeof offerRow.amount !== 'undefined' && offerRow.amount !== null) expectedAmount = Number(offerRow.amount);
            else if (typeof offerRow.price !== 'undefined' && offerRow.price !== null) expectedAmount = Number(offerRow.price);
            else if (offerRow.type) {
              const { data: priceRow, error: priceErr } = await supabase
                .from('ads_price')
                .select('amount')
                .eq('type', offerRow.type)
                .limit(1)
                .single();
              // Debug log: record result of fallback price lookup by offerRow.type
              console.log('ads_price fallback lookup (by offerRow.type):', { type: offerRow.type, priceRow: priceRow || null, priceErr: priceErr || null });
              if (!priceErr && priceRow && typeof priceRow.amount !== 'undefined') expectedAmount = Number(priceRow.amount);
            }
          }
        }

        if (expectedAmount === null) {
          // Provide more detailed diagnostic info in logs to help root-cause investigation
          console.warn('Unable to determine expected amount for offer payment', {
            offerId: offerId || null,
            offerData: offerData || null,
            note: 'Checked ads_price by type/duration, fallback to offerData.price, then ads_offar and ads_price by offerRow.type'
          });
          return safeStatusJson(400, { error: 'تعذر التحقق من قيمة الدفع للعرض' });
        }
        // Verify signature against server-computed expectedAmount (strict)
        if (!(await verifySignatureHmac({ merchantOrderId, amount: expectedAmount, timestamp, signature }))) {
          console.warn('Rejected create-offer-payment due to invalid/missing signature', { merchantOrderId, expectedAmount });
          return safeStatusJson(401, { error: 'Invalid or missing signature' });
        }

        // تحقق إذا أرسل العميل مبلغاً مُقَدَّماً: يجب أن يطابق المبلغ المتوقع
        const providedAmount = (typeof amount !== 'undefined' && amount !== null) ? Number(amount) : null;
        if (providedAmount !== null) {
          if (isNaN(providedAmount) || providedAmount !== expectedAmount) {
            console.warn('Offer payment amount mismatch', { expectedAmount, provided: amount, offerId });
            return safeStatusJson(400, { error: 'قيمة الدفع غير مطابقة للسعر المتوقع للعرض' });
          }
        }

        // استخدم المبلغ المحسوب من الخادم لإنشاء الطلب ومفتاح الدفع
        numericAmount = Number(expectedAmount);
      } catch (amtErr) {
        console.error('Error verifying offer amount:', amtErr);
        return safeStatusJson(500, { error: 'خطأ في التحقق من المبلغ' });
      }
      console.log("Step 1: Getting auth token...");
      const token = await getAuthToken();
      console.log("Step 2: Registering order...");
      const orderData = await registerOrder(token, { amount: numericAmount, merchantOrderId });
      console.log("Step 3: Getting payment key...");
      const paymentKey = await getPaymentKey(token, {
        amount: numericAmount,
        orderId: orderData.id,
        email,
        name,
        phone,
        redirect_url: redirect_url_success,
        failed_redirect_url: redirect_url_failed
      });
      console.log("Step 4: Building iframe URL...");
      const iframe_url = `https://accept.paymob.com/api/acceptance/iframes/${IFRAME_ID}?payment_token=${paymentKey}`;
      console.log("Step 5: Saving payment data to ads_payment table...");
      const offerRowId = (offerData && offerData.offer_id) ? offerData.offer_id : offerId;
      const { data: adData, error: adError } = await supabase
        .from('ads_offar')
        .select('mainimage_url')
        .eq('id', offerRowId)
        .single();
      const imageUrl = adData?.mainimage_url || '';
      let durationDays = 1;
      try {
        const { data: priceData, error: priceError } = await supabase
          .from('ads_price')
          .select('duration_days')
          .eq('type', offerData.type)
          .single();
        if (priceError) {
          console.warn('لم يتم العثور على مدة في ads_price, سيتم استخدام القيمة الافتراضية:', priceError.message);
        } else if (priceData && priceData.duration_days) {
          durationDays = priceData.duration_days;
          console.log(`تم جلب مدة الإعلان: ${durationDays} يوم`);
        }
      } catch (e) { console.warn('خطأ أثناء جلب مدة الإعلان:', e); }
      let currentUserData = null;
      try {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', offerData.user_id)
          .single();
        if (userError || !userData) {
          console.error('خطأ في جلب بيانات المستخدم من جدول users:', userError);
          const { data: businessData, error: businessError } = await supabase
            .from('businesses')
            .select('store_name, phone')
            .eq('user_id', offerData.user_id)
            .single();
          currentUserData = {
            store_name: businessData?.store_name || offerData.store_name || 'متجر غير محدد',
            phone: businessData?.phone || offerData.phone || '',
            name: businessData?.store_name || offerData.name || ''
          };
        } else {
          currentUserData = {
            store_name: userData.user_metadata?.store_name || userData.store_name || offerData.store_name || '',
            phone: userData.phone || offerData.phone || '',
            name: userData.name || ''
          };
        }
      } catch (error) {
        console.error('خطأ في جلب بيانات المستخدم:', error);
        currentUserData = {
          store_name: offerData.store_name || '',
          phone: offerData.phone || '',
          name: offerData.name || ''
        };
      }
      const paymentData = {
        user_id: offerData.user_id,
        store_name: currentUserData.store_name,
        phone: currentUserData.phone,
        duration_days: durationDays,
        expires_at: null,
        paymob_order_id: orderData.id,
        is_paid: false,
        payment_date: null,
        amount: numericAmount,
        type: offerData.type,
        payment_status: 'pending',
        offer_id: offerRowId,
        bonus_offer: offerData.bonus_offer || 0,
        image_url: imageUrl
      };
      let insertedPaymentId = null;
      try {
        const { data: insertedPayment, error: paymentError } = await supabase
          .from('ads_payment')
          .insert([paymentData])
          .select('id')
          .single();
        if (_timedOut) return; // abort remaining processing if timed out
        if (paymentError) {
          console.error('خطأ في حفظ بيانات الدفع في جدول ads_payment:', paymentError);
          throw paymentError;
        }
        insertedPaymentId = insertedPayment.id;
        console.log(`تم حفظ بيانات الدفع بنجاح في جدول ads_payment with ID: ${insertedPaymentId}`);
        // حاول تخزين tokens و iframe_url في السجل إن وُجدت الأعمدة، لكن لا تفشل العملية إذا لم توجد الأعمدة
        try {
          await supabase
            .from('ads_payment')
            .update({ iframe_url, payment_token: paymentKey })
            .eq('id', insertedPaymentId);
          console.log('تم حفظ iframe_url و payment_token في ads_payment (إن وُجدت الأعمدة)');
        } catch (storeErr) {
          console.warn('Could not store payment token/iframe_url in ads_payment (column may not exist):', storeErr.message || storeErr);
          // لا نُعيد الخطأ لأننا نريد إرجاع الـ iframe إلى العميل مهما حدث
        }
      } catch (insertError) {
        console.error('خطأ في حفظ بيانات الدفع في جدول ads_payment:', insertError);
        throw insertError;
      }
      const response = {
        ok: true,
        payment_token: paymentKey,
        iframe_url,
        order_id: orderData.id,
        merchant_order_id: merchantOrderId || null,
        offerId: offerId || null,
        payment_id: insertedPaymentId // ⭐ إضافة payment_id في الرد
      };
      console.log("Sending response:", JSON.stringify(response, null, 2));
      return safeJson(response);
    } catch (e) {
      console.error("Error in create-offer-payment:", e);
      if (_timedOut) return;
      return sendError(res, 500, 'حدث خطأ في الخادم', e);
    }
});

// Endpoint to fetch stored iframe_url / payment_token by payment_id
app.get('/paymob/payment-link', async (req, res) => {
  try {
    const paymentId = req.query.payment_id;
    const merchantOrderId = req.query.merchant_order_id;
    console.log('/paymob/payment-link called with', { paymentId, merchantOrderId });

    if (!paymentId && !merchantOrderId) return res.status(400).json({ error: 'payment_id or merchant_order_id required' });

    let query = supabase.from('ads_payment').select('id, iframe_url, paymob_order_id, payment_token');
    if (paymentId) query = query.eq('id', paymentId);
    else if (merchantOrderId) query = query.eq('merchant_order_id', merchantOrderId);

    const { data: paymentRow, error } = await query.maybeSingle();

    if (error) {
      console.error('/paymob/payment-link supabase error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!paymentRow) return res.status(404).json({ error: 'payment not found' });

    return res.json({ ok: true, payment_id: paymentRow.id, iframe_url: paymentRow.iframe_url || null, payment_token: paymentRow.payment_token || null, order_id: paymentRow.paymob_order_id || null });
  } catch (e) {
    console.error('Error in /paymob/payment-link:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ===================================================================
// ========= نقاط النهاية لصفحات نجاح وفشل الدفع المخصصة (Paymob) =========
// ===================================================================

// صفحة نجاح الدفع المخصصة (مع زر العودة للتطبيق)
app.get('/paymob/redirect-success', (req, res) => {
  try {
    console.log('تم الوصول إلى نقطة إعادة التوجيه', req.query);
    const { success } = req.query;

    // التحقق من حالة الدفع من خلال query parameter
    if (success === 'true') {
      console.log('الدفع ناجح، عرض صفحة النجاح.');
      const successPath = path.join(__dirname, 'views', 'success.html');
      if (fs.existsSync(successPath)) {
        res.sendFile(successPath);
      } else {
        res.status(404).send('صفحة النجاح غير موجودة');
      }
    } else {
      console.log('الدفع فاشل، عرض صفحة الفشل.');
      const failurePath = path.join(__dirname, 'views', 'failure.html');
      if (fs.existsSync(failurePath)) {
        res.sendFile(failurePath);
      } else {
        res.status(404).send('صفحة الفشل غير موجودة');
      }
    }
  } catch (error) {
    console.error('خطأ في عرض صفحة النجاح:', error);
    res.status(500).send('خطأ في عرض الصفحة');
  }
});

// صفحة فشل الدفع المخصصة
app.get('/paymob/redirect-failed', (req, res) => {
  try {
    console.log('تم الوصول إلى صفحة الفشل', req.query);
    const failurePath = path.join(__dirname, 'views', 'failure.html');
    
    // التحقق من وجود الملف قبل إرساله
    if (fs.existsSync(failurePath)) {
      res.sendFile(failurePath);
    } else {
      console.error('ملف failure.html غير موجود في:', failurePath);
      res.status(404).send('صفحة الفشل غير موجودة');
    }
  } catch (error) {
    console.error('خطأ في عرض صفحة الفشل:', error);
    res.status(500).send('خطأ في عرض الصفحة');
  }
});

app.post("/paymob/webhook", async (req, res) => {
  const payload = req.body;
  const receivedHmac = req.query.hmac;
  
  console.log("=== PAYMOB WEBHOOK NOTIFICATION ===");
  console.log("WEBHOOK RECEIVED:", JSON.stringify(payload, null, 2));
  console.log("Received HMAC:", receivedHmac);
  console.log("======================================");

  // --- 1. التحقق من صحة HMAC (مهم جداً للأمان) ---
  // التحقق من وجود HMAC في الطلب
  if (!receivedHmac) {
    console.error("HMAC not found in request");
    return res.status(400).send("HMAC missing");
  }

  // استخدام payload.obj بدلاً من obj فقط
  const { obj } = payload;
  console.log("Processing webhook payload:", JSON.stringify(obj, null, 2));

  // التأكد من وجود جميع الحقول المطلوبة لبناء سلسلة التحقق
  // const requiredFields = [
  //   'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction',
  //   'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded',
  //   'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending', 'source_data.pan',
  //   'source_data.sub_type', 'source_data.type', 'success'
  // ];
  //
  // const missingFields = requiredFields.filter(field => {
  //   const parts = field.split('.');
  //   let value = obj;
  //   for (const part of parts) {
  //     if (value === undefined || value === null) return true;
  //     value = value[part];
  //   }
  //   return value === undefined || value === null;
  // });
  //
  // if (missingFields.length > 0) {
  //   console.error("Missing required fields for HMAC calculation:", missingFields.join(', '));
  //   console.error("Available fields:", Object.keys(obj).join(', '));
  //   return res.status(400).send(`Missing required fields: ${missingFields.join(', ')}`);
  // }

  // بناء سلسلة التحقق كما هو مطلوب بواسطة Paymob
  console.log("Building HMAC string...");
  
  // استخدام الترتيب المحدد في وثائق Paymob مع تحويل القيم المنطقية إلى نص
const amountCents = obj.amount_cents; // number
  const createdAt = obj.created_at; // string
  const currency = obj.currency; // string
  const errorOccurred = String(obj.error_occured); // boolean -> "true" or "false"
  const hasParentTransaction = String(obj.has_parent_transaction); // boolean -> "true" or "false"
  const id = obj.id; // number
  const integrationId = obj.integration_id; // number
  const is3dSecure = String(obj.is_3d_secure); // boolean -> "true" or "false"
  const isAuth = String(obj.is_auth); // boolean -> "true" or "false"
  const isCapture = String(obj.is_capture); // boolean -> "true" or "false"
  const isRefunded = String(obj.is_refunded); // boolean -> "true" or "false"
  const isStandalonePayment = String(obj.is_standalone_payment); // boolean -> "true" or "false"
  const isVoided = String(obj.is_voided); // boolean -> "true" or "false"
  const orderId = obj.order.id; // number
  const owner = obj.owner; // number
  const pending = String(obj.pending); // boolean -> "true" or "false"
  const pan = obj.source_data.pan; // string
  const subType = obj.source_data.sub_type; // string
  const type = obj.source_data.type; // string
  const success = String(obj.success); // boolean -> "true" or "false"
  
  const concatenatedString = [
    amountCents.toString(),
    createdAt.toString(),
    currency,
    errorOccurred,
    hasParentTransaction,
    id.toString(),
    integrationId.toString(),
    is3dSecure,
    isAuth,
    isCapture,
    isRefunded,
    isStandalonePayment,
    isVoided,
    orderId.toString(),
    owner.toString(),
    pending,
    pan,
    subType,
    type,
    success
  ].join("");
  
  console.log("HMAC string:", concatenatedString);

  // حساب HMAC
  console.log("Calculating HMAC with secret...");
  const calculatedHmac = crypto
    .createHmac('sha512', HMAC_SECRET)
    .update(concatenatedString)
    .digest('hex');

  // مقارنة HMACs
  console.log("Received HMAC:", receivedHmac);
  console.log("Calculated HMAC:", calculatedHmac);
  
  // تحقق من تطابق HMACs
  if (calculatedHmac !== receivedHmac) {
    console.error("HMAC validation failed. Request might be tampered.");
    console.error("Concatenated string:", concatenatedString);
    console.error("HMAC Secret length:", HMAC_SECRET.length);
    console.error("HMAC Secret (first 10 chars):", HMAC_SECRET.substring(0, 10));
    
    // في بيئة التطوير، قد يكون من المفيد تجاهل التحقق من HMAC
    // لكن في بيئة الإنتاج، يجب إبقاء هذا التحقق
    if (process.env.NODE_ENV === 'development') {
      console.log("Development mode: accepting webhook despite HMAC mismatch");
    } else {
      return res.status(401).send("Invalid HMAC");
    }
  } else {
    console.log("HMAC validation successful");
  }

  // --- 2. معالجة الإشعار بعد التحقق من صحته ---
  try {
    console.log("Processing webhook notification...");
    
    // تحقق من نجاح الدفع
    if (obj?.success === true && obj?.pending === false) {
      console.log('تم تأكيد نجاح الدفع، سيتم تحديث حالة الإعلان');
      const orderId = payload.obj.order?.id;
      const merchantOrderId = payload.obj.order?.merchant_order_id;
      
      console.log("=== PAYMENT SUCCESS ===");
      console.log(`تم استلام دفع ناجح. orderId: ${orderId}, merchantOrderId: ${merchantOrderId}`);
      console.log(`مبلغ الدفع: ${obj.amount_cents} ${obj.currency}`);
      console.log(`طريقة الدفع: ${obj.source_data.type}`);
      console.log(`رقم المعاملة: ${obj.id}`);
      console.log(`حالة الدفع: ${obj.payment_status || "غير محددة"}`);
      console.log("========================");

      if (orderId && merchantOrderId) {
        // ⭐ توحيد منطق تحديث جميع أنواع الدفعات في جدول ads_payment
        console.log(`تحديث سجل الدفع المرتبط بـ paymob_order_id: ${orderId}`);
        try {
          // 1. البحث عن سجل الدفع عبر paymob_order_id
          const { data: existingAd, error: fetchError } = await supabase
            .from('ads_payment')
            .select('*')
            .eq('paymob_order_id', orderId)
            .single();

          if (fetchError || !existingAd) {
            console.error(`لم يتم العثور على سجل دفع لـ paymob_order_id: ${orderId}`, fetchError);
          } else {
            console.log(`تم العثور على سجل الدفع:`, existingAd);

            // 2. حساب تاريخ الانتهاء
            const paymentDate = new Date();
            // ⭐ تحويل المدة إلى رقم صحيح لضمان الحساب الصحيح
            const duration = parseInt(existingAd.duration_days, 10) || 0;
            const expiresAt = new Date(paymentDate);
            expiresAt.setDate(expiresAt.getDate() + duration);

            // 3. تحديث حالة الدفع وتاريخ الانتهاء
            const { error: updateError } = await supabase
              .from('ads_payment')
              .update({ is_paid: true, payment_date: paymentDate.toISOString(), payment_status: 'paid', expires_at: expiresAt.toISOString() })
              .eq('paymob_order_id', orderId);

            if (updateError) {
              console.error('خطأ في تحديث حالة الدفع في Supabase:', updateError);
            } else {
              console.log(`تم تحديث سجل الدفع ${orderId} بنجاح. تاريخ الانتهاء: ${expiresAt.toISOString()}`);

              // --- ⭐ بداية: تحديث رصيد البونص للمستخدم ---
              const { user_id, bonus_offer } = existingAd;
              if (user_id && bonus_offer > 0) {
                console.log(`إضافة بونص بقيمة ${bonus_offer} للمستخدم ${user_id}`);
                const { error: rpcError } = await supabase.rpc('add_to_bonus_balance', {
                  p_user_id: user_id,
                  p_amount_to_add: bonus_offer
                });

                if (rpcError) {
                  console.error('خطأ في تحديث رصيد البونص عبر RPC:', rpcError);
                } else {
                  console.log(`تم تحديث رصيد البونص للمستخدم ${user_id} بنجاح.`);
                }
              } else {
                console.log('لا يوجد بونص لإضافته أو لا يوجد معرّف مستخدم.');
              }
              // --- ⭐ نهاية: تحديث رصيد البونص للمستخدم ---
            }
          }
        } catch (dbError) {
          console.error('خطأ في قاعدة البيانات عند تحديث سجل الدفع:', dbError);
        }
      } else {
        console.error('الطلب يحتوي على بيانات ناقصة:', JSON.stringify(payload.obj.order, null, 2));
      }
    } else {
      console.log("=== PAYMENT STATUS ===");
      console.log('الدفع لم ينجح أو لا يزال معلقاً:', JSON.stringify({ success: obj?.success, pending: obj?.pending }, null, 2));
      
      if (obj?.success === false && obj?.error_occurred) {
        console.log("حدث خطأ في الدفع:", obj.error);
        if (obj.data && obj.data.message) {
          console.log("رسالة الخطأ:", obj.data.message);
        }
      } else if (obj?.pending === true) {
        console.log("الدفع معلق بانتظار الموافقة");
      }
      
      console.log("======================");
    }
    res.status(200).send("received");
  } catch (e) {
    console.error(e);
    res.status(200).send("received");
  }
});

// =================================================================
// 5. نقاط نهاية إضافية
// =================================================================

// نقطة نهاية فحص صحة الخادم
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'Server is running properly'
  });
});

// نقطة نهاية لجلب نوع الإعلان وسعره
app.get("/api/offer-details", async (req, res) => {
  try {
    const adId = req.query.id;
    
    if (!adId) {
      return res.status(400).json({ error: "معرّف الإعلان مطلوب" });
    }
    
    console.log(`جلب تفاصيل الإعلان بالمعرّف: ${adId}`);
    
    // 1. جلب بيانات الإعلان من جدول ads_offar
    const { data: offerData, error: offerError } = await supabase
      .from('ads_offar')
      .select('*')
      .eq('id', adId)
      .single();
    
    if (offerError || !offerData) {
      console.error('خطأ في جلب بيانات العرض:', offerError);
      return res.status(404).json({ error: "لم يتم العثور على الإعلان" });
    }
    
    console.log("بيانات الإعلان الكاملة:", JSON.stringify(offerData, null, 2));
    
    // 2. جلب سعر الإعلان من جدول ads_price بناءً على النوع
    const adType = offerData.type;
    console.log(`نوع الإعلان: ${adType}`);
    
    // 2.1. جلب سعر الإعلان من جدول ads_price بناءً على النوع
    const { data: priceData, error: priceError } = await supabase
      .from('ads_price')
      .select('*')
      .eq('type', adType);
    
    console.log("بيانات السعر من ads_price:", JSON.stringify(priceData, null, 2));
    
    if (priceError || !priceData || priceData.length === 0) {
      console.error('خطأ في جلب سعر الإعلان:', priceError);
      console.log(`محاولة البحث عن سعر للنوع: ${adType}`);
      
      // محاولة الحصول على السعر من الإعلان نفسه إذا كان موجودًا
      if (offerData.price) {
        console.log("تم العثور على السعر مباشرة في بيانات الإعلان:", offerData.price);
        return res.json({
          ok: true,
          adId: parseInt(adId),
          adType,
          price: offerData.price
        });
      }
      
      return res.status(404).json({ error: "لم يتم العثور على سعر للإعلان" });
    }
    
    // استخدام أول سعر متاح
    const price = priceData[0].price || priceData[0].amount;
    console.log(`سعر الإعلان: ${price}`);
    
    // 3. إرجاع الرد
    const response = {
      ok: true,
      adId: parseInt(adId),
      adType,
      price
    };
    
    console.log("إرسال تفاصيل الإعلان:", JSON.stringify(response, null, 2));
    res.json(response);
  } catch (e) {
    console.error("خطأ في جلب تفاصيل الإعلان:", e);
    return sendError(res, 500, 'حدث خطأ في الخادم', e);
  }
});

// Middleware للتحقق من JWT Token
const verifyJwtToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    // Local dev bypass: if DEV_BYPASS_TOKEN is set and matches, inject a fake user
    if (DEV_BYPASS_TOKEN && token === DEV_BYPASS_TOKEN) {
      req.user = { id: 'dev-user-id', email: 'dev@local.test', role: 'admin' };
      return next();
    }

    // التحقق من صحة JWT Token باستخدام Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    // إضافة بيانات المستخدم إلى الطلب
    req.user = user;
    next();
  } catch (error) {
    console.error('Error verifying JWT token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

// نقطة نهاية لجلب الهواتف المسجلة للمستخدم الحالي مع فك تشفير IMEI
app.get('/api/user-phones', verifyJwtToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. جلب الهواتف التي يملكها المستخدم الحالي فقط
    const { data: phones, error } = await supabase
      .from('registered_phones')
      .select('id, imei, phone_type, registration_date, last_confirmed_at, status, user_id')
      .eq('user_id', userId);

    if (error) throw error;

    // جلب البلاغات النشطة للمستخدم للتحقق منها
    const { data: reports, error: reportsError } = await supabase
      .from('phone_reports')
      .select('imei, user_id, status')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (reportsError) throw reportsError;

    // 2. معالجة البيانات: فك التشفير لحساب hasActiveReport، ثم إرسال IMEI مشفّر ونسخة مخفية للواجهة
    const processedPhones = phones.map(phone => {
      const decryptedImei = decryptField(phone.imei);
      const maskedImei = decryptedImei ? `${decryptedImei.substring(0, 4)}*******${decryptedImei.slice(-4)}` : 'غير متوفر';
      const encryptedImei = encryptAES(decryptedImei || '');

      return {
        id: phone.id,
        phone_type: phone.phone_type || 'غير محدد',
        registration_date: phone.registration_date,
        last_confirmed_at: phone.last_confirmed_at,
        status: phone.status,
        imei_encrypted: encryptedImei,
        imei_masked: maskedImei,
        hasActiveReport: reports ? reports.some(r => decryptField(r.imei) === decryptedImei) : false
      };
    });

    res.json({ success: true, data: processedPhones });
  } catch (error) {
    console.error('Error fetching user phones:', error);
    return sendError(res, 500, 'حدث خطأ في الخادم', error, { success: false });
  }
});

// نقطة نهاية لحل البلاغ (تغيير الحالة إلى resolved)
app.post('/api/resolve-report', verifyJwtToken, async (req, res) => {
  const { imei, imei_encrypted } = req.body;
  const userId = req.user.id;

  if (!imei) return res.status(400).json({ error: 'IMEI is required' });

  try {
    // جلب البلاغات النشطة للمستخدم
    const { data: reports, error: fetchError } = await supabase
      .from('phone_reports')
      .select('id, imei')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (fetchError) throw fetchError;

    // تحديد قيمة IMEI الهدف: نقبل IMEI نصي أو كـ { encryptedData, iv }
    let targetImei = imei;
    if (!targetImei && imei_encrypted && imei_encrypted.encryptedData && imei_encrypted.iv && imei_encrypted.authTag) {
      try {
        targetImei = decryptAES(imei_encrypted.encryptedData, imei_encrypted.iv, imei_encrypted.authTag);
      } catch (e) {
        console.error('Failed to decrypt provided imei_encrypted:', e);
        return res.status(400).json({ error: 'Invalid encrypted IMEI' });
      }
    }

    if (!targetImei) {
      return res.status(400).json({ error: 'IMEI is required' });
    }

    // البحث عن البلاغ المطابق بفك التشفير
    const targetReport = reports.find(r => decryptField(r.imei) === targetImei);

    if (!targetReport) {
      return res.status(404).json({ error: 'Active report not found for this IMEI' });
    }

    // تحديث الحالة
    const { error: updateError } = await supabase
      .from('phone_reports')
      .update({ status: 'resolved' })
      .eq('id', targetReport.id);

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Report resolved successfully' });
  } catch (error) {
    console.error('Error resolving report:', error);
    return sendError(res, 500, 'حدث خطأ في الخادم', error);
  }
});

// نقطة نهاية للتحقق من كلمة مرور البلاغ ومن ثم حل البلاغ بنفس النداء
app.post('/api/verify-and-resolve-report', verifyJwtToken, async (req, res) => {
  const { reportId, password } = req.body;
  const userId = req.user.id;

  if (!reportId || !password) {
    return res.status(400).json({ success: false, error: 'reportId and password are required' });
  }

  try {
    console.log('/api/verify-and-resolve-report called by user:', userId, 'reportId:', reportId);
    console.log('Request body keys:', Object.keys(req.body));
    // جلب البلاغ للتأكد من ملكيته وحالته
    const { data: reports, error: fetchError } = await supabase
      .from('phone_reports')
      .select('id, user_id, status, password')
      .eq('id', reportId)
      .limit(1);

    if (fetchError) {
      console.error('supabase fetchError for report:', fetchError);
      throw fetchError;
    }
    const report = reports && reports[0];
    console.log('Fetched report:', !!report, report ? { id: report.id, user_id: report.user_id, status: report.status, passwordExists: !!report.password } : null);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
    if (report.user_id !== userId) return res.status(403).json({ success: false, error: 'Not authorized' });
    if (report.status !== 'active') return res.status(400).json({ success: false, error: 'Report not active' });

    // تحقق من كلمة المرور عن طريق هاش SHA256
    const hashed = crypto.createHash('sha256').update(String(password)).digest('hex');
    console.log('Computed hashed password (sha256):', hashed);
    console.log('Stored password (raw):', String(report.password).slice(0, 8) + '...');
    if (!report.password || String(report.password).toLowerCase() !== String(hashed).toLowerCase()) {
      console.warn('Password mismatch for report:', reportId);
      return res.status(401).json({ success: false, error: 'Invalid password' });
    }

    // قم بحل البلاغ (تغيير الحالة إلى resolved)
    const { data: updateData, error: updateError } = await supabase
      .from('phone_reports')
      .update({ status: 'resolved' })
      .eq('id', reportId)
      .select();
    if (updateError) {
      console.error('supabase updateError resolving report:', updateError);
      throw updateError;
    }
    console.log('Report update result:', updateData);

    res.json({ success: true, message: 'Report verified and resolved' });
  } catch (error) {
    console.error('Error in /api/verify-and-resolve-report:', error);
    return sendError(res, 500, 'حدث خطأ في الخادم', error, { success: false });
  }
});

// نقطة نهاية لإعادة تعيين كلمة مرور البلاغ المسجل
app.post('/api/reset-report-password', verifyJwtToken, async (req, res) => {
  const { reportId, newPassword } = req.body;
  const userId = req.user.id;

  if (!reportId || !newPassword) {
    return res.status(400).json({ success: false, error: 'reportId and newPassword are required' });
  }

  try {
    // جلب البلاغ للتحقق من الملكية
    const { data: reports, error: fetchError } = await supabase
      .from('phone_reports')
      .select('id, user_id, status, password')
      .eq('id', reportId)
      .limit(1);

    if (fetchError) {
      console.error('supabase fetchError for report:', fetchError);
      throw fetchError;
    }
    const report = reports && reports[0];
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
    if (report.user_id !== userId) return res.status(403).json({ success: false, error: 'Not authorized' });
    if (report.status !== 'active') return res.status(400).json({ success: false, error: 'Report not active' });

    // تشفير كلمة المرور الجديدة
    const hashed = crypto.createHash('sha256').update(newPassword).digest('hex');

    // تحديث كلمة المرور في البلاغ
    const { data: updatedReport, error: updateError } = await supabase
      .from('phone_reports')
      .update({ password: hashed })
      .eq('id', reportId)
      .select();
    if (updateError) throw updateError;

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error in /api/reset-report-password:', error);
    return sendError(res, 500, 'حدث خطأ في الخادم', error);
  }
});

// نقطة نهاية لتحديث finder_phone في جدول phone_reports باستخدام IMEI
app.post('/api/update-finder-phone-by-imei', async (req, res) => {
  try {
    const { imei, finderPhone } = req.body;
    if (!imei || !finderPhone) {
      return res.status(400).json({ success: false, error: 'imei and finderPhone are required' });
    }

    // تحديث السجل في قاعدة البيانات
    const { data, error } = await supabase
      .from('phone_reports')
      .update({ finder_phone: finderPhone })
      .eq('imei', imei);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =================================================================
// 6. تشغيل الخادم
// =================================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server listening on port", PORT));
