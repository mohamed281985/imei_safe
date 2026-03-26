// دالة محسنة لإرسال إشعار FCM عبر REST API
export async function sendFCMNotification({ to, title, body, data }: {
  to: string;
  title: string;
  body: string;
  data?: any;
}) {
  const serverKey = import.meta.env.VITE_FCM_SERVER_KEY || process.env.VITE_FCM_SERVER_KEY;
  if (!serverKey) throw new Error('FCM server key is missing');

  const payload = {
    to,
    notification: {
      title,
      body,
      priority: 'high',
      sound: 'default',
    },
    data: data || {},
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        default_vibrate_timings: true,
        default_light_settings: true,
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
          contentAvailable: true,
        },
      },
    },
    ttl: 86400000, // 24 ساعة
  };

  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `key=${serverKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`FCM Error: ${error}`);
  }
  return await res.json();
}
