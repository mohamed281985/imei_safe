import admin from 'firebase-admin';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

if (!admin.apps.length) {
  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error('Missing Firebase Admin environment variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, '\n')
    })
  });
}

export default admin;
