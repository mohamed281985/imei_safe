import { fileURLToPath } from 'url';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { normalizeStoragePath, signStorageUrl, createOrRefreshRecoveryCard } from '../utils/qrCardUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildRecoveryCardResponse = async (supabase, phoneRow) => {
  const signedCardUrl = phoneRow.qr_card_url ? await signStorageUrl(supabase, phoneRow.qr_card_url) : null;
  return {
    id: phoneRow.id,
    qr_token: phoneRow.qr_token,
    device_code: phoneRow.device_code,
    qr_card_url: signedCardUrl,
    qr_created_at: phoneRow.qr_created_at,
    phone_type: phoneRow.phone_type,
    status: phoneRow.status,
    phone_image_url: phoneRow.phone_image_url,
    is_transferred: phoneRow.status === 'transferred' || phoneRow.status === 'sold',
    is_rejected: phoneRow.status === 'rejected' // إضافة حالة الرفض
  };
};

const fetchRegisteredPhoneById = async (supabase, id) => {
  const { data, error } = await supabase
    .from('registered_phones')
    .select('id, user_id, qr_token, device_code, qr_card_url, qr_created_at, phone_type, status, phone_image_url, imei, imei_hash, owner_name')
    .eq('id', id)
    .neq('status', 'rejected') // استبعاد الهواتف المرفوضة
    .maybeSingle();

  if (error) throw error;
  return data;
};

const fetchRegisteredPhoneByToken = async (supabase, qrToken) => {
  const { data, error } = await supabase
    .from('registered_phones')
    .select('id, user_id, qr_token, device_code, qr_card_url, qr_created_at, phone_type, status, phone_image_url, imei, imei_hash, owner_name')
    .eq('qr_token', qrToken)
    .neq('status', 'rejected') // استبعاد الهواتف المرفوضة
    .maybeSingle();

  if (error) throw error;
  return data;
};

const findActiveReportForPhone = async (supabase, registeredPhone, decryptField, normalizeDigitsOnly) => {
  if (!registeredPhone) return false;
  if (registeredPhone.imei_hash) {
    const { data, error } = await supabase
      .from('phone_reports')
      .select('id')
      .eq('imei_hash', registeredPhone.imei_hash)
      .eq('status', 'active')
      .limit(1);
    if (!error && data && data.length > 0) return true;
  }

  try {
    const { data: reports, error } = await supabase
      .from('phone_reports')
      .select('imei')
      .eq('status', 'active');
    if (error) return false;

    const registeredImei = registeredPhone.imei ? decryptField(registeredPhone.imei) : null;
    const normalizedPhoneImei = registeredImei ? normalizeDigitsOnly(registeredImei) : null;
    if (!normalizedPhoneImei) return false;

    return (reports || []).some((report) => {
      const reportImei = report?.imei ? decryptField(report.imei) : null;
      const normalizedReportImei = reportImei ? normalizeDigitsOnly(reportImei) : null;
      return normalizedReportImei && normalizedReportImei === normalizedPhoneImei;
    });
  } catch (err) {
    console.error('findActiveReportForPhone lookup failed:', err);
    return false;
  }
};

const normalizeDigitsOnlyIfPossible = (value) => {
  if (!value || typeof value !== 'string') return null;
  return value.replace(/\D+/g, '') || null;
};

// ✅ التحقق من أن owner_name في registered_phones يطابق المستخدم الحالي (لعرض البطاقات)
const isPhoneOwnerForUser = async (supabase, phoneRow, userId, decryptField) => {
  if (!phoneRow || !phoneRow.owner_name || !userId) {
    return false;
  }

  try {
    // جلب اسم المستخدم الحالي من جدول users
    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('id', userId)
      .maybeSingle();

    if (userErr || !userRow) {
      console.warn('isPhoneOwnerForUser: Failed to fetch user:', userErr);
      return false;
    }

    // فك تشفير owner_name من البطاقة
    let decryptedOwnerName = '';
    try {
      decryptedOwnerName = decryptField(phoneRow.owner_name) || phoneRow.owner_name || '';
    } catch (decErr) {
      console.error('isPhoneOwnerForUser: Failed to decrypt owner_name:', decErr);
      decryptedOwnerName = phoneRow.owner_name || '';
    }

    // مقارنة الأسماء (حساس للأحرف الكبيرة والصغيرة بعد تنظيفها)
    const normalizedDecrypted = String(decryptedOwnerName).trim().toLowerCase();
    const normalizedUser = String(userRow.full_name || '').trim().toLowerCase();

    const match = normalizedDecrypted === normalizedUser || normalizedDecrypted.includes(normalizedUser) || normalizedUser.includes(normalizedDecrypted);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`isPhoneOwnerForUser: userId=${userId}, match=${match}, decrypted="${normalizedDecrypted}", user="${normalizedUser}"`);
    }

    return match;
  } catch (err) {
    console.error('isPhoneOwnerForUser error:', err);
    return false;
  }
};

export function registerQrRoutes({ app, supabase, verifyJwtToken, sendError, decryptField, normalizeDigitsOnly, encryptAES, logAudit, sendFCMNotificationV1 }) {
  const foundContactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${req.ip}:${String(req.params.token || '').slice(0, 128)}`,
    handler: (_req, res) => res.status(429).json({ success: false, message: 'محاولات كثيرة، حاول لاحقًا' })
  });

  app.get('/api/recovery-card/:phoneId', verifyJwtToken, async (req, res) => {
    try {
      const phoneId = req.params.phoneId;
      if (!phoneId) return res.status(400).json({ error: 'phoneId required' });

      const phone = await fetchRegisteredPhoneById(supabase, phoneId);
      if (!phone) return res.status(404).json({ error: 'Phone not found' });

      // ✅ التحقق الأساسي: المستخدم يجب أن يكون هو صاحب السجل (user_id)
     if (phone.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

     

      const hasRequiredQr = phone.qr_token && phone.device_code && phone.qr_card_url;
      const updatedPhone = hasRequiredQr ? phone : await createOrRefreshRecoveryCard(supabase, phone, { forceRefresh: false });
      const response = await buildRecoveryCardResponse(supabase, updatedPhone);

      return res.json({ success: true, data: response });
    } catch (err) {
      console.error('/api/recovery-card error:', err);
      return sendError(res, 500, 'حدث خطأ في الخادم', err);
    }
  });

  app.post('/api/recovery-card/:phoneId/refresh', verifyJwtToken, async (req, res) => {
    try {
      const phoneId = req.params.phoneId;
      if (!phoneId) return res.status(400).json({ error: 'phoneId required' });

      const phone = await fetchRegisteredPhoneById(supabase, phoneId);
      if (!phone) return res.status(404).json({ error: 'Phone not found' });
      
      // ✅ التحقق الأساسي: المستخدم يجب أن يكون هو صاحب السجل (user_id)
      if (phone.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

      // ✅ التحقق من owner_name: يجب أن يطابق المستخدم الحالي
      const isOwner = await isPhoneOwnerForUser(supabase, phone, req.user.id, decryptField);
      if (!isOwner) {
        const statusLower = String(phone.status || '').trim().toLowerCase();
        if (['transferred', 'sold'].includes(statusLower)) {
          return res.status(403).json({ error: 'owner_name does not match current user' });
        }
        return res.status(403).json({ error: 'Forbidden: Not the phone owner' });
      }

      const refreshed = await createOrRefreshRecoveryCard(supabase, phone, { forceRefresh: true });
      const response = await buildRecoveryCardResponse(supabase, refreshed);

      return res.json({ success: true, data: response });
    } catch (err) {
      console.error('/api/recovery-card/refresh error:', err);
      return sendError(res, 500, 'حدث خطأ في الخادم', err);
    }
  });
app.get('/api/found/:token', async (req, res) => {
  try {
    const token = req.params.token;
    if (!token) {
      return res.status(404).json({ success: false, message: 'Invalid QR Code' });
    }

    // Query only required fields from registered_phones
    const { data: phone, error: phoneErr } = await supabase
      .from('registered_phones')
      .select('id, imei, imei_hash, owner_name, phone_number, device_code, status, phone_type, phone_image_url')
      .eq('qr_token', token)
      .maybeSingle();

    if (phoneErr) {
      console.error('/api/found registered_phones query error:', phoneErr);
      return sendError(res, 500, 'Server error', phoneErr);
    }

    if (!phone || !phone.id) {
      return res.status(404).json({ success: false, message: 'Invalid QR Code' });
    }

    const statusLower = String(phone.status || '').trim().toLowerCase();
    
    // الباركود الجديد للمشتري يبقى صالحًا بعد النقل (status=sold).
    // أما الباركودات القديمة المنقولة أو المرفوضة فتبقى غير صالحة.
    if (['rejected', 'transferred'].includes(statusLower)) {
      return res.status(404).json({ success: false, message: 'Invalid QR Code' });
    }

    // ابحث بالهاش أولًا، ثم استخدم فك تشفير IMEI كحل للبلاغات القديمة التي لا تحتوي هاش.
    let reported = false;
    let whatsapp_enabled = false;
    let whatsapp_number = null;

    try {
      let repRows = [];
      if (phone.imei_hash) {
        const { data, error: repErr } = await supabase
          .from('phone_reports')
          .select('imei, imei_hash, whatsapp, anther_number')
          .eq('imei_hash', phone.imei_hash)
          .eq('status', 'active')
          .limit(1);

        if (repErr) {
          console.error('/api/found phone_reports query error:', repErr);
          return sendError(res, 500, 'Server error', repErr);
        }

        repRows = data || [];
      }

      if (repRows.length === 0) {
        const { data, error: legacyError } = await supabase
          .from('phone_reports')
          .select('imei, imei_hash, whatsapp, anther_number')
          .eq('status', 'active');
        if (legacyError) throw legacyError;

        const phoneImei = normalizeDigitsOnly(decryptField(phone.imei || ''));
        repRows = (data || []).filter((row) => {
          if (phone.imei_hash && row.imei_hash === phone.imei_hash) return true;
          return phoneImei && normalizeDigitsOnly(decryptField(row.imei)) === phoneImei;
        }).slice(0, 1);
      }

      if (repRows.length > 0) {
          reported = true;
          const r = repRows[0];
          whatsapp_enabled = !!r.whatsapp;
          if (whatsapp_enabled && r.anther_number) {
            try {
              whatsapp_number = decryptField(r.anther_number) || r.anther_number;
            } catch (decErr) {
              console.error('/api/found decrypt phone_reports.anther_number error:', decErr);
              whatsapp_number = r.anther_number;
            }
          }
        }
    } catch (err) {
      console.error('/api/found phone_reports lookup failed:', err);
      return sendError(res, 500, 'Server error', err);
    }

    if (!reported) {
      return res.json({
        success: true,
        reported: false,
        has_active_report: false,
        phone_type: phone.phone_type || null,
        status: phone.status || null,
        phone_image_url: phone.phone_image_url || null,
        message: 'هذا الهاتف غير مسجل به إخطار فقد حتى الآن.'
      });
    }

    // Decrypt only allowed fields when there is an active report
    let ownerName = '';
    try {
      if (phone.owner_name) ownerName = decryptField(phone.owner_name) || phone.owner_name;
    } catch (decErr) {
      console.error('/api/found decrypt owner_name error:', decErr);
      ownerName = phone.owner_name || '';
    }

    let ownerPhone = '';
    try {
      if (phone.phone_number) ownerPhone = decryptField(phone.phone_number) || phone.phone_number;
    } catch (decErr) {
      console.error('/api/found decrypt phone_number error:', decErr);
      ownerPhone = phone.phone_number || '';
    }

    return res.json({
      success: true,
      reported: true,
      has_active_report: true,
      phone_type: phone.phone_type || null,
      status: phone.status || null,
      phone_image_url: phone.phone_image_url || null,
      owner_name: ownerName,
      phone: ownerPhone,
        owner_contact_available: Boolean(ownerPhone),
      device_code: phone.device_code || '',
      whatsapp_enabled,
      whatsapp_number
    });
  } catch (err) {
    console.error('/api/found/:token error:', err);
    return sendError(res, 500, 'Server error', err);
  }
});


  app.post('/api/found/:qrToken/notify-owner', async (req, res) => {
    try {
      const qrToken = req.params.qrToken;
      if (!qrToken) return res.status(400).json({ error: 'qrToken required' });

      const phone = await fetchRegisteredPhoneByToken(supabase, qrToken);
      if (!phone) return res.status(404).json({ error: 'Token not found' });
      if (!phone.user_id) return res.status(404).json({ error: 'Owner not available' });

      const { data: owner, error: ownerError } = await supabase
        .from('users')
        .select('id, fcm_token, language, role')
        .eq('id', phone.user_id)
        .maybeSingle();

      if (ownerError) throw ownerError;
      if (!owner) return res.status(404).json({ error: 'Owner not found' });

      const language = (owner.language || 'ar').toString().slice(0, 2).toLowerCase();
      const message = language === 'en'
        ? 'Your lost phone recovery card was scanned. Someone found your phone.'
        : 'تم مسح بطاقة استرداد هاتفك المفقود. يبدو أن شخصًا عثر على هاتفك.';
      const title = language === 'en' ? 'Your Phone Was Found' : 'تم العثور على هاتفك';

      let notifyInApp = true;
      let notifyPush = Boolean(owner.fcm_token);
      try {
        const { data: plan } = await supabase
          .from('plans')
          .select('notify_in_app, notify_push')
          .eq('type', owner.role)
          .maybeSingle();
        if (plan) {
          notifyInApp = plan.notify_in_app !== false;
          notifyPush = plan.notify_push === true && Boolean(owner.fcm_token);
        }
      } catch (planError) {
        console.warn('/api/found/:qrToken/notify-owner plan lookup failed:', planError?.message || planError);
      }

      if (notifyPush && owner.fcm_token) {
        await sendFCMNotificationV1({ token: owner.fcm_token, title, body: message });
      }

      if (notifyInApp) {
        const { error: notificationError } = await supabase.from('notifications').insert({
          user_id: owner.id,
          title,
          body: message,
          type: 'phone_found',
          is_read: false,
          created_at: new Date().toISOString(),
          metadata: { source: 'qr_scan', registered_phone_id: phone.id }
        });
        if (notificationError) throw notificationError;
      }

      await logAudit({
        userId: null,
        action: 'qr_token_notify_owner',
        resourceType: 'registered_phone',
        resourceId: phone.id,
        details: { qr_token: qrToken },
        ip: req.headers['x-forwarded-for']?.split(',')[0] || req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        status: 'success'
      });

      return res.json({ success: true });
    } catch (err) {
      console.error('/api/found/:qrToken/notify-owner error:', err);
      return sendError(res, 500, 'Server error', err);
    }
  });

  app.post('/api/found/:token/contact', foundContactLimiter, async (req, res) => {
    try {
      const token = String(req.params.token || '').trim();
      const finderPhone = String(req.body?.finderPhone || '').replace(/\D/g, '');
      const captchaToken = String(req.body?.captchaToken || '').trim();
      const turnstileSecret = String(process.env.TURNSTILE_SECRET_KEY || '').trim();

      if (!token || !/^\d{7,15}$/.test(finderPhone) || !captchaToken) {
        return res.status(400).json({ success: false, message: 'البيانات المطلوبة غير صحيحة' });
      }
      if (!turnstileSecret) {
        console.error('/api/found/:token/contact: TURNSTILE_SECRET_KEY is not configured');
        return res.status(503).json({ success: false, message: 'الخدمة غير متاحة حاليًا' });
      }

      const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: turnstileSecret, response: captchaToken, remoteip: req.ip })
      });
      const turnstileResult = await turnstileResponse.json();
      if (!turnstileResponse.ok || !turnstileResult?.success) {
        return res.status(400).json({ success: false, message: 'فشل التحقق الأمني' });
      }

      const { data: phone, error: phoneError } = await supabase
        .from('registered_phones')
        .select('id, imei, imei_hash, user_id, qr_token')
        .eq('qr_token', token)
        .maybeSingle();
      if (phoneError) throw phoneError;
      if (!phone) return res.status(404).json({ success: false, message: 'رمز QR غير صالح' });

      let report = null;
      if (phone.imei_hash) {
        const { data: hashedReports, error: reportError } = await supabase
          .from('phone_reports')
          .select('id, user_id, imei, imei_hash, status, anther_number, finder_phone')
          .eq('imei_hash', phone.imei_hash)
          .eq('status', 'active')
          .limit(1);
        if (reportError) throw reportError;
        report = hashedReports?.[0] || null;
      }

      if (!report && phone.imei) {
        const { data: reports, error: legacyError } = await supabase
          .from('phone_reports')
          .select('id, user_id, imei, imei_hash, status, anther_number, finder_phone')
          .eq('status', 'active');
        if (legacyError) throw legacyError;
        const phoneImei = normalizeDigitsOnly(decryptField(phone.imei));
        report = (reports || []).find((candidate) => (
          phoneImei && normalizeDigitsOnly(decryptField(candidate.imei)) === phoneImei
        )) || null;
      }

      if (!report || !report.user_id || report.anther_number || report.finder_phone) {
        return res.status(409).json({ success: false, message: 'لا يمكن إرسال الإشعار لهذا الهاتف' });
      }

      const encryptedFinderPhone = encryptAES(finderPhone);
      const finderPhoneValue = JSON.stringify({
        encryptedData: encryptedFinderPhone.encryptedData,
        iv: encryptedFinderPhone.iv,
        authTag: encryptedFinderPhone.authTag
      });
      const { data: updatedReport, error: updateError } = await supabase
        .from('phone_reports')
        .update({ finder_phone: finderPhoneValue })
        .eq('id', report.id)
        .is('finder_phone', null)
        .select('id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updatedReport) {
        return res.status(409).json({ success: false, message: 'تم إرسال الإشعار مسبقًا' });
      }

      const { error: notificationError } = await supabase.from('notifications').insert({
        user_id: report.user_id,
        title: 'تم العثور على هاتفك',
        body: 'تم العثور على هاتفك. يوجد رقم للتواصل مع الشخص الذي وجده.',
        type: 'phone_found',
        notification_type: 'phone_found',
        is_read: false,
        created_at: new Date().toISOString(),
        metadata: { source: 'qr_contact', registered_phone_id: phone.id }
      });
      if (notificationError) throw notificationError;

      return res.json({ success: true, message: 'تم إرسال الإشعار' });
    } catch (err) {
      console.error('/api/found/:token/contact error:', err);
      return sendError(res, 500, 'حدث خطأ في الخادم', err, { success: false });
    }
  });

  app.post('/api/found/:qrToken/location', async (req, res) => {
    try {
      const qrToken = req.params.qrToken;
      const { latitude, longitude } = req.body || {};
      if (!qrToken) return res.status(400).json({ error: 'qrToken required' });
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({ error: 'latitude and longitude are required as numbers' });
      }

      const phone = await fetchRegisteredPhoneByToken(supabase, qrToken);
      if (!phone) return res.status(404).json({ error: 'Token not found' });
      if (!phone.user_id) return res.status(404).json({ error: 'Owner not available' });

      const { data: owner, error: ownerError } = await supabase
        .from('users')
        .select('id, fcm_token, language')
        .eq('id', phone.user_id)
        .maybeSingle();
      if (ownerError) throw ownerError;
      if (!owner) return res.status(404).json({ error: 'Owner not found' });

      const locationUrl = `https://maps.google.com?q=${encodeURIComponent(`${latitude},${longitude}`)}`;
      const language = (owner.language || 'ar').toString().slice(0, 2).toLowerCase();
      const title = language === 'en' ? 'Phone Location Shared' : 'موقع الهاتف تم إرساله';
      const body = language === 'en'
        ? `A location was shared by the finder: ${locationUrl}`
        : `تم إرسال موقع جديد من قبل الشخص الذي عثر على الهاتف: ${locationUrl}`;

      if (owner.fcm_token) {
        await sendFCMNotificationV1({ token: owner.fcm_token, title, body });
      }

      await supabase.from('notifications').insert({
        user_id: owner.id,
        title,
        body,
        type: 'qr_location_shared',
        is_read: false,
        created_at: new Date().toISOString()
      });

      await logAudit({
        userId: null,
        action: 'qr_token_location_shared',
        resourceType: 'registered_phone',
        resourceId: phone.id,
        details: { qr_token: qrToken, latitude, longitude },
        ip: req.headers['x-forwarded-for']?.split(',')[0] || req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        status: 'success'
      });

      return res.json({ success: true });
    } catch (err) {
      console.error('/api/found/:qrToken/location error:', err);
      return sendError(res, 500, 'Server error', err);
    }
  });
}
