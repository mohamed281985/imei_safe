if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || String(process.env.SESSION_SECRET).length < 32)) {
  throw new Error('SESSION_SECRET is required in production and must be at least 32 characters.');
}

// Security Configuration
export const SECURITY_CONFIG = {
  // CORS
  ALLOWED_ORIGINS: [
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:8081',
    'https://imei-safe.me',
    'capacitor://localhost',
    'https://localhost'
  ],

  // Rate Limiting - TIGHTENED
  RATE_LIMITS: {
    GLOBAL: {
      windowMs: 60 * 1000, // 1 دقيقة
      max: 100 // من 200 (تشديد)
    },
    CREATE_APP_USER: {
      windowMs: 24 * 60 * 60 * 1000, // 24 ساعة
      max: 5 // من 20 (تشديد كثير)
    },
    LOGIN: {
      windowMs: 15 * 60 * 1000, // 15 دقيقة
      max: 5 // محاولات تسجيل دخول
    },
    SEARCH_IMEI: {
      windowMs: 60 * 1000, // 1 دقيقة
      max: 20
    },
    PAYMENT: {
      windowMs: 15 * 60 * 1000, // 15 دقيقة
      max: 5 // من 10 (تشديد)
    }
  },

  // Security Headers
  SECURITY_HEADERS: {
    HSTS: {
      maxAge: 31536000, // سنة
      includeSubDomains: true,
      preload: true
    },
    CSP: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imageSrc: ["'self'", "data:", "https:"],
      frameSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },

  // Session
  SESSION: {
    secret: process.env.SESSION_SECRET || 'dev-only-session-secret-not-for-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 ساعة
    }
  },

  // File Upload
  FILE_UPLOAD: {
    MAX_SIZE_BYTES: 5 * 1024 * 1024, // 5 MB
    ALLOWED_MIME_TYPES: [
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  },

  // Encryption
  ENCRYPTION: {
    ALGORITHM: 'aes-256-gcm',
    IV_LENGTH: 12, // 96-bit nonce
    AUTH_TAG_LENGTH: 16
  }
};

export default SECURITY_CONFIG;
