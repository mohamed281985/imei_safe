import { supabase } from './supabase';

interface SendFcmPayload {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

/**
 * إرسال FCM يتم عبر السيرفر فقط.
 * لا يتم تمرير أي مفاتيح حساسة من الواجهة.
 */
export async function sendFCMNotification({ to, title, body, data }: SendFcmPayload) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    throw new Error('Unauthorized: missing access token');
  }

  const apiBase = import.meta.env.VITE_API_BASE_URL || 'https://imei-safe.me';
  const res = await fetch(`${apiBase}/api/send-fcm-v1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      token: to,
      title,
      body,
      data: data || {},
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`FCM proxy error: ${errorText}`);
  }

  return res.json();
}
