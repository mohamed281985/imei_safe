import { Resend } from 'resend';
import { safeError } from './scripts/logging.js';

// التحقق من وجود مفتاح API
if (!process.env.RESEND_API_KEY) {
  safeError('resend:init', 'RESEND_API_KEY is not defined in environment variables');
  process.exit(1);
}

const resend = new Resend(process.env.RESEND_API_KEY);

export default resend;
