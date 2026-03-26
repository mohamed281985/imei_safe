import { Resend } from 'resend';

// التحقق من وجود مفتاح API
if (!process.env.RESEND_API_KEY) {
  console.error('RESEND_API_KEY is not defined in environment variables');
  process.exit(1);
}

const resend = new Resend(process.env.RESEND_API_KEY);

export default resend;
