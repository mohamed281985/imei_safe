// CSRF Protection Middleware
import { doubleCsrf } from 'csrf-csrf';

// تكوين CSRF protection
const { invalidCsrfTokenError, generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'default-secret-change-in-production',
  cookieName: 'x-csrf-token',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    httpOnly: true
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