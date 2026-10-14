import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import sharp from 'sharp';
import qrcode from 'qrcode';

const QR_BUCKET = 'registerphone';
const CARD_WIDTH = 1200;
const CARD_HEIGHT = 1800;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.resolve(__dirname, '../card-template.png');

export const generateQrToken = () => {
  return crypto.randomBytes(18).toString('base64url');
};

export const generateDeviceCode = () => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 10; i += 1) {
    const idx = crypto.randomInt(0, alphabet.length);
    code += alphabet[idx];
  }
  return code;
};

export const normalizeStoragePath = (value) => {
  if (!value) return null;
  let input = String(value).trim();
  if (input.startsWith('http')) {
    try {
      const url = new URL(input);
      const fullPath = url.pathname;
      const registerphoneSegment = '/registerphone/';
      const idx = fullPath.indexOf(registerphoneSegment);
      if (idx !== -1) {
        return fullPath.slice(idx + registerphoneSegment.length);
      }
      return fullPath.replace(/^\/+/, '');
    } catch (e) {
      input = input.replace(/^https?:\/\//, '');
    }
  }
  input = input.replace(/^\/+/, '');
  if (input.startsWith('registerphone/')) {
    return input.slice('registerphone/'.length);
  }
  return input;
};

export const generateQrImage = async (qrUrl) => {
  return qrcode.toBuffer(qrUrl, {
    type: 'png',
    width: 640,
    margin: 1,
    errorCorrectionLevel: 'H'
  });
};

export const generateRecoveryCard = async ({ qrUrl, deviceCode }) => {
  const qrBuffer = await generateQrImage(qrUrl);
  const background = fs.existsSync(TEMPLATE_PATH)
    ? await sharp(TEMPLATE_PATH).png().toBuffer()
    : await sharp({
        create: {
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          channels: 4,
          background: '#f8fafc'
        }
      }).png().toBuffer();

  // تحديد مكان وضع رمز QR في القالب (في المكان المخصص له)
  const qrPosition = {
    left: 160, // موضع X لرمز QR في القالب
    top: 580   // موضع Y لرمز QR في القالب
  };

  // إنشاء صورة لمعرف الجهاز كنص واضح باستخدام SVG
  const svgText = `
    <svg width="400" height="100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="rgba(255,255,255,0)" />
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="25" font-weight="bold" fill="#000000" text-anchor="middle" dominant-baseline="middle">
        ${deviceCode}
      </text>
    </svg>
  `;
  const deviceCodeImage = Buffer.from(svgText, 'utf-8');

  // تحديد مكان وضع رمز الجهاز في القالب (أسفل المنتصف)
  const deviceCodePosition = {
    left: 300, // موضع X لرمز الجهاز في القالب (تمركز أفقي)
    top: 1280  // موضع Y لرمز الجهاز في القالب (في الأسفل)
  };
const resizedQr = await sharp(qrBuffer)
  .resize(440, 440) // عدل المقاس حسب حجم الإطار
  .png()
  .toBuffer();
  // دمج جميع العناصر معًا
  return await sharp(background)
    .composite([
      {
        input: resizedQr,
        left: qrPosition.left,
        top: qrPosition.top
      },
      {
        input: deviceCodeImage,
        left: deviceCodePosition.left,
        top: deviceCodePosition.top
      }
    ])
    .png()
    .toBuffer();
};


export const uploadCard = async (supabase, storagePath, buffer) => {
  const { error } = await supabase.storage.from(QR_BUCKET).upload(storagePath, buffer, {
    contentType: 'image/png',
    upsert: true
  });
  if (error) {
    throw error;
  }
  return storagePath;
};

export const deleteOldCard = async (supabase, rawPath) => {
  const storagePath = normalizeStoragePath(rawPath);
  if (!storagePath) return;

  const { error } = await supabase.storage.from(QR_BUCKET).remove([storagePath]);
  if (error && !String(error.message || '').toLowerCase().includes('not found')) {
    console.warn('deleteOldCard error:', error);
  }
};

export const signStorageUrl = async (supabase, rawPath, expiresIn = 300) => {
  const storagePath = normalizeStoragePath(rawPath);
  if (!storagePath) return null;
  const { data, error } = await supabase.storage.from(QR_BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) {
    console.error('signStorageUrl error:', error);
    return null;
  }
  return data?.signedUrl || null;
};

export const createOrRefreshRecoveryCard = async (supabase, registeredPhone, { forceRefresh = false } = {}) => {
  const shouldRefresh = forceRefresh || !registeredPhone.qr_token || !registeredPhone.device_code || !registeredPhone.qr_card_url;

  const token = shouldRefresh ? generateQrToken() : registeredPhone.qr_token;
  const deviceCode = shouldRefresh ? generateDeviceCode() : registeredPhone.device_code;
  const qrUrl = `https://app.imei-safe.me/found/${token}`;
  const filePath = `qr-cards/${token}.png`;

  const cardBuffer = await generateRecoveryCard({ qrUrl, deviceCode });
  await uploadCard(supabase, filePath, cardBuffer);

  const previousPath = forceRefresh ? normalizeStoragePath(registeredPhone.qr_card_url) : null;
  if (forceRefresh && previousPath && previousPath !== filePath) {
    await deleteOldCard(supabase, previousPath);
  }

  const { data, error } = await supabase
    .from('registered_phones')
    .update({
      qr_token: token,
      device_code: deviceCode,
      qr_card_url: filePath,
      qr_created_at: new Date().toISOString()
    })
    .eq('id', registeredPhone.id)
    .select()
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

export const getRecoveryCard = async (supabase, registeredPhone) => {
  if (!registeredPhone.qr_token || !registeredPhone.device_code || !registeredPhone.qr_card_url) {
    return await createOrRefreshRecoveryCard(supabase, registeredPhone, { forceRefresh: false });
  }

  const signedUrl = await signStorageUrl(supabase, registeredPhone.qr_card_url);
  return {
    ...registeredPhone,
    qr_card_signed_url: signedUrl
  };
}
