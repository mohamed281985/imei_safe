// CSRF Protection Middleware
import csrf from 'csurf';

// تكوين CSRF protection مع session storage
export const csrfProtection = csrf({ cookie: false });

// middleware لإرجاع CSRF token
export const getCsrfToken = (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
};

// Error handler للـ CSRF errors
export const csrfErrorHandler = (err, req, res, next) => {
  if (err.code !== 'EBADCSRFTOKEN') return next(err);
  
  // CSRF token errors
  res.status(403).json({ 
    error: 'Invalid or missing CSRF token',
    code: 'CSRF_INVALID'
  });
};

export default csrfProtection;
