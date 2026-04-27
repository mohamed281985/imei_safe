// CSRF Protection Middleware
import { doubleCsrf } from 'csrf-csrf';

const csrfSecret = process.env.CSRF_SECRET;
if (process.env.NODE_ENV === 'production' && (!csrfSecret || String(csrfSecret).length < 32)) {
  throw new Error('CSRF_SECRET is required in production and must be at least 32 characters.');
}

// تكوين CSRF protection
const { invalidCsrfTokenError, generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => csrfSecret || 'dev-only-csrf-secret-not-for-production',
  cookieName: 'x-csrf-token',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    // For deployed frontends on a different origin we need to allow cross-site
    // credentialed requests. Use 'none' in production (requires Secure).
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    httpOnly: true,
    // Optional: allow overriding cookie domain via env when needed
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {})
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS']
});

// middleware لحماية CSRF
export const csrfProtection = doubleCsrfProtection;

// middleware لإرجاع CSRF token
export const getCsrfToken = (req, res) => {
  const token = generateToken(req, res);
  res.json({ csrfToken: token });
};

// Error handler للـ CSRF errors
export const csrfErrorHandler = (err, req, res, next) => {
  if (err !== invalidCsrfTokenError) return next(err);

  // CSRF token errors
  res.status(403).json({
    error: 'Invalid or missing CSRF token',
    code: 'CSRF_INVALID'
  });
};

export default csrfProtection;
