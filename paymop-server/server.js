
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

// Configure `trust proxy` securely.
// Set environment variable `TRUST_PROXY` to control behavior. Examples:
// - not set or empty -> disabled (default, safest)
// - "1" or "true" -> trust first proxy (common for PaaS like Heroku)
// - a number N -> trust first N proxies
// - a string/list (e.g. "127.0.0.1", "127.0.0.1,::1", "loopback") -> passed directly to Express
const TRUST_PROXY = process.env.TRUST_PROXY;
if (TRUST_PROXY) {
  if (TRUST_PROXY === 'true' || TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
    console.log('trust proxy: set to 1 (first proxy)');
  } else if (/^[0-9]+$/.test(TRUST_PROXY)) {
    app.set('trust proxy', Number(TRUST_PROXY));
    console.log(`trust proxy: set to first ${TRUST_PROXY} proxies`);
  } else {
    app.set('trust proxy', TRUST_PROXY);
    console.log(`trust proxy: set to '${TRUST_PROXY}'`);
  }
} else {
  app.set('trust proxy', false);
  console.log('trust proxy: disabled (default). Set TRUST_PROXY env var to enable trusted proxies.');
}

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
        const ip = req.ip || req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress;
        const key = `globalrl:${ip}`;
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
      const ip = req.ip || req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress;
      const key = ip;
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

// Signup-specific rate limiter: stricter limits to prevent brute-force account creation
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 signup requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many signup attempts from this IP, please try again later.'
});

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

    console.log(`Phone found for IMEI: ${imei}. Owner: ${decryptedOwnerName || foundReport.owner_name}`);

    // 2. تشفير finder_phone قبل الحفظ
    let encryptedFinderPhone = null;
    if (finderPhone) {
      try {
        const enc = encryptAES(finderPhone);
        encryptedFinderPhone = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
      } catch (e) {
        console.error('فشل تشفير finder_phone:', e);
        encryptedFinderPhone = finderPhone; // fallback: حفظ الرقم كما هو
      }
    }
    const { error: updateError } = await supabase
      .from('phone_reports')
      .update({ finder_phone: encryptedFinderPhone })
      .eq('id', foundReport.id);

    if (updateError) {
      console.error('فشل تحديث finder_phone في phone_reports:', updateError);
      // لا توقف العملية، فقط سجل الخطأ
    } else {
      console.log('Finder phone saved to database successfully');
    }

    // ⭐ 3. إرسال الإشعار والبريد الإلكتروني بعد التحديث الناجح

    let finderPhoneFromDb = encryptedFinderPhone;
    try {
      const { data: refreshedReport, error: refreshError } = await supabase
        .from('phone_reports')
        .select('finder_phone')
        .eq('id', foundReport.id)
        .single();
      if (refreshError) {
        console.error('فشل جلب finder_phone بعد التحديث:', refreshError);
      } else {
        finderPhoneFromDb = refreshedReport?.finder_phone ?? finderPhoneFromDb;
      }
    } catch (e) {
      console.error('خطأ أثناء جلب finder_phone بعد التحديث:', e);
    }

    const decryptedFinderPhone = (() => {
      if (!finderPhoneFromDb) return finderPhone;
      try {
        return decryptField(finderPhoneFromDb) || finderPhone;
      } catch (e) {
        console.error('فشل فك تشفير finder_phone:', e);
        return finderPhone;
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
        body: `مبروك! تم العثور على هاتفك. للتواصل مع الشخص الذي وجده، يرجى الاتصال على الرقم: ${decryptedFinderPhone}.`,
        emailSubject: 'تهانينا! تم العثور على هاتفك المفقود',
        emailHtml: `<p>عزيزي ${ownerName || decryptedOwnerName || foundReport.owner_name || ''},</p>
          <p>مبروك! تم العثور على هاتفك المفقود (IMEI: ${decryptedImei || foundReport.imei || ''}).</p>
          <p>يرجى التواصل مع الشخص الذي وجد الهاتف على الرقم: <b>${decryptedFinderPhone}</b> لاستلام هاتفك.</p>
          <p>نتمنى لك يوماً سعيداً!</p>`
      },
      en: {
        title: 'Your phone was found!',
        body: `Congratulations! Your phone was found. To contact the finder, please call: ${decryptedFinderPhone}.`,
        emailSubject: 'Great news! Your lost phone was found',
        emailHtml: `<p>Dear ${ownerName || decryptedOwnerName || foundReport.owner_name || ''},</p>
          <p>Good news! Your lost phone was found (IMEI: ${decryptedImei || foundReport.imei || ''}).</p>
          <p>Please contact the finder at: <b>${decryptedFinderPhone}</b> to retrieve your phone.</p>
          <p>Have a great day!</p>`
      },
      fr: {
        title: 'Votre téléphone a été retrouvé !',
        body: `Félicitations ! Votre téléphone a été retrouvé. Pour contacter la personne qui l'a trouvé, appelez : ${decryptedFinderPhone}.`,
        emailSubject: 'Bonne nouvelle ! Votre téléphone a été retrouvé',
        emailHtml: `<p>Cher/Chère ${ownerName || decryptedOwnerName || foundReport.owner_name || ''},</p>
          <p>Bonne nouvelle ! Votre téléphone perdu a été retrouvé (IMEI : ${decryptedImei || foundReport.imei || ''}).</p>
          <p>Veuillez contacter la personne qui l'a trouvé au : <b>${decryptedFinderPhone}</b> pour le récupérer.</p>
          <p>Bonne journée !</p>`
      },
      hi: {
        title: 'आपका फोन मिल गया है!',
        body: `बधाई हो! आपका फोन मिल गया है। खोजने वाले से संपर्क करने के लिए कॉल करें: ${decryptedFinderPhone}.`,
        emailSubject: 'खुशखबरी! आपका खोया फोन मिल गया है',
        emailHtml: `<p>प्रिय ${ownerName || decryptedOwnerName || foundReport.owner_name || ''},</p>
          <p>खुशखबरी! आपका खोया हुआ फोन मिल गया है (IMEI: ${decryptedImei || foundReport.imei || ''}).</p>
          <p>कृपया फोन प्राप्त करने के लिए खोजने वाले से संपर्क करें: <b>${decryptedFinderPhone}</b>.</p>
          <p>आपका दिन शुभ हो!</p>`
      }
    };

    const localizedContent = notificationsByLang[normalizedLang] || notificationsByLang.ar;

    if (foundReport.fcm_token) {
      console.log(`Found FCM token, sending push notification to: ${foundReport.fcm_token}`);
      try {
        const notificationBody = localizedContent.body;
        await sendFCMNotificationV1({
          token: foundReport.fcm_token,
          title: localizedContent.title,
          body: notificationBody,
          data: {
            type: 'phone_found',
            imei: decryptedImei || foundReport.imei
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
    } else {
      console.log('No email found for this report, skipping email notification.');
    }

    // إذا لم يكن هناك بريد إلكتروني أو توكن، قد يكون هناك مشكلة
    if (!foundReport.fcm_token && !decryptedOwnerEmail) {
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
            const { data: priceRows } = await supabase
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
          const { data: priceRows } = await supabase
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
    
    // سجل استجابة مُخفّفة لتجنب طباعة الحقول الحساسة مثل payment_token
    console.log("Sending response (redacted):", JSON.stringify(Object.assign({}, response, { payment_token: response.payment_token ? 'REDACTED' : null }), null, 2));
    return safeJson(response);
  } catch (e) {
    console.error("Error in create-payment:", e);
    if (_timedOut) return;
    return sendError(res, 500, 'حدث خطأ في الخادم', e);
  }
});

// Endpoint: Publish ad using user's bonus balance (server-side enforced)
app.post('/paymob/publish-from-bonus', paymentLimiter, rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 6 }), async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized: missing token' });
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized: invalid token' });

    const userId = user.id;
    const { adData } = req.body || {};
    if (!adData) return res.status(400).json({ error: 'adData is required' });

    // Compute expected amount from ads_price (ignore any client-sent amount)
    let expectedAmount = null;
    try {
      const durationVal = adData.duration_days || adData.duration || null;
      const typeVal = adData.type || 'publish';
      if (durationVal !== null && typeof durationVal !== 'undefined') {
        const { data: priceRow, error: priceErr } = await supabase
          .from('ads_price')
          .select('amount')
          .eq('type', typeVal)
          .eq('duration_days', durationVal)
          .limit(1)
          .single();
        if (!priceErr && priceRow && typeof priceRow.amount !== 'undefined') expectedAmount = Number(priceRow.amount);
      }
      // fallback: if adData.amount provided and DB lookup failed, still refuse — require DB price
    } catch (e) {
      console.error('Error computing expectedAmount for bonus publish:', e);
    }

    if (expectedAmount === null) {
      return res.status(400).json({ error: 'Unable to determine expected amount for this ad' });
    }

    // Fetch user's latest paid bonus record
    const { data: lastBonus, error: bonusError } = await supabase
      .from('ads_payment')
      .select('id, bonus_offer, payment_status, is_paid')
      .eq('user_id', userId)
      .eq('transaction', 'bonus_add')
      .eq('is_paid', true)
      .order('payment_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bonusError) {
      console.error('Error fetching last bonus for user:', bonusError);
      return res.status(500).json({ error: 'Server error' });
    }

    if (!lastBonus || typeof lastBonus.bonus_offer !== 'number' || lastBonus.bonus_offer <= 0) {
      return res.status(400).json({ error: 'No valid bonus balance available' });
    }

    if (lastBonus.bonus_offer < expectedAmount) {
      return res.status(400).json({ error: 'Insufficient bonus balance' });
    }

    // Perform deduction and insert ad record. Use optimistic update: ensure row id matches and update succeeds.
    const newBonusValue = Number(lastBonus.bonus_offer) - Number(expectedAmount);
    try {
      const { error: updateErr } = await supabase
        .from('ads_payment')
        .update({ bonus_offer: newBonusValue, payment_date: new Date().toISOString(), is_paid: true, payment_status: 'paid', transaction: 'bonus_add', Actual_bonus: lastBonus.bonus_offer })
        .eq('id', lastBonus.id);
      if (updateErr) {
        console.error('Failed to update bonus row:', updateErr);
        return res.status(500).json({ error: 'Could not deduct bonus' });
      }
    } catch (e) {
      console.error('Exception updating bonus row:', e);
      return res.status(500).json({ error: 'Server error' });
    }

    // Insert ad as paid using bonus
    try {
      const adInsert = {
        ...adData,
        user_id: userId,
        is_paid: true,
        payment_status: 'paid',
        transaction: 'ad_payment',
        amount: expectedAmount,
        upload_date: new Date().toISOString(),
        expires_at: (() => { const d = new Date(); d.setDate(d.getDate() + (adData.duration_days || 0)); return d.toISOString(); })(),
      };
      const { data: insertedAd, error: insertAdError } = await supabase
        .from('ads_payment')
        .insert([adInsert])
        .select('id')
        .single();
      if (insertAdError) {
        console.error('Error inserting ad using bonus:', insertAdError);
        // attempt to revert bonus update? Log and return error
        return res.status(500).json({ error: 'Failed to create ad' });
      }

      // Informational: trigger server-side event (no window in backend) by updating a small field or returning info
      console.log(`Ad published using bonus for user ${userId}, ad id: ${insertedAd.id}`);
      return res.json({ ok: true, adId: insertedAd.id, deducted: expectedAmount, remainingBonus: newBonusValue });
    } catch (e) {
      console.error('Exception inserting ad using bonus:', e);
      return res.status(500).json({ error: 'Server error' });
    }
  } catch (e) {
    console.error('Error in /paymob/publish-from-bonus:', e);
    return res.status(500).json({ error: 'Server error' });
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
    
    // سجل استجابة مُخفّفة لتجنب طباعة الحقول الحساسة
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
            // ===== تحقق أمني: تأكد من أن المبلغ الذي أرسله Paymob يطابق السعر المخزن في قاعدة البيانات =====
            try {
              // الحصول على المبلغ المتوقع من السجل إن وُجد
              let expectedAmount = null;
              if (typeof existingAd.amount !== 'undefined' && existingAd.amount !== null) expectedAmount = Number(existingAd.amount);

              // إذا لم يوجد عمود amount في السجل حاول جلبه من جدول ads_price باستخدام النوع والمدد
              if ((expectedAmount === null || Number.isNaN(expectedAmount)) && existingAd.type && existingAd.duration_days) {
                try {
                  const { data: priceRow, error: priceErr } = await supabase
                    .from('ads_price')
                    .select('amount')
                    .eq('type', existingAd.type)
                    .eq('duration_days', existingAd.duration_days)
                    .limit(1)
                    .single();
                  if (!priceErr && priceRow && typeof priceRow.amount !== 'undefined') expectedAmount = Number(priceRow.amount);
                } catch (e) {
                  // ignore and continue
                }
              }

              const paidAmount = (typeof obj.amount_cents !== 'undefined') ? Number(obj.amount_cents) / 100 : NaN;

              // If we cannot determine expectedAmount or the amounts don't match, log and mark diagnostic field instead of auto-approving
              if (expectedAmount === null || Number.isNaN(paidAmount) || Math.abs(paidAmount - expectedAmount) > 0.001) {
                console.error('Amount mismatch or unable to verify payment amount for order. Skipping auto-mark-paid.', { orderId, paidAmount, expectedAmount });

                // حاول تسجيل المبلغ الذي استلمه Paymob في سجل الدفع لأغراض التحقيق
                try {
                  await supabase
                    .from('ads_payment')
                    .update({ payment_status: 'amount_mismatch', paymob_amount_cents: obj.amount_cents })
                    .eq('paymob_order_id', orderId);
                } catch (e) {
                  console.warn('Failed to write diagnostic amount_mismatch to ads_payment:', e?.message || e);
                }

                // أجب على webhook بنجاح حتى لا تحاول Paymob إعادة الإرسال، لكن لا تقم بتغيير حالة الإعلان إلى مدفوع
                return res.status(200).send('received');
              }
            } catch (amtErr) {
              console.error('Error while verifying expected amount in webhook:', amtErr);
              // في حالة خطأ داخلي، لا نكسر الاستجابة للـ webhook — سجّل فقط
            }

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

app.get('/api/get-contact-info', verifyJwtToken, async (req, res) => {
  try {
    const phoneId = String(req.query.phoneId || '').trim();
    if (!phoneId) {
      return res.status(400).json({ error: 'phoneId is required' });
    }

    const { data: allReports, error: reportError } = await supabase
      .from('phone_reports')
      .select('id, imei, email, owner_name, finder_phone')
      .order('id', { ascending: true });

    if (reportError || !allReports || allReports.length === 0) {
      console.error('No phone_reports found. Error:', reportError);
      return res.status(404).json({ error: 'لم يتم العثور على الهاتف في البلاغات', phoneId });
    }

    const normalizedIncoming = phoneId.replace(/\D/g, '');
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
      return res.status(404).json({ error: 'لم يتم العثور على الهاتف في البلاغات' });
    }

    const decryptedPhone = (() => {
      if (!foundReport.finder_phone) return null;
      try {
        return decryptField(foundReport.finder_phone) || foundReport.finder_phone;
      } catch (e) {
        console.error('فشل فك تشفير finder_phone:', e);
        return foundReport.finder_phone;
      }
    })();

    const decryptedEmail = (() => {
      if (!foundReport.email) return null;
      try {
        return decryptField(foundReport.email) || foundReport.email;
      } catch (e) {
        console.error('فشل فك تشفير email:', e);
        return foundReport.email;
      }
    })();

    const decryptedOwnerName = (() => {
      if (!foundReport.owner_name) return null;
      try {
        return decryptField(foundReport.owner_name) || foundReport.owner_name;
      } catch (e) {
        console.error('فشل فك تشفير owner_name:', e);
        return foundReport.owner_name;
      }
    })();

    const decryptedImei = (() => {
      if (!foundReport.imei) return null;
      try {
        return decryptField(foundReport.imei) || foundReport.imei;
      } catch (e) {
        console.error('فشل فك تشفير IMEI:', e);
        return foundReport.imei;
      }
    })();

    return res.json({
      phone: decryptedPhone,
      email: decryptedEmail,
      owner_name: decryptedOwnerName,
      imei: decryptedImei
    });
  } catch (err) {
    console.error('خطأ في جلب بيانات التواصل:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.post('/api/get-owner-email-by-imei', verifyJwtToken, async (req, res) => {
  try {
    const { imei } = req.body;

    if (!imei) {
      return res.status(400).json({ error: 'IMEI is required' });
    }

    const { data: allReports, error: reportError } = await supabase
      .from('phone_reports')
      .select('id, imei, email, owner_name')
      .order('id', { ascending: true });

    if (reportError || !allReports || allReports.length === 0) {
      console.error('No phone_reports found. Error:', reportError);
      return res.status(404).json({ error: 'لم يتم العثور على الهاتف في البلاغات', imei });
    }

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

    if (!foundReport || !foundReport.email) {
      return res.status(404).json({ error: 'لم يتم العثور على البريد الإلكتروني لهذا الهاتف' });
    }

    return res.json({
      email: foundReport.email,
      owner_name: foundReport.owner_name || null
    });
  } catch (err) {
    console.error('خطأ في جلب بريد المالك:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

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

    if (!targetImei) return res.status(400).json({ error: 'IMEI is required' });

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

    if (fetchError) console.error('supabase fetchError for report:', fetchError);
    if (fetchError) throw fetchError;
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

// نقطة نهاية لإعادة تعيين كلمة مرور الهاتف المسجل
app.post('/api/reset-phone-password', verifyJwtToken, async (req, res) => {
  const { imei, newPassword } = req.body;
  const userId = req.user.id;

  if (!imei || !newPassword) {
    return res.status(400).json({ error: 'IMEI and new password are required' });
  }

  try {
    // Rate limit check (per requesting user/IP)
    const userKey = req.user && req.user.id ? `uid:${req.user.id}` : `ip:${req.ip}`;
    const blocked = checkAuthBlocked(userKey);
    if (blocked.blocked) {
      const retryAfter = Math.ceil((blocked.retryAfterMs || 0) / 1000);
      return res.status(429).json({ error: 'Rate limit exceeded', retryAfter });
    }

    // 1. جلب جميع هواتف المستخدم
    const { data: userPhones, error: fetchError } = await supabase
      .from('registered_phones')
      .select('id, imei')
      .eq('user_id', userId);

    if (fetchError) throw fetchError;

    // 2. البحث عن الهاتف المطابق بفك التشفير
    const targetPhone = userPhones.find(p => decryptField(p.imei) === imei);

    if (!targetPhone) {
      // Record failed attempt (possible probing)
      recordAuthFailure(userKey);
      return res.status(404).json({ error: 'Phone not found for this user' });
    }

    // 3. تحديث كلمة المرور (تشفيرها أولاً)
    const hashedPassword = crypto.createHash('sha256').update(newPassword).digest('hex');

    const { error: updateError } = await supabase
      .from('registered_phones')
      .update({ password: hashedPassword })
      .eq('id', targetPhone.id);

    if (updateError) throw updateError;

    // success: clear any recorded failures for this user
    clearAuthFailures(userKey);
    res.json({ success: true, message: 'Password updated successfully' });

  } catch (error) {
    console.error('Error resetting phone password:', error);
    return sendError(res, 500, 'حدث خطأ في الخادم', error);
  }
});

// --- نقاط نهاية تسجيل الهاتف ---

// دالة التحقق من حد التسجيل (Rate Limiting)
const checkRegisterLimit = async (userId) => {
  try {
    // 1. جلب أحدث دفع من جدول ads_payment
    const { data: latestPayment, error: paymentError } = await supabase
      .from('ads_payment')
      .select('type, is_paid, user_id, payment_date')
      .eq('user_id', userId)
      .eq('is_paid', true)
      .in('type', ['gold_business', 'silver_business'])
      .not('payment_date', 'is', null)
      .order('payment_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError) {
      console.error('Payment query error:', paymentError);
      throw paymentError;
    }

    let userType = 'free_business';
    if (latestPayment && latestPayment.type) {
      userType = latestPayment.type;
    }
    console.log('نوع المستخدم بعد التحقق:', userType);

    // 2. جلب تفاصيل الخطة بناءً على type
    const { data: planData, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('type', userType)
      .maybeSingle();

    if (planError || !planData) {
      console.error('Plan query error:', planError);
      throw new Error('لم يتم العثور على تفاصيل الخطة لهذا النوع');
    }

    // 3. جلب الاستخدام الحالي
    const { data: usageData, error: usageError } = await supabase
      .from('users_plans')
      .select('id, user_id, used_register_phone')
      .eq('user_id', userId)
      .maybeSingle();

    if (usageError) {
      // إذا لم يوجد سجل، قم بإنشاء سجل جديد
      if (usageError.code === 'PGRST116') {
        const { data: insertData, error: insertError } = await supabase
          .from('users_plans')
          .insert({
            id: userId,
            user_id: userId,
            role: userType,
            used_register_phone: 0
          })
          .select()
          .maybeSingle();

        if (insertError) {
          throw new Error('حدث خطأ في تهيئة بيانات الخطة الخاصة بك');
        }
        return { canRegister: true, limit: parseInt(planData.register_phone_limit), currentUsage: 0 };
      }
      throw usageError;
    }

    const currentUsage = usageData.used_register_phone || 0;
    const limit = parseInt(planData.register_phone_limit);
    const isLastUsage = currentUsage >= limit - 1;

    if (currentUsage >= limit) {
      return { 
        canRegister: false, 
        limit, 
        currentUsage, 
        isLastUsage: false,
        message: 'تم الوصول إلى الحد الأقصى للتسجيل'
      };
    }

    return { 
      canRegister: true, 
      limit, 
      currentUsage, 
      isLastUsage,
      message: isLastUsage ? 'هذا هو آخر تسجيل مسموح' : null
    };
  } catch (error) {
    console.error('Error in checkRegisterLimit:', error);
    throw error;
  }
};

// دالة تحديث العداد بعد التسجيل
const updateRegisterUsage = async (userId) => {
  try {
    const { error } = await supabase.rpc('increment_register_usage', {
      p_user_id: userId
    });
    if (error) {
      console.error('خطأ في تحديث الاستخدام:', error);
      throw error;
    }
  } catch (error) {
    console.error('خطأ في تحديث استخدام التسجيل:', error);
    throw error;
  }
};

// نقطة نهاية للتحقق من وجود IMEI
app.post('/api/check-imei', verifyJwtToken, async (req, res) => {
  const { imei, userId } = req.body;
  try {
    // أولاً: التحقق من جدول البلاغات (phone_reports) قبل أي شيء
    // جلب جميع السجلات للتحقق منها
    const { data: allReports, error: reportsFetchError } = await supabase
      .from('phone_reports')
      .select('id, user_id, imei')
      .eq('status', 'active');
    
    if (reportsFetchError) {
      console.error('Error fetching phone_reports:', reportsFetchError);
    } else if (allReports && allReports.length > 0) {
      // فك تشفير جميع أرقام IMEI والمقارنة
      const matchingReport = allReports.find(report => {
        const decryptedImei = decryptField(report.imei);
        if (process.env.NODE_ENV !== 'production') console.log('[check-imei] report decrypted IMEI:', decryptedImei, 'normalized:', normalizeDigitsOnly(decryptedImei));
        return normalizeDigitsOnly(decryptedImei) === normalizeDigitsOnly(imei);
      });
      
      if (matchingReport) {
        // يوجد بلاغ فعال لهذا الـ IMEI، لا يسمح بالتسجيل في أي حال
        // التحقق مما إذا كان البلاغ يخص المستخدم الحالي
        if (userId && matchingReport.user_id === userId) {
          // المستخدم الحالي هو صاحب البلاغ، لكن لا نسمح له بالتسجيل
          return res.json({ exists: true, phoneDetails: null, isOtherUser: false, hasActiveReport: true, isOwnReport: true, isStolen: true });
        }
        // يوجد بلاغ فعال لمستخدم آخر، نعتبره موجوداً ومملوكاً لآخر لمنع التسجيل وإظهار التحذير
        return res.json({ exists: true, phoneDetails: null, isOtherUser: true, hasActiveReport: true, isStolen: true });
      }
    }

    // ثانياً: التحقق من جدول الهواتف المسجلة (registered_phones)
    // جلب جميع السجلات للتحقق منها
    const { data: allPhones, error: phonesFetchError } = await supabase
      .from('registered_phones')
      .select('owner_name, phone_number, phone_image_url, phone_type, status, user_id, imei, id_last6');

    if (phonesFetchError) {
      console.error('Error fetching registered_phones:', phonesFetchError);
      return res.status(500).json({ error: 'Error fetching registered phones' });
    }
    
    // فك تشفير جميع أرقام IMEI والبحث عن المطابقة (بما في ذلك الهواتف التي قد تكون بحالة 'transferred')
    const matchingPhone = allPhones ? allPhones.find(phone => {
      const decryptedImei = decryptField(phone.imei);
      if (process.env.NODE_ENV !== 'production') console.log('[check-imei] phone row decrypted IMEI:', decryptedImei, 'normalized:', normalizeDigitsOnly(decryptedImei));
      return normalizeDigitsOnly(decryptedImei) === normalizeDigitsOnly(imei);
    }) : null;

    // If not found, in non-prod print a summary of all decrypted IMEIs to help debugging
    if (!matchingPhone && process.env.NODE_ENV !== 'production') {
      console.log('[check-imei] incoming IMEI raw/norm ->', imei, '/', normalizeDigitsOnly(imei));
      console.log('[check-imei] registered_phones rows count ->', (allPhones || []).length);
      console.log('[check-imei] No matching phone found. Listing decrypted IMEIs (first 50 rows):');
      (allPhones || []).slice(0,50).forEach((p, idx) => {
        try {
          const d = decryptField(p.imei);
          const norm = normalizeDigitsOnly(d);
          console.log(`  [${idx}] id_last6=${p.id_last6} user_id=${p.user_id} status=${p.status} decryptedImei=${d} normalized=${norm}`);
        } catch (e) {
          console.log(`  [${idx}] error decrypting row:`, e?.message || e);
        }
      });
    }

    // إذا كان الهاتف مسجلاً (وليس منقول الملكية)
    if (matchingPhone) {
      // إذا كانت حالة السجل 'transferred' نعامله كـ موجود ومُنقَل
        if (matchingPhone.status === 'transferred') {
        // If the record is marked transferred, still check if the requesting user is the new owner.
        if (userId && matchingPhone.user_id === userId) {
          // Treat as owned by current user (allow access to decrypted details)
          const decryptedOwnerName = decryptField(matchingPhone.owner_name) || matchingPhone.owner_name || '';
          const decryptedPhone = {
            ...matchingPhone,
            imei: decryptField(matchingPhone.imei),
            phone_number: decryptField(matchingPhone.phone_number),
            id_last6: decryptField(matchingPhone.id_last6),
            owner_name: decryptedOwnerName
          };
          return res.json({ exists: true, phoneDetails: decryptedPhone, isOtherUser: false, hasActiveReport: false, isTransferred: true });
        }

        const decryptedPhoneNumber = decryptField(matchingPhone.phone_number);
        const decryptedIdLast6 = decryptField(matchingPhone.id_last6);
        const decryptedOwnerName = decryptField(matchingPhone.owner_name) || matchingPhone.owner_name || '';
        const maskedPhoneDetails = {
          maskedOwnerName: maskName(decryptedOwnerName),
          maskedPhoneNumber: maskPhoneNumber(decryptedPhoneNumber),
          maskedIdLast6: maskIdLast6(decryptedIdLast6 || ''),
          phone_type: matchingPhone.phone_type || '',
          phone_image_url: matchingPhone.phone_image_url || ''
        };
        return res.json({ exists: true, phoneDetails: maskedPhoneDetails, isOtherUser: true, hasActiveReport: false, isTransferred: true, registered: true });
      }
      // التحقق مما إذا كان مسجلاً لمستخدم آخر
      if (userId && matchingPhone.user_id === userId) {
        // الهاتف مسجل للمستخدم الحالي، نسمح له بتحديث البيانات
        // فك تشفير البيانات قبل إرجاعها
        const decryptedOwnerName = decryptField(matchingPhone.owner_name) || matchingPhone.owner_name || '';
        const decryptedPhone = {
          ...matchingPhone,
          imei: decryptField(matchingPhone.imei),
          phone_number: decryptField(matchingPhone.phone_number),
          id_last6: decryptField(matchingPhone.id_last6),
          owner_name: decryptedOwnerName
        };
        return res.json({ exists: true, phoneDetails: decryptedPhone, isOtherUser: false });
      } else {
        // مسجل لمستخدم آخر، تحقق مما إذا كان هناك بلاغ فعال
        const { data: reportData2, error: reportError2 } = await supabase
          .from('phone_reports')
          .select('id, imei')
          .eq('status', 'active');

        if (reportError2) {
          console.error('Error checking phone_reports:', reportError2);
          // في حالة فشل التحقق من البلاغ، ارجع للسلوك الأصلي
          return res.json({ exists: true, phoneDetails: null, isOtherUser: true, hasActiveReport: false });
        }

        // فك تشفير جميع أرقام IMEI في البلاغات والبحث عن المطابقة
        const matchingReport2 = reportData2 ? reportData2.find(report => {
          const decryptedImei = decryptField(report.imei);
          return decryptedImei === imei;
        }) : null;

        if (matchingReport2) {
          // الهاتف مسجل لمستخدم آخر وبه بلاغ فعال
          return res.json({ exists: true, phoneDetails: null, isOtherUser: true, hasActiveReport: true, isStolen: true });
        }
        // الهاتف مسجل لمستخدم آخر ولكن ليس به بلاغ فعال
        // إرجاع بيانات مقنّعة فقط
        const decryptedPhoneNumber = decryptField(matchingPhone.phone_number);
        const decryptedIdLast6 = decryptField(matchingPhone.id_last6);
        const decryptedOwnerName = decryptField(matchingPhone.owner_name) || matchingPhone.owner_name || '';
        const maskedPhoneDetails = {
          maskedOwnerName: maskName(decryptedOwnerName),
          maskedPhoneNumber: maskPhoneNumber(decryptedPhoneNumber),
          maskedIdLast6: maskIdLast6(decryptedIdLast6 || ''),
          phone_type: matchingPhone.phone_type || '',
          phone_image_url: matchingPhone.phone_image_url || ''
        };
        return res.json({ exists: true, phoneDetails: maskedPhoneDetails, isOtherUser: true, hasActiveReport: false });
      }
    }

    res.json({ exists: false, phoneDetails: null });
  } catch (error) {
    console.error('Error checking IMEI:', error);
    return sendError(res, 500, 'حدث خطأ في الخادم', error);
  }
});

// نقطة نهاية لتسجيل الهاتف
// تخزين مؤقت لتتبع محاولات التسجيل لمنع الهجمات العشوائية
const registrationAttempts = new Map(); // تخزين محاولات التسجيل لكل مستخدم
const MAX_ATTEMPTS_PER_HOUR = 10; // الحد الأقصى للمحاولات في الساعة
const ATTEMPT_COOLDOWN = 3600000; // فترة التهدئة: ساعة بالمللي ثانية

// ==========================
// Rate limiter for auth attempts (login/password checks)
// ==========================
// This protects endpoints that accept passwords (verify-seller-password, transfer-ownership)
const authFailures = new Map(); // key -> array of timestamps (failed attempts)
const authBlockedUntil = new Map(); // key -> timestamp until which blocked
const MAX_AUTH_ATTEMPTS = process.env.MAX_AUTH_ATTEMPTS ? parseInt(process.env.MAX_AUTH_ATTEMPTS, 10) : 5;
const AUTH_WINDOW_MS = process.env.AUTH_WINDOW_MS ? parseInt(process.env.AUTH_WINDOW_MS, 10) : (15 * 60 * 1000); // 15 minutes
const AUTH_LOCK_MS = process.env.AUTH_LOCK_MS ? parseInt(process.env.AUTH_LOCK_MS, 10) : (30 * 60 * 1000); // 30 minutes

const recordAuthFailure = (key) => {
  try {
    const now = Date.now();
    if (!authFailures.has(key)) authFailures.set(key, []);
    const arr = (authFailures.get(key) || []).filter(ts => now - ts < AUTH_WINDOW_MS);
    arr.push(now);
    authFailures.set(key, arr);
    if (arr.length >= MAX_AUTH_ATTEMPTS) {
      authBlockedUntil.set(key, now + AUTH_LOCK_MS);
      // clear the failure timestamps to avoid unbounded growth
      authFailures.delete(key);
    }
  } catch (e) {
    console.error('recordAuthFailure error:', e);
  }
};

const clearAuthFailures = (key) => {
  try {
    authFailures.delete(key);
    authBlockedUntil.delete(key);
  } catch (e) {
    console.error('clearAuthFailures error:', e);
  }
};

const checkAuthBlocked = (key) => {
  try {
    const now = Date.now();
    const until = authBlockedUntil.get(key) || 0;
    if (until && until > now) {
      return { blocked: true, retryAfterMs: until - now };
    }
    // if block expired, cleanup
    if (until && until <= now) {
      authBlockedUntil.delete(key);
      authFailures.delete(key);
    }
    return { blocked: false };
  } catch (e) {
    console.error('checkAuthBlocked error:', e);
    return { blocked: false };
  }
};

app.post('/api/register-phone', verifyJwtToken, async (req, res) => {
  const phoneData = req.body;
  const userId = req.user.id;

  // التحقق من وجود المستخدم من JWT Token
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: Invalid user' });
  }
  
  // التحقق من حد المحاولات
  const userAttempts = registrationAttempts.get(userId) || [];
  const now = Date.now();
  
  // إزالة المحاولات القديمة (أقدم من ساعة)
  const recentAttempts = userAttempts.filter(attempt => now - attempt.timestamp < ATTEMPT_COOLDOWN);
  
  // التحقق من تجاوز الحد الأقصى
  if (recentAttempts.length >= MAX_ATTEMPTS_PER_HOUR) {
    const oldestAttempt = recentAttempts[0];
    const timeUntilReset = Math.ceil((oldestAttempt.timestamp + ATTEMPT_COOLDOWN - now) / 60000); // بالدقائق
    return res.status(429).json({ 
      error: `تم تجاوز الحد الأقصى للمحاولات. يرجى المحاولة مرة أخرى بعد ${timeUntilReset} دقيقة`,
      retryAfter: timeUntilReset,
      attemptsRemaining: 0
    });
  }

  // تشفير كلمة المرور قبل التخزين في قاعدة البيانات
  if (phoneData.password) {
    phoneData.password = crypto.createHash('sha256').update(phoneData.password).digest('hex');
  }
  
  // تشفير رقم IMEI باستخدام AES
  if (phoneData.imei) {
    const encryptedImei = encryptAES(phoneData.imei);
    if (!encryptedImei) {
      return res.status(400).json({ error: 'فشل تشفير رقم IMEI' });
    }
    phoneData.imei = JSON.stringify({
      encryptedData: encryptedImei.encryptedData,
      iv: encryptedImei.iv,
      authTag: encryptedImei.authTag
    });
  }
  
  // تشفير رقم الهاتف باستخدام AES
  if (phoneData.phone_number) {
    const encryptedPhone = encryptAES(phoneData.phone_number);
    if (!encryptedPhone) {
      return res.status(400).json({ error: 'فشل تشفير رقم الهاتف' });
    }
    phoneData.phone_number = JSON.stringify({
      encryptedData: encryptedPhone.encryptedData,
      iv: encryptedPhone.iv,
      authTag: encryptedPhone.authTag
    });
  }
  
  // تشفير آخر 6 أرقام من البطاقة باستخدام AES
  if (phoneData.id_last6) {
    const encryptedId = encryptAES(phoneData.id_last6);
    if (!encryptedId) {
      return res.status(400).json({ error: 'فشل تشفير رقم الهوية' });
    }
    phoneData.id_last6 = JSON.stringify({
      encryptedData: encryptedId.encryptedData,
      iv: encryptedId.iv,
      authTag: encryptedId.authTag
    });
  }
  
  // تشفير البريد الإلكتروني باستخدام AES
  if (phoneData.email) {
    const encryptedEmail = encryptAES(phoneData.email);
    if (!encryptedEmail) {
      return res.status(400).json({ error: 'فشل تشفير البريد الإلكتروني' });
    }
    phoneData.email = JSON.stringify({
      encryptedData: encryptedEmail.encryptedData,
      iv: encryptedEmail.iv,
      authTag: encryptedEmail.authTag
    });
  }

  try {
    // ⭐ التحقق من حد التسجيل (Rate Limiting)
    const limitCheck = await checkRegisterLimit(req.user.id);
    if (!limitCheck.canRegister) {
      return res.status(429).json({ 
        success: false, 
        error: limitCheck.message || 'تم الوصول إلى الحد الأقصى للتسجيل',
        limit: limitCheck.limit,
        currentUsage: limitCheck.currentUsage
      });
    }

    // أولاً: التحقق من عدم وجود بلاغ نشط لهذا الـ IMEI
    if (phoneData.imei) {
      // جلب جميع السجلات للتحقق منها
      const { data: allReports, error: reportsFetchError } = await supabase
        .from('phone_reports')
        .select('id, imei')
        .eq('status', 'active');
      
      if (reportsFetchError) {
        console.error('Error checking phone_reports:', reportsFetchError);
      } else if (allReports && allReports.length > 0) {
        // فك تشفير جميع أرقام IMEI والمقارنة
        const matchingReport = allReports.find(report => {
          const decryptedImei = decryptField(report.imei);
          return decryptedImei === phoneData.imei;
        });
        
        if (matchingReport) {
          // يوجد بلاغ نشط لهذا الـ IMEI، لا يسمح بالتسجيل
          return res.status(400).json({ 
            success: false, 
            error: 'لا يمكن تسجيل هذا الهاتف لأنه مسجل به بلاغ نشط',
            hasActiveReport: true,
            isStolen: true
          });
        }
      }
    }

    // إذا كان التسجيل للغير (user_id === null أو غير معرف)، لا تضع user_id
    if (typeof phoneData.user_id === 'undefined' || phoneData.user_id === null) {
      delete phoneData.user_id;
    } else {
      // إذا أرسل العميل user_id (تسجيل لنفسه)، استخدم معرف المستخدم من التوكن
      phoneData.user_id = req.user.id;
    }

    const { data, error } = await supabase
      .from('registered_phones')
      .insert([phoneData])
      .select();

    if (error) throw error;

    // ⭐ تسجيل محاولة التسجيل الناجحة
    registrationAttempts.set(userId, [
      ...(userAttempts || []),
      { timestamp: Date.now() }
    ].filter(attempt => Date.now() - attempt.timestamp < ATTEMPT_COOLDOWN));

    // ⭐ تحديث العداد بعد التسجيل الناجح
    await updateRegisterUsage(userId);

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error registering phone:', error);
    return sendError(res, 500, 'حدث خطأ في الخادم', error);
  }
});

// نقطة نهاية للتحقق من الصور قبل رفعها
app.post('/api/validate-image', async (req, res) => {
  try {
    const { imageBase64, maxSizeMB = 10 } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({ error: 'صورة مطلوبة' });
    }
    
    // تحويل Base64 إلى Buffer
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // الحد الأقصى لحجم الصورة بالبايت
    const maxSizeInBytes = maxSizeMB * 1024 * 1024;
    
    // التحقق من الصورة
    const validation = validateImageFile(buffer, buffer.length, maxSizeInBytes);
    
    if (!validation.isValid) {
      return res.status(400).json({ 
        error: validation.error,
        isValid: false
      });
    }
    
    res.json({ 
      isValid: true, 
      mimeType: validation.mimeType,
      message: 'الصورة صالحة' 
    });
  } catch (error) {
    console.error('خطأ في التحقق من الصورة:', error);
    res.status(500).json({ error: 'خطأ في التحقق من الصورة' });
  }
});

// نقطة نهاية لجلب بيانات المستخدم لتسجيل الهاتف (التحقق من المستخدم)
app.post('/api/get-user-data-for-registration', verifyJwtToken, async (req, res) => {
  const { userId, role } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    let userData = null;

    if (role === 'business') {
      const { data, error } = await supabase
        .from('businesses')
        .select('store_name, phone, id_last6')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        userData = {
          ownerName: data.store_name,
          phoneNumber: data.phone,
          idLast6: maskIdLast6(data.id_last6), // إخفاء الرقم القومي للنشاط التجاري
          isBusiness: true
        };
      }
    } else {
      const { data, error } = await supabase
        .from('users')
        .select('full_name, phone, email, id_last6')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        userData = {
          ownerName: maskName(data.full_name), // إخفاء الاسم
          phoneNumber: maskPhoneNumber(data.phone), // إخفاء الهاتف
          email: maskEmail(data.email), // إخفاء البريد
          idLast6: maskIdLast6(data.id_last6), // إخفاء الرقم القومي
          isBusiness: false
        };
      }
    }

    if (userData) {
      res.json({ success: true, data: userData });
    } else {
      res.json({ success: false, message: 'User data not found' });
    }
  } catch (error) {
    console.error('Error fetching user data for registration:', error);
    return sendError(res, 500, 'حدث خطأ في الخادم', error);
  }
});

// نقطة نهاية لإرجاع بيانات المشتري (مقنعة) للمستخدم الموّقع فقط
app.get('/api/my-buyer-info', verifyJwtToken, async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // تحقق مما إذا كان المستخدم مرتبطًا بعمل تجاري
    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('store_name, phone, email')
      .eq('user_id', userId)
      .maybeSingle();

    if (bizErr) {
      console.error('my-buyer-info: businesses query error', bizErr);
      return res.status(500).json({ error: 'Database error' });
    }

    if (business) {
      return res.json({
        success: true,
        data: {
          maskedName: maskName(business.store_name || ''),
          maskedPhone: maskPhoneNumber(business.phone || ''),
          maskedEmail: maskEmail(business.email || ''),
          isBusiness: true,
          ownerId: userId
        }
      });
    }

    // إذا لم يكن عملًا تجاريًا، حاول جلب بيانات المستخدم العامة
    const { data: userData, error: userErr } = await supabase
      .from('users')
      .select('full_name, phone, email')
      .eq('id', userId)
      .maybeSingle();

    if (userErr) {
      console.error('my-buyer-info: users query error', userErr);
      return res.status(500).json({ error: 'Database error' });
    }

    if (userData) {
      return res.json({
        success: true,
        data: {
          maskedName: maskName(userData.full_name || ''),
          maskedPhone: maskPhoneNumber(userData.phone || ''),
          maskedEmail: maskEmail(userData.email || ''),
          isBusiness: false,
          ownerId: userId
        }
      });
    }

    return res.json({ success: false, data: null });
  } catch (err) {
    console.error('my-buyer-info error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// نقطة نهاية لجلب معلومات الهاتف المقنعة (للإبلاغ عن فقدان)
app.post('/api/imei-masked-info', verifyJwtToken, async (req, res) => {
  try {
    const { imei } = req.body;
    // استخدام userId من التوكن بدلاً من جسم الطلب
    const userId = req.user.id;
    if (!imei) return res.status(400).json({ error: 'IMEI required' });

    // 1. Check active reports
    const { data: reports, error: reportError } = await supabase
      .from('phone_reports')
      .select('imei')
      .eq('status', 'active');
    
    if (reportError) throw reportError;

    // Decrypt and check reports (normalize to digits-only for robust matching)
    const normalizedIncoming = normalizeDigitsOnly(imei);
    const activeReport = reports ? reports.find(r => normalizeDigitsOnly(decryptField(r.imei)) === normalizedIncoming) : null;

    // 2. Check registered phones
    // جلب فقط receipt_image_url (بدون receipt_image_url_iv)
    const { data: phones, error: phoneError } = await supabase
      .from('registered_phones')
      .select('*, receipt_image_url');
    if (phoneError) throw phoneError;
    // ⚠️ Diagnostic logging in development to help debug missing matches
    if (process.env.NODE_ENV === 'development') {
      try {
        const decryptedList = (phones || []).map(p => ({ id: p.id, user_id: p.user_id, imei_decrypted: decryptField(p.imei) }));
        console.log('[IMEI-MASKED-INFO][DEBUG] incoming imei:', imei);
        console.log('[IMEI-MASKED-INFO][DEBUG] decrypted registered_phones sample (first 20):', decryptedList.slice(0,20));
      } catch (dbgErr) {
        console.error('[IMEI-MASKED-INFO][DEBUG] failed to decrypt sample list:', dbgErr);
      }
    }

    const registeredPhone = phones ? phones.find(p => normalizeDigitsOnly(decryptField(p.imei)) === normalizedIncoming) : null;

    if (activeReport) {
      if (registeredPhone) {
        const isOwner = userId && registeredPhone.user_id === userId;
        // Debug info
        console.log('[IMEI-MASKED-INFO][REPORT+REG]', {
          imei,
          userId,
          registeredPhoneUserId: registeredPhone.user_id,
          isOwner,
          status: registeredPhone.status
        });
        if (registeredPhone.status === 'transferred') {
          // If transferred, allow the new owner (matching userId) to see owner details
          if (userId && registeredPhone.user_id === userId) {
            const ownerName = decryptField(registeredPhone.owner_name) || registeredPhone.owner_name || '';
            const phoneNumber = decryptField(registeredPhone.phone_number) || registeredPhone.phone_number || '';
            const idLast6 = decryptField(registeredPhone.id_last6) || registeredPhone.id_last6 || '';
            const phoneType = registeredPhone.phone_type || '';
            const phoneImageUrl = registeredPhone.phone_image_url || '';
            return res.json({
              found: true,
              masked: false,
              isRegistered: true,
              isOwner: true,
              isTransferred: true,
              receipt_image_url: registeredPhone.receipt_image_url,
              maskedOwnerName: maskName(ownerName),
              maskedPhoneNumber: maskPhoneNumber(phoneNumber),
              maskedIdLast6: maskIdLast6(idLast6 || ''),
              phone_type: phoneType,
              phone_image_url: phoneImageUrl
            });
          }
          console.log('[IMEI-MASKED-INFO] حالة transferred: returning masked transferred info');
          const decryptedPhoneNumber = decryptField(registeredPhone.phone_number);
          const decryptedIdLast6 = decryptField(registeredPhone.id_last6);
          const decryptedOwnerName = decryptField(registeredPhone.owner_name) || registeredPhone.owner_name || '';
          const maskedPhoneDetails = {
            maskedOwnerName: maskName(decryptedOwnerName),
            maskedPhoneNumber: maskPhoneNumber(decryptedPhoneNumber),
            maskedIdLast6: maskIdLast6(decryptedIdLast6 || ''),
            phone_type: registeredPhone.phone_type || '',
            phone_image_url: registeredPhone.phone_image_url || ''
          };
          return res.json({
            found: true,
            masked: true,
            isOtherUser: true,
            hasActiveReport: false,
            isTransferred: true,
            isRegistered: true,
            receipt_image_url: registeredPhone.receipt_image_url,
            ...maskedPhoneDetails
          });
        }
        const ownerName = decryptField(registeredPhone.owner_name) || registeredPhone.owner_name || '';
        const phoneNumber = decryptField(registeredPhone.phone_number) || registeredPhone.phone_number || '';
        const idLast6 = decryptField(registeredPhone.id_last6) || registeredPhone.id_last6 || '';
        const phoneType = registeredPhone.phone_type || '';
        const phoneImageUrl = registeredPhone.phone_image_url || '';

        const response = {
          found: true,
          masked: false,
          isRegistered: true,
          isOwner,
          receipt_image_url: registeredPhone.receipt_image_url,
          maskedOwnerName: maskName(ownerName),
          maskedPhoneNumber: maskPhoneNumber(phoneNumber),
          maskedIdLast6: maskIdLast6(idLast6),
          phone_type: phoneType,
          phone_image_url: phoneImageUrl
        };
        console.log('[IMEI-MASKED-INFO] Response:', response);
        return res.json(response);
      } else {
        // عليه بلاغ وغير مسجل
        return res.json({ found: true, masked: false, isRegistered: false, isOwner: false });
      }
    }

    if (registeredPhone) {
      const isOwner = userId && registeredPhone.user_id === userId;
      // Debug info
      console.log('[IMEI-MASKED-INFO][REG ONLY]', {
        imei,
        userId,
        registeredPhoneUserId: registeredPhone.user_id,
        isOwner,
        status: registeredPhone.status
      });
      if (registeredPhone.status === 'transferred') {
        // If transferred and requesting user is the new owner, return owner-visible details
        if (userId && registeredPhone.user_id === userId) {
          const ownerName = decryptField(registeredPhone.owner_name) || registeredPhone.owner_name || '';
          const phoneNumber = decryptField(registeredPhone.phone_number) || registeredPhone.phone_number || '';
          const idLast6 = decryptField(registeredPhone.id_last6) || registeredPhone.id_last6 || '';
          const phoneType = registeredPhone.phone_type || '';
          const phoneImageUrl = registeredPhone.phone_image_url || '';
          return res.json({
            found: true,
            masked: false,
            isRegistered: true,
            isOwner: true,
            isTransferred: true,
            receipt_image_url: registeredPhone.receipt_image_url,
            maskedOwnerName: maskName(ownerName),
            maskedPhoneNumber: maskPhoneNumber(phoneNumber),
            maskedIdLast6: maskIdLast6(idLast6 || ''),
            phone_type: phoneType,
            phone_image_url: phoneImageUrl
          });
        }

        console.log('[IMEI-MASKED-INFO] حالة transferred: returning masked transferred info');
        const decryptedPhoneNumber = decryptField(registeredPhone.phone_number);
        const decryptedIdLast6 = decryptField(registeredPhone.id_last6);
        const maskedPhoneDetails = {
          maskedOwnerName: maskName(registeredPhone.owner_name),
          maskedPhoneNumber: maskPhoneNumber(decryptedPhoneNumber),
          maskedIdLast6: maskIdLast6(decryptedIdLast6 || ''),
          phone_type: registeredPhone.phone_type || '',
          phone_image_url: registeredPhone.phone_image_url || ''
        };
        return res.json({
          found: true,
          masked: true,
          isOtherUser: true,
          isTransferred: true,
          isRegistered: true,
          receipt_image_url: registeredPhone.receipt_image_url,
          ...maskedPhoneDetails
        });
      }
      const ownerName = decryptField(registeredPhone.owner_name) || registeredPhone.owner_name || '';
      const phoneNumber = decryptField(registeredPhone.phone_number) || registeredPhone.phone_number || '';
      const idLast6 = decryptField(registeredPhone.id_last6) || registeredPhone.id_last6 || '';
      const phoneType = registeredPhone.phone_type || '';
      const phoneImageUrl = registeredPhone.phone_image_url || '';

      const response = {
        found: true,
        masked: true,
        isOwner,
        isRegistered: true,
        receipt_image_url: registeredPhone.receipt_image_url,
        maskedOwnerName: maskName(ownerName),
        maskedPhoneNumber: maskPhoneNumber(phoneNumber),
        maskedIdLast6: maskIdLast6(idLast6),
        phone_type: phoneType,
        phone_image_url: phoneImageUrl
      };
      console.log('[IMEI-MASKED-INFO] Response:', response);
      return res.json(response);
    }

    console.log('[IMEI-MASKED-INFO] Not registered: found=false');
    return res.json({ found: false, masked: false, isOwner: false, isRegistered: false });

  } catch (error) {
    console.error('Error in imei-masked-info:', error);
    return res.status(500).json({ error: 'Server error', details: error?.message || '' });
  }
});

// Simple in-memory rate limiter for decrypted report requests (per user)
const decryptedRequestCounts = {}; // { [userId]: [timestamps] }

// نقطة نهاية لعرض تفاصيل البلاغ مفكوكة الحقول - الوصول للمالك فقط
app.post('/api/report-details-decrypted', verifyJwtToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Rate limiting logic
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour
    const limit = 10;
    if (!decryptedRequestCounts[userId]) decryptedRequestCounts[userId] = [];
    // keep only recent timestamps
    decryptedRequestCounts[userId] = decryptedRequestCounts[userId].filter(ts => now - ts < windowMs);
    if (decryptedRequestCounts[userId].length >= limit) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    decryptedRequestCounts[userId].push(now);

    // Support both reportId (from client) and id
    const { reportId, id } = req.body;
    const targetId = reportId || id;

    if (!targetId) return res.status(400).json({ error: 'reportId is required' });

    // جلب البلاغ حسب المعرف
    const { data: report, error } = await supabase
      .from('phone_reports')
      .select('*')
      .eq('id', targetId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching report for decrypted details:', error);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!report) return res.status(404).json({ error: 'Report not found' });

    // تأكد أن طالب الطلب هو المالك فقط
    if (req.user.id !== report.user_id) {
      return res.status(403).json({ error: 'Forbidden: only owner can view decrypted details' });
    }

    // فك الحقول المشفرة إن وُجدت باستخدام دالة المساعدة الموجودة
    const decrypted = {
      id: report.id,
      imei: decryptField(report.imei),
      owner_name: decryptField(report.owner_name) || report.owner_name,
      phone_number: decryptField(report.phone_number) || report.phone_number,
      phone_type: decryptField(report.phone_type) || report.phone_type,
      loss_location: decryptField(report.loss_location) || report.loss_location,
      loss_time: report.loss_time || null,
      id_last6: decryptField(report.id_last6) || report.id_last6,
      email: decryptField(report.email) || report.email,
      fcm_token: report.fcm_token || null,
      report_date: report.report_date || null,
      status: report.status || null,
      receipt_image_url: report.receipt_image_url || null,
      finder_phone: decryptField(report.finder_phone) || report.finder_phone || null
    };

    return res.json({ success: true, ...decrypted, data: decrypted });
  } catch (err) {
    console.error('Error in /api/report-details-decrypted:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// نقطة نهاية لكشف (فك) IMEI المشفّر وإرجاع نسخة مقنعة (masked)
app.post('/api/reveal-imei', verifyJwtToken, async (req, res) => {
  try {
    const { imei_encrypted, imei_plain } = req.body;

    console.log('[reveal-imei] payload keys:', Object.keys(req.body));

    let imeiValue = null;

    // Try multiple ways to obtain/decrypt the IMEI
    if (imei_encrypted) {
      // If object with expected keys
      if (typeof imei_encrypted === 'object' && imei_encrypted.encryptedData && imei_encrypted.iv && imei_encrypted.authTag) {
        try {
          imeiValue = decryptAES(imei_encrypted.encryptedData, imei_encrypted.iv, imei_encrypted.authTag);
        } catch (e) {
          console.warn('[reveal-imei] decryptAES failed for imei_encrypted object:', e.message);
        }
      }

      // If still not found, try decryptField which can handle JSON strings or other formats
      if (!imeiValue) {
        try {
          imeiValue = decryptField(typeof imei_encrypted === 'string' ? imei_encrypted : JSON.stringify(imei_encrypted));
        } catch (e) {
          console.warn('[reveal-imei] decryptField failed:', e.message);
        }
      }
    }

    // Fallback to imei_plain if provided
    if (!imeiValue && imei_plain) {
      imeiValue = String(imei_plain);
    }

    if (!imeiValue) {
      console.warn('[reveal-imei] IMEI value could not be determined');
      return res.status(404).json({ success: false, error: 'IMEI not found or could not be decrypted' });
    }

    // إنشاء نسخة مقنعة - إظهار آخر 4 أرقام وإخفاء الباقي
    const visible = 4;
    const masked = imeiValue.length <= visible ? imeiValue : '*'.repeat(imeiValue.length - visible) + imeiValue.slice(-visible);
    // أرفق مسافات كل 4 محارف لسهولة القراءة
    const maskedWithSpaces = masked.replace(/(.{4})/g, '$1 ').trim();

    console.log('[reveal-imei] success for imei:', imeiValue && imeiValue.slice(-8));
    return res.json({ success: true, maskedImei: maskedWithSpaces });
  } catch (err) {
    console.error('Error in /api/reveal-imei:', err);
    return sendError(res, 500, 'حدث خطأ في الخادم', err, { success: false });
  }
});

// نقطة نهاية للتحقق من كلمة مرور البائع (يستخدمها البائع للتحقق قبل تنزيل مستند/نقل)
app.post('/api/verify-seller-password', verifyJwtToken, async (req, res) => {
  try {
    const { imei, password } = req.body;
    if (!imei || !password) return res.status(400).json({ error: 'imei and password required' });

    // Rate limit check (per requesting user)
    const userKey = req.user && req.user.id ? `uid:${req.user.id}` : `ip:${req.ip}`;
    const blocked = checkAuthBlocked(userKey);
    if (blocked.blocked) {
      const retryAfter = Math.ceil((blocked.retryAfterMs || 0) / 1000);
      return res.status(429).json({ ok: false, error: 'Rate limit exceeded', retryAfter });
    }

    // جلب السجلات ثم البحث عن مطابقة IMEI بعد الفك
    const { data: phones, error } = await supabase
      .from('registered_phones')
      .select('id, imei, password, user_id')
      .limit(1000);
    if (error) throw error;

    const found = phones ? phones.find(p => decryptField(p.imei) === imei) : null;
    if (!found) return res.status(404).json({ ok: false, error: 'Phone not found' });

    // تأكد أن المطلوب هو نفس صاحب الهاتف
    if (found.user_id !== req.user.id) return res.status(403).json({ ok: false, error: 'Not owner' });

    const hashed = crypto.createHash('sha256').update(password).digest('hex');
    if (found.password !== hashed) {
      recordAuthFailure(userKey);
      return res.json({ ok: false });
    }
    // success -> clear failures
    clearAuthFailures(userKey);
    return res.json({ ok: true });
  } catch (err) {
    console.error('verify-seller-password error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// نقطة نهاية لنقل الملكية (ينفذ التحديثات الحساسة على السيرفر)
app.post('/api/transfer-ownership', verifyJwtToken, async (req, res) => {
  try {
    const { imei, sellerPassword, newOwner, new_receipt_image_url } = req.body;
    if (!imei || !sellerPassword || !newOwner) return res.status(400).json({ error: 'imei, sellerPassword and newOwner required' });

    // البحث عن السجل
    const { data: phones, error } = await supabase
      .from('registered_phones')
      .select('*')
      .limit(1000);
    if (error) throw error;

    const registeredPhone = phones ? phones.find(p => decryptField(p.imei) === imei) : null;
    if (!registeredPhone) return res.status(404).json({ error: 'Phone not found' });

    // تحقق من كلمة المرور للبائع
    const hashedSeller = crypto.createHash('sha256').update(sellerPassword).digest('hex');
    // Rate limit check (per seller/user)
    const userKey = req.user && req.user.id ? `uid:${req.user.id}` : `ip:${req.ip}`;
    const blocked = checkAuthBlocked(userKey);
    if (blocked.blocked) {
      const retryAfter = Math.ceil((blocked.retryAfterMs || 0) / 1000);
      return res.status(429).json({ error: 'Rate limit exceeded', retryAfter });
    }

    if (registeredPhone.password !== hashedSeller) {
      recordAuthFailure(userKey);
      return res.status(401).json({ error: 'Incorrect seller password' });
    }
    // success -> clear failures
    clearAuthFailures(userKey);

    // حفظ بيانات البائع الحالية قبل التحديث
    const previousOwnerIdLast6 = decryptField(registeredPhone.id_last6);
    const previousOwnerName = decryptField(registeredPhone.owner_name) || registeredPhone.owner_name || '';
    const previousOwnerPhone = decryptField(registeredPhone.phone_number) || registeredPhone.phone_number || '';

    // إعداد بيانات التحديث (تشفير الحقول الحساسة)
    const updateData = {};
    if (typeof newOwner.owner_name !== 'undefined') {
      if (newOwner.owner_name === null || newOwner.owner_name === '') {
        updateData.owner_name = null;
      } else {
        const encOwner = encryptAES(newOwner.owner_name);
        if (encOwner) updateData.owner_name = JSON.stringify({ encryptedData: encOwner.encryptedData, iv: encOwner.iv, authTag: encOwner.authTag });
      }
    }
    if (typeof newOwner.phone_number !== 'undefined') {
      if (newOwner.phone_number === null || newOwner.phone_number === '') {
        updateData.phone_number = null;
      } else {
        const enc = encryptAES(newOwner.phone_number);
        if (enc) updateData.phone_number = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
      }
    }
    if (typeof newOwner.id_last6 !== 'undefined') {
      if (newOwner.id_last6 === null || newOwner.id_last6 === '') {
        updateData.id_last6 = null;
      } else {
        const enc = encryptAES(newOwner.id_last6);
        if (enc) updateData.id_last6 = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
      }
    }
    if (typeof newOwner.email !== 'undefined') {
      if (newOwner.email === null || newOwner.email === '') {
        updateData.email = null;
      } else {
        const enc = encryptAES(newOwner.email);
        if (enc) updateData.email = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
      }
    }
    if (typeof newOwner.phone_type !== 'undefined') updateData.phone_type = newOwner.phone_type;

    // كلمة مرور المشتري (تخزين كهاش sha256)
    if (typeof newOwner.password !== 'undefined' && newOwner.password) {
      updateData.password = crypto.createHash('sha256').update(newOwner.password).digest('hex');
    }

    // Determine owner `user_id` for the new buyer.
    // Priority:
    // 1) explicit `newOwner.user_id` sent by client
    // 2) lookup by `newOwner.email` in `users` (if buyer has an account)
    // 3) null (unlinked owner)
    let buyerUserId = null;
    if (typeof newOwner.user_id !== 'undefined' && newOwner.user_id !== null) {
      buyerUserId = newOwner.user_id;
    } else if (newOwner.email) {
      try {
        const { data: userRecord, error: userError } = await supabase.from('users').select('id').eq('email', newOwner.email).maybeSingle();
        if (!userError && userRecord && userRecord.id) {
          buyerUserId = userRecord.id;
        }
      } catch (e) {
        console.error('transfer-ownership: failed to lookup buyer user by email in users table', e);
      }
    }
    updateData.user_id = buyerUserId;

    // تعليم الحالة كـ 'transferred' حتى لا يتم عرض بيانات المالك القديم للبائع
    updateData.status = 'transferred';

    // If buyer did not provide an email but we resolved a buyerUserId, try to fetch
    // the buyer's email from `users` and store it. Do NOT default to the
    // requester's (seller) email.
    if ((typeof newOwner.email === 'undefined' || newOwner.email === null || newOwner.email === '') && buyerUserId) {
      try {
        const { data: userById, error: userByIdErr } = await supabase.from('users').select('email').eq('id', buyerUserId).maybeSingle();
        if (!userByIdErr && userById && userById.email) {
          const enc = encryptAES(userById.email);
          if (enc) updateData.email = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
        }
      } catch (e) {
        console.error('transfer-ownership: failed to fetch buyer email from users table', e);
      }
    }

    const { data: updated, error: updateErr } = await supabase
      .from('registered_phones')
      .update(updateData)
      .eq('id', registeredPhone.id)
      .select();
    if (updateErr) throw updateErr;

    // إنشاء سجل نقل الملكية عبر السيرفر مع تشفير البيانات الحساسة
    const encryptToJson = (value) => {
      if (value === null || value === undefined || String(value).trim() === '') return null;
      const enc = encryptAES(value);
      if (!enc) return null;
      return JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
    };

    const transferRecord = {
      date: new Date().toISOString(),
      imei: encryptToJson(imei),
      phone_type: newOwner.phone_type || registeredPhone.phone_type || null,
      seller_name: encryptToJson(previousOwnerName),
      seller_phone: encryptToJson(previousOwnerPhone),
      seller_id_last6: encryptToJson(previousOwnerIdLast6),
      buyer_name: encryptToJson(newOwner.owner_name || ''),
      buyer_phone: encryptToJson(newOwner.phone_number || ''),
      buyer_id_last6: encryptToJson(newOwner.id_last6 || null),
      receipt_image: new_receipt_image_url || registeredPhone.receipt_image_url || null,
      phone_image: registeredPhone.phone_image_url || null
    };

    const { data: transferInserted, error: transferErr } = await supabase
      .from('transfer_records')
      .insert([transferRecord])
      .select();

    if (transferErr) {
      console.error('transfer-ownership: failed to insert transfer record', transferErr);
    }
    return res.json({ success: true, data: updated, previousOwnerIdLast6, transferRecordId: transferInserted?.[0]?.id || null });
  } catch (err) {
    console.error('transfer-ownership error:', err);
    return sendError(res, 500, 'حدث خطأ في الخادم', err);
  }
});

// نقطة نهاية لجلب سجلات نقل الملكية مع فك التشفير
app.post('/api/transfer-records', verifyJwtToken, async (req, res) => {
  try {
    const { imei } = req.body || {};

    const { data: records, error } = await supabase
      .from('transfer_records')
      .select('*')
      .order('date', { ascending: false })
      .limit(1000);

    if (error) throw error;

    const filtered = imei
      ? (records || []).filter(r => {
          const decImei = decryptField(r.imei) || r.imei;
          return decImei === imei;
        })
      : (records || []);

    const decrypted = filtered.map(r => ({
      ...r,
      imei: decryptField(r.imei) || r.imei,
      seller_name: decryptField(r.seller_name) || r.seller_name,
      seller_phone: decryptField(r.seller_phone) || r.seller_phone,
      seller_id_last6: decryptField(r.seller_id_last6) || r.seller_id_last6,
      buyer_name: decryptField(r.buyer_name) || r.buyer_name,
      buyer_phone: decryptField(r.buyer_phone) || r.buyer_phone,
      buyer_id_last6: decryptField(r.buyer_id_last6) || r.buyer_id_last6
    }));

    return res.json({ success: true, data: decrypted });
  } catch (err) {
    console.error('transfer-records error:', err);
    return res.status(500).json({ error: 'Server error', details: err?.message || '' });
  }
});

// نقطة نهاية لتحديث حالة هاتف واحد أو مجموعة هواتف (مثلاً set status = 'transferred' أو 'approved')
app.post('/api/update-phone-status', verifyJwtToken, async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });
    if (!status) return res.status(400).json({ error: 'status required' });

    const { data, error } = await supabase
      .from('registered_phones')
      .update({ status })
      .in('id', ids)
      .select();

    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    console.error('update-phone-status error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// نقطة نهاية لإعادة تعيين كلمة مرور مسجلة للهاتف (للمالك فقط)
app.post('/api/reset-registered-phone-password', verifyJwtToken, async (req, res) => {
  try {
    const { imei, newPassword } = req.body;
    if (!imei || !newPassword) return res.status(400).json({ error: 'imei and newPassword required' });

    // البحث عن الهاتف
    const { data: phones, error } = await supabase
      .from('registered_phones')
      .select('id, imei, email, user_id')
      .limit(1000);
    if (error) throw error;

    const found = phones ? phones.find(p => decryptField(p.imei) === imei) : null;
    if (!found) return res.status(404).json({ error: 'Phone not found' });

    // تأكد من أن البريد في السجل مطابق لمستخدم الطلب
    // Rate limit check (per requesting user/IP)
    const userKey = req.user && req.user.id ? `uid:${req.user.id}` : `ip:${req.ip}`;
    const blocked = checkAuthBlocked(userKey);
    if (blocked.blocked) {
      const retryAfter = Math.ceil((blocked.retryAfterMs || 0) / 1000);
      return res.status(429).json({ error: 'Rate limit exceeded', retryAfter });
    }

    if (found.email !== req.user.email && found.user_id !== req.user.id) {
      // record possible unauthorized attempt
      recordAuthFailure(userKey);
      return res.status(403).json({ error: 'Not authorized to reset password for this phone' });
    }

    const hashed = crypto.createHash('sha256').update(newPassword).digest('hex');
    const { data: updated, error: updateErr } = await supabase
      .from('registered_phones')
      .update({ password: hashed })
      .eq('id', found.id)
      .select();
    if (updateErr) throw updateErr;

    // on success clear failures
    clearAuthFailures(userKey);
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('reset-registered-phone-password error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// نقطة نهاية للتحقق من حدود الاستخدام
app.post('/api/check-limit', verifyJwtToken, async (req, res) => {
  const { type } = req.body; // 'search_imei', 'register_phone', 'search_history', 'print_history'
  const userId = req.user.id;
  const userEmail = req.user.email;

  if (!type) {
    return res.status(400).json({ error: 'Limit type is required' });
  }

  try {
    // 1. جلب أحدث دفع من جدول ads_payment
    const { data: latestPayment, error: paymentError } = await supabase
      .from('ads_payment')
      .select('type, is_paid, user_id, payment_date')
      .eq('user_id', userId)
      .eq('is_paid', true)
      .in('type', ['gold_business', 'silver_business'])
      .not('payment_date', 'is', null)
      .order('payment_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError && paymentError.code !== 'PGRST116') {
      console.error('Payment query error:', paymentError);
      throw paymentError;
    }

    let userType = 'free_business';
    if (latestPayment && latestPayment.type) {
      userType = latestPayment.type;
    }

    // 2. جلب تفاصيل الخطة بناءً على type
    const { data: planData, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('type', userType)
      .single();

    if (planError || !planData) {
      console.error('Plan query error:', planError);
      return res.status(500).json({ error: 'Plan details not found' });
    }

    // 3. جلب الاستخدام الحالي
    const { data: usageData, error: usageError } = await supabase
      .from('users_plans')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (usageError) {
      if (usageError.code === 'PGRST116') {
        // إنشاء سجل جديد إذا لم يكن موجوداً
        const { data: insertData, error: insertError } = await supabase
          .from('users_plans')
          .insert({
            id: userId,
            user_id: userId,
            email: userEmail,
            role: userType,
            used_search_imei: 0,
            used_register_phone: 0,
            used_search_history: 0,
            used_print_history: 0
          })
          .select()
          .single();

        if (insertError) {
           console.error('Insert usage error:', insertError);
           return res.status(500).json({ error: 'Failed to initialize usage data' });
        }
        
        const limitKey = `${type}_limit`;
        const limit = parseInt(planData[limitKey]);
        return res.json({ 
            allowed: true, 
            limit, 
            currentUsage: 0,
            isLastUsage: false 
        });
      }
      throw usageError;
    }

    const usageKey = `used_${type}`;
    const limitKey = `${type}_limit`;
    
    // التحقق من وجود المفاتيح
    if (usageData[usageKey] === undefined || planData[limitKey] === undefined) {
        return res.status(400).json({ error: `Invalid limit type: ${type}` });
    }

    const currentUsage = usageData[usageKey] || 0;
    const limit = parseInt(planData[limitKey]);
    const isLastUsage = currentUsage >= limit - 1;

    if (currentUsage >= limit) {
      return res.json({ 
        allowed: false, 
        limit, 
        currentUsage, 
        isLastUsage: false, 
        message: 'Limit exceeded'
      });
    }

    return res.json({ 
      allowed: true, 
      limit, 
      currentUsage, 
      isLastUsage 
    });

  } catch (error) {
    console.error('Error checking limit:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// نقطة نهاية لزيادة الاستخدام
app.post('/api/increment-usage', verifyJwtToken, async (req, res) => {
    const { type } = req.body;
    const userId = req.user.id;

    if (!type) return res.status(400).json({ error: 'Type required' });

    try {
        let rpcName = '';
        if (type === 'search_imei') rpcName = 'increment_search_usage';
        else if (type === 'register_phone') rpcName = 'increment_register_usage';
        else if (type === 'search_history') rpcName = 'increment_search_history';
        else if (type === 'print_history') rpcName = 'increment_print_history';
        else return res.status(400).json({ error: 'Invalid type' });

        const { error } = await supabase.rpc(rpcName, { p_user_id: userId });
        
        if (error) throw error;
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error incrementing usage:', error);
      return sendError(res, 500, 'حدث خطأ في الخادم', error);
    }
});

// =================================================================
// 6. تشغيل الخادم
// =================================================================

// نقطة نهاية لإرسال إشعار بريدي للمالك
app.post('/api/notify-owner-email', verifyJwtToken, async (req, res) => {
  try {
    const { imei, ownerName, finderPhone } = req.body;

    if (!imei || !finderPhone) {
      return res.status(400).json({ error: 'IMEI and finderPhone are required' });
    }

    const { data: allReports, error: reportError } = await supabase
      .from('phone_reports')
      .select('id, imei, email, owner_name')
      .order('id', { ascending: true });

    if (reportError || !allReports || allReports.length === 0) {
      return res.status(404).json({ error: 'لم يتم العثور على الهاتف في البلاغات' });
    }

    const normalizedIncoming = imei.replace(/\D/g, '');
    let reportData = null;
    for (const r of allReports) {
      let decrypted = null;
      try {
        decrypted = decryptField(r.imei);
      } catch (e) {}
      if (decrypted && decrypted.replace(/\D/g, '') === normalizedIncoming) {
        reportData = r;
        break;
      }
    }

    if (!reportData) {
      return res.status(404).json({ error: 'لم يتم العثور على الهاتف في البلاغات' });
    }

    const decryptedOwnerName = (() => {
      if (!reportData.owner_name) return undefined;
      try {
        return decryptField(reportData.owner_name) || reportData.owner_name;
      } catch (e) {
        console.error('فشل فك تشفير owner_name:', e);
        return reportData.owner_name;
      }
    })();

    const decryptedOwnerEmail = (() => {
      if (!reportData.email) return undefined;
      try {
        return decryptField(reportData.email) || reportData.email;
      } catch (e) {
        console.error('فشل فك تشفير email:', e);
        return reportData.email;
      }
    })();

    const decryptedImei = (() => {
      if (!reportData.imei) return undefined;
      try {
        return decryptField(reportData.imei) || reportData.imei;
      } catch (e) {
        console.error('فشل فك تشفير IMEI:', e);
        return reportData.imei;
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
        emailSubject: 'تم العثور على هاتفك!',
        emailHtml: `<p>عزيزي ${ownerName || decryptedOwnerName || reportData.owner_name || ''},</p>
          <p>تم العثور على هاتفك المفقود (IMEI: ${decryptedImei || reportData.imei || ''}).</p>
          <p>يرجى التواصل مع الشخص الذي وجد الهاتف على الرقم: <b>${finderPhone}</b> لاستلام هاتفك.</p>
          <p>نتمنى لك يوماً سعيداً!</p>`
      },
      en: {
        emailSubject: 'Your phone was found!',
        emailHtml: `<p>Dear ${ownerName || decryptedOwnerName || reportData.owner_name || ''},</p>
          <p>Your lost phone was found (IMEI: ${decryptedImei || reportData.imei || ''}).</p>
          <p>Please contact the finder at: <b>${finderPhone}</b> to retrieve your phone.</p>
          <p>Have a great day!</p>`
      },
      fr: {
        emailSubject: 'Votre téléphone a été retrouvé !',
        emailHtml: `<p>Cher/Chère ${ownerName || decryptedOwnerName || reportData.owner_name || ''},</p>
          <p>Votre téléphone perdu a été retrouvé (IMEI : ${decryptedImei || reportData.imei || ''}).</p>
          <p>Veuillez contacter la personne qui l'a trouvé au : <b>${finderPhone}</b> pour le récupérer.</p>
          <p>Bonne journée !</p>`
      },
      hi: {
        emailSubject: 'आपका फोन मिल गया है!',
        emailHtml: `<p>प्रिय ${ownerName || decryptedOwnerName || reportData.owner_name || ''},</p>
          <p>आपका खोया हुआ फोन मिल गया है (IMEI: ${decryptedImei || reportData.imei || ''}).</p>
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
    // Require verified email to reduce risk of claiming by email-only knowledge
    if (!req.user.email_confirmed_at && !req.user.confirmed_at) {
      console.log('[Check Unclaimed] Rejecting unverified email user:', userEmail);
      return res.status(403).json({ error: 'Email not verified' });
    }
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
          // Do NOT return full IMEI to the client here; only return a masked preview
          const last4 = decryptedImei ? String(decryptedImei).slice(-4) : null;
          const masked = last4 ? `****${last4}` : null;

          myPhones.push({
            id: phone.id,
            imei_preview: masked,
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
  const { imei, id } = req.body;
  const user = req.user;

  if (!imei) {
    if (!id) return res.status(400).json({ error: 'IMEI or id is required' });
  }

  try {
    // Require verified email to reduce risk of claiming by knowledge of email alone
    if (!user.email_confirmed_at && !user.confirmed_at) {
      console.log('[Claim Phone] Rejecting claim from unverified email user:', user.email);
      return res.status(403).json({ error: 'Email not verified' });
    }
    // 1. التحقق من أن الهاتف موجود وليس له user_id
    // بما أن IMEI مشفر، نحتاج للبحث عنه. 
    // ملاحظة: البحث عن IMEI المشفر يتطلب أن يكون التشفير حتمي (Deterministic) أو البحث في الكل.
    // هنا سنفترض أننا سنبحث في الكل ونطابق (أو إذا كان العميل أرسل الـ IMEI الأصلي، سنبحث عنه في القائمة التي جلبناها سابقاً أو نعيد البحث).
    // للأمان، سنعيد البحث في الهواتف غير المطالب بها.
    
    let targetPhone = null;

    if (id) {
      const { data: phoneRows, error: fetchError } = await supabase
        .from('registered_phones')
        .select('id, email, user_id, imei')
        .eq('id', id)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!phoneRows || phoneRows.user_id) {
        return res.status(404).json({ error: 'Phone not found or already claimed' });
      }

      // Verify email matches the registered (decrypted) email
      if (decryptField(phoneRows.email).trim().toLowerCase() !== user.email.trim().toLowerCase()) {
        return res.status(404).json({ error: 'Phone not found or email mismatch' });
      }

      targetPhone = phoneRows;
    } else {
      // Fallback: legacy behavior when IMEI provided (less efficient)
      const { data: phones, error: fetchError } = await supabase
        .from('registered_phones')
        .select('id, email, user_id, imei')
        .is('user_id', null);

      if (fetchError) throw fetchError;

      targetPhone = phones.find(p => decryptField(p.imei) === imei && decryptField(p.email).trim().toLowerCase() === user.email.trim().toLowerCase());

      if (!targetPhone) {
        return res.status(404).json({ error: 'Phone not found or email mismatch' });
      }
    }

    // 2. تحديث user_id
    const { error: updateError } = await supabase
      .from('registered_phones')
      .update({ user_id: user.id })
      .eq('id', targetPhone.id);

    if (updateError) throw updateError;

    // Audit log (best-effort). If table doesn't exist this will be ignored by catching errors.
    try {
      await supabase.from('phone_claims_audit').insert({
        phone_id: targetPhone.id,
        user_id: user.id,
        email: user.email,
        claimed_at: new Date().toISOString()
      });
    } catch (auditErr) {
      console.warn('Audit insert failed (table may not exist):', auditErr?.message || auditErr);
    }

    console.log(`[Claim Phone] User ${user.id} (${user.email}) claimed phone ${targetPhone.id}`);

    res.json({ success: true, message: 'Phone claimed successfully' });

  } catch (error) {
    console.error('Error claiming phone:', error);
    return sendError(res, 500, 'حدث خطأ في الخادم', error);
  }
});

// Rate-limited signup proxy endpoint
app.post('/api/signup', signupLimiter, rateLimitMiddleware({ windowMs: 60 * 60 * 1000, max: 6 }), async (req, res) => {
  try {
    const { email, password, username, phoneNumber, idLast6, countryCode } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });

    // Server-side password complexity validation
    const pwd = String(password || '');
    const pwdValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(pwd);
    if (!pwdValid) return res.status(400).json({ error: 'weak_password', message: 'Password does not meet complexity requirements' });

    // Optional: sanitize/validate other fields briefly
    const fullPhone = (countryCode || '') + (phoneNumber || '');

    // Create user via Supabase auth (service key client)
    // ملاحظة: لا نمرر البيانات الحساسة في options.data لتجنب التخزين التلقائي غير المشفر
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: username || null,
          role: 'free_user'
          // البيانات الحساسة (phone, id_last6) سيتم تخزينها مشفرة في جدول users فقط
        },
        emailRedirectTo: `${process.env.FRONTEND_URL || 'https://'+(process.env.HOST||'')}/login`
      }
    });

    if (error) {
      console.error('Signup RPC error:', error);
      return res.status(400).json({ error: 'signup_failed', message: error.message });
    }

    // Insert users profile row if auth created a user id
    if (data?.user?.id) {
      try {
        // تشفير البيانات الحساسة قبل التخزين
        let encryptedEmail = null;
        let encryptedPhone = null;
        let encryptedIdLast6 = null;

        // تشفير البريد الإلكتروني
        if (email) {
          const enc = encryptAES(email);
          if (enc) {
            encryptedEmail = JSON.stringify({ 
              encryptedData: enc.encryptedData, 
              iv: enc.iv, 
              authTag: enc.authTag 
            });
          }
        }

        // تشفير رقم الهاتف
        if (fullPhone) {
          const enc = encryptAES(fullPhone);
          if (enc) {
            encryptedPhone = JSON.stringify({ 
              encryptedData: enc.encryptedData, 
              iv: enc.iv, 
              authTag: enc.authTag 
            });
          }
        }

        // تشفير آخر 6 أرقام من الهوية
        if (idLast6) {
          const enc = encryptAES(idLast6);
          if (enc) {
            encryptedIdLast6 = JSON.stringify({ 
              encryptedData: enc.encryptedData, 
              iv: enc.iv, 
              authTag: enc.authTag 
            });
          }
        }

        // إدراج البيانات المشفرة في جدول users
        await supabase.from('users').insert([{
          id: data.user.id,
          full_name: username || null,
          email: encryptedEmail,
          phone: encryptedPhone,
          id_last6: encryptedIdLast6,
          role: 'customer',
          status: 'active'
        }]);

        console.log(`[Signup] تم إنشاء حساب جديد للمستخدم ${data.user.id} مع تشفير البيانات الحساسة`);
      } catch (insertErr) {
        console.warn('Warning: failed to insert user profile row:', insertErr?.message || insertErr);
      }
    }

    return res.json({ ok: true, data });
  } catch (err) {
    console.error('/api/signup error', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server listening on port", PORT));
