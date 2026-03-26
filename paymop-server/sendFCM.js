// كود Node.js لإرسال إشعار FCM عبر API V1 باستخدام Google Service Account
const { google } = require('googleapis');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());

// اسم ملف الخدمة كما رفعته في مشروع Render
const SERVICE_ACCOUNT_FILE = './firebase-service-account.json';
const PROJECT_ID = 'imeisafe-b2dd8';

// إعداد Google Auth
const auth = new google.auth.GoogleAuth({
  keyFile: SERVICE_ACCOUNT_FILE,
  scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
});

// دالة لإرسال إشعار FCM V1
async function sendFCMNotificationV1({ token, title, body, data }) {
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  const message = {
    message: {
      token,
      notification: { title, body },
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

// Endpoint API لإرسال إشعار FCM
app.post('/api/send-fcm-v1', async (req, res) => {
  try {
    const { token, title, body, data } = req.body;
    const result = await sendFCMNotificationV1({ token, title, body, data });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = app;
