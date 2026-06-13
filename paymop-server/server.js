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
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { csrfProtection, csrfErrorHandler, getCsrfToken } from './middleware/csrf.js';
import { logAudit } from './utils/auditLogger.js';
import { SECURITY_CONFIG } from './config/security.js';
import { registerAdRoutes } from './routes/adRoutes.js';
import { registerNotificationRoutes } from './routes/notificationRoutes.js';
import { registerOwnershipRoutes } from './routes/ownershipRoutes.js';
import { registerProfileRoutes } from './routes/profileRoutes.js';
import { registerReportRoutes } from './routes/reportRoutes.js';
import { registerBuyerInfoRoutes } from './routes/buyerInfoRoutes.js';
import { registerAdminRoutes } from './routes/adminRoutes.js';
// =================================================================
// 1. الإعدادات الأولية وتحميل متغيرات البيئة (يجب أن تكون في البداية)
// =================================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// تحميل متغيرات البيئة
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

// Allow configuring trust proxy via environment for safer local vs prod behavior
const TRUST_PROXY = Number(process.env.TRUST_PROXY || 0);

// Development bypass token (only used when explicitly set in .env)
const DEV_BYPASS_TOKEN = process.env.DEV_BYPASS_TOKEN || null;
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
if (!IS_DEVELOPMENT && DEV_BYPASS_TOKEN) {
  throw new Error('DEV_BYPASS_TOKEN must not be set outside development');
}

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

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

const hashPasswordForStorage = async (plainPassword) => bcrypt.hash(String(plainPassword), BCRYPT_ROUNDS);

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
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedData, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    console.error('[decryptAES] Decryption failed:', e.message);
    return null;
  }
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

// Normalize decrypted output: if it's a JSON-quoted string like '"0123"' or
// a JSON object string, parse/unquote it so callers receive a plain value.
const normalizeDecrypted = (val) => {
  if (val === null || typeof val === 'undefined') return null;
  if (typeof val !== 'string') return val;
  const s = val.trim();

  // quoted JSON string: "..."
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    try {
      const parsed = JSON.parse(s);
      return typeof parsed === 'string' ? parsed : String(parsed);
    } catch (e) {
      return s.substring(1, s.length - 1);
    }
  }

  // JSON object/array string
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      return JSON.parse(s);
    } catch (e) {
      return s;
    }
  }

  return s;
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
      return normalizeDecrypted(decryptAES(obj.encryptedData, obj.iv, obj.authTag));
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
              return normalizeDecrypted(decryptAES(parsed.encryptedData, parsed.iv, parsed.authTag));
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
    if (/^\d+$/.test(s)) return normalizeDecrypted(s);

    // في الحالات الأخرى، أعِد السلسلة كما هي إذا كانت تبدو عادية
    // (ليست JSON مشفّر)
    if (!s.includes('encryptedData') && !s.includes('authTag')) return normalizeDecrypted(s);

    // في حال فشل التعرف على أي نموذج صالح، لا نُرجع النص المشفر الخام
    return null;
  }
  return null;
};

const isEncryptedPayloadObject = (value) => {
  return !!(value && typeof value === 'object' && value.encryptedData && value.iv && value.authTag);
};

const encryptFieldForStorage = (value) => {
  if (value === null || typeof value === 'undefined') return null;

  if (isEncryptedPayloadObject(value)) {
    return JSON.stringify(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return value;
    try {
      const parsed = JSON.parse(trimmed);
      if (isEncryptedPayloadObject(parsed)) return trimmed;
    } catch (e) {
      // not encrypted JSON string; continue and encrypt below
    }
  }

  const encrypted = encryptAES(value);
  return encrypted ? JSON.stringify(encrypted) : value;
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

// ✅ SECURITY: Parse cookies and setup session
app.use(cookieParser());
app.use(session(SECURITY_CONFIG.SESSION));

// ✅ SECURITY: Enable CORS with whitelisted origins
const CLIENT_ORIGINS = SECURITY_CONFIG.ALLOWED_ORIGINS;
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || CLIENT_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

// Capture raw body for debugging and protect against malformed JSON
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf, encoding) => {
    try {
      req.rawBody = buf.toString(encoding || 'utf8');
    } catch (e) {
      req.rawBody = '';
    }
  }
}));

app.use(express.urlencoded({
  limit: '50mb',
  extended: true,
  verify: (req, res, buf, encoding) => {
    try {
      req.rawBody = buf.toString(encoding || 'utf8');
    } catch (e) {
      req.rawBody = '';
    }
  }
}));

// Middleware to handle JSON parse errors and log raw body for debugging
app.use((err, req, res, next) => {
  if (!err) return next();
  const isBodyParserError = err instanceof SyntaxError || err.type === 'entity.parse.failed' || err.status === 400;
  if (isBodyParserError) {
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[body-parser] JSON parse error:', err && err.message);
        console.error('[body-parser] rawBody:', req && req.rawBody ? req.rawBody : '<empty>');
      }
    } catch (logErr) {
      if (process.env.NODE_ENV !== 'production') console.error('[body-parser] failed to log raw body', logErr && logErr.message);
    }
    if (!res.headersSent) return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  return next(err);
});

// If behind a proxy (Render, Heroku, etc.) trust proxy headers so req.secure and x-forwarded-proto work
// Use 1 instead of true for single proxy (Render/Heroku) to avoid rate-limit bypass warnings
app.set('trust proxy', TRUST_PROXY);
console.log('Configured TRUST_PROXY (env):', process.env.TRUST_PROXY, '=> numeric TRUST_PROXY:', TRUST_PROXY);
console.log("Express app.get('trust proxy') =>", app.get('trust proxy'));

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

// ✅ SECURITY: Global rate limiter (TIGHTENED)
const GLOBAL_RATE_WINDOW_MS = SECURITY_CONFIG.RATE_LIMITS.GLOBAL.windowMs;
const GLOBAL_RATE_MAX = SECURITY_CONFIG.RATE_LIMITS.GLOBAL.max; // تشديد من 200 إلى 100
const localGlobalRate = new Map();

const globalRateMiddleware = (req, res, next) => {
  if (redisClient) {
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
        if (process.env.NODE_ENV !== 'production') console.error('Redis rate limit error:', e);
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


// ✅ SECURITY: Rate limiter for creating app users (TIGHTENED)
const CREATE_APP_USER_WINDOW_MS = SECURITY_CONFIG.RATE_LIMITS.CREATE_APP_USER.windowMs; // 24 ساعة
const DEFAULT_CREATE_APP_USER_MAX = process.env.NODE_ENV !== 'production' ? 50 : SECURITY_CONFIG.RATE_LIMITS.CREATE_APP_USER.max; // تشديد من 20 إلى 5
const CREATE_APP_USER_MAX = Number(process.env.CREATE_APP_USER_MAX) || DEFAULT_CREATE_APP_USER_MAX;
const createAppUserLimiter = rateLimit({
  windowMs: CREATE_APP_USER_WINDOW_MS,
  max: CREATE_APP_USER_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: TRUST_PROXY,
  handler: (req, res) => res.status(429).json({ error: 'Too many account creation attempts, please try later.' })
});

// ✅ SECURITY: Rate limiter for IMEI search
const searchImeiLimiter = rateLimit({
  windowMs: SECURITY_CONFIG.RATE_LIMITS.SEARCH_IMEI.windowMs,
  max: SECURITY_CONFIG.RATE_LIMITS.SEARCH_IMEI.max,
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: TRUST_PROXY,
  handler: (req, res) => res.status(429).json({ error: 'Too many IMEI search attempts, please try later.' })
});

// ✅ SECURITY: Rate limiter for owner verification endpoint
const verifyOwnerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: TRUST_PROXY,
  handler: (req, res) => res.status(429).json({ error: 'Too many verification attempts, please try later.' })
});


// ✅ SECURITY: Login rate limiter (NEW)
const loginLimiter = rateLimit({
  windowMs: SECURITY_CONFIG.RATE_LIMITS.LOGIN.windowMs, // 15 دقيقة
  max: SECURITY_CONFIG.RATE_LIMITS.LOGIN.max, // 5 محاولات
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: TRUST_PROXY,
  handler: (req, res) => res.status(429).json({ error: 'Too many login attempts, please try later.' }),
  skip: (req) => req.user // لا تحد للمستخدمين المسجلين
});


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
    redisClient.on('error', (err) => { if (process.env.NODE_ENV !== 'production') console.error('Redis error:', err); });
    console.log('Connected to Redis for shared state');
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('Failed to initialize Redis client:', e);
    redisClient = null;
  }
}

// Helper to log internal errors and return a generic message to clients
function sendError(res, status = 500, userMessage = 'حدث خطأ في الخادم', err = null, extra = {}) {
  try {
    if (err && process.env.NODE_ENV !== 'production') console.error(err);
  } catch (logErr) {
    if (process.env.NODE_ENV !== 'production') console.error('Failed to log error:', logErr);
  }
  if (res.headersSent) return; // avoid double responses
  return res.status(status).json({ ...extra, error: userMessage });
}

// ✅ SECURITY: Add CSRF protection middleware (before routes)
// Expose CSRF token endpoint BEFORE applying CSRF protection so frontend
// can fetch a fresh token without being blocked by the protection middleware.
app.get('/api/csrf-token', getCsrfToken);

// Simple compatibility middleware: allow requests where the `X-CSRF-Token`
// header exactly equals the `x-csrf-token` cookie. This provides a
// lightweight fallback for clients that fetch the token and echo it back
// without requiring the full doubleCsrf internal format. Place BEFORE the
// doubleCsrf protection so we can short-circuit validation when possible.
app.use((req, res, next) => {
  try {
    const methodsNeedingCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (methodsNeedingCsrf.includes(req.method)) {
      const header = req.header('X-CSRF-Token');
      const cookie = req.cookies && req.cookies['x-csrf-token'];
      if (header && cookie && header === cookie) return next();
    }
  } catch (e) {
    // ignore and fall through to normal CSRF protection
  }

  return next();
});

// Optional unprotected admin endpoint for environments where CSRF is not used.
// This endpoint mirrors /admin/reject-phone but does NOT require a CSRF token.
// It DOES require a valid Authorization: Bearer <token> for an admin user.
app.post('/admin/reject-phone-no-csrf', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized: missing token' });
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    // validate auth token with Supabase
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData || !authData.user) return res.status(401).json({ error: 'Unauthorized: invalid token' });

    const user = authData.user;

    // fetch app role
    const { data: appUser, error: roleErr } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
    if (roleErr) console.warn('/admin/reject-phone-no-csrf role fetch error', roleErr);
    const role = appUser && appUser.role ? String(appUser.role).toLowerCase() : 'free_user';
    if (!role.includes('admin')) return res.status(403).json({ error: 'Forbidden: admin only' });

    const { phoneId, reason } = req.body || {};
    if (!phoneId || !reason) return res.status(400).json({ error: 'phoneId and reason required' });

    const { data: phone, error: phoneErr } = await supabase.from('phones').select('*').eq('id', phoneId).maybeSingle();
    if (phoneErr) throw phoneErr;
    if (!phone) return res.status(404).json({ error: 'phone not found' });

    const user_id = phone.user_id || phone.userId || phone.owner_id || phone.owner || null;

    const { data: updated, error: updateErr } = await supabase.from('phones').update({ status: 'rejected' }).eq('id', phoneId).select().maybeSingle();
    if (updateErr) throw updateErr;

    if (user_id) {
      const notif = { user_id: user_id, title: 'تم رفض طلب تسجيل الهاتف', message: reason, is_read: false };
      const { error: notifErr } = await supabase.from('notifications').insert(notif);
      if (notifErr) console.warn('/admin/reject-phone-no-csrf: notification insert failed', notifErr);
    }

    try {
      await logAudit({
        userId: user.id || null,
        action: 'reject_phone_no_csrf',
        resourceType: 'phone',
        resourceId: phoneId,
        details: { reason },
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
    } catch (e) {
      console.warn('/admin/reject-phone-no-csrf: audit failed', e);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('/admin/reject-phone-no-csrf error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Apply CSRF protection to subsequent routes, but allow explicit path skips
const CSRF_SKIP_PATHS = [
  '/admin/reject-phone'
];
app.use((req, res, next) => {
  // CSRF disabled by request of operator — bypassing doubleCsrf for all routes
  if (process.env.NODE_ENV !== 'production') console.log('[csrf] global CSRF bypass enabled');
  return next();
});

// ✅ SECURITY: CSRF error handler
app.use(csrfErrorHandler);

// ✅ SECURITY: CSRF token endpoint is registered earlier (above CSRF middleware)

// Endpoint: توليد signed URL قصير الأجل لملفات التخزين
// يقبل: { bucket, path, expiresIn (بالثواني) }
app.get('/api/signed-url', verifyJwtToken, async (req, res) => {
  try {
    const { bucket, path, expiresIn = 900 } = req.query; // 15 دقيقة افتراضياً (900 ثانية)

    if (!bucket || !path) {
      return res.status(400).json({ error: 'bucket and path are required' });
    }

    // تحقق من أن الـ bucket آمن (whitelist of allowed buckets)
    const allowedBuckets = ['registerphone', 'phone-images', 'transfer-assets'];
    if (!allowedBuckets.includes(String(bucket))) {
      return res.status(400).json({ error: 'Invalid bucket' });
    }

    // تجنب path traversal attacks
    if (String(path).includes('..') || String(path).includes('./')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    // توليد signed URL بالمدة المطلوبة
    const expirationSeconds = Math.min(Number(expiresIn) || 900, 86400); // حد أقصى 24 ساعة
    const cleanedPath = String(path).replace(/^\/+/, '');

    // Diagnostic logging to help debug failing signed-url requests
    try {
      const requester = req.user && req.user.id ? req.user.id : 'unknown';
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      console.log(`/api/signed-url called by=${requester} bucket=${String(bucket)} path=${cleanedPath} expiresIn=${expirationSeconds} ip=${clientIp}`);
    } catch (logErr) {
      console.error('Failed to log /api/signed-url request details', logErr);
    }

    try {
      // Quick heuristic: for transfer-assets we commonly store receipts under 'receipts/<filename>'.
      // Try that prefixed path first when caller passed only a filename to avoid extra download checks.
      if (String(bucket) === 'transfer-assets' && !cleanedPath.startsWith('receipts/')) {
        try {
          const prefPath = `receipts/${cleanedPath}`;
          const { data: prefData, error: prefErr } = await supabase.storage
            .from(String(bucket))
            .createSignedUrl(prefPath, expirationSeconds);
          if (!prefErr && prefData && prefData.signedUrl) {
            return res.json({ signedUrl: prefData.signedUrl, path: prefPath });
          }
        } catch (e) {
          // ignore and continue to the normal flow below
        }
      }

      const { data, error } = await supabase.storage
        .from(String(bucket))
        .createSignedUrl(cleanedPath, expirationSeconds);

      if (error) {
        console.error('Error creating signed URL (createSignedUrl):', error);
        // حاول التحقق من وجود الملف كسبب شائع للفشل
        try {
          const { data: dlData, error: dlErr } = await supabase.storage.from(String(bucket)).download(cleanedPath);
          if (dlErr) {
            console.error('Signed-url: object not found or download failed for path:', cleanedPath, dlErr && dlErr.message ? dlErr.message : dlErr);

            // حاول البحث عن الملف في مسارات محتملة شائعة (prefixes)
            const prefixes = ['receipts/', `${req.user?.id || ''}/`, 'images/', 'phone-images/', 'phones/'].filter(Boolean);
            for (const p of prefixes) {
              try {
                const tryPath = (p + cleanedPath).replace(/^\/+/, '');
                const { data: testDl, error: testErr } = await supabase.storage.from(String(bucket)).download(tryPath);
                if (!testErr) {
                  // وجدنا الملف في مسار بديل — قم بإنشاء signed URL لهذا المسار
                  const { data: altData, error: altErr } = await supabase.storage.from(String(bucket)).createSignedUrl(tryPath, expirationSeconds);
                  if (!altErr && altData && altData.signedUrl) {
                    return res.json({ signedUrl: altData.signedUrl, path: tryPath });
                  }
                }
              } catch (pe) {
                // تجاهل المحاولات الفاشلة واستمر
              }
            }

            return res.status(404).json({ error: 'Object not found in storage', details: dlErr && dlErr.message ? dlErr.message : dlErr });
          }
          // إذا نجح التنزيل ولكن createSignedUrl فشل لسبب آخر، قم بإرجاع خطأ مفصّل في بيئة التطوير
          console.error('createSignedUrl failed but object exists; returning server error');
          if (process.env.NODE_ENV !== 'production') {
            try {
              const listChecks = {};
              const prefixesToCheck = [cleanedPath, `receipts/${cleanedPath}`, `images/${cleanedPath}`, `phone-images/${cleanedPath}`];
              for (const p of prefixesToCheck) {
                try {
                  const prefix = p.replace(/^\/+/, '').replace(/\/+$/, '');
                  const { data: listData, error: listErr } = await supabase.storage.from(String(bucket)).list(prefix, { limit: 50 });
                  listChecks[p] = { ok: !listErr, items: listData || null, error: listErr ? (listErr.message || listErr) : null };
                } catch (le) {
                  listChecks[p] = { ok: false, items: null, error: String(le) };
                }
              }
              return res.status(500).json({ error: 'Failed to create signed URL', details: error, listChecks });
            } catch (diagErr) {
              console.error('Diagnostic list check failed:', diagErr);
            }
          }
          return res.status(500).json({ error: 'Failed to create signed URL', details: error });
        } catch (inner) {
          console.error('Error while checking object existence:', inner);
          return res.status(500).json({ error: 'Failed to create signed URL' });
        }
      }

      return res.json({ signedUrl: data?.signedUrl || null });
    } catch (createErr) {
      console.error('Unexpected error creating signed URL:', createErr);
      return res.status(500).json({ error: 'Failed to create signed URL', details: createErr && createErr.message ? createErr.message : null });
    }
  } catch (err) {
    console.error('Error in /api/signed-url:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});


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

// Temporary debug endpoint to list storage items matching a filename or prefix
app.get('/api/debug-storage-list', verifyJwtToken, async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Not available' });
    const bucket = String(req.query.bucket || '');
    const filename = String(req.query.filename || '').trim();
    if (!bucket || !filename) return res.status(400).json({ error: 'bucket and filename required' });

    // Try exact filename, receipts/, and a fuzzy search by listing root and filtering
    const results = {};

    // exact
    try {
      const { data, error } = await supabase.storage.from(bucket).list('', { search: filename, limit: 100 });
      results.search = { ok: !error, items: data || null, error: error ? (error.message || error) : null };
    } catch (e) {
      results.search = { ok: false, error: String(e) };
    }

    // receipts/ prefix
    try {
      const p = `receipts/${filename}`;
      const { data, error } = await supabase.storage.from(bucket).list('receipts', { limit: 100 });
      results.receipts_prefix = { ok: !error, items: data || null, error: error ? (error.message || error) : null, triedPath: p };
    } catch (e) {
      results.receipts_prefix = { ok: false, error: String(e) };
    }

    // full list root (capped)
    try {
      const { data, error } = await supabase.storage.from(bucket).list('', { limit: 200 });
      results.root = { ok: !error, items: data || null, error: error ? (error.message || error) : null };
    } catch (e) {
      results.root = { ok: false, error: String(e) };
    }

    return res.json({ ok: true, bucket, filename, results });
  } catch (err) {
    console.error('/api/debug-storage-list error', err);
    return res.status(500).json({ error: 'Server error', details: String(err) });
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
    if (process.env.NODE_ENV !== 'production') console.error('/api/encrypt error', e);
    return sendError(res, 500, 'Encryption error', e);
  }
});

// Webhook: Supabase Auth -> call this when a user confirms email.
// Configure Supabase Auth webhooks to send events to this URL.
// For security, set SUPABASE_WEBHOOK_SECRET in .env and send it in header 'x-webhook-secret'.
// NOTE: Supabase auth webhook handling removed. The application now relies on
// the client/server `POST /api/create-app-user` flow which is idempotent and
// is called by the app on first successful authenticated session after
// email confirmation. Keep a disabled endpoint to provide a clear response
// if an external webhook is still configured.
app.post('/api/supabase-auth-webhook', (req, res) => {
  console.warn('/api/supabase-auth-webhook called but webhook support is disabled on this server');
  return res.status(410).json({ error: 'Webhook disabled. Use client-side create-on-first-session flow.' });
});

// ⭐ نقطة نهاية للتحقق الشامل من IMEI (البلاغات، التسجيل، والإعلانات السابقة)
// ⭐ نقطة نهاية للتحقق الشامل من IMEI (البلاغات، التسجيل، والإعلانات السابقة)
app.post('/api/imei-masked-info', verifyJwtToken, async (req, res) => {
  try {
    const { imei } = req.body;
    const userId = req.user?.id; // جلب معرف المستخدم من التوكن
    
    if (!imei) return res.status(400).json({ error: 'IMEI is required' });
    const normalizedImei = String(imei).replace(/\D/g, '');

    // 1. التحقق من جدول البلاغات (active reports)
    const { data: reports } = await supabase.from('phone_reports').select('imei').eq('status', 'active');
    const isStolen = (reports || []).some(r => {
      const dec = decryptField(r.imei);
      return dec && String(dec).replace(/\D/g, '') === normalizedImei;
    });
    if (isStolen) return res.json({ found: true, hasActiveReport: true });

    // 2. ⭐ التحقق من جدول phones (وجود إعلان سابق)
    const { data: ads } = await supabase.from('phones').select('id, imei, phone_type').neq('status', 'deleted');
    const existingAd = (ads || []).find(a => {
      const dec = decryptField(a.imei);
      return dec && String(dec).replace(/\D/g, '') === normalizedImei;
    });

    if (existingAd) {
      return res.json({
        found: true,
        hasActiveAd: true,
        adId: existingAd.id,
        phone_type: existingAd.phone_type
      });
    }

    // 3. التحقق من جدول التسجيل (registered_phones)
    const { data: registered } = await supabase.from('registered_phones').select('imei, phone_type, user_id');
    const reg = (registered || []).find(r => {
      const dec = decryptField(r.imei);
      return dec && String(dec).replace(/\D/g, '') === normalizedImei;
    });

    if (reg) {
      return res.json({
        found: true,
        isRegistered: true,
        phone_type: reg.phone_type,
        isOwner: userId === reg.user_id
      });
    }

    // 4. ⭐ التعديل الجديد: إذا لم يتم العثور على IMEI، جلب بيانات المستخدم الحالي للملء التلقائي (مقنعة)
    if (!reg && userId) {
      try {
        // جلب بيانات المستخدم الحالي من جدول users
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('full_name, phone, id_last6')
          .eq('id', userId)
          .maybeSingle();

        if (!userError && userData) {
          // فك تشفير بيانات المستخدم
          const decryptedFullName = decryptField(userData.full_name) || '';
          const decryptedPhone = decryptField(userData.phone) || '';
          const decryptedIdLast6 = decryptField(userData.id_last6) || '';

          // ⭐ إخفاء البيانات (Masking)
          const maskedFullName = maskName(decryptedFullName);
          const maskedPhone = maskPhoneNumber(decryptedPhone);
          const maskedIdLast6 = maskIdLast6(decryptedIdLast6);

          // إرجاع البيانات المقنعة للملء التلقائي
          return res.json({
            found: false,
            autoFillData: {
              ownerName: maskedFullName, // الاسم مقنع
              phoneNumber: maskedPhone, // رقم الهاتف مقنع
              idLast6: maskedIdLast6, // آخر 6 أرقام مقنعة
              isReadOnly: true // البيانات للقراءة فقط
            }
          });
        }
      } catch (e) {
        console.error('[imei-masked-info] Error fetching user data for auto-fill:', e);
      }
    }

    // إذا لم يتم العثور على أي شيء
    return res.json({ found: false });
  } catch (err) {
    console.error('imei-masked-info error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Internal endpoint: create application `users` row after auth signup
// Frontend calls this after `supabase.auth.signUp` to persist encrypted app user data.
app.post('/api/create-app-user', (req, res) => {
  // Disabled by operator request: avoid creating application rows via this endpoint.
  console.warn('/api/create-app-user called but is disabled on this server');
  return res.status(410).json({ error: 'create-app-user endpoint disabled' });
});

// Temporary test endpoint: encrypt payload and save to local file for testing
// This does NOT touch the database and is intended for local functional tests

// Temporary testing endpoint: create a Supabase Auth user (admin) and then create the
// corresponding application user via the existing `/api/create-app-user` flow.
// This endpoint is only intended for local/dev testing and requires the server
// to have a valid service role key in `SUPABASE_KEY`.

// Endpoint: register user via server (creates Supabase Auth user using service role)
// This creates the auth user but does NOT insert application rows; the
// `/api/supabase-auth-webhook` will handle creating encrypted `users`/`businesses`
// after the user confirms their email.
app.post('/api/register-user', createAppUserLimiter, async (req, res) => {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Server not configured for admin operations' });

    const { email, password, metadata } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    // Optional CAPTCHA verification: if RECAPTCHA_SECRET is set, require `captchaToken` in the request body
    const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || null;
    if (RECAPTCHA_SECRET) {
      const captchaToken = req.body && (req.body.captchaToken || req.headers['x-captcha-token']);
      if (!captchaToken) {
        // Do not reveal reason to client beyond a generic error
        return res.status(400).json({ error: 'captcha_required' });
      }
      try {
        const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `secret=${encodeURIComponent(RECAPTCHA_SECRET)}&response=${encodeURIComponent(captchaToken)}&remoteip=${encodeURIComponent(req.ip)}`
        });
        const verifyJson = await verifyRes.json();
        if (!verifyJson || !verifyJson.success) {
          if (process.env.NODE_ENV !== 'production') console.warn('/api/register-user captcha verification failed', verifyJson);
          return res.status(400).json({ error: 'captcha_failed' });
        }
        // Optional: enforce a minimum score for v3; treat missing score as pass
        if (typeof verifyJson.score === 'number' && verifyJson.score < 0.3) {
          if (process.env.NODE_ENV !== 'production') console.warn('/api/register-user captcha score too low', verifyJson);
          return res.status(400).json({ error: 'captcha_failed' });
        }
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') console.warn('/api/register-user captcha verify error', e);
        return res.status(400).json({ error: 'captcha_verification_failed' });
      }
    }

    const adminCreateUrl = `${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/admin/users`;
    // Do not auto-confirm the email: let Supabase send confirmation email
    const createResp = await fetch(adminCreateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({ email, password, user_metadata: metadata || {}, email_confirm: false })
    });

    const createText = await createResp.text();
    let createJson = null;
    try { createJson = JSON.parse(createText); } catch (e) { createJson = null; }

    if (!createResp.ok) {
      // Log details server-side for operators but do NOT reveal whether the email exists.
      if (process.env.NODE_ENV !== 'production') console.warn('/api/register-user admin create failed', createResp.status, createJson || createText);
      // Return a generic success-like message to avoid user enumeration.
      return res.status(200).json({ ok: true, message: 'If this email is not already registered, a confirmation email has been sent.' });
    }

    const userId = createJson && createJson.id ? createJson.id : null;
    if (!userId) {
      if (process.env.NODE_ENV !== 'production') console.warn('/api/register-user admin_create_missing_id', createJson || createText);
      return res.status(200).json({ ok: true, message: 'If this email is not already registered, a confirmation email has been sent.' });
    }

    // For security, avoid returning internal identifiers to the client which could aid enumeration.
    return res.status(200).json({ ok: true, message: 'Registration initiated. Please check your email for confirmation.' });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('/api/register-user error', e);
    return sendError(res, 500, 'Server error', e);
  }
});

// Simple direct register endpoint (operator-requested)
app.post('/api/register', async (req, res) => {
  try {
    console.log('REGISTER REQUEST');

    const {
      id,
      email,
      full_name,
      phone,
      id_last6,
      role,
      store_name,
      address,
      business_type
    } = req.body;

    console.log('DATA RECEIVED:', req.body);

    // Encrypt sensitive fields before storing
    const encFullName = encryptObject(full_name);
    const encPhone = encryptObject(phone);
    const encIdLast6 = encryptObject(id_last6);
    const encAddress = encryptObject(address);

    const userPayload = {
      id,
      email: email || '',
      full_name: encFullName ? JSON.stringify(encFullName) : null,
      phone: encPhone ? JSON.stringify(encPhone) : null,
      id_last6: encIdLast6 ? JSON.stringify(encIdLast6) : null,
      role: role || null
    };

    const { error: userError } = await supabase
      .from('users')
      .insert(userPayload);

    if (userError) {
      console.error('USER ERROR:', userError);
      return res.status(400).json(userError);
    }

    if (role === 'free_business') {
      const businessPayload = {
        user_id: id,
        email: email || '',
        store_name: store_name || '',
        owner_name: encFullName ? JSON.stringify(encFullName) : null,
        phone: encPhone ? JSON.stringify(encPhone) : null,
        address: encAddress ? JSON.stringify(encAddress) : null,
        id_last6: encIdLast6 ? JSON.stringify(encIdLast6) : null,
        business_type: business_type || ''
      };
      const { error: businessError } = await supabase
        .from('businesses')
        .insert(businessPayload);

      if (businessError) {
        console.error('BUSINESS ERROR:', businessError);
        return res.status(400).json(businessError);
      }
    }

    return res.json({
      success: true
    });

  } catch (err) {
    console.error('REGISTER ERROR:', err);
    return res.status(500).json({
      error: err && err.message ? err.message : String(err)
    });
  }
});

// The old `POST /api/register-business` route was removed.
// Registration now uses the auth flow + DB trigger/webhook:
// - Frontend calls the Auth signup (or the server creates the Auth user without confirming email).
// - When `auth.users.email_confirmed_at` becomes non-null, a DB Trigger or
//   the `/api/supabase-auth-webhook` endpoint will insert encrypted rows
//   into `public.users` and `public.businesses`.
// This prevents saving application data before email confirmation.

// --- تهيئة Supabase ---
const SUPABASE_URL = process.env.SUPABASE_URL;
// Prefer the explicit service-role key if provided; fall back to legacy name
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
// Debug/logging helpers for Supabase usage
try {
  console.log('[supabase] SUPABASE_URL:', SUPABASE_URL ? SUPABASE_URL : 'MISSING');
  console.log('[supabase] SUPABASE_KEY present:', !!SUPABASE_KEY);

  if (supabase && typeof supabase.from === 'function') {
    const _origFrom = supabase.from.bind(supabase);
    supabase.from = function (table) {
      if (process.env.NODE_ENV !== 'production') console.log(`[supabase] .from('${table}') called`);
      return _origFrom(table);
    };
  }

  if (supabase && supabase.auth && typeof supabase.auth.getUser === 'function') {
    const _origGetUser = supabase.auth.getUser.bind(supabase.auth);
    supabase.auth.getUser = async function (token) {
      if (process.env.NODE_ENV !== 'production') console.log('[supabase.auth] getUser called, token length:', token ? String(token).length : 0);
      return _origGetUser(token);
    };
  }
} catch (e) {
  console.warn('[supabase] debug wrapper failed', e && e.message);
}

// Endpoint: /api/lost-phones
// يعيد قائمة الهواتف المفقودة مع فك تشفير حقل imei و phone_type فقط

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

// ✅ SECURITY: Global and endpoint-specific rate limiters
// Global limiter: prevents brute-force across the whole app (TIGHTENED: 100 from 200)
const globalLimiter = rateLimit({
  windowMs: SECURITY_CONFIG.RATE_LIMITS.GLOBAL.windowMs,
  max: SECURITY_CONFIG.RATE_LIMITS.GLOBAL.max, // تشديد من 200 إلى 100
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: 1, // Trust only one proxy (Render/Heroku)
  handler: (req, res) => res.status(429).json({ error: 'Too many requests, please try again later.' })
});

// ✅ SECURITY: Payment endpoints limiter (TIGHTENED)
const paymentLimiter = rateLimit({
  windowMs: SECURITY_CONFIG.RATE_LIMITS.PAYMENT.windowMs,
  max: SECURITY_CONFIG.RATE_LIMITS.PAYMENT.max, // تشديد من 10 إلى 5
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: 1, // Trust only one proxy (Render/Heroku)
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
      android: {
        priority: 'high'
      },
      apns: {
        headers: {
          'apns-priority': '10'
        }
      },
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
  const cleanId = String(id).replace(/\D/g, '');
  if (cleanId.length <= 6) return cleanId;
  // إذا كانت أطول من 6، أظهر آخر 6 أرقام بدون إخفاء
  return cleanId.slice(-6);
};

// إخفاء رقم واتساب/هاتف: يُظهر أول 3 أرقام وآخر رقمين فقط
const maskWhatsAppNumber = (phone) => {
  if (!phone) return null;
  const s = String(phone).trim();
  const digits = s.replace(/\D/g, '');
  if (digits.length <= 5) return s; // قصير جداً، أرجعه كما هو
  // احتفظ بـ + أو رمز الدولة في البداية إن وُجد
  const prefix = s.startsWith('+') ? '+' : '';
  const first3 = digits.slice(0, 3);
  const last2 = digits.slice(-2);
  const masked = '*'.repeat(Math.max(0, digits.length - 5));
  return `${prefix}${first3}${masked}${last2}`;
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

const normalizeTextForCompare = (s) => {
  if (s === null || s === undefined) return '';
  try {
    return String(s)
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/^[\u0022\u201C\u201D\u00AB\u00BB'`\s]+|[\u0022\u201C\u201D\u00AB\u00BB'`\s]+$/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
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

registerNotificationRoutes({
  app,
  supabase,
  verifyJwtToken,
  sendError,
  sendFCMNotificationV1,
  getFCMTokenByImei,
  searchImeiLimiter,
  // helpers used by notification routes
  decryptField,
  normalizeDigitsOnly
});

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
registerReportRoutes({
  app,
  supabase,
  verifyJwtToken,
  decryptField,
  encryptAES,
  hashPasswordForStorage,
  sendError,
  logAudit,
  sendFCMNotificationV1,
  resend,
  crypto
});

// Admin routes (general utilities that may decrypt provided payloads)
registerAdminRoutes({
  app,
  supabase,
  decryptField,
  verifyJwtToken,
  logAudit,
  csrfProtection
});

// --- نقاط نهاية Paymob ---

// نقطة نهاية لحفظ بلاغ فقدان الهاتف مع تشفير البيانات
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
      webhook: "POST /paymob/webhook - استقبال إشعارات الدفع", send_fcm: "POST /api/send-fcm-v1 - إرسال إشعار FCM",
      send_notification: "POST /api/send-notification - إرسال إشعار من هاتف لآخر",
      send_notification_by_imei: "POST /api/send-notification-by-imei - إرسال إشعار باستخدام IMEI",
      get_finder_phone: "POST /api/get-finder-phone - جلب رقم هاتف الواجد",
      update_fcm_token: "POST /api/update-fcm-token - تحديث توكن الإشعارات للمستخدم", update_finder_phone_by_imei: "POST /api/update-finder-phone-by-imei - تحديث رقم هاتف الواجد باستخدام IMEI"
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

    // تشفير الحقول الحساسة قبل الحفظ في ads_payment
    const adDataToStore = adData ? { ...adData } : null;
    if (adDataToStore) {
      if (Object.prototype.hasOwnProperty.call(adDataToStore, 'phone')) {
        adDataToStore.phone = encryptFieldForStorage(adDataToStore.phone);
      }
    }

    // 5. حفظ بيانات الإعلان في قاعدة البيانات
    let newAdId = null;
    if (adId) { // حالة تحديث إعلان موجود
      console.log(`Step 5: Updating existing ad with ID: ${adId}`);
      const tableName = isSpecialAd ? 'ads_payment' : 'ads_payment';
      // adData هنا يحتوي فقط على الحقول المراد تحديثها
      const { error: updateError } = await supabase
        .from(tableName)
        .update({ ...adDataToStore, paymob_order_id: orderData.id }) // ربط طلب الدفع الجديد
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
        ...adDataToStore,
        paymob_order_id: orderData.id, // ربط الإعلان بطلب الدفع
        payment_status: 'pending', // ⭐ تغيير: حالة الدفع المبدئية
        is_paid: false,
        status: 'pending'
      };

      try {
        const { data: insertedAd, error: adError } = await supabase
          .from('ads_payment')
          .insert([adInsertData])
          .select('id, status')
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
      iframe_url,
      order_id: orderData.id,
      merchant_order_id: merchantOrderId || null,
      // ⭐ إرجاع adId سواء كان جديداً أو محدثاً
      adId: newAdId || adId || null
    };

    // لا نُرجع payment_token للعميل لتقليل سطح التسريب
    console.log("Sending response:", JSON.stringify(response, null, 2));
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
        .update({ bonus_offer: newBonusValue, payment_date: new Date().toISOString(), is_paid: true, payment_status: 'paid', transaction: 'bonus_add' })
        .eq('id', lastBonus.id);
      if (updateErr) {
        console.error('Failed to update bonus row:', updateErr);
        return res.status(500).json({ error: 'Could not deduct bonus' });
      }
    } catch (e) {
      console.error('Exception updating bonus row:', e);
      return res.status(500).json({ error: 'Server error' });
    }

    // تشفير الحقول الحساسة قبل حفظ الإعلان في ads_payment
    const adDataToStore = { ...adData };
    if (Object.prototype.hasOwnProperty.call(adDataToStore, 'phone')) {
      adDataToStore.phone = encryptFieldForStorage(adDataToStore.phone);
    }

    // Insert ad as paid using bonus
    try {
      const adInsert = {
        ...adDataToStore,
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

      console.log(`Ad published using bonus for user ${userId}, ad id: ${insertedAd.id}`);
      // ⭐ لا يتم الإدراج يدوياً في publish_ad - المشغل (trigger_copy_ad) سيتكفل بذلك تلقائياً عند تفعيل is_active
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

// Endpoint: Publish ad for package users (gold/silver) — server verifies package and inserts ad without opening payment gateway
app.post('/api/ads/package-publish', verifyJwtToken, paymentLimiter, rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 6 }), async (req, res) => {
  try {

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { adData, packageType, merchantOrderId } = req.body || {};
    if (!adData || !packageType) return res.status(400).json({ error: 'adData and packageType are required' });

    const normalizedPackage = String(packageType || '').toLowerCase().trim();
    if (!normalizedPackage.includes('gold') && !normalizedPackage.includes('silver')) {
      return res.status(400).json({ error: 'Invalid packageType' });
    }

    // 1) جلب الحد الأقصى من جدول plans بناءً على type المستخدم وعمود Publish_Ad فقط
    let maxAdsAllowed = null;
    try {
      const { data: planRow, error: planErr } = await supabase
        .from('plans')
        .select('type, Publish_Ad')
        .ilike('type', `%${normalizedPackage}%`)
        .maybeSingle();
      if (!planErr && planRow) {
        maxAdsAllowed = planRow.Publish_Ad;
        if (maxAdsAllowed != null) maxAdsAllowed = Number(maxAdsAllowed);
        console.log(`[PACKAGE-PUBLISH] نوع الباقة من plans: ${planRow.type} | الحد الأقصى: ${maxAdsAllowed}`);
      } else {
        console.warn(`[PACKAGE-PUBLISH] لم يتم العثور على باقة مطابقة في plans للنوع: ${normalizedPackage}`);
      }
    } catch (e) {
      console.warn('package-publish: error fetching plan', e);
    }

    if (!maxAdsAllowed || !Number.isFinite(maxAdsAllowed)) {
      return res.status(400).json({ error: 'تعذر تحديد الحد الأقصى للإعلانات المسموح بها للباقة' });
    }

    // 2) جلب تاريخ بداية الباقة الفعلي
    let packageStartDate = null;
    try {
      // جلب أقدم دفعة مدفوعة لنفس الباقة (تاريخ البداية)
      const { data: firstPaid, error: firstPaidErr } = await supabase
        .from('ads_payment')
        .select('payment_date')
        .eq('user_id', userId)
        .eq('is_paid', true)
        .eq('type', normalizedPackage)
        .order('payment_date', { ascending: false }) // جلب أحدث تاريخ دفع لبداية الدورة الحالية
        .limit(1)
        .maybeSingle();
      if (!firstPaidErr && firstPaid && firstPaid.payment_date) {
        packageStartDate = firstPaid.payment_date;
      }
    } catch (e) {
      console.warn('package-publish: error fetching package start date', e);
    }

    if (!packageStartDate) {
      // fallback: جلب expires_at من جدول users ومدة الباقة الكاملة من plans
      try {
        const { data: userRec } = await supabase.from('users').select('expires_at').eq('id', userId).maybeSingle();
        if (userRec && userRec.expires_at && maxAdsAllowed) {
          // مدة الباقة الكاملة (مثلاً 30 يوم أو 90 يوم) يجب أن تكون معرفة في plans (مثلاً planRow.duration_days)
          // إذا لم توجد، نستخدم 30 يوم افتراضيًا
          let planDuration = 30;
          try {
            const { data: planRow } = await supabase.from('plans').select('duration_days').ilike('type', `%${normalizedPackage}%`).maybeSingle();
            if (planRow && planRow.duration_days) planDuration = Number(planRow.duration_days);
          } catch { }
          const expiresAt = new Date(userRec.expires_at);
          const start = new Date(expiresAt);
          start.setDate(start.getDate() - planDuration);
          packageStartDate = start.toISOString();
        }
      } catch (e) {
        console.warn('package-publish: error fallback fetching expires_at', e);
      }
    }

    if (!packageStartDate) {
      return res.status(400).json({ error: 'تعذر تحديد تاريخ بداية الباقة' });
    }

    // 3) عدّ الإعلانات الحالية (pending + approved) للمستخدم منذ بداية الباقة
    let currentAdsCount = 0;
    try {
      const { data: adsList, error: countErr } = await supabase
        .from('ads_payment')
        .select('id, status, upload_date, expires_at')
        .eq('user_id', userId)
        .gte('upload_date', packageStartDate);
      if (!countErr && Array.isArray(adsList)) {
        currentAdsCount = adsList.filter(ad => {
          return ad.status === 'pending' || ad.status === 'approved';
        }).length;
      }
      console.log(`[PACKAGE-PUBLISH] userId=${userId} | currentAdsCount=${currentAdsCount} | maxAdsAllowed=${maxAdsAllowed} | packageStartDate=${packageStartDate}`);
    } catch (e) {
      console.warn('package-publish: error counting user ads', e);
    }

    if (currentAdsCount >= maxAdsAllowed) {
      console.log(`[PACKAGE-PUBLISH] منع النشر: المستخدم وصل للحد الأقصى (${currentAdsCount}/${maxAdsAllowed})`);
      return res.status(403).json({ error: 'لقد وصلت للحد الأقصى للإعلانات المسموح بها في باقتك. لا يمكنك نشر إعلان جديد حتى انتهاء أو حذف إعلان سابق.' });
    }

    // ...باقي الكود كما هو (إدراج الإعلان)

    // Encrypt sensitive fields before storing
    const adDataToStore = { ...adData };
    if (Object.prototype.hasOwnProperty.call(adDataToStore, 'phone')) {
      adDataToStore.phone = encryptFieldForStorage(adDataToStore.phone);
    }

    // Ensure package type stored uses server-normalized value
    const serverType = normalizedPackage;

    // حذف الحقول التي قد تسبب مشاكل مع المشغلات (triggers) في قاعدة البيانات
    // is_active يُفعّل trigger_copy_ad الذي يفشل بسبب عدم توافق أنواع الأعمدة (text vs uuid)
    const insertObj = {
      ...adDataToStore,
      user_id: userId,
      amount: 0,
      type: serverType,
      payment_status: 'package',
      is_paid: true,
      is_active: false,
      transaction: 'package_publish',
      merchant_order_id: merchantOrderId || null,
      upload_date: new Date().toISOString(),
      expires_at: (() => { const d = new Date(); d.setDate(d.getDate() + (adData.duration_days || 0)); return d.toISOString(); })(),
    };

    try {
      console.log('package-publish: inserting ads_payment payload', JSON.stringify(insertObj, null, 2));
      const { data: inserted, error: insertErr } = await supabase.from('ads_payment').insert([insertObj]).select('id').single();
      if (insertErr) {
        console.error('package-publish: failed to insert ads_payment', insertErr);
        try {
          if (insertErr.details) console.error('insertErr.details:', insertErr.details);
          if (insertErr.hint) console.error('insertErr.hint:', insertErr.hint);
        } catch (diag) { /* ignore */ }
        return res.status(500).json({ error: 'Failed to create ad record' });
      }

      // تحديث عداد الاستخدام فقط إذا كان usersPlansRow معرفًا
      if (typeof usersPlansRow !== 'undefined' && usersPlansRow && usersPlansRow.id) {
        try {
          const updates = {};
          if (Object.prototype.hasOwnProperty.call(usersPlansRow, 'used_publish_ad')) updates.used_publish_ad = Number(usersPlansRow.used_publish_ad || 0) + 1;
          else if (Object.prototype.hasOwnProperty.call(usersPlansRow, 'used_publish_ads')) updates.used_publish_ads = Number(usersPlansRow.used_publish_ads || 0) + 1;
          else if (Object.prototype.hasOwnProperty.call(usersPlansRow, 'used_ads')) updates.used_ads = Number(usersPlansRow.used_ads || 0) + 1;

          if (Object.keys(updates).length > 0) {
            await supabase.from('users_plans').update(updates).eq('id', usersPlansRow.id);
          }
        } catch (updErr) {
          console.warn('package-publish: failed to update users_plans usage counter', updErr);
        }
      }

      return res.json({ ok: true, adId: inserted.id });
    } catch (e) {
      console.error('package-publish: unexpected error', e);
      return res.status(500).json({ error: 'Server error' });
    }
  } catch (e) {
    console.error('Error in /api/ads/package-publish:', e);
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

    // سجل الاستجابة بدون أي حقول حساسة
    console.log("Sending response:", JSON.stringify(response, null, 2));
    return safeJson(response);
  } catch (e) {
    console.error("Error in create-invoice:", e);
    if (_timedOut) return;
    return sendError(res, 500, 'حدث خطأ في الخادم', e);
  }
});

// ⭐ تم حذف نقطة debug لإدراج publish_ad - المشغل (trigger_copy_ad) سيتكفل بذلك تلقائياً

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
      // نحفظ iframe_url فقط (بدون payment_token) لتقليل المخاطر الأمنية
      try {
        await supabase
          .from('ads_payment')
          .update({ iframe_url })
          .eq('id', insertedPaymentId);
        console.log('تم حفظ iframe_url في ads_payment');
      } catch (storeErr) {
        console.warn('Could not store iframe_url in ads_payment (column may not exist):', storeErr.message || storeErr);
        // لا نُعيد الخطأ لأننا نريد إرجاع الـ iframe إلى العميل مهما حدث
      }
      // ⭐ لا يتم الإدراج يدوياً في publish_ad - المشغل (trigger_copy_ad) سيتكفل بذلك تلقائياً عند تفعيل is_active
    } catch (insertError) {
      console.error('خطأ في حفظ بيانات الدفع في جدول ads_payment:', insertError);
      throw insertError;
    }
    const response = {
      ok: true,
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

// Endpoint to fetch stored iframe_url by payment_id
app.get('/paymob/payment-link', verifyJwtToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const paymentId = req.query.payment_id;
    const merchantOrderId = req.query.merchant_order_id;
    console.log('/paymob/payment-link called with', { paymentId, merchantOrderId });

    if (!paymentId && !merchantOrderId) return res.status(400).json({ error: 'payment_id or merchant_order_id required' });

    let query = supabase
      .from('ads_payment')
      .select('id, iframe_url, paymob_order_id, user_id')
      .eq('user_id', userId);
    if (paymentId) query = query.eq('id', paymentId);
    else if (merchantOrderId) query = query.eq('merchant_order_id', merchantOrderId);

    const { data: paymentRow, error } = await query.maybeSingle();

    if (error) {
      console.error('/paymob/payment-link supabase error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!paymentRow) return res.status(404).json({ error: 'payment not found' });

    return res.json({ ok: true, payment_id: paymentRow.id, iframe_url: paymentRow.iframe_url || null, order_id: paymentRow.paymob_order_id || null });
  } catch (e) {
    console.error('Error in /paymob/payment-link:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ===================================================================
// ========= نقاط النهاية لصفحات نجاح وفشل الدفع المخصصة (Paymob) =========
// ===================================================================

// صفحة نجاح الدفع المخصصة (مع زر العودة للتطبيق)
app.get('/paymob/redirect-success', async (req, res) => {
  try {
    console.log('تم الوصول إلى نقطة إعادة التوجيه', req.query);
    const success = String(req.query?.success || '');
    const pending = String(req.query?.pending || '');
    const orderId = String(req.query?.order || '');
    const merchantOrderId = String(req.query?.merchant_order_id || '');
    const receivedHmac = String(req.query?.hmac || '');

    // Fallback: لو webhook لم يصل، حاول تثبيت حالة الدفع من redirect بشكل آمن
    if (success === 'true' && pending === 'false' && orderId && merchantOrderId) {
      try {
        let hmacValid = false;
        const requiredForHmac = [
          'amount_cents',
          'created_at',
          'currency',
          'error_occured',
          'has_parent_transaction',
          'id',
          'integration_id',
          'is_3d_secure',
          'is_auth',
          'is_capture',
          'is_refunded',
          'is_standalone_payment',
          'is_voided',
          'order',
          'owner',
          'pending',
          'source_data.pan',
          'source_data.sub_type',
          'source_data.type',
          'success'
        ];
        const hasAllFields = requiredForHmac.every((k) => typeof req.query?.[k] !== 'undefined');

        if (receivedHmac && hasAllFields) {
          const concatenatedString = [
            String(req.query['amount_cents']),
            String(req.query['created_at']),
            String(req.query['currency']),
            String(req.query['error_occured']),
            String(req.query['has_parent_transaction']),
            String(req.query['id']),
            String(req.query['integration_id']),
            String(req.query['is_3d_secure']),
            String(req.query['is_auth']),
            String(req.query['is_capture']),
            String(req.query['is_refunded']),
            String(req.query['is_standalone_payment']),
            String(req.query['is_voided']),
            String(req.query['order']),
            String(req.query['owner']),
            String(req.query['pending']),
            String(req.query['source_data.pan']),
            String(req.query['source_data.sub_type']),
            String(req.query['source_data.type']),
            String(req.query['success'])
          ].join('');

          const calculatedHmac = crypto
            .createHmac('sha512', HMAC_SECRET)
            .update(concatenatedString)
            .digest('hex');
          hmacValid = calculatedHmac === receivedHmac;
        }

        if (hmacValid) {
          const { data: existingAd, error: fetchError } = await supabase
            .from('ads_payment')
            .select('*')
            .eq('paymob_order_id', Number(orderId))
            .single();

          if (fetchError || !existingAd) {
            console.error('redirect-success fallback: payment row not found', { orderId, fetchError });
          } else if (existingAd.is_paid === true) {
            console.log('redirect-success fallback: payment already marked as paid', { orderId });
          } else {
            let expectedAmount = null;
            if (typeof existingAd.amount !== 'undefined' && existingAd.amount !== null) expectedAmount = Number(existingAd.amount);
            if ((expectedAmount === null || Number.isNaN(expectedAmount)) && existingAd.type && existingAd.duration_days) {
              const { data: priceRow } = await supabase
                .from('ads_price')
                .select('amount')
                .eq('type', existingAd.type)
                .eq('duration_days', existingAd.duration_days)
                .limit(1)
                .single();
              if (priceRow && typeof priceRow.amount !== 'undefined') expectedAmount = Number(priceRow.amount);
            }

            const paidAmount = Number(req.query?.amount_cents || 0) / 100;
            if (expectedAmount !== null && !Number.isNaN(paidAmount) && Math.abs(paidAmount - expectedAmount) <= 0.001) {
              const paymentDate = new Date();
              const duration = parseInt(existingAd.duration_days, 10) || 0;
              const expiresAt = new Date(paymentDate);
              expiresAt.setDate(expiresAt.getDate() + duration);
              const isOffersGallerySubscription = String(merchantOrderId || '').startsWith('ads_payment-');

              const { error: updateError } = await supabase
                .from('ads_payment')
                .update({
                  is_paid: true,
                  payment_status: 'paid',
                  ...(isOffersGallerySubscription ? { transaction: 'bonus_add' } : {}),
                  payment_date: paymentDate.toISOString(),
                  expires_at: expiresAt.toISOString()
                })
                .eq('paymob_order_id', Number(orderId));

              if (updateError) {
                console.error('redirect-success fallback: failed to mark paid', updateError);
              } else {
                console.log('redirect-success fallback: payment marked paid', { orderId, merchantOrderId });
                // ⭐ تحديث دور المستخدم وتاريخ الانتهاء من السيرفر للأمان (Fallback)
                if (existingAd.user_id && existingAd.type && !['publish', 'normal', 'ad_payment'].includes(existingAd.type)) {
                  await supabase
                    .from('users')
                    .update({ role: existingAd.type, expires_at: expiresAt.toISOString() })
                    .eq('id', existingAd.user_id);
                  console.log(`[Redirect] Updated user ${existingAd.user_id} role to ${existingAd.type}`);

                  // ⭐ تحديث أو إنشاء سجل في users_plans وتصفير العدادات (Fallback)
                  await supabase
                    .from('users_plans')
                    .upsert({
                      id: existingAd.user_id,
                      user_id: existingAd.user_id,
                      role: existingAd.type,
                      used_search_imei: 0,
                      used_register_phone: 0,
                      used_search_history: 0,
                      used_print_history: 0,
                      used_game: 0,
                      used_notify_in_app: 0,
                      used_notify_email: 0,
                      used_notify_push: 0,
                      silver_ad: 0,
                      gold_ad: 0
                    }, { onConflict: 'id' });
                }
              }
            } else {
              await supabase
                .from('ads_payment')
                .update({ payment_status: 'amount_mismatch', paymob_amount_cents: Number(req.query?.amount_cents || 0) })
                .eq('paymob_order_id', Number(orderId));
              console.warn('redirect-success fallback: amount mismatch, skipped paid', { orderId, expectedAmount, paidAmount });
            }
          }
        } else {
          console.warn('redirect-success fallback skipped: invalid or missing HMAC/required fields');
        }
      } catch (fallbackError) {
        console.error('redirect-success fallback error:', fallbackError);
      }
    }

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
            const isOffersGallerySubscription = String(merchantOrderId || '').startsWith('ads_payment-');

            // 3. تحديث حالة الدفع وتاريخ الانتهاء
            const updatePayload = {
              is_paid: true,
              payment_date: paymentDate.toISOString(),
              payment_status: 'paid',
              ...(isOffersGallerySubscription ? { transaction: 'bonus_add' } : {}),
              expires_at: expiresAt.toISOString()
            };
            const { error: updateError } = await supabase
              .from('ads_payment')
              .update(updatePayload)
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

              // ⭐ تحديث دور المستخدم وتاريخ الانتهاء من السيرفر عند نجاح الدفع (التحكم المركزي)
              if (user_id && existingAd.type && !['publish', 'normal', 'ad_payment'].includes(existingAd.type)) {
                await supabase
                  .from('users')
                  .update({ role: existingAd.type, expires_at: expiresAt.toISOString() })
                  .eq('id', user_id);
                console.log(`[Webhook] Updated user ${user_id} role to ${existingAd.type}`);

                // ⭐ تحديث أو إنشاء سجل في users_plans وتصفير العدادات
                const { error: upsertErr } = await supabase
                  .from('users_plans')
                  .upsert({
                    id: user_id,
                    user_id: user_id,
                    role: existingAd.type,
                    used_search_imei: 0,
                    used_register_phone: 0,
                    used_search_history: 0,
                    used_print_history: 0,
                    used_game: 0,
                    used_notify_in_app: 0,
                    used_notify_email: 0,
                    used_notify_push: 0,
                    silver_ad: String(existingAd.type || '').toLowerCase().includes('silver') ? 0 : undefined,
                    gold_ad: String(existingAd.type || '').toLowerCase().includes('gold') ? 0 : undefined
                  }, { onConflict: 'id' });

                if (upsertErr) console.error('[Webhook] Failed to upsert users_plans:', upsertErr);
                else console.log(`[Webhook] users_plans updated/created for user ${user_id}`);
              }
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

// نقطة نهاية لجلب رقم هاتف المحل وفك تشفيره
app.get('/api/store-phone/:productId', verifyJwtToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const productId = req.params.productId;
    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    // جلب رقم الهاتف من جدول phones
    console.log('[store-phone] Looking for product with ID:', productId);
    const { data: phoneData, error: phoneError } = await supabase
      .from('phones')
      .select('contact_methods')
      .eq('id', productId)
      .maybeSingle();

    if (phoneError) {
      console.error('[store-phone] Error fetching from phones table:', phoneError);
    } else if (phoneData) {
      console.log('[store-phone] Found in phones table, contact_methods:', JSON.stringify(phoneData.contact_methods));
    } else {
      console.log('[store-phone] Not found in phones table');
    }

    // إذا لم يُوجد في phones، جلب من accessories
    let phoneNumber = null;
    if (phoneData && !phoneError) {
      // فك تشفير رقم الهاتف من contact_methods.phone إذا كان موجوداً
      if (phoneData.contact_methods && phoneData.contact_methods.phone) {
        // معالجة حالة التشفير المزدوج: contact_methods.phone قد يكون JSON داخل JSON
        try {
          // إذا كانت القيمة نصاً، حاول تحليلها كـ JSON
          if (typeof phoneData.contact_methods.phone === 'string') {
            const parsedContact = JSON.parse(phoneData.contact_methods.phone);
            // إذا كان parsedContact كائناً يحتوي على خاصية phone، حاول تحليلها أيضاً
            if (parsedContact && typeof parsedContact === 'object' && parsedContact.phone) {
              // إذا كانت phone أيضاً نصاً، حاول تحليلها كـ JSON
              if (typeof parsedContact.phone === 'string') {
                const parsedPhone = JSON.parse(parsedContact.phone);
                // إذا كان parsedPhone يحتوي على البيانات المشفرة، فك تشفيرها
                if (parsedPhone && parsedPhone.encryptedData && parsedPhone.iv && parsedPhone.authTag) {
                  phoneNumber = normalizeDecrypted(decryptAES(parsedPhone.encryptedData, parsedPhone.iv, parsedPhone.authTag));
                }
              }
            }
          }
          // إذا فشلت كل المحاولات، استخدم decryptField العادية
          if (!phoneNumber) {
            phoneNumber = decryptField(phoneData.contact_methods.phone);
          }
        } catch (e) {
          // في حالة الخطأ، استخدم decryptField العادية
          phoneNumber = decryptField(phoneData.contact_methods.phone);
        }
      }
    } else {
      console.log('[store-phone] Looking in accessories table for ID:', productId);
      const { data: accessoryData, error: accessoryError } = await supabase
        .from('accessories')
        .select('contact_methods')
        .eq('id', productId)
        .maybeSingle();

      if (accessoryError) {
        console.error('[store-phone] Error fetching from accessories table:', accessoryError);
      } else if (accessoryData) {
        console.log('[store-phone] Found in accessories table, contact_methods:', JSON.stringify(accessoryData.contact_methods));
      } else {
        console.log('[store-phone] Not found in accessories table');
      }

      if (accessoryData && !accessoryError) {
        // فك تشفير رقم الهاتف من contact_methods.phone إذا كان موجوداً
        if (accessoryData.contact_methods && accessoryData.contact_methods.phone) {
          // معالجة حالة التشفير المزدوج: contact_methods.phone قد يكون JSON داخل JSON
          try {
            // إذا كانت القيمة نصاً، حاول تحليلها كـ JSON
            if (typeof accessoryData.contact_methods.phone === 'string') {
              let parsedContact = accessoryData.contact_methods.phone;
              // التعامل مع HTML entities مثل &quot;
              if (parsedContact.includes('&quot;')) {
                parsedContact = parsedContact.replace(/&quot;/g, '"');
              }
              const parsedContactObj = JSON.parse(parsedContact);
              // إذا كان parsedContactObj كائناً يحتوي على خاصية phone، حاول تحليلها أيضاً
              if (parsedContactObj && typeof parsedContactObj === 'object' && parsedContactObj.phone) {
                // إذا كانت phone أيضاً نصاً، حاول تحليلها كـ JSON
                if (typeof parsedContactObj.phone === 'string') {
                  let parsedPhoneStr = parsedContactObj.phone;
                  // التعامل مع HTML entities مثل &quot;
                  if (parsedPhoneStr.includes('&quot;')) {
                    parsedPhoneStr = parsedPhoneStr.replace(/&quot;/g, '"');
                  }
                  const parsedPhone = JSON.parse(parsedPhoneStr);
                  // إذا كان parsedPhone يحتوي على البيانات المشفرة، فك تشفيرها
                  if (parsedPhone && parsedPhone.encryptedData && parsedPhone.iv && parsedPhone.authTag) {
                    phoneNumber = normalizeDecrypted(decryptAES(parsedPhone.encryptedData, parsedPhone.iv, parsedPhone.authTag));
                  }
                }
              }
            }
            // إذا فشلت كل المحاولات، استخدم decryptField العادية
            if (!phoneNumber) {
              phoneNumber = decryptField(accessoryData.contact_methods.phone);
            }
          } catch (e) {
            // في حالة الخطأ، استخدم decryptField العادية
            phoneNumber = decryptField(accessoryData.contact_methods.phone);
          }
        }
      }
    }

    // إذا لم يتم العثور على رقم الهاتف في المنتج، جلبه من جدول المستخدمين
    if (!phoneNumber) {
      console.log('[store-phone] Phone not found in product, trying to fetch from user table');

      // جلب بيانات المنتج للحصول على معرف البائع
      let sellerId = null;
      const { data: productData, error: productError } = await supabase
        .from('phones')
        .select('seller_id')
        .eq('id', productId)
        .maybeSingle();

      if (!productError && productData && productData.seller_id) {
        sellerId = productData.seller_id;
      } else {
        // إذا لم يُوجد في phones، جلب من accessories
        const { data: accessoryData, error: accessoryError } = await supabase
          .from('accessories')
          .select('seller_id')
          .eq('id', productId)
          .maybeSingle();

        if (!accessoryError && accessoryData && accessoryData.seller_id) {
          sellerId = accessoryData.seller_id;
        }
      }

      if (sellerId) {
        // جلب رقم الهاتف من جدول المستخدمين
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('phone')
          .eq('id', sellerId)
          .maybeSingle();

        if (!userError && userData && userData.phone) {
          // فك تشفير رقم الهاتف
          phoneNumber = decryptField(userData.phone);
          console.log('[store-phone] Found phone in users table:', phoneNumber);
        }
      }

      if (!phoneNumber) {
        console.error('[store-phone] Phone number not found for product ID:', productId);
        return res.status(404).json({ error: 'Phone number not found' });
      }
    }

    // فك تشفير رقم الهاتف إذا لم يتم فك تشفيره بالفعل
    console.log('[store-phone] Phone number before final decryption:', typeof phoneNumber, phoneNumber);
    const decryptedPhone = typeof phoneNumber === 'string' ? phoneNumber : decryptField(phoneNumber);
    console.log('[store-phone] Phone number after decryption:', decryptedPhone);
    if (!decryptedPhone) {
      console.error('[store-phone] Failed to decrypt phone number');
      return res.status(500).json({ error: 'Failed to decrypt phone number' });
    }

    // تنظيف الرقم من أي رموز غير رقمية
    let cleanPhone = decryptedPhone.replace(/\D/g, '');

    // إضافة رمز الدولة الافتراضي إذا لم يكن موجوداً
    // نفترض +20 لمصر إذا كان الرقم يبدأ بـ 0 أو 1 (أرقام مصرية)
    if (cleanPhone.length > 0 && !cleanPhone.startsWith('+')) {
      // إذا كان الرقم يبدأ بـ 0 أو 1، نعتبره رقماً مصرياً
      if (cleanPhone.startsWith('0') || cleanPhone.startsWith('1')) {
        cleanPhone = '+20' + cleanPhone;
      }
    }

    // إرجاع الرقم وفك تشفيره
    return res.json({
      success: true,
      phone: cleanPhone
    });
  } catch (error) {
    console.error('Error in /api/store-phone/:productId:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
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
async function verifyJwtToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    // Local dev bypass only in development environment
    if (IS_DEVELOPMENT && DEV_BYPASS_TOKEN && token === DEV_BYPASS_TOKEN) {
      req.user = { id: 'dev-user-id', email: 'dev@local.test', role: 'admin' };
      return next();
    }

    // التحقق من صحة JWT Token باستخدام Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
    // 2. جلب الدور (role) من جدول users في قاعدة البيانات
    // ملاحظة: نستخدم service role client (supabase) لتجاوز قيود RLS
    const { data: appUserData, error: roleError } = await supabase
      .from('users')
      .select('role, expires_at')
      .eq('id', user.id)
      .maybeSingle();

    // 3. دمج الدور مع بيانات المستخدم
    // إذا لم يتم العثور على دور، نستخدم القيمة الافتراضية 'free_user'
    let userRole = (appUserData && appUserData.role) ? appUserData.role : 'free_user';

    // ⭐ التحقق من انتهاء صلاحية الباقة وتحويل الدور تلقائياً (Lazy Downgrade)
    if (appUserData && appUserData.expires_at) {
      const expiryDate = new Date(appUserData.expires_at);
      if (new Date() > expiryDate && !userRole.startsWith('free_')) {
        // تحديد الدور البديل بناءً على نوع الحساب (تجاري أم عادي)
        const isBusiness = userRole.toLowerCase().includes('business');
        userRole = isBusiness ? 'free_business' : 'free_user';

        // تحديث قاعدة البيانات لإلغاء الصلاحية المنتهية وإعادة الدور للافتراضي
        await supabase.from('users').update({ role: userRole, expires_at: null }).eq('id', user.id);
        console.log(`[Auth] User ${user.id} subscription expired. Reverted to ${userRole}`);

        // ⭐ تحديث جدول users_plans: تغيير role إلى المجاني وتصفير كل عدادات الاستخدام
        try {
          const { error: planUpdateErr } = await supabase
            .from('users_plans')
            .update({
              role: userRole,
              used_search_imei: 0,
              used_register_phone: 0,
              used_search_history: 0,
              used_print_history: 0,
              used_game: 0,
              used_notify_in_app: 0,
              used_notify_email: 0,
              used_notify_push: 0,
              silver_ad: 0,
              gold_ad: 0
            })
            .eq('id', user.id);
          if (planUpdateErr) {
            console.error('[Auth] Failed to reset users_plans on expiry:', planUpdateErr);
          } else {
            console.log(`[Auth] users_plans reset to ${userRole} for user ${user.id}`);
          }
        } catch (planErr) {
          console.error('[Auth] Exception resetting users_plans on expiry:', planErr);
        }
      }
    }

    // تحديث كائن req.user ليشمل الدور
    req.user = {
      ...user,
      role: userRole // ⭐ هذا هو السطر المهم

    };

    next();
  } catch (error) {
    // Avoid referencing variables (`user`, `appUserData`) that may not be defined
    // when an exception occurs during token verification — doing so caused a
    // ReferenceError which turned a 401 into a 500. Log the error safely and
    // return 401 to the client.
    console.error('Error verifying JWT token:', error);
    try {
      console.error('[verifyJwtToken] error details:', error && error.message ? error.message : String(error));
    } catch (logErr) {
      // swallow logging errors
    }
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}
// إضافة بيانات المستخدم إلى الطلب

registerProfileRoutes({
  app,
  supabase,
  sendError,
  decryptField,
  isDevelopment: IS_DEVELOPMENT,
  devBypassToken: DEV_BYPASS_TOKEN,
});

app.get('/api/get-contact-info', verifyJwtToken, async (req, res) => {
  try {
    const requesterId = req.user?.id;
    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const phoneId = String(req.query.phoneId || '').trim();
    if (!phoneId) {
      return res.status(400).json({ error: 'phoneId is required' });
    }

    const { data: allReports, error: reportError } = await supabase
      .from('phone_reports')
      .select('id, imei, email, owner_name, finder_phone, user_id, finder_user_id')
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
      } catch (e) { }
      if (decrypted && decrypted.replace(/\D/g, '') === normalizedIncoming) {
        foundReport = r;
        break;
      }
    }

    if (!foundReport) {
      return res.status(404).json({ error: 'لم يتم العثور على الهاتف في البلاغات' });
    }

    // تفويض: يسمح فقط لمالك البلاغ أو الواجد المرتبط بالبلاغ.
    const isOwner = !!foundReport.user_id && foundReport.user_id === requesterId;
    const isAssignedFinder = !!foundReport.finder_user_id && foundReport.finder_user_id === requesterId;
    if (!isOwner && !isAssignedFinder) {
      return res.status(403).json({ error: 'Forbidden: not authorized to access this contact info' });
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

// Return the authenticated user's business row with decrypted phone
app.get('/api/businesses/me', verifyJwtToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { data, error } = await supabase
      .from('businesses')
      .select('store_name, phone')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('/api/businesses/me supabase error:', error);
      return sendError(res, 500, 'Database error', error);
    }
    if (!data) return res.json({ ok: true, business: null });

    const out = { store_name: data.store_name || null };
    try {
      out.phone = decryptField(data.phone);
    } catch (e) {
      out.phone = null;
    }

    return res.json({ ok: true, business: out });
  } catch (e) {
    console.error('/api/businesses/me error:', e);
    return sendError(res, 500, 'Server error', e);
  }
});

// نقطة نهاية لإعادة التوجيه إلى واتساب المالك (تفك التشفير من الخادم فقط)
// الرقم يبقى مقنعاً في الواجهة، وعند الضغط على زر واتساب يتم التوجيه عبر هذه النقطة
const whatsappRedirectLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: TRUST_PROXY,
  handler: (req, res) => res.status(429).json({ error: 'Too many WhatsApp redirect attempts, please try later.' })
});

app.post('/api/whatsapp-redirect', verifyJwtToken, whatsappRedirectLimiter, async (req, res) => {
  try {
    const requesterId = req.user?.id;
    if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

    const { imei } = req.body || {};
    if (!imei) return res.status(400).json({ error: 'IMEI is required' });

    // البحث عن البلاغ المطابق للـ IMEI
    const { data: allReports, error: reportError } = await supabase
      .from('phone_reports')
      .select('id, imei, user_id, phone_number, whatsapp, finder_user_id')
      .order('id', { ascending: true });

    if (reportError || !allReports || allReports.length === 0) {
      return res.status(404).json({ error: 'لم يتم العثور على الهاتف في البلاغات' });
    }

    const normalizedIncoming = String(imei).replace(/\D/g, '');
    let foundReport = null;
    for (const r of allReports) {
      let decrypted = null;
      try { decrypted = decryptField(r.imei); } catch (e) { }
      if (decrypted && decrypted.replace(/\D/g, '') === normalizedIncoming) {
        foundReport = r;
        break;
      }
    }

    if (!foundReport) return res.status(404).json({ error: 'لم يتم العثور على البلاغ لهذا الـ IMEI' });

    // تفويض: أي مستخدم موثق يمكنه التواصل عبر واتساب مع المالك
    // شروط: البلاغ يجب أن يكون نشطاً والواتساب مفعّلاً عند المالك
    // المالك نفسه لا يحتاج لاستخدام هذا الرابط (يمكنه رؤية رقمه مباشرة)
    const isOwner = !!foundReport.user_id && foundReport.user_id === requesterId;
    // لا نسمح للمالك بالتواصل مع نفسه
    if (isOwner) {
      return res.status(400).json({ error: 'لا يمكنك التواصل مع نفسك عبر واتساب' });
    }

    // فك تشفير رقم الواتساب/الهاتف
    let whatsappNumber = null;

    // 1) من phone_reports.phone_number
    if (!whatsappNumber && foundReport.phone_number) {
      try {
        whatsappNumber = decryptField(foundReport.phone_number);
      } catch (e) { }
    }

    // 2) من phone_reports.whatsapp
    if (!whatsappNumber && foundReport.whatsapp) {
      try {
        const v = foundReport.whatsapp;
        whatsappNumber = (typeof v === 'string' && ['1', 'true', 'yes'].includes(v.trim().toLowerCase()))
          ? whatsappNumber // whatsapp is just a boolean flag
          : decryptField(v) || v;
      } catch (e) { }
    }

    // 3) من جدول users
    if (!whatsappNumber && foundReport.user_id) {
      try {
        const { data: userRow } = await supabase.from('users').select('phone').eq('id', foundReport.user_id).maybeSingle();
        if (userRow && userRow.phone) whatsappNumber = decryptField(userRow.phone);
      } catch (e) { }
    }

    // 4) من جدول businesses
    if (!whatsappNumber && foundReport.user_id) {
      try {
        const { data: bizRow } = await supabase.from('businesses').select('phone').eq('user_id', foundReport.user_id).maybeSingle();
        if (bizRow && bizRow.phone) whatsappNumber = decryptField(bizRow.phone);
      } catch (e) { }
    }

    if (!whatsappNumber) {
      return res.status(404).json({ error: 'رقم واتساب غير متوفر' });
    }

    // تنظيف الرقم: أرقام فقط
    const cleanNumber = String(whatsappNumber).replace(/\D/g, '');
    if (!cleanNumber) {
      return res.status(404).json({ error: 'رقم واتساب غير صالح' });
    }

    // تسجيل عملية التوجيه للمراجعة
    try {
      await logAudit({
        userId: requesterId,
        action: 'whatsapp_redirect',
        resourceType: 'phone_report',
        resourceId: foundReport.id,
        details: { imei_last_4: imei.slice(-4) },
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
    } catch (e) {
      // لا نوقف العملية بسبب فشل التدقيق
    }

    // إرجاع رابط واتساب المفكوك كـ JSON (الواجهة تفتحه عبر window.open)
    return res.json({ success: true, whatsapp_url: `https://wa.me/${cleanNumber}` });
  } catch (err) {
    console.error('خطأ في /api/whatsapp-redirect/:imei:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.post('/api/get-owner-email-by-imei', verifyJwtToken, async (req, res) => {
  try {
    const requesterId = req.user?.id;
    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { imei } = req.body;

    if (!imei) {
      return res.status(400).json({ error: 'IMEI is required' });
    }

    const { data: allReports, error: reportError } = await supabase
      .from('phone_reports')
      .select('id, imei, email, owner_name, user_id, finder_user_id')
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
      } catch (e) { }
      if (decrypted && decrypted.replace(/\D/g, '') === normalizedIncoming) {
        foundReport = r;
        break;
      }
    }

    if (!foundReport || !foundReport.email) {
      return res.status(404).json({ error: 'لم يتم العثور على البريد الإلكتروني لهذا الهاتف' });
    }

    // تفويض: فقط المالك أو الواجد المعين لنفس البلاغ.
    const isOwner = !!foundReport.user_id && foundReport.user_id === requesterId;
    const isAssignedFinder = !!foundReport.finder_user_id && foundReport.finder_user_id === requesterId;
    if (!isOwner && !isAssignedFinder) {
      return res.status(403).json({ error: 'Forbidden: not authorized to access owner email' });
    }

    let decryptedEmail = null;
    try {
      decryptedEmail = decryptField(foundReport.email) || foundReport.email;
    } catch (e) {
      decryptedEmail = foundReport.email;
    }

    let decryptedOwnerName = null;
    try {
      decryptedOwnerName = foundReport.owner_name ? (decryptField(foundReport.owner_name) || foundReport.owner_name) : null;
    } catch (e) {
      decryptedOwnerName = foundReport.owner_name || null;
    }

    return res.json({
      email: decryptedEmail,
      owner_name: decryptedOwnerName
    });
  } catch (err) {
    console.error('خطأ في جلب بريد المالك:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// نقطة نهاية لجلب تفاصيل المالك (دور، حالة واتساب، ورقم واتساب مفكوك التشفير) بناءً على IMEI
app.post('/api/get-owner-details-by-imei', verifyJwtToken, async (req, res) => {
  try {
    const requesterId = req.user?.id;
    if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

    const { imei } = req.body;
    if (!imei) return res.status(400).json({ error: 'IMEI is required' });

    console.log('/api/get-owner-details-by-imei called by', requesterId, 'imei:', imei);
    const { data: allReports, error: reportError } = await supabase
      .from('phone_reports')
      .select('id, imei, user_id, phone_number, email, whatsapp, owner_name, finder_user_id')
      .order('id', { ascending: true });

    if (reportError || !allReports || allReports.length === 0) {
      return res.status(404).json({ error: 'لم يتم العثور على الهاتف في البلاغات', imei });
    }

    const normalizedIncoming = String(imei).replace(/\D/g, '');
    console.log('Looking for normalized IMEI:', normalizedIncoming, 'among', (allReports || []).length, 'reports');
    let foundReport = null;
    for (const r of allReports) {
      let decrypted = null;
      try {
        decrypted = decryptField(r.imei);
      } catch (e) { }
      if (decrypted && decrypted.replace(/\D/g, '') === normalizedIncoming) {
        foundReport = r;
        break;
      }
    }

    if (!foundReport) return res.status(404).json({ error: 'لم يتم العثور على البلاغ لهذا الـ IMEI' });

    console.log('Matched report:', { id: foundReport.id, user_id: foundReport.user_id, email: foundReport.email });

    const ownerId = foundReport.user_id;

    // Configure response defaults
    let role = null;
    let whatsappEnabled = false;
    let whatsappNumber = null;

    // 1) Always try to fetch owner row to obtain the canonical `role`
    let fetchedUserRow = null;
    try {
      if (ownerId) {
        const { data: userRow, error: userErr } = await supabase.from('users').select('role, phone').eq('id', ownerId).maybeSingle();
        fetchedUserRow = userRow || null;
        if (userErr) {
          console.error('Error fetching users row for ownerId', ownerId, userErr);
        } else if (fetchedUserRow) {
          role = fetchedUserRow.role ? String(fetchedUserRow.role).trim() : null;
          // Note: `users.whatsapp_enabled` column may not exist; prefer report/business flags
          // Keep user phone as fallback if phone_reports doesn't have a number
          try {
            const decryptedUserPhone = decryptField(fetchedUserRow.phone);
            if (decryptedUserPhone) {
              // do not override phone_reports value if present — this is fallback
              if (!whatsappNumber) whatsappNumber = decryptedUserPhone;
            }
          } catch (e) {
            // Ignore decryption failure here; we'll try other sources
            if (!whatsappNumber && fetchedUserRow.phone) whatsappNumber = fetchedUserRow.phone;
          }
        }
      }
    } catch (e) {
      console.error('Error while fetching owner user row:', e);
    }

    // 2) Prefer phone_reports.phone_number (decrypted) as primary WhatsApp number
    try {
      if (foundReport.phone_number) {
        console.log('Found phone_number in phone_reports (raw):', foundReport.phone_number);
        try {
          const fromReport = decryptField(foundReport.phone_number);
          console.log('Decrypted phone_number from phone_reports:', fromReport);
          whatsappNumber = fromReport || normalizeDecrypted(foundReport.phone_number) || whatsappNumber;
        } catch (dErr) {
          console.error('Failed to decrypt phone_reports.phone_number, using raw value if it looks valid:', dErr?.message || dErr);
          if (/^\+?\d+$/.test(String(foundReport.phone_number))) whatsappNumber = String(foundReport.phone_number);
        }

        // If the report row explicitly contains a whatsapp flag, honor it
        if (typeof foundReport.whatsapp !== 'undefined') {
          const v = foundReport.whatsapp;
          whatsappEnabled = typeof v === 'string'
            ? ['1', 'true', 'yes'].includes(String(v).trim().toLowerCase())
            : !!v;
        } else if (typeof foundReport.whatsapp_enabled !== 'undefined') {
          const v = foundReport.whatsapp_enabled;
          whatsappEnabled = typeof v === 'string'
            ? ['1', 'true', 'yes'].includes(String(v).trim().toLowerCase())
            : !!v;
        }
      }
    } catch (e) {
      console.error('Error while processing phone_reports.phone_number:', e);
    }

    // 3) If still no number, fallback to businesses table
    let fetchedBizRow = null;
    if (!whatsappNumber && ownerId) {
      try {
        const { data: bizRow, error: bizErr } = await supabase.from('businesses').select('phone, whatsapp_enabled, store_name').eq('user_id', ownerId).maybeSingle();
        fetchedBizRow = bizRow || null;
        if (bizErr) {
          console.error('Error fetching businesses row for ownerId', ownerId, bizErr);
        } else if (fetchedBizRow) {
          try {
            const decryptedBizPhone = decryptField(fetchedBizRow.phone);
            if (decryptedBizPhone) whatsappNumber = decryptedBizPhone;
            else if (fetchedBizRow.phone) whatsappNumber = fetchedBizRow.phone;
          } catch (e) {
            if (fetchedBizRow.phone) whatsappNumber = fetchedBizRow.phone;
          }
          if (!whatsappEnabled && typeof fetchedBizRow.whatsapp_enabled !== 'undefined') {
            const v = fetchedBizRow.whatsapp_enabled;
            whatsappEnabled = typeof v === 'string'
              ? ['1', 'true', 'yes'].includes(String(v).trim().toLowerCase())
              : !!v;
          }
        }
      } catch (e) {
        console.error('Error while checking businesses table:', e);
      }
    }

    // 4) If role still missing, infer a convincing role for the UI: prefer business then gold_user when phone exists
    try {
      if (!role) {
        if (fetchedBizRow) {
          role = 'gold_business';
        } else if (fetchedUserRow && (whatsappNumber || fetchedUserRow.phone)) {
          role = 'gold_user';
        }
      }
    } catch (e) {
      // ignore
    }

    // If we have a WhatsApp number and the owner role is privileged, but no explicit whatsapp flag,
    // be permissive so the UI can offer the WhatsApp contact (prevents UX breakage).
    try {
      const roleLower = role ? String(role).toLowerCase() : '';
      if (whatsappNumber && !whatsappEnabled && (roleLower.includes('gold') || roleLower.includes('business') || roleLower.includes('user'))) {
        whatsappEnabled = true;
      }
    } catch (e) {
      // ignore
    }

    // إخفاء رقم واتساب قبل الإرجاع لحماية الخصوصية
    const maskedWhatsappNumber = maskWhatsAppNumber(whatsappNumber);
    console.log('Responding from /api/get-owner-details-by-imei with', { role, whatsapp_enabled: !!whatsappEnabled, whatsapp_number: '***masked***' });
    return res.json({ role, whatsapp_enabled: !!whatsappEnabled, whatsapp_number: maskedWhatsappNumber });
  } catch (err) {
    console.error('خطأ في /api/get-owner-details-by-imei:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// نقطة نهاية لجلب الهواتف المسجلة للمستخدم الحالي مع فك تشفير IMEI
app.get('/api/user-phones', verifyJwtToken, async (req, res) => {
  try {
    const userId = req.user?.id;

    // التحقق من التخويل: يمكن فقط للمستخدم رؤية هواتفه الخاصة
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: No user ID' });
    }

    // دالة مساعدة لفك التشفير الآمن
    const safeDecryptImei = (value) => {  // ✅ صحيح في JavaScript
      if (!value) return '';
      try {
        const decrypted = decryptField(value);
        return decrypted || String(value);
      } catch (e) {
        return String(value);
      }
    };

    // جلب الهواتف التي يملكها المستخدم الحالي فقط (استبعاد المنقولة والمن بيعها)
    const { data: phones, error } = await supabase
      .from('registered_phones')
      .select('id, imei, phone_type, registration_date, last_confirmed_at, status, user_id')
      .eq('user_id', userId)
      .neq('status', 'transferred')
      .neq('status', 'sold');

    if (error) throw error;

    // جلب البلاغات النشطة للمستخدم للتحقق منها
    const { data: reports, error: reportsError } = await supabase
      .from('phone_reports')
      .select('imei, user_id, status')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (reportsError) throw reportsError;

    // إنشاء خريطة سريعة للبحث في البلاغات
    const reportsMap = new Map();
    if (reports && reports.length > 0) {
      for (const report of reports) {
        const decryptedImei = safeDecryptImei(report.imei);
        if (decryptedImei) {
          reportsMap.set(decryptedImei, true);
        }
      }
    }

    // معالجة البيانات: فك التشفير مرة واحدة فقط لكل هاتف
    const processedPhones = phones.map(phone => {
      const decryptedImei = safeDecryptImei(phone.imei);
      const maskedImei = decryptedImei
        ? decryptedImei.substring(0, 4) + '*******' + decryptedImei.slice(-4)
        : 'غير متوفر';

      const encryptedImei = encryptAES(decryptedImei || '');

      // البحث في الخريطة بدلاً من التكرار
      const hasActiveReport = reportsMap.has(decryptedImei);

      return {
        id: phone.id,
        phone_type: phone.phone_type || 'غير محدد',
        registration_date: phone.registration_date,
        last_confirmed_at: phone.last_confirmed_at,
        status: phone.status,
        imei_encrypted: encryptedImei,
        imei_masked: maskedImei,
        hasActiveReport: hasActiveReport
      };
    });

    return res.json({ success: true, data: processedPhones });
  } catch (error) {
    console.error('Error fetching user phones:', error);
    return sendError(res, 500, 'حدث خطأ في الخادم', error, { success: false });
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

    const passwordMatched = report.password
      ? await bcrypt.compare(String(password), String(report.password))
      : false;
    if (!passwordMatched) {
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

    // 📝 Audit Log: Record report verification and resolution
    await logAudit({
      userId: userId,
      action: 'verify_and_resolve_report',
      resourceType: 'phone_report',
      resourceId: reportId,
      oldValues: { status: 'active' },
      newValues: { status: 'resolved' },
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Report verified and resolved' });
  } catch (error) {
    console.error('Error in /api/verify-and-resolve-report:', error);
    return sendError(res, 500, 'حدث خطأ في الخادم', error, { success: false });
  }
});

// Endpoint: تغيير رقم الهاتف للمستخدم (يتطلب تحقق بالـ last6 وكلمة المرور)
app.post('/api/change-phone', verifyJwtToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { newPhone, last6, password } = req.body || {};
    if (!newPhone || !last6 || !password) return res.status(400).json({ success: false, error: 'newPhone, last6 and password are required' });

    // جلب صف التطبيق للمستخدم
    const { data: userRow, error: userErr } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
    if (userErr) {
      console.error('/api/change-phone users fetch error', userErr);
      return sendError(res, 500, 'Failed to fetch user data', userErr);
    }
    if (!userRow) return res.status(404).json({ success: false, error: 'User record not found' });

    // التحقق من last6
    const storedLast6Raw = decryptField(userRow.id_last6) || '';
    const storedLast6Digits = String(storedLast6Raw).replace(/\D/g, '');
    const providedLast6 = String(last6 || '').replace(/\D/g, '');
    if (!providedLast6 || providedLast6.length !== 6) {
      return res.status(400).json({ success: false, error: 'Invalid last6 value' });
    }
    if (!storedLast6Digits || !storedLast6Digits.endsWith(providedLast6) && storedLast6Digits !== providedLast6) {
      // لا يطابق آخر 6 أرقام
      return res.status(403).json({ success: false, error: 'Last6 verification failed' });
    }

    // تحقق من كلمة المرور عن طريق إعادة التوثيق عبر Supabase Auth
    const email = (req.user && req.user.email) ? req.user.email : (userRow.email || null);
    if (!email) return res.status(400).json({ success: false, error: 'User email not available for password verification' });

    // استدعاء نقطة الدخول الخاصة بـ Supabase Auth للتحقق من كلمة المرور
    const authUrlBase = SUPABASE_URL ? SUPABASE_URL.replace(/\/$/, '') : null;
    if (!authUrlBase || !SUPABASE_KEY) return sendError(res, 500, 'Server not configured for auth operations');

    const verifyResp = await fetch(`${authUrlBase}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({ email, password })
    });

    if (!verifyResp.ok) {
      const txt = await verifyResp.text();
      console.warn('/api/change-phone password verification failed', verifyResp.status, txt);
      return res.status(401).json({ success: false, error: 'Invalid password' });
    }

    // تشفير رقم الهاتف الجديد
    const encPhone = encryptObject(newPhone);
    const encPhoneJson = encPhone ? JSON.stringify(encPhone) : null;

    // تحديث جدول users
    const { data: updatedUser, error: updateUserErr } = await supabase.from('users').update({ phone: encPhoneJson }).eq('id', userId).select();
    if (updateUserErr) {
      console.error('/api/change-phone update users error', updateUserErr);
      return sendError(res, 500, 'Failed to update user phone', updateUserErr);
    }

    // تحديث جدول businesses إن وجد
    const { data: businessRow, error: businessErr } = await supabase.from('businesses').select('id').eq('user_id', userId).maybeSingle();
    if (businessErr) console.warn('/api/change-phone fetch business error', businessErr);
    if (businessRow) {
      const { error: updateBusinessErr } = await supabase.from('businesses').update({ phone: encPhoneJson }).eq('user_id', userId);
      if (updateBusinessErr) console.error('/api/change-phone update businesses error', updateBusinessErr);
    }

    // تحديث phone_reports حيث user_id = current user
    try {
      const { error: updateReportsErr } = await supabase.from('phone_reports').update({ phone_number: encPhoneJson }).eq('user_id', userId);
      if (updateReportsErr) console.error('/api/change-phone update phone_reports error', updateReportsErr);
    } catch (e) {
      console.error('/api/change-phone update phone_reports exception', e);
    }

    // تحديث registered_phones حيث user_id = current user
    try {
      const { error: updateRegErr } = await supabase.from('registered_phones').update({ phone_number: encPhoneJson }).eq('user_id', userId);
      if (updateRegErr) console.error('/api/change-phone update registered_phones error', updateRegErr);
    } catch (e) {
      console.error('/api/change-phone update registered_phones exception', e);
    }

    // سجل عملية التدقيق
    await logAudit({
      userId,
      action: 'change_phone',
      resourceType: 'user_profile',
      resourceId: userId,
      oldValues: { phone: decryptField(userRow.phone) },
      newValues: { phone: newPhone },
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    return res.json({ success: true, message: 'Phone updated' });
  } catch (err) {
    console.error('/api/change-phone error', err);
    return sendError(res, 500, 'Server error', err);
  }
});

// نقطة نهاية لإعادة تعيين كلمة مرور الهاتف المسجل
app.post('/api/reset-phone-password', verifyJwtToken, async (req, res) => {
  const { imei, currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  // ✅ Ownership verification: فقط مالك الهاتف يمكنه إعادة تعيين كلمة المرور
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!imei || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'IMEI, current password and new password are required' });
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
      .select('id, imei, password, user_id, email')
      .eq('user_id', userId);

    if (fetchError) throw fetchError;

    // 2. البحث عن الهاتف المطابق عبر IMEI بعد التطبيع (digits only)
    const normalizedIncomingImei = normalizeDigitsOnly(imei);
    const targetPhone = (userPhones || []).find((p) => {
      const storedImei = decryptField(p.imei);
      return normalizeDigitsOnly(storedImei) === normalizedIncomingImei;
    });

    if (!targetPhone) {
      // Record failed attempt (possible probing)
      recordAuthFailure(userKey);
      return res.status(404).json({ error: 'Phone not found for this user' });
    }

    // 3. تحقق ملكية إضافي: user_id + email (إن وجد) + كلمة المرور الحالية
    if (targetPhone.user_id !== userId) {
      recordAuthFailure(userKey);
      return res.status(403).json({ error: 'Not authorized for this phone' });
    }

    if (targetPhone.email && req.user?.email) {
      const storedEmail = normalizeTextForCompare(decryptField(targetPhone.email));
      const requesterEmail = normalizeTextForCompare(req.user.email);
      if (storedEmail && requesterEmail && storedEmail !== requesterEmail) {
        recordAuthFailure(userKey);
        return res.status(403).json({ error: 'Identity verification failed' });
      }
    }

    const currentPasswordMatched = targetPhone.password
      ? await bcrypt.compare(String(currentPassword), String(targetPhone.password))
      : false;
    if (!currentPasswordMatched) {
      recordAuthFailure(userKey);
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // منع إعادة تعيين نفس كلمة المرور الحالية
    const sameAsOldPassword = targetPhone.password
      ? await bcrypt.compare(String(newPassword), String(targetPhone.password))
      : false;
    if (sameAsOldPassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    // 4. تحديث كلمة المرور (bcrypt) بنفس آلية القديمة
    const hashedPassword = await hashPasswordForStorage(newPassword);

    const { error: updateError } = await supabase
      .from('registered_phones')
      .update({ password: hashedPassword })
      .eq('id', targetPhone.id);

    if (updateError) throw updateError;

    // success: clear any recorded failures for this user
    clearAuthFailures(userKey);

    // 📝 Audit Log: Record password reset
    await logAudit({
      userId: userId,
      action: 'reset_phone_password',
      resourceType: 'registered_phone',
      resourceId: targetPhone.id,
      details: { imei_last_4: imei.slice(-4) },
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Password updated successfully' });

  } catch (error) {
    console.error('Error resetting phone password:', error);
    return sendError(res, 500, 'حدث خطأ في الخادم', error);
  }
});

// --- نقاط نهاية تسجيل الهاتف ---

// دالة التحقق من حد التسجيل (Rate Limiting)
const checkRegisterLimit = async (userId, consumeBonusOnLimit = false) => {
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

    let userType = 'free_user';
    // try to infer a sensible default from the users.role when possible
    try {
      const { data: userRec, error: userErr } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      if (!userErr && userRec && typeof userRec.role === 'string' && userRec.role.toLowerCase().includes('business')) {
        userType = 'free_business';
      }
    } catch (e) {
      console.warn('checkRegisterLimit: failed to read user role, using default free_user', e);
    }

    // If a latest payment exists, prefer its type (keeps upgrade logic intact)
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
        // Determine role for users_plans from users.role (free_user or free_business)
        let roleToInsert = 'free_user';
        try {
          const { data: urec, error: uerr } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
          if (!uerr && urec && typeof urec.role === 'string' && urec.role.toLowerCase().includes('business')) roleToInsert = 'free_business';
        } catch (e) {
          console.warn('checkRegisterLimit: failed to read user role for users_plans insert, defaulting to free_user', e);
        }

        console.log('checkRegisterLimit: inserting users_plans for user', userId, 'resolved roleToInsert=', roleToInsert);
        try {
          const { data: urecCheck, error: urecErr } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
          console.log('checkRegisterLimit: users table lookup for users_plans insert', { userId, urec: urecCheck, urecErr: urecErr ? String(urecErr) : null });
        } catch (e) {
          console.warn('checkRegisterLimit: users lookup failed before insert', e);
        }

        const { data: insertData, error: insertError } = await supabase
          .from('users_plans')
          .insert({
            id: userId,
            user_id: userId,
            role: roleToInsert,
            used_register_phone: 0
          })
          .select()
          .maybeSingle();

        if (insertError) {
          throw new Error('حدث خطأ في تهيئة بيانات الخطة الخاصة بك');
        }
        return { canRegister: true, limit: parseInt(planData.register_phone_limit), currentUsage: 0, isLastUsage: false, bonusAvailable: false, offerCost: Number(planData.price_offer || 0), remainingBonus: 0 };
      }
      throw usageError;
    }

    const currentUsage = usageData.used_register_phone || 0;
    const limit = parseInt(planData.register_phone_limit);
    const isLastUsage = currentUsage >= limit - 1;

    if (currentUsage >= limit) {
      const offerCost = Number(planData.price_offer || 0);
      let bonusAvailable = false;
      let remainingBonus = 0;
      let lastBonusId = null;

      if (offerCost > 0) {
        const { data: lastBonus, error: bonusError } = await supabase
          .from('ads_payment')
          .select('id, bonus_offer, payment_status, is_paid')
          .eq('user_id', userId)
          .eq('transaction', 'bonus_add')
          .eq('is_paid', true)
          .order('payment_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!bonusError && lastBonus) {
          const amount = Number(lastBonus.bonus_offer || 0);
          bonusAvailable = amount >= offerCost;
          remainingBonus = amount;
          lastBonusId = lastBonus.id;
        }
      }

      if (consumeBonusOnLimit && bonusAvailable && lastBonusId) {
        const newBonusValue = Number(remainingBonus) - offerCost;
        const { error: updateErr } = await supabase
          .from('ads_payment')
          .update({
            bonus_offer: newBonusValue,
            payment_date: new Date().toISOString(),
            is_paid: true,
            payment_status: 'paid',
            transaction: 'bonus_add',
            Actual_bonus: remainingBonus
          })
          .eq('id', lastBonusId);

        if (!updateErr) {
          return {
            canRegister: true,
            limit,
            currentUsage,
            isLastUsage: false,
            usedBonus: true,
            deductedAmount: offerCost,
            remainingBonus: newBonusValue,
            bonusAvailable: true,
            offerCost
          };
        }
        console.error('checkRegisterLimit: failed to deduct bonus:', updateErr);
      }

      return {
        canRegister: false,
        limit,
        currentUsage,
        isLastUsage: false,
        message: 'تم الوصول إلى الحد الأقصى للتسجيل',
        bonusAvailable,
        offerCost,
        remainingBonus
      };
    }

    return {
      canRegister: true,
      limit,
      currentUsage,
      isLastUsage,
      message: isLastUsage ? 'هذا هو آخر تسجيل مسموح' : null,
      bonusAvailable: false,
      offerCost: Number(planData.price_offer || 0),
      remainingBonus: 0
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
  const { imei } = req.body;
  const requesterId = req.user?.id;

  // ✅ Ownership verification: يمكن فقط للمستخدم التحقق من IMEIs الخاصة به
  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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
        if (requesterId && matchingReport.user_id === requesterId) {
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
      (allPhones || []).slice(0, 50).forEach((p, idx) => {
        try {
          const d = decryptField(p.imei);
          const norm = normalizeDigitsOnly(d);
          console.log(`  [${idx}] id_last6=${p.id_last6} user_id=${p.user_id} status=${p.status} decryptedImei=${d} normalized=${norm}`);
        } catch (e) {
          console.log(`  [${idx}] error decrypting row:`, e?.message || e);
        }
      });
    }

    // إذا كان الهاتف مسجلاً
    if (matchingPhone) {
      // التحقق مما إذا كان مسجلاً لمستخدم آخر أو منقول الملكية
      if (requesterId && matchingPhone.user_id === requesterId) {
        // الهاتف مسجل للمستخدم الحالي
        if (matchingPhone.status === 'transferred') {
          // المستخدم تخلى عن الهاتف (قال "هذا ليس هاتفي") - يُسمح بتسجيله من جديد
          return res.json({ exists: false, phoneDetails: null, isTransferred: true });
        }
        if (matchingPhone.status === 'rejected') {
          // تم رفض التسجيل سابقًا - السماح بإعادة التسجيل
          return res.json({ exists: false, phoneDetails: null, isRejected: true });
        }
        if (matchingPhone.status === 'sold') {
          // تم نقل الملكية - فقط المشتري الجديد يقدر يسجله
          return res.json({ exists: true, isOtherUser: false, phoneDetails: null, isSold: true });
        }
        // نسمح له بتحديث البيانات - فك تشفير البيانات قبل إرجاعها
        let decryptedPhoneNumber = null;
        try {
          decryptedPhoneNumber = decryptField(matchingPhone.phone_number);
          if (!decryptedPhoneNumber) {
            console.warn('[check-imei] decryptField returned null/empty for phone_number, using original');
            decryptedPhoneNumber = matchingPhone.phone_number;
          }
        } catch (e) {
          console.error('[check-imei] Error decrypting phone_number:', e);
          decryptedPhoneNumber = matchingPhone.phone_number;
        }

        let decryptedIdLast6 = null;
        try {
          decryptedIdLast6 = decryptField(matchingPhone.id_last6);
          if (!decryptedIdLast6) {
            console.warn('[check-imei] decryptField returned null/empty for id_last6, using original');
            decryptedIdLast6 = matchingPhone.id_last6;
          }
        } catch (e) {
          console.error('[check-imei] Error decrypting id_last6:', e);
          decryptedIdLast6 = matchingPhone.id_last6;
        }

        const decryptedOwnerName = decryptField(matchingPhone.owner_name) || matchingPhone.owner_name || '';
        const decryptedPhone = {
          ...matchingPhone,
          imei: decryptField(matchingPhone.imei),
          phone_number: decryptedPhoneNumber || '',
          id_last6: decryptedIdLast6 || '',
          owner_name: decryptedOwnerName
        };
        if (process.env.NODE_ENV !== 'production') {
          console.log('[check-imei] Returning decrypted phoneDetails for current user:', {
            phone_number: decryptedPhoneNumber,
            id_last6: decryptedIdLast6,
            owner_name: decryptedOwnerName
          });
        }
        return res.json({ exists: true, phoneDetails: decryptedPhone, isOtherUser: false });
      } else {
        // مسجل لمستخدم آخر
        if (matchingPhone.status === 'transferred') {
          // المستخدم تخلى عن الهاتف - يُسمح بتسجيله من جديد
          return res.json({ exists: false, phoneDetails: null, isTransferred: true });
        }
        if (matchingPhone.status === 'rejected') {
          // تم رفض التسجيل سابقًا - السماح بإعادة التسجيل
          return res.json({ exists: false, phoneDetails: null, isRejected: true });
        }
        if (matchingPhone.status === 'sold') {
          return res.json({
            exists: true,
            isOtherUser: false,
            isSold: true,
            phoneDetails: null
          });
        }
      }
    }

    // ⭐ التعديل الرئيسي: إذا لم يتم العثور على الهاتف، جلب بيانات المستخدم الحالي للملء التلقائي
    if (!matchingPhone) {
      try {
        // جلب بيانات المستخدم الحالي
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('full_name, phone, id_last6')
          .eq('id', requesterId)
          .maybeSingle();

        if (!userError && userData) {
          // فك تشفير بيانات المستخدم
          const decryptedFullName = decryptField(userData.full_name) || '';
          const decryptedPhone = decryptField(userData.phone) || '';
          const decryptedIdLast6 = decryptField(userData.id_last6) || '';

          // إرجاع البيانات للملء التلقائي مع تحديد أنها للقراءة فقط
          return res.json({
            exists: false,
            phoneDetails: null,
            autoFillData: {
              ownerName: decryptedFullName,
              phoneNumber: decryptedPhone,
              idLast6: decryptedIdLast6,
              isReadOnly: true // البيانات للقراءة فقط
            }
          });
        }
      } catch (e) {
        console.error('[check-imei] Error fetching user data for auto-fill:', e);
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
  const rawImei = typeof phoneData.imei === 'string' ? phoneData.imei : '';
  // If an IMEI is provided, compute a stable SHA-256 hash of the normalized digits
  // and store it in `imei_hash` for indexing/searching (non-reversible).
  try {
    if (rawImei && String(rawImei).trim() !== '') {
      const norm = normalizeDigitsOnly(rawImei);
      if (norm) {
        phoneData.imei_hash = crypto.createHash('sha256').update(String(norm)).digest('hex');
      }
    }
  } catch (e) {
    console.warn('Failed to compute imei_hash for registration', e);
  }
  const useBonusOnLimit = phoneData.useBonusOnLimit === true || phoneData.useBonusOnLimit === 'true';
  delete phoneData.useBonusOnLimit;

  // ✅ Ownership verification: فقط المستخدم نفسه يمكنه تسجيل هاتفه الخاص
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

  // تشفير كلمة المرور قبل التخزين في قاعدة البيانات (bcrypt)
  if (phoneData.password) {
    phoneData.password = await hashPasswordForStorage(phoneData.password);
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

  // Normalize and encrypt owner name (accept ownerName or owner_name)
  if (typeof phoneData.ownerName !== 'undefined') {
    // prefer explicit camelCase input but normalize to snake_case
    phoneData.owner_name = phoneData.ownerName;
    delete phoneData.ownerName;
  }

  if (typeof phoneData.owner_name !== 'undefined' && phoneData.owner_name !== null && phoneData.owner_name !== '') {
    let rawOwner = phoneData.owner_name;
    try {
      // If it's a JSON string containing encrypted fields, keep it as-is (stringify canonical form)
      if (typeof rawOwner === 'string') {
        try {
          const parsed = JSON.parse(rawOwner);
          if (parsed && parsed.encryptedData && parsed.iv && parsed.authTag) {
            phoneData.owner_name = JSON.stringify({ encryptedData: parsed.encryptedData, iv: parsed.iv, authTag: parsed.authTag });
          } else {
            const encOwner = encryptAES(String(rawOwner));
            if (!encOwner) return res.status(400).json({ error: 'فشل تشفير اسم المالك' });
            phoneData.owner_name = JSON.stringify({ encryptedData: encOwner.encryptedData, iv: encOwner.iv, authTag: encOwner.authTag });
          }
        } catch (e) {
          const encOwner = encryptAES(String(rawOwner));
          if (!encOwner) return res.status(400).json({ error: 'فشل تشفير اسم المالك' });
          phoneData.owner_name = JSON.stringify({ encryptedData: encOwner.encryptedData, iv: encOwner.iv, authTag: encOwner.authTag });
        }
      } else if (typeof rawOwner === 'object' && rawOwner.encryptedData && rawOwner.iv && rawOwner.authTag) {
        phoneData.owner_name = JSON.stringify({ encryptedData: rawOwner.encryptedData, iv: rawOwner.iv, authTag: rawOwner.authTag });
      } else {
        const encOwner = encryptAES(String(rawOwner));
        if (!encOwner) return res.status(400).json({ error: 'فشل تشفير اسم المالك' });
        phoneData.owner_name = JSON.stringify({ encryptedData: encOwner.encryptedData, iv: encOwner.iv, authTag: encOwner.authTag });
      }
    } catch (e) {
      const encOwner = encryptAES(String(rawOwner));
      if (!encOwner) return res.status(400).json({ error: 'فشل تشفير اسم المالك' });
      phoneData.owner_name = JSON.stringify({ encryptedData: encOwner.encryptedData, iv: encOwner.iv, authTag: encOwner.authTag });
    }
  }

  try {
    // ⭐ التحقق من حد التسجيل (Rate Limiting)
    const limitCheck = await checkRegisterLimit(req.user.id, false);
    if (!limitCheck.canRegister && !(useBonusOnLimit && limitCheck.bonusAvailable)) {
      return res.status(429).json({
        success: false,
        error: limitCheck.message || 'تم الوصول إلى الحد الأقصى للتسجيل',
        limit: limitCheck.limit,
        currentUsage: limitCheck.currentUsage,
        bonusAvailable: limitCheck.bonusAvailable || false,
        offerCost: limitCheck.offerCost || 0,
        remainingBonus: limitCheck.remainingBonus || 0
      });
    }

    // أولاً: التحقق من عدم وجود بلاغ نشط لهذا الـ IMEI
    if (rawImei) {
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
          return normalizeDigitsOnly(decryptedImei) === normalizeDigitsOnly(rawImei);
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

    const registeredId = Array.isArray(data) ? data[0]?.id : data?.id;

    if (useBonusOnLimit && limitCheck.currentUsage >= limitCheck.limit) {
      const bonusResult = await checkRegisterLimit(req.user.id, true);
      if (!bonusResult.canRegister) {
        console.error('Failed to consume bonus after successful registration:', bonusResult);
        try {
          if (registeredId) {
            await supabase.from('registered_phones').delete().eq('id', registeredId);
          }
        } catch (deleteError) {
          console.error('Failed to rollback registered phone after bonus consumption failure:', deleteError);
        }
        return res.status(500).json({ success: false, error: 'فشل خصم البونص بعد حفظ الهاتف' });
      }
    }

    // 📝 Audit Log: Record phone registration
    try {
      await logAudit({
        userId: userId,
        action: 'register_phone',
        resourceType: 'registered_phone',
        resourceId: registeredId,
        details: {
          imei_last_4: rawImei.slice(-4),
          phone_type: phoneData.phone_type,
          status: 'pending'
        },
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
    } catch (auditError) {
      console.error('خطأ غير حرج في تسجيل Audit:', auditError);
      // لا نوقف العملية بسبب فشل Audit Log
    }

    // ⭐ تسجيل محاولة التسجيل الناجحة
    registrationAttempts.set(userId, [
      ...(userAttempts || []),
      { timestamp: Date.now() }
    ].filter(attempt => Date.now() - attempt.timestamp < ATTEMPT_COOLDOWN));

    // ⭐ تحديث العداد بعد التسجيل الناجح
    try {
      await updateRegisterUsage(userId);
    } catch (updateError) {
      console.error('خطأ غير حرج في تحديث الاستخدام:', updateError);
      // لا نوقف الاستجابة الناجحة بسبب خطأ في تحديث الاستخدام
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error registering phone:', error);
    return sendError(res, 500, 'حدث خطأ في الخادم', error);
  }
});

// Compatibility endpoint: create-phone (client previously posts to /api/create-phone)
app.post('/api/create-phone', verifyJwtToken, async (req, res) => {
  const phoneData = { ...req.body };
  const userId = req.user?.id;

  const rawImei = typeof phoneData.imei === 'string' ? phoneData.imei : '';

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  // Minimal masked logging to help debug client 400s (avoid logging full IMEI)
  try {
    if (process.env.NODE_ENV !== 'production') {
      const masked = rawImei ? `****${String(rawImei).slice(-4)}` : null;
      console.log(`/api/create-phone called user=${userId} imei_last4=${masked} bodyKeys=${Object.keys(phoneData).join(',')}`);
    }
  } catch (e) {
    // non-fatal logging error
    console.warn('/api/create-phone logging failed', e && e.message);
  }

  // Normalize and validate incoming payload to avoid DB insert errors
  try {
    // Ensure contact_methods is an object
    if (!phoneData.contact_methods || typeof phoneData.contact_methods !== 'object') phoneData.contact_methods = {};

    // Normalize phone in contact_methods (digits only)
    if (phoneData.contact_methods.phone) {
      phoneData.contact_methods.phone = normalizeDigitsOnly(String(phoneData.contact_methods.phone));
      if (phoneData.contact_methods.phone === '') delete phoneData.contact_methods.phone;
    }

    // Normalize and validate IMEI: digits only, exactly 15
    if (phoneData.imei) {
      phoneData.imei = String(phoneData.imei).replace(/\D/g, '').slice(0, 15);
      if (phoneData.imei.length !== 15) {
        return res.status(400).json({ success: false, error: 'invalid_imei', message: 'IMEI must be 15 digits' });
      }
    } else {
      return res.status(400).json({ success: false, error: 'missing_imei', message: 'IMEI is required' });
    }

    // Clean up city (remove stray quotes/backslashes) and trim
    if (phoneData.city && typeof phoneData.city === 'string') {
      phoneData.city = String(phoneData.city).replace(/(^["\\]+|["\\]+$)/g, '').trim();
    }

    // Ensure numeric fields
    phoneData.price = Number(phoneData.price) || 0;
    phoneData.warranty_months = parseInt(String(phoneData.warranty_months || '0').replace(/\D/g, ''), 10) || 0;

    // Trim common string fields to avoid weird characters
    ['title', 'brand', 'phone_type', 'model', 'description', 'store_name', 'status', 'role'].forEach(k => {
      if (phoneData[k] && typeof phoneData[k] === 'string') phoneData[k] = phoneData[k].trim();
    });

    // If client sent `brand` but DB uses `phone_type`, move brand -> phone_type and remove brand
    try {
      if (phoneData.brand && !phoneData.phone_type) {
        phoneData.phone_type = phoneData.brand;
        delete phoneData.brand;
      }
    } catch (mapErr) {
      console.warn('Failed to map brand->phone_type:', mapErr && mapErr.message);
    }

    // Ensure specs is an object
    if (!phoneData.specs || typeof phoneData.specs !== 'object') phoneData.specs = {};

  } catch (normErr) {
    console.error('/api/create-phone payload normalization failed:', normErr && (normErr.stack || normErr.message || normErr));
    return res.status(400).json({ success: false, error: 'payload_normalization_failed' });
  }

  try {
    // Rate limit / plan checks
    // NOTE: Exempt phone sale listings from registration limits per product requirement.
    // Skipping `checkRegisterLimit(userId)` here so users can post phones for sale without quota.

    // Prevent registration if active report exists for this IMEI
    if (rawImei) {
      const { data: allReports, error: reportsFetchError } = await supabase
        .from('phone_reports')
        .select('id, imei')
        .eq('status', 'active');

      if (reportsFetchError) {
        console.error('Error checking phone_reports:', reportsFetchError);
      } else if (allReports && allReports.length > 0) {
        const matchingReport = allReports.find(report => {
          const decryptedImei = decryptField(report.imei);
          return normalizeDigitsOnly(decryptedImei) === normalizeDigitsOnly(rawImei);
        });

        if (matchingReport) {
          return res.status(400).json({ success: false, error: 'Cannot register: active report exists for this IMEI', hasActiveReport: true });
        }
      }
    }

    // Encrypt sensitive fields (password, imei, phone_number, id_last6, email, owner_name)
    if (phoneData.password) phoneData.password = await hashPasswordForStorage(phoneData.password);

    if (phoneData.imei) {
      const enc = encryptAES(phoneData.imei);
      if (!enc) return res.status(400).json({ error: 'IMEI encryption failed' });
      phoneData.imei = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
    }

    if (phoneData.phone_number) {
      const enc = encryptAES(phoneData.phone_number);
      if (!enc) return res.status(400).json({ error: 'Phone encryption failed' });
      phoneData.phone_number = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
    }

    if (phoneData.id_last6) {
      const enc = encryptAES(phoneData.id_last6);
      if (!enc) return res.status(400).json({ error: 'ID encryption failed' });
      phoneData.id_last6 = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
    }

    if (phoneData.email) {
      const enc = encryptAES(phoneData.email);
      if (!enc) return res.status(400).json({ error: 'Email encryption failed' });
      phoneData.email = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
    }

    // Encrypt contact_methods.phone if present (store encrypted JSON blob)
    if (phoneData.contact_methods && phoneData.contact_methods.phone) {
      try {
        const enc = encryptAES(String(phoneData.contact_methods.phone));
        if (!enc) return res.status(400).json({ error: 'Contact phone encryption failed' });
        phoneData.contact_methods.phone = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
      } catch (e) {
        console.error('Failed encrypting contact_methods.phone:', e && e.message);
        return res.status(400).json({ error: 'Contact phone encryption failed' });
      }
    }

    if (typeof phoneData.ownerName !== 'undefined') {
      phoneData.owner_name = phoneData.ownerName;
      delete phoneData.ownerName;
    }

    if (typeof phoneData.owner_name !== 'undefined' && phoneData.owner_name !== null && phoneData.owner_name !== '') {
      let rawOwner = phoneData.owner_name;
      try {
        if (typeof rawOwner === 'string') {
          try {
            const parsed = JSON.parse(rawOwner);
            if (parsed && parsed.encryptedData && parsed.iv && parsed.authTag) {
              phoneData.owner_name = JSON.stringify({ encryptedData: parsed.encryptedData, iv: parsed.iv, authTag: parsed.authTag });
            } else {
              const encOwner = encryptAES(String(rawOwner));
              if (!encOwner) return res.status(400).json({ error: 'Owner encryption failed' });
              phoneData.owner_name = JSON.stringify({ encryptedData: encOwner.encryptedData, iv: encOwner.iv, authTag: encOwner.authTag });
            }
          } catch (e) {
            const encOwner = encryptAES(String(rawOwner));
            if (!encOwner) return res.status(400).json({ error: 'Owner encryption failed' });
            phoneData.owner_name = JSON.stringify({ encryptedData: encOwner.encryptedData, iv: encOwner.iv, authTag: encOwner.authTag });
          }
        } else if (typeof rawOwner === 'object' && rawOwner.encryptedData && rawOwner.iv && rawOwner.authTag) {
          phoneData.owner_name = JSON.stringify({ encryptedData: rawOwner.encryptedData, iv: rawOwner.iv, authTag: rawOwner.authTag });
        } else {
          const encOwner = encryptAES(String(rawOwner));
          if (!encOwner) return res.status(400).json({ error: 'Owner encryption failed' });
          phoneData.owner_name = JSON.stringify({ encryptedData: encOwner.encryptedData, iv: encOwner.iv, authTag: encOwner.authTag });
        }
      } catch (e) {
        const encOwner = encryptAES(String(rawOwner));
        if (!encOwner) return res.status(400).json({ error: 'Owner encryption failed' });
        phoneData.owner_name = JSON.stringify({ encryptedData: encOwner.encryptedData, iv: encOwner.iv, authTag: encOwner.authTag });
      }
    }

    // Ensure user_id set to token user
    phoneData.user_id = userId;

    // Log a masked snapshot of the payload to help debug insertion errors (never log full IMEI)
    try {
      const safeSnapshot = { ...phoneData };
      if (safeSnapshot.imei && typeof safeSnapshot.imei === 'string') safeSnapshot.imei = `****${String(rawImei).slice(-4)}`;
      if (safeSnapshot.phone_number) safeSnapshot.phone_number = '***masked***';
      // don't include large fields
      if (safeSnapshot.specs) delete safeSnapshot.specs;
      console.log('/api/create-phone inserting registered_phones, user=', userId, 'snapshot=', JSON.stringify(safeSnapshot));
    } catch (logErr) {
      console.warn('Failed to create safe snapshot for create-phone log', logErr && logErr.message);
    }

    let data, error;
    try {
      // تحديد نوع الإعلان بناءً على دور المستخدم
      const userRole = req.user?.role || 'free_user';
      const adType = ['silver_business', 'gold_business', 'silver_user', 'gold_user'].includes(userRole)
        ? 'promotions'
        : 'normal';

      // إضافة type و role إلى phoneData
      phoneData.type = adType;
      phoneData.role = userRole;

      // ثم الإدراج
      const insertRes = await supabase
        .from('phones')
        .insert([phoneData])
        .select()
        .maybeSingle();

      data = insertRes.data;
      error = insertRes.error;
      if (error) {
        console.error('/api/create-phone supabase insert error (phones):', error);
        throw error;
      }
    } catch (dbErr) {
      console.error('/api/create-phone DB insert exception (phones):', dbErr && (dbErr.stack || dbErr.message || dbErr));
      return sendError(res, 500, 'Database insert failed', process.env.NODE_ENV !== 'production' ? dbErr : undefined);
    }

    // Audit
    try {
      await logAudit({ userId, action: 'create_phone', resourceType: 'phone', resourceId: data?.id, details: { imei_last_4: rawImei.slice(-4) }, ip: req.ip, userAgent: req.headers['user-agent'] });
    } catch (e) {
      console.error('Audit log failed for create-phone:', e);
    }

    // Update usage counters
    try { await updateRegisterUsage(userId); } catch (e) { console.error('updateRegisterUsage error:', e); }

    return res.json({ success: true, phone: data });
  } catch (error) {
    console.error('/api/create-phone error:', error && (error.stack || error.message || error));
    if (!res.headersSent) {
      const safeMessage = process.env.NODE_ENV !== 'production' ? (error && (error.message || String(error))) : 'Server error while creating phone';
      return res.status(500).json({ success: false, error: 'server_error', message: safeMessage });
    }
  }
});

// Create accessory via server: normalize input, encrypt PII, insert as seller
app.post('/api/create-accessory', verifyJwtToken, async (req, res) => {
  const accessoryData = { ...req.body };
  const userId = req.user?.id;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Ensure contact_methods is an object
    if (!accessoryData.contact_methods || typeof accessoryData.contact_methods !== 'object') accessoryData.contact_methods = {};

    // Normalize contact phone (digits only)
    if (accessoryData.contact_methods.phone) {
      accessoryData.contact_methods.phone = normalizeDigitsOnly(String(accessoryData.contact_methods.phone)).slice(0, 20);
      if (accessoryData.contact_methods.phone === '') delete accessoryData.contact_methods.phone;
    }

    // Clean and trim common string fields
    ['title', 'category', 'brand', 'compatibility', 'description', 'store_name', 'city', 'status', 'role'].forEach(k => {
      if (accessoryData[k] && typeof accessoryData[k] === 'string') accessoryData[k] = accessoryData[k].trim();
    });

    // Ensure numeric fields
    accessoryData.price = Number(accessoryData.price) || 0;
    accessoryData.warranty_months = parseInt(String(accessoryData.warranty_months || '0').replace(/\D/g, ''), 10) || 0;

    // Default status
    if (!accessoryData.status) accessoryData.status = 'pending';

    // Encrypt PII fields if present
    if (accessoryData.contact_methods && accessoryData.contact_methods.phone) {
      try {
        const enc = encryptAES(String(accessoryData.contact_methods.phone));
        if (!enc) return res.status(400).json({ error: 'Contact phone encryption failed' });
        accessoryData.contact_methods.phone = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
      } catch (e) {
        console.error('Failed encrypting accessory contact phone:', e && e.message);
        return res.status(400).json({ error: 'Contact phone encryption failed' });
      }
    }

    if (typeof accessoryData.owner_name !== 'undefined' && accessoryData.owner_name !== null && accessoryData.owner_name !== '') {
      try {
        const rawOwner = accessoryData.owner_name;
        if (typeof rawOwner === 'string') {
          try {
            const parsed = JSON.parse(rawOwner);
            if (parsed && parsed.encryptedData && parsed.iv && parsed.authTag) {
              accessoryData.owner_name = JSON.stringify({ encryptedData: parsed.encryptedData, iv: parsed.iv, authTag: parsed.authTag });
            } else {
              const encOwner = encryptAES(String(rawOwner));
              if (!encOwner) return res.status(400).json({ error: 'Owner encryption failed' });
              accessoryData.owner_name = JSON.stringify({ encryptedData: encOwner.encryptedData, iv: encOwner.iv, authTag: encOwner.authTag });
            }
          } catch (e) {
            const encOwner = encryptAES(String(rawOwner));
            if (!encOwner) return res.status(400).json({ error: 'Owner encryption failed' });
            accessoryData.owner_name = JSON.stringify({ encryptedData: encOwner.encryptedData, iv: encOwner.iv, authTag: encOwner.authTag });
          }
        } else if (typeof rawOwner === 'object' && rawOwner.encryptedData && rawOwner.iv && rawOwner.authTag) {
          accessoryData.owner_name = JSON.stringify({ encryptedData: rawOwner.encryptedData, iv: rawOwner.iv, authTag: rawOwner.authTag });
        } else {
          const encOwner = encryptAES(String(rawOwner));
          if (!encOwner) return res.status(400).json({ error: 'Owner encryption failed' });
          accessoryData.owner_name = JSON.stringify({ encryptedData: encOwner.encryptedData, iv: encOwner.iv, authTag: encOwner.authTag });
        }
      } catch (e) {
        const encOwner = encryptAES(String(accessoryData.owner_name));
        if (!encOwner) return res.status(400).json({ error: 'Owner encryption failed' });
        accessoryData.owner_name = JSON.stringify({ encryptedData: encOwner.encryptedData, iv: encOwner.iv, authTag: encOwner.authTag });
      }
    }

    if (accessoryData.email) {
      const enc = encryptAES(String(accessoryData.email));
      if (!enc) return res.status(400).json({ error: 'Email encryption failed' });
      accessoryData.email = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
    }

    // Ensure seller_id is set to token user
    accessoryData.seller_id = userId;

    // Insert
    let inserted;
    try {
      const insertRes = await supabase
        .from('accessories')
        .insert([accessoryData])
        .select()
        .maybeSingle();

      if (insertRes.error) {
        console.error('/api/create-accessory supabase insert error:', insertRes.error);
        throw insertRes.error;
      }

      inserted = insertRes.data;
    } catch (dbErr) {
      console.error('/api/create-accessory DB insert exception:', dbErr && (dbErr.stack || dbErr.message || dbErr));
      return sendError(res, 500, 'Database insert failed', process.env.NODE_ENV !== 'production' ? dbErr : undefined);
    }

    // Audit
    try {
      await logAudit({ userId, action: 'create_accessory', resourceType: 'accessory', resourceId: inserted?.id, ip: req.ip, userAgent: req.headers['user-agent'] });
    } catch (e) {
      console.error('Audit log failed for create-accessory:', e);
    }

    return res.json({ success: true, accessory: inserted });
  } catch (err) {
    console.error('/api/create-accessory error:', err);
    return sendError(res, 500, 'Server error', err);
  }
});

registerAdRoutes({
  app,
  supabase,
  verifyJwtToken,
  sendError,
  decryptField,
  normalizeTextForCompare,
  normalizeDigitsOnly,
});

// IMEI ownership, reveal, and transfer-related routes.
registerOwnershipRoutes({
  app,
  supabase,
  verifyJwtToken,
  verifyOwnerLimiter,
  sendError,
  decryptField,
  normalizeDigitsOnly,
  maskName,
  maskPhoneNumber,
  maskIdLast6,
  encryptAES,
  hashPasswordForStorage,
  logAudit,
  checkAuthBlocked,
  recordAuthFailure,
  clearAuthFailures
});

// مسار للحصول على بيانات المشتري
registerBuyerInfoRoutes({
  app,
  supabase,
  verifyJwtToken,
  sendError,
  decryptField
});

// نقطة نهاية للتحقق من حدود الاستخدام
app.post('/api/check-limit', verifyJwtToken, async (req, res) => {
  const { type, consumeBonusOnLimit = false } = req.body; // 'search_imei', 'register_phone', 'search_history', 'print_history', 'game'
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

    // Default to free_user, but prefer latest payment if present.
    let userType = 'free_user';
    if (latestPayment && latestPayment.type) {
      userType = latestPayment.type;
    } else {
      // No payment found -> infer from users.role: consider business if role contains 'business', otherwise user is free_user
      try {
        const { data: userRec, error: userErr } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
        if (!userErr && userRec && typeof userRec.role === 'string' && userRec.role.toLowerCase().includes('business')) {
          userType = 'free_business';
        }
      } catch (e) {
        console.warn('check-limit: failed to read user role, defaulting to free_user', e);
      }
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
            used_print_history: 0,
            used_game: 0
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
      // خيار إضافي: عند بلوغ الحد، اسمح بالاستخدام عبر خصم cost من bonus (price_offer من plan)
      const offerCost = Number(planData.price_offer || 0);
      let bonusAvailable = false;
      let remainingBonus = 0;

      if (offerCost > 0) {
        const { data: lastBonus, error: bonusError } = await supabase
          .from('ads_payment')
          .select('id, bonus_offer, payment_status, is_paid')
          .eq('user_id', userId)
          .eq('transaction', 'bonus_add')
          .eq('is_paid', true)
          .order('payment_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!bonusError && lastBonus) {
          remainingBonus = Number(lastBonus.bonus_offer || 0);
          bonusAvailable = remainingBonus >= offerCost;
        }
      }

      if (consumeBonusOnLimit && offerCost > 0 && bonusAvailable) {
        const { data: lastBonus, error: bonusError } = await supabase
          .from('ads_payment')
          .select('id, bonus_offer')
          .eq('user_id', userId)
          .eq('transaction', 'bonus_add')
          .eq('is_paid', true)
          .order('payment_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!bonusError && lastBonus && Number(lastBonus.bonus_offer || 0) >= offerCost) {
          const newBonusValue = Number(lastBonus.bonus_offer) - offerCost;
          const { error: updateErr } = await supabase
            .from('ads_payment')
            .update({
              bonus_offer: newBonusValue,
              payment_date: new Date().toISOString(),
              is_paid: true,
              payment_status: 'paid',
              transaction: 'bonus_add',
              Actual_bonus: lastBonus.bonus_offer
            })
            .eq('id', lastBonus.id);

          if (!updateErr) {
            return res.json({
              allowed: true,
              limit,
              currentUsage,
              isLastUsage: false,
              usedBonus: true,
              deductedAmount: offerCost,
              remainingBonus: newBonusValue
            });
          }
          console.error('check-limit: failed to deduct bonus:', updateErr);
        }
      }

      return res.json({
        allowed: false,
        limit,
        currentUsage,
        isLastUsage: false,
        message: 'Limit exceeded',
        bonusAvailable,
        offerCost,
        remainingBonus
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
    else if (type === 'game') rpcName = 'increment_used_game';
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

  // ✅ Ownership verification: فقط المستخدم نفسه يمكنه المطالبة بهاتفه
  if (!user || !user.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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

    // 📝 Audit Log: Record phone claim
    await logAudit({
      userId: user.id,
      action: 'claim_phone_by_email',
      resourceType: 'registered_phone',
      resourceId: targetPhone.id,
      oldValues: { user_id: null },
      newValues: { user_id: user.id },
      details: { imei_last_4: imei.slice(-4) },
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Phone claimed successfully' });

  } catch (error) {
    console.error('Error claiming phone:', error);
    return sendError(res, 500, 'حدث خطأ في الخادم', error);
  }
});

// Polling worker: periodically query Supabase Admin users and process newly-confirmed users
const ENABLE_POLLING = String(process.env.ENABLE_POLLING || 'false').toLowerCase() === 'true';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 60 * 1000; // default 60s
const POLL_BATCH_LIMIT = Number(process.env.POLL_BATCH_LIMIT) || 50;

// Poller backoff: if we see repeated 403s, stop polling to avoid noisy logs.
let poller403Count = 0;
const POLLER_403_THRESHOLD = 5; // after 5 consecutive 403s, disable poller in-memory

async function pollConfirmedUsersOnce() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('[poller] SUPABASE_URL or SUPABASE_SERVICE_KEY missing, skipping poll');
    return;
  }

  try {
    const url = `${SUPABASE_URL.replace(/\/+$/, '')}/admin/v1/users?limit=${POLL_BATCH_LIMIT}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '<no-body>');
      console.warn('[poller] admin users fetch failed', resp.status, text);
      if (resp.status === 403) {
        poller403Count += 1;
        if (poller403Count >= POLLER_403_THRESHOLD) {
          console.error('[poller] too many 403 responses, disabling poller in-memory to prevent noise');
          // prevent further polling in this process
          return;
        }
      } else {
        // reset counter on non-403
        poller403Count = 0;
      }
      return;
    }

    const users = await resp.json();
    if (!Array.isArray(users) || users.length === 0) return;

    for (const user of users) {
      try {
        if (!user || !user.id) continue;
        if (!user.email_confirmed_at) continue; // only process confirmed users

        // Idempotency: skip if we've already created an application user
        const { data: existingUser, error: existingErr } = await supabase.from('users').select('id').eq('id', user.id).maybeSingle();
        if (existingErr) {
          console.warn('[poller] existing user check error', existingErr);
          continue;
        }
        if (existingUser) continue;

        const email = user.email || user.email_address || '';
        const metadata = user.user_metadata || {};
        // Prevent bringing `username` from auth metadata into application `users` rows
        try { if (metadata && typeof metadata === 'object') { delete metadata.username; } } catch (e) { }

        const owner_name = metadata.full_name || metadata.owner_name || '';
        const store_name = metadata.store_name || '';
        const phone = metadata.phone || '';
        const address = metadata.address || '';
        const business_type = metadata.business_type || '';
        const id_last6 = metadata.id_last6 || '';

        const encPhone = encryptObject(phone);
        const encFullName = encryptObject(owner_name);
        const encIdLast6 = encryptObject(id_last6);
        const encOwnerName = encryptObject(owner_name);
        const encAddress = encryptObject(address);

        const userRow = {
          id: user.id,
          email,
          full_name: encFullName,
          phone: encPhone,
          id_last6: encIdLast6,
          role: 'free_business'
        };

        const { error: userInsertError } = await supabase.from('users').insert(userRow);
        if (userInsertError) {
          console.error('[poller] users insert error:', userInsertError);
          continue;
        }

        const businessRow = {
          email,
          store_name,
          owner_name: encOwnerName,
          phone: encPhone,
          address: encAddress,
          business_type,
          id_last6: encIdLast6 ? JSON.stringify(encIdLast6) : null,
          user_id: user.id
        };

        const { error: businessInsertError } = await supabase.from('businesses').insert(businessRow);
        if (businessInsertError) {
          console.error('[poller] businesses insert error:', businessInsertError);
          // don't rollback user insert; log and continue
        } else {
          console.log('[poller] processed confirmed user', user.id, email);
        }

      } catch (inner) {
        console.error('[poller] error processing user', inner);
      }
    }

  } catch (e) {
    console.error('[poller] unexpected error', e);
  }
}

// Start the poller if enabled
if (ENABLE_POLLING) {
  console.log('[poller] ENABLE_POLLING=true -> starting Supabase confirmed-user poller, interval(ms)=', POLL_INTERVAL_MS);
  // run immediately then interval
  pollConfirmedUsersOnce().catch(e => console.error('[poller] initial run failed', e));
  setInterval(() => pollConfirmedUsersOnce().catch(e => console.error('[poller] run failed', e)), POLL_INTERVAL_MS);
} else {
  console.log('[poller] ENABLE_POLLING not enabled. To enable set ENABLE_POLLING=true in .env');
}

const PORT = process.env.PORT || 3000;

// Start server and attach robust error handlers to avoid unhandled 'error' events
const server = app.listen(PORT, () => console.log('Server listening on port', PORT));

server.on('error', (err) => {
  try {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Another process may be running.`);
      console.error('If you expect to run only one instance, stop the other process or change PORT.');
      // do not exit abruptly here; surface the error and keep process alive for debugging
    } else {
      console.error('Server error event:', err && err.stack ? err.stack : err);
    }
  } catch (e) {
    console.error('Error while handling server error event', e);
  }
});

// Global handlers to log uncaught exceptions and unhandled rejections. Do not force-exit
process.on('uncaughtException', (err) => {
  try {
    console.error('Uncaught exception (logged, process will NOT exit):', err && err.stack ? err.stack : err);
    // attempt graceful shutdown of server sockets so existing connections close
    try { server && server.close(); } catch (closeErr) { console.error('Error closing server after uncaughtException', closeErr); }
  } catch (e) {
    console.error('Error in uncaughtException handler', e);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  try {
    console.error('Unhandled rejection (logged, process will NOT exit). Promise:', promise, 'reason:', reason);
    try { server && server.close(); } catch (closeErr) { console.error('Error closing server after unhandledRejection', closeErr); }
  } catch (e) {
    console.error('Error in unhandledRejection handler', e);
  }
});

// Graceful shutdown on SIGINT/SIGTERM
['SIGINT', 'SIGTERM'].forEach(sig => {
  process.on(sig, () => {
    console.log(`Received ${sig}, shutting down server gracefully...`);
    try {
      server && server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
      // Force exit if not closed within timeout
      setTimeout(() => {
        console.warn('Force exiting after timeout');
        process.exit(1);
      }, 5000).unref();
    } catch (e) {
      console.error('Error during shutdown', e);
      process.exit(1);
    }
  });
});

// periodic heartbeat log to help detect silent exits
setInterval(() => {
  process.stdout.write('.');
}, 60 * 1000).unref();
