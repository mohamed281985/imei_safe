import { validateImageFile } from '../utils/imageValidator.js';
import { SECURITY_CONFIG } from '../config/security.js';

export function registerReportRoutes({
  app,
  supabase,
  verifyJwtToken,
  decryptField,
  encryptAES,
  hashPasswordForStorage,
  sendError,
  logAudit: rawLogAudit,
  sendFCMNotificationV1,
  resend,
  crypto
}, getTranslations) {
  const logAudit = (config) => rawLogAudit({ supabase, ...config });

  const normalizeDigitsOnly = (s) => {
    if (s === null || s === undefined) return '';
    try {
      return String(s).replace(/\D/g, '');
    } catch (e) {
      return '';
    }
  };

  const getImeiHash = (imei) => {
    try {
      const normalized = normalizeDigitsOnly(imei);
      if (!normalized) return null;
      return crypto.createHash('sha256').update(String(normalized)).digest('hex');
    } catch (e) {
      console.error('reportRoutes.getImeiHash error:', e);
      return null;
    }
  };

  app.get('/api/lost-phones', verifyJwtToken, async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // جلب الحقول المشفرة من قاعدة البيانات (اقتصر على 50 سجل لتفادي التحميل الزائد)
      const { data, error } = await supabase
        .from('phone_reports')
        .select('phone_type')
        .eq('status', 'active')
        .order('report_date', { ascending: false })
        .limit(50);

      // Diagnostic logging (dev only): surface supabase error and returned row count
      if (process.env.NODE_ENV !== 'production') {
        console.log('/api/lost-phones supabase fetch error:', error ? (error.message || error) : null);
        console.log('/api/lost-phones rows:', Array.isArray(data) ? data.length : typeof data);
      }

      if (error) {
        console.error('Supabase error fetching lost phones:', error);
        return res.status(500).json({ error: 'Database error' });
      }

      // فك تشفير الحقول وإرجاع الشكل المطلوب
      const result = (data || []).map(row => {
        let phone_type = decryptField(row.phone_type);

        // إذا لم يُفكّ phone_type، حاول استخدام القيمة الخام أو نص افتراضي
        if (!phone_type) {
          phone_type = (row.phone_type && typeof row.phone_type === 'string') ? row.phone_type : 'غير محدد';
        }

        return { phone_type };
      }).filter(item => item.phone_type);

      return res.json(result);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') console.error('Error in /api/lost-phones:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/report-lost-phone', verifyJwtToken, async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
      }
      const data = { ...(req.body || {}) };
      data.user_id = req.user?.id || null;
      data.email = req.user?.email || data.email || '';
      const PLACEHOLDER_REGISTERED = 'مسجل بالنظام';
      let registeredPhoneForReport = null;

      // Diagnostic: log presence/format of image URLs to help debug 400 errors
      try {
        const caller = req.user?.id || 'unknown';
        console.log(`/api/report-lost-phone called by=${caller} receipt_image_url_present=${!!data.receipt_image_url} report_image_url_present=${!!data.report_image_url}`);
        if (process.env.NODE_ENV !== 'production') {
          console.log('Payload keys:', Object.keys(req.body || {}).join(','));
        }
      } catch (e) {
        // ignore logging failures
      }

      // تحقق من روابط الصور (الفاتورة والمحضر) — سنجري التحقق بعد تعبئة القيم من
      // registered_phones لأن الواجهة قد ترسل placeholders بدلاً من رابط الفاتورة.
     const isValidImageUrl = (url) => {
  if (!url || typeof url !== "string") return false;

  if (url.startsWith("reports/")) return true;

  if (
    url.startsWith("https://") &&
    url.includes("/storage/v1/object/sign/")
  ) return true;

  if (
    url.startsWith("https://") &&
    url.includes("/storage/v1/object/public/")
  ) return true;

  if (url.startsWith("registerphone/")) return true;

  if (url.startsWith("phone-images/")) return true;

  // اسم الملف فقط
  if (!url.includes("/") && /\.(jpg|jpeg|png|webp)$/i.test(url))
    return true;

  return false;
};

      // التحقق مما إذا كان الهاتف مسجلاً ومنع غير المالك من تقديم البلاغ
      if (data.imei) {
        // تطبيع الـ IMEI الوارد (أزل كل غير الأرقام) لمطابقة أكثر مرونة
        const incomingImei = String(data.imei || '').replace(/\D/g, '');
        const { data: phones } = await supabase.from('registered_phones').select('*');
        const registeredPhone = phones ? phones.find(p => {
          const stored = decryptField(p.imei) || '';
          const normalizedStored = String(stored).replace(/\D/g, '');
          return normalizedStored === incomingImei;
        }) : null;

        if (registeredPhone) {
          registeredPhoneForReport = registeredPhone;
          // تحديد معرف المرسل: إذا جاء عبر التوكن استخدم req.user، وإلا احترم الحقل المرسَل (إن وُجد)
          const requesterId = (req && req.user && req.user.id) ? req.user.id : (data.user_id || null);

          // إذا كانت الحالة 'transferred' فالمستخدم تخلى عن الهاتف — لا يسمح لأي شخص بتقديم بلاغ
          if (registeredPhone.status === 'transferred') {
            return res.status(403).json({ success: false, error: 'تم التخلي عن هذا الهاتف ولا يمكن تقديم بلاغ عليه.' });
          }
          // إذا كانت الحالة 'sold' فتم نقل الملكية — فقط المشتري الجديد يقدر يقدم بلاغ
          if (registeredPhone.status === 'sold') {
            if (!requesterId || registeredPhone.user_id !== requesterId) {
              return res.status(403).json({ success: false, error: 'فقط المالك الجديد يمكنه تقديم البلاغ.' });
            }
            // المشتري الجديد يقدر يقدم بلاغ
          } else {
            // الحالة الاعتيادية: تأكد أن المرسل هو المالك المسجّل
            if (!requesterId || registeredPhone.user_id !== requesterId) {
              return res.status(403).json({ success: false, error: 'فقط صاحب الهاتف يمكنه تقديم البلاغ' });
            }
          }
        }
      }

      // إذا كانت الواجهة أرسلت placeholders (مسجل بالنظام)، استبدلها بالقيم الفعلية من registered_phones
      // ثم قم بتشفيرها وحفظها في phone_reports.
      if (registeredPhoneForReport) {
        try {
          const ownerNameReal = decryptField(registeredPhoneForReport.owner_name) || registeredPhoneForReport.owner_name;
          const phoneReal = decryptField(registeredPhoneForReport.phone_number) || registeredPhoneForReport.phone_number;
          const idLast6Real = decryptField(registeredPhoneForReport.id_last6) || registeredPhoneForReport.id_last6;
          const phoneTypeReal = registeredPhoneForReport.phone_type || null;

          // احفظ القيم الحقيقية دائماً عندما تكون متوفرة في سجل registered_phones
          if (ownerNameReal) data.ownerName = ownerNameReal;
          if (phoneReal) data.phoneNumber = phoneReal;
          if (idLast6Real) data.idLast6 = idLast6Real;
          if (phoneTypeReal) data.phone_type = phoneTypeReal;
          // إذا كانت صورة الفاتورة محفوظة في سجل registered_phones، استخدمها كقيمة افتراضية
          if (registeredPhoneForReport) {
            data.receipt_image_url = registeredPhoneForReport.receipt_image_url;
          }

        } catch (e) {
          console.error('Error processing registered phone data:', e);
        }
      }
console.log("================================");
console.log("receipt_image_url:", data.receipt_image_url);
console.log("typeof:", typeof data.receipt_image_url);
console.log("exists:", "receipt_image_url" in data);
console.log("isValid:", isValidImageUrl(data.receipt_image_url));
console.log("================================");
      // الآن بعد تعبئة الحقول من registered_phones، نفّذ تحقق روابط الصور النهائي
      if (
        !('receipt_image_url' in data) ||
        !data.receipt_image_url ||
        !isValidImageUrl(data.receipt_image_url)
      ) {
        return res.status(400).json({
          success: false,
          error: 'يجب رفع صورة الفاتورة بشكل صحيح'
        });
      }

      if (
        'report_image_url' in data &&
        data.report_image_url &&
        !isValidImageUrl(data.report_image_url)
      ) {
        return res.status(400).json({
          success: false,
          error: 'صورة المحضر غير صالحة أو لم يتم رفعها بشكل صحيح'
        });
      }
      else {
        // quick mode: allow missing images, but ensure expiry is set (default to 48 hours)
        try {
          if (!data.expiry) {
            data.expiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
          }
        } catch (e) {
          // ignore
        }

        // If no images are provided in quick mode, do not include empty image fields in the insert payload.
        if (!data.receipt_image_url) {
          delete data.receipt_image_url;
        }
        if (!data.report_image_url) {
          delete data.report_image_url;
        }
      }
      // تشفير كلمة المرور قبل الحفظ (bcrypt)
      if (data.password) {
        data.password = await hashPasswordForStorage(data.password);
      }

      // تشفير الحقول الحساسة
      if (data.imei) {
        // تسجيل هاش للايمي (SHA-256) باستخدام الأرقام فقط
        const imeiHash = getImeiHash(data.imei);
        if (imeiHash) data.imei_hash = imeiHash;

        // حفظ نسخة مقنّعة قابلة للعرض (masked_imei)
        try {
          const digitsOnly = String(data.imei || '').replace(/\D/g, '');
          if (digitsOnly) {
            const shown = digitsOnly.slice(0, 6);
            const masked = shown + '*'.repeat(Math.max(0, 15 - shown.length));
            data.masked_imei = masked;
          }
        } catch (e) {
          console.warn('Warning: failed to compute masked_imei', e);
        }

        const encryptedImei = encryptAES(data.imei);
        if (!encryptedImei) {
          return res.status(400).json({ success: false, error: 'فشل تشفير رقم IMEI' });
        }
        data.imei = JSON.stringify({ encryptedData: encryptedImei.encryptedData, iv: encryptedImei.iv, authTag: encryptedImei.authTag });
      }
      if (data.ownerName) {
        const encryptedOwner = encryptAES(data.ownerName);
        if (!encryptedOwner) {
          return res.status(400).json({ success: false, error: 'فشل تشفير اسم المالك' });
        }
        data.owner_name = JSON.stringify({ encryptedData: encryptedOwner.encryptedData, iv: encryptedOwner.iv, authTag: encryptedOwner.authTag });
        delete data.ownerName;
      }
      if (data.phoneNumber) {
        const encryptedPhone = encryptAES(data.phoneNumber);
        if (!encryptedPhone) {
          return res.status(400).json({ success: false, error: 'فشل تشفير رقم الهاتف' });
        }
        data.phone_number = JSON.stringify({ encryptedData: encryptedPhone.encryptedData, iv: encryptedPhone.iv, authTag: encryptedPhone.authTag });
        delete data.phoneNumber;
      }
      if (data.idLast6) {
        const encryptedId = encryptAES(data.idLast6);
        if (!encryptedId) {
          return res.status(400).json({ success: false, error: 'فشل تشفير رقم الهوية' });
        }
        data.id_last6 = JSON.stringify({ encryptedData: encryptedId.encryptedData, iv: encryptedId.iv, authTag: encryptedId.authTag });
        delete data.idLast6;
      }
      if (data.email) {
        const encryptedEmail = encryptAES(data.email);
        if (!encryptedEmail) {
          return res.status(400).json({ success: false, error: 'فشل تشفير البريد الإلكتروني' });
        }
        data.email = JSON.stringify({ encryptedData: encryptedEmail.encryptedData, iv: encryptedEmail.iv, authTag: encryptedEmail.authTag });
      }
      // تشفير رقم الواتساب وحفظه في عمود anther_number
      if (data.whatsapp_number) {
        const encryptedWhatsapp = encryptAES(data.whatsapp_number);
        if (!encryptedWhatsapp) {
          return res.status(400).json({ success: false, error: 'فشل تشفير رقم الواتساب' });
        }
        data.anther_number = JSON.stringify({ encryptedData: encryptedWhatsapp.encryptedData, iv: encryptedWhatsapp.iv, authTag: encryptedWhatsapp.authTag });
        delete data.whatsapp_number;
      }
      if (data.whatsapp_country_code) {
        delete data.whatsapp_country_code; // لا نحتاج لتخزين كود الدولة منفصلاً (هو جزء من الرقم المشفر)
      }
      // حفظ البلاغ في قاعدة البيانات
      const { data: inserted, error } = await supabase
        .from('phone_reports')
        .insert([data])
        .select();
      if (error) {
        console.error('Error saving report:', error);
        return sendError(res, 500, 'حدث خطأ في الخادم', error, { success: false });
      }
      // إشعار تسجيل بلاغ فقد

      const { data: userRow } = await supabase
        .from('users')
        .select('fcm_token, language')
        .eq('id', req.user.id)
        .single();

      const language = (userRow?.language || 'ar').toLowerCase();
      const translations = (typeof getTranslations === 'function') ? getTranslations(language) : {};

      const title = (translations && (translations.report_submitted || translations.report_submitted_success || translations.notification_sent))
        || (language.startsWith('en') ? 'Lost Phone Alert' : 'إخطار فقد');

      const body = (translations && (translations.report_submitted_details || translations.report_submitted || translations.notification_sent))
        || (language.startsWith('en') ? 'A new loss notification has been registered for your phone.' : 'تم تسجيل إخطار فقد جديد على هاتفك.');

      // حفظ داخل جدول الإشعارات (مترجم حسب لغة المستخدم)
      await supabase.from('notifications').insert({
        user_id: req.user.id,
        title,
        body,
        is_read: false,
        created_at: new Date().toISOString()
      });

      // إشعار خارجي FCM
      if (userRow?.fcm_token) {
        await sendFCMNotificationV1({
          token: userRow.fcm_token,
          title,
          body
        });
      }

      // 📝 Audit Log: Record lost phone report
      const reportedImei = req.body.imei || 'unknown';
      await logAudit({
        userId: req.user.id,
        action: 'report_lost_phone',
        resourceType: 'phone_report',
        resourceId: inserted?.[0]?.id,
        oldValues: null,
        newValues: { status: 'active' },
        details: {
          imei_last_4: reportedImei.slice(-4),
          status: 'active'
        },
        ip: req.headers['x-forwarded-for']?.split(',')[0] || req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        status: 'success'
      });

      res.json({ success: true, data: inserted });
    } catch (err) {
      console.error('Error in /api/report-lost-phone:', err);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // Endpoint: upload images for reports via server (uses service-role supabase client)
  app.post('/api/upload-report-image', verifyJwtToken, async (req, res) => {
    try {
      // Expect { fileBase64, fileExt, type }
      const { fileBase64, fileExt, type } = req.body || {};
      if (!fileBase64 || !fileExt || !type) return res.status(400).json({ success: false, error: 'Missing fileBase64/fileExt/type' });

      // Basic validation
      if (!['receipt', 'report'].includes(type)) return res.status(400).json({ success: false, error: 'Invalid type' });

      // Decode base64 (allow data URL prefix)
      let base64 = String(fileBase64);
      const match = base64.match(/^data:(.+);base64,(.*)$/);
      if (match) {
        base64 = match[2];
      }

      const buffer = Buffer.from(base64, 'base64');

      // ✅ SECURITY: Verify the real file content via magic numbers and enforce
      // the configured size limit, instead of trusting the client-supplied
      // extension/MIME type (which can be spoofed to disguise malicious files).
      const validation = validateImageFile(buffer, buffer.length, SECURITY_CONFIG.FILE_UPLOAD.MAX_SIZE_BYTES);
      if (!validation.isValid) {
        return res.status(400).json({ success: false, error: validation.error || 'Invalid image file' });
      }
      const contentType = validation.mimeType;

      // Generate filename similar to client
      const fileId = `${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
      const fileName = `${fileId}_${type}_${Date.now()}.${String(fileExt).replace(/[^a-z0-9]/gi, '')}`;
      const filePath = `reports/${fileName}`;

      // Upload to bucket `phone-images` (server uses service role client passed as `supabase`)
      const { data: uploadData, error: uploadErr } = await supabase.storage.from('phone-images').upload(filePath, buffer, { contentType, upsert: true });
      if (uploadErr) {
        console.error('Server upload error:', uploadErr);
        return res.status(500).json({ success: false, error: 'Upload failed', details: uploadErr.message || uploadErr });
      }

      // Construct a guaranteed public URL (format: {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path})
      return res.json({
        success: true,
        path: filePath
      });
    } catch (err) {
      console.error('/api/upload-report-image error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // Endpoint: convert various storage URL forms to a guaranteed public URL
  app.post('/api/get-public-url', verifyJwtToken, async (req, res) => {
    try {
      const { url } = req.body || {};
      if (!url || typeof url !== 'string') return res.status(400).json({ success: false, error: 'Missing url' });

      // If already a public storage URL, return as-is
      if (url.startsWith('https://') && url.includes('/storage/v1/object/public/')) {
        return res.json({ success: true, publicUrl: url });
      }

      // Try to extract bucket and path from known supabase URL patterns
      let bucket = 'phone-images';
      let path = null;

      // Pattern: /storage/v1/object/sign/{bucket}/{path}
      const signIdx = url.indexOf('/storage/v1/object/sign/');
      if (signIdx !== -1) {
        const after = url.substring(signIdx + '/storage/v1/object/sign/'.length);
        const cleaned = after.split('?')[0];
        const parts = cleaned.split('/');
        if (parts.length >= 2) {
          bucket = parts.shift();
          path = parts.join('/');
        }
      }

      // Pattern: /storage/v1/object/public/{bucket}/{path}
      if (!path) {
        const pubIdx = url.indexOf('/storage/v1/object/');
        if (pubIdx !== -1) {
          const after = url.substring(pubIdx + '/storage/v1/object/'.length);
          if (after.startsWith('public/')) {
            const rest = after.substring('public/'.length).split('?')[0];
            const parts = rest.split('/');
            if (parts.length >= 2) {
              bucket = parts.shift();
              path = parts.join('/');
            }
          }
        }
      }

      // Fallback: detect bucket name in plain strings like 'phone-images/...' or full path containing 'phone-images/'
      if (!path) {
        const idx = url.indexOf('phone-images/');
        if (idx !== -1) {
          path = url.substring(idx + 'phone-images/'.length).split('?')[0];
          bucket = 'phone-images';
        }
      }

      if (!path) return res.status(400).json({ success: false, error: 'Cannot extract storage path' });

      const { data: publicUrlData, error } = await supabase.storage.from(bucket).getPublicUrl(path);
      if (error) {
        console.error('get-public-url supabase error:', error);
        return res.status(500).json({ success: false, error: 'Failed to get public url', details: error.message || error });
      }
      return res.json({ success: true, publicUrl: publicUrlData?.publicUrl || null });
    } catch (err) {
      console.error('/api/get-public-url error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  const recentlyNotifiedByImei = new Map();

  // إرسال بريد إلكتروني للمالك عند العثور على الهاتف
  app.post('/api/update-finder-phone-by-imei', verifyJwtToken, async (req, res) => {
    console.log('POST request received at /api/update-finder-phone-by-imei');
    const { imei, ownerName, finderPhone } = req.body;
    const requesterId = req.user?.id;

    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!imei || !finderPhone) {
      return res.status(400).json({ error: 'IMEI and finderPhone are required' });
    }

    console.log(`Processing IMEI: ${imei}, Finder phone: ${finderPhone}, Owner name: ${ownerName || 'Not provided'}`);

    // --- ⭐ التحقق من فترة التهدئة (Cooldown) ---
    // إذا تم إرسال إشعار لهذا الـ IMEI مؤخرًا، تجاهل الطلب الحالي.
    if (recentlyNotifiedByImei.has(imei)) {
      console.log(`[Cooldown] Blocked duplicate notification request for IMEI: ${imei}`);
      // أرسل ردًا ناجحًا لتجنب ظهور خطأ في الواجهة الأمامية
      return res.json({ ok: true, message: 'Notification already sent recently.' });
    }

    try {
      // 1. البحث عن الهاتف للحصول على معلومات المالك (بريد، اسم، وتوكن الإشعارات، ومعرف الواجد)
      console.log(`Searching for phone with IMEI: ${imei}`);
      const imeiHash = getImeiHash(imei);
      let allReports = [];
      let reportError = null;

      if (imeiHash) {
        const result = await supabase
          .from('phone_reports')
          .select('id, imei, email, owner_name, fcm_token, finder_user_id')
          .eq('imei_hash', imeiHash)
          .order('id', { ascending: true });
        allReports = result.data || [];
        reportError = result.error;
      }

      if ((!allReports || !allReports.length) && reportError === null) {
        const legacy = await supabase
          .from('phone_reports')
          .select('id, imei, email, owner_name, fcm_token, finder_user_id')
          .order('id', { ascending: true });
        allReports = legacy.data || [];
        reportError = legacy.error;
      }

      if (reportError || !allReports || allReports.length === 0) {
        console.error(`No phone_reports found. Error:`, reportError);
        return res.status(404).json({ error: 'لم يتم العثور على الهاتف في البلاغات', imei });
      }

      // فك تشفير IMEI ومقارنته
      const normalizedIncoming = imei.replace(/\D/g, '');
      let foundReport = null;
      for (const r of allReports) {
        let decrypted = null;
        try {
          decrypted = decryptField(r.imei);
        } catch (e) { }
        if (decrypted && decrypted.replace(/\D/g, '') === normalizedIncoming) {
          foundReport = r;
          break;
        }
      }

      if (!foundReport) {
        console.error(`Phone not found for IMEI (decrypted match): ${imei}`);
        return res.status(404).json({ error: 'لم يتم العثور على الهاتف في البلاغات', imei });
      }

      const currentFinderPhoneRaw = (() => {
        try {
          return decryptField(foundReport.finder_phone) || foundReport.finder_phone || null;
        } catch (_) {
          return foundReport.finder_phone || null;
        }
      })();
      const normalizedCurrentFinderPhone = String(currentFinderPhoneRaw || '').replace(/\D/g, '');
      const normalizedIncomingFinderPhone = String(finderPhone || '').replace(/\D/g, '');
      if (
        normalizedIncomingFinderPhone &&
        normalizedCurrentFinderPhone &&
        normalizedIncomingFinderPhone === normalizedCurrentFinderPhone &&
        foundReport.finder_user_id === requesterId
      ) {
        return res.json({ success: true, message: 'No changes detected' });
      }

      // تفويض: أي مستخدم موثق يمكنه إبلاغ المالك بالعثور على هاتفه.
      // أكثر من شخص قد يجد الهاتف، لذلك لا نقيّد الإبلاغ بواجد واحد فقط.
      // ملاحظة: finder_user_id سيُحدّث لآخر مُبلّغ، لكن الإشعار سيُرسل للمالك بغض النظر.

      const decryptedOwnerName = (() => {
        if (!foundReport.owner_name) return undefined;
        try {
          return decryptField(foundReport.owner_name) || foundReport.owner_name;
        } catch (e) {
          console.error('فشل فك تشفير owner_name:', e);
          return foundReport.owner_name;
        }
      })();

      const decryptedOwnerEmail = (() => {
        if (!foundReport.email) return undefined;
        try {
          return decryptField(foundReport.email) || foundReport.email;
        } catch (e) {
          console.error('فشل فك تشفير email:', e);
          return foundReport.email;
        }
      })();

      // ✅ SECURITY: لا نطبع اسم المالك المفكوك التشفير في بيئة الإنتاج
      if (process.env.NODE_ENV !== 'production') {
        console.log(`Phone found for IMEI: ${imei}. Owner: ${decryptedOwnerName || foundReport.owner_name}`);
      } else {
        console.log(`Phone found for report id: ${foundReport.id}`);
      }

      // 2. تشفير finder_phone قبل الحفظ
      let encryptedFinderPhone = null;
      if (finderPhone) {
        try {
          const enc = encryptAES(finderPhone);
          encryptedFinderPhone = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
        } catch (e) {
          console.error('فشل تشفير finder_phone:', e);
          encryptedFinderPhone = finderPhone; // fallback: حفظ الرقم كما هو
        }
      }
      const { error: updateError } = await supabase
        .from('phone_reports')
        .update({ finder_phone: encryptedFinderPhone, finder_user_id: requesterId })
        .eq('id', foundReport.id);

      if (updateError) {
        console.error('فشل تحديث finder_phone في phone_reports:', updateError);
        // لا توقف العملية، فقط سجل الخطأ
      } else {
        console.log('Finder phone saved to database successfully');
      }

      // ⭐ 3. إرسال الإشعار والبريد الإلكتروني بعد التحديث الناجح

      let finderPhoneFromDb = encryptedFinderPhone;
      try {
        const { data: refreshedReport, error: refreshError } = await supabase
          .from('phone_reports')
          .select('finder_phone')
          .eq('id', foundReport.id)
          .single();
        if (refreshError) {
          console.error('فشل جلب finder_phone بعد التحديث:', refreshError);
        } else {
          finderPhoneFromDb = refreshedReport?.finder_phone ?? finderPhoneFromDb;
        }
      } catch (e) {
        console.error('خطأ أثناء جلب finder_phone بعد التحديث:', e);
      }

      const decryptedFinderPhone = (() => {
        if (!finderPhoneFromDb) return finderPhone;
        try {
          return decryptField(finderPhoneFromDb) || finderPhone;
        } catch (e) {
          console.error('فشل فك تشفير finder_phone:', e);
          return finderPhone;
        }
      })();

      const decryptedImei = (() => {
        if (!foundReport.imei) return undefined;
        try {
          return decryptField(foundReport.imei) || foundReport.imei;
        } catch (e) {
          console.error('فشل فك تشفير IMEI:', e);
          return foundReport.imei;
        }
      })();

      const ownerLanguage = await (async () => {
        if (!decryptedOwnerEmail) return 'ar';
        try {
          const { data, error } = await supabase
            .from('users')
            .select('language')
            .ilike('email', decryptedOwnerEmail)
            .maybeSingle();
          if (error) {
            console.error('فشل جلب لغة المستخدم:', error);
            return 'ar';
          }
          return data?.language || 'ar';
        } catch (e) {
          console.error('خطأ أثناء جلب لغة المستخدم:', e);
          return 'ar';
        }
      })();

      const normalizedLang = String(ownerLanguage || 'ar').toLowerCase();
      const translations = (typeof getTranslations === 'function') ? getTranslations(normalizedLang) : {};

      const ownerNameToUse = ownerName || decryptedOwnerName || foundReport.owner_name || '';
      const title = translations['phone_found_success'] || translations['phone_found'] || (normalizedLang.startsWith('en') ? 'Your phone was found!' : 'تم العثور على هاتفك!');
      const body = (translations['owner_notified_success'] || translations['owner_notified'] || translations['owner_will_be_notified'])
        ? `${translations['owner_notified_success'] || translations['owner_notified'] || translations['owner_will_be_notified']} ${decryptedFinderPhone ? `: ${decryptedFinderPhone}` : ''}`
        : (normalizedLang.startsWith('en') ? `Congratulations! Your phone was found. To contact the finder, please call: ${decryptedFinderPhone}.` : `مبروك! تم العثور على هاتفك. للتواصل مع الشخص الذي وجده، يرجى الاتصال على الرقم: ${decryptedFinderPhone}.`);

      const emailSubject = translations['phone_found_success'] || title;
      const emailHtml = `<p>${ownerNameToUse}</p>
        <p>${translations['phone_found_success'] || 'Your phone was found'} (IMEI: ${decryptedImei || foundReport.imei || ''}).</p>
        <p>${body}</p>`;

      const localizedContent = { title, body, emailSubject, emailHtml };

      let ownerFcmToken = foundReport.fcm_token;

      // إذا كان توكن البلاغ غير متوفر أو نريد تأكيد أنه تابع للمالك، حاول الحصول عليه من جدول المستخدمين حسب البريد الإلكتروني.
      if (!ownerFcmToken && decryptedOwnerEmail) {
        try {
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('fcm_token')
            .ilike('email', decryptedOwnerEmail)
            .maybeSingle();

          if (userData && !userError && userData.fcm_token) {
            ownerFcmToken = userData.fcm_token;
            // ✅ SECURITY: البريد الإلكتروني المفكوك التشفير لا يُطبع إلا في وضع التطوير
            if (process.env.NODE_ENV !== 'production') {
              console.log('Using owner FCM token fallback from users table for owner email:', decryptedOwnerEmail);
            }
          }
        } catch (fcmLookupError) {
          console.error('Error looking up owner FCM token fallback by email:', fcmLookupError);
        }
      }

      if (!ownerFcmToken && foundReport.user_id) {
        try {
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('fcm_token')
            .eq('id', foundReport.user_id)
            .maybeSingle();

          if (userData && !userError && userData.fcm_token) {
            ownerFcmToken = userData.fcm_token;
            console.log('Using owner FCM token fallback from users table for owner id:', foundReport.user_id);
          }
        } catch (fcmLookupError) {
          console.error('Error looking up owner FCM token fallback by user id:', fcmLookupError);
        }
      }

      // --- ⭐ قراءة خطة المالك لتقرير أي قنوات يجب استخدامها ---
      let notifyPush = false;
      let notifyEmail = false;
      let notifyInApp = false;

      try {
        // حاول تحديد owner user id
        let ownerUserId = foundReport.user_id || null;
        if (!ownerUserId && decryptedOwnerEmail) {
          try {
            const { data: urow, error: uerr } = await supabase
              .from('users')
              .select('id')
              .ilike('email', decryptedOwnerEmail)
              .maybeSingle();
            if (!uerr && urow && urow.id) ownerUserId = urow.id;
          } catch (qe) {
            console.error('Error resolving owner user id for plan lookup:', qe);
          }
        }

        // جلب دور المالك (role) إن توفر ownerUserId
        let ownerRole = null;
        if (ownerUserId) {
          try {
            const { data: urole, error: roleErr } = await supabase
              .from('users')
              .select('role')
              .eq('id', ownerUserId)
              .maybeSingle();
            if (!roleErr && urole) ownerRole = urole.role || null;
          } catch (roleEx) {
            console.error('Error fetching owner role:', roleEx);
          }
        }

        // جلب صف الخطة المطابق للـ type = ownerRole
        let planRow = null;
        if (ownerRole) {
          try {
            const { data: prow, error: pErr } = await supabase
              .from('plans')
              .select('notify_in_app, notify_email, notify_push')
              .eq('type', ownerRole)
              .maybeSingle();
            if (!pErr && prow) planRow = prow;
          } catch (pFetchErr) {
            console.error('Error fetching plan row:', pFetchErr);
          }
        }

        // قرارات الإرسال: إن وُجدت خطة، استخدم أعلامها، وإلا احتفظ بالسلوك الافتراضي القديم
        if (planRow) {
          notifyInApp = !!planRow.notify_in_app;
          notifyEmail = !!planRow.notify_email;
          notifyPush = !!planRow.notify_push;
        } else {
          // default: إرسال القنوات المتاحة كما في السلوك السابق
          notifyPush = !!ownerFcmToken;
          notifyEmail = !!decryptedOwnerEmail;
          notifyInApp = true;
        }
      } catch (planErr) {
        console.error('Plan decision error, falling back to defaults:', planErr);
        notifyPush = !!ownerFcmToken;
        notifyEmail = !!decryptedOwnerEmail;
        notifyInApp = true;
      }

      // تنفيذ الإرسال طبقاً لقرارات الخطة
      if (notifyPush && ownerFcmToken) {
        try {
          // ✅ SECURITY: لا نطبع قيمة FCM token الكاملة في السجلات
          if (process.env.NODE_ENV !== 'production') {
            console.log(`Plan allows push. Sending push to token: ${ownerFcmToken}`);
          } else {
            console.log('Plan allows push. Sending push notification to owner device.');
          }
          await sendFCMNotificationV1({
            token: ownerFcmToken,
            title: localizedContent.title,
            body: localizedContent.body,
            data: { type: 'phone_found', imei: decryptedImei || foundReport.imei }
          });
          console.log('Push notification sent (per plan).');
        } catch (fcmErr) {
          console.error('Failed to send plan-based FCM notification:', fcmErr);
        }
      } else {
        console.log('Skipping push notification due to plan or missing token.');
      }

      if (notifyEmail && decryptedOwnerEmail) {
        try {
          // ✅ SECURITY: لا نطبع البريد الإلكتروني الفعلي في بيئة الإنتاج
          if (process.env.NODE_ENV !== 'production') {
            console.log('Plan allows email. Sending email to:', decryptedOwnerEmail);
          } else {
            console.log('Plan allows email. Sending notification email to owner.');
          }
          await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: decryptedOwnerEmail.trim(),
            subject: localizedContent.emailSubject,
            html: localizedContent.emailHtml
          });
          console.log('Email sent (per plan).');
        } catch (emailErr) {
          console.error('Failed to send plan-based email:', emailErr);
        }
      } else {
        console.log('Skipping email notification due to plan or missing email.');
      }

      // إنشاء سجل الإشعار داخل التطبيق إذا سمحت الخطة
      if (notifyInApp) {
        try {
          const notificationEmail = (decryptedOwnerEmail || '').trim().toLowerCase() || null;
          let resolvedOwnerUserId = foundReport.user_id || null;
          if (!resolvedOwnerUserId && notificationEmail) {
            try {
              const { data: urow, error: uerr } = await supabase
                .from('users')
                .select('id')
                .ilike('email', notificationEmail)
                .maybeSingle();
              if (!uerr && urow && urow.id) resolvedOwnerUserId = urow.id;
            } catch (uErr2) {
              console.error('Error resolving owner user id for notification insert:', uErr2);
            }
          }

          const notifPayload = {
            title: title + (decryptedImei ? ` (IMEI: ${decryptedImei})` : ''),
            body: body,
            email: notificationEmail,
            user_id: resolvedOwnerUserId,
            imei: decryptedImei || (foundReport.imei || null),
            notification_type: 'phone_found',
            is_read: false,
            created_at: new Date().toISOString(),
            metadata: { finder_phone: decryptedFinderPhone || null }
          };

          try {
            const { data: notifData, error: notifError } = await supabase
              .from('notifications')
              .insert(notifPayload)
              .select()
              .single();
            if (notifError) {
              console.error('Failed to insert notification record (per plan):', notifError);
            } else {
              console.log('Notification record created (server-side, per plan):', notifData && notifData.id ? notifData.id : '<no-id>');

              // ----------------------
              // Update users_plans counters
              // ----------------------
              try {
                const ownerIdForUsage = resolvedOwnerUserId;
                if (!ownerIdForUsage) {
                  console.log('Skipping users_plans update: owner user id not resolved');
                } else {
                  console.log('Updating users_plans notify counters for owner:', ownerIdForUsage, { notifyInApp, notifyEmail, notifyPush });
                  const { data: usageRow, error: usageErr } = await supabase
                    .from('users_plans')
                    .select('used_notify_in_app, used_notify_email, used_notify_push')
                    .eq('id', ownerIdForUsage)
                    .maybeSingle();

                  if (usageErr) {
                    console.error('Error fetching users_plans row:', usageErr);
                  }

                  if (!usageRow) {
                    // no existing row -> insert initial counters (use upsert to be safe)
                    const insertObj = {
                      id: ownerIdForUsage,
                      used_notify_in_app: notifyInApp ? 1 : 0,
                      used_notify_email: notifyEmail ? 1 : 0,
                      used_notify_push: notifyPush ? 1 : 0
                    };
                    const { data: upsertData, error: insertUsageErr } = await supabase.from('users_plans').upsert(insertObj, { onConflict: ['id'] }).select().maybeSingle();
                    if (insertUsageErr) console.error('Failed to upsert users_plans notify counters:', insertUsageErr);
                    else console.log('Inserted users_plans notify counters for owner:', upsertData);
                  } else {
                    // existing row -> compute increments and update
                    // استخدم Number() لضمان الجمع الرقمي وليس دمج النصوص (0+1=1 وليس 01)
                    const updates = {};
                    if (notifyInApp) updates.used_notify_in_app = Number(usageRow.used_notify_in_app || 0) + 1;
                    if (notifyEmail) updates.used_notify_email = Number(usageRow.used_notify_email || 0) + 1;
                    if (notifyPush) updates.used_notify_push = Number(usageRow.used_notify_push || 0) + 1;

                    if (Object.keys(updates).length > 0) {
                      const { data: updatedData, error: updErr } = await supabase
                        .from('users_plans')
                        .update(updates)
                        .eq('id', ownerIdForUsage)
                        .select()
                        .maybeSingle();
                      if (updErr) console.error('Failed to update users_plans notify counters:', updErr);
                      else console.log('Updated users_plans notify counters for owner:', updatedData);
                    } else {
                      console.log('No notify counters to update for owner');
                    }
                  }
                }
              } catch (usageUpdateEx) {
                console.error('Exception while updating users_plans notify counters:', usageUpdateEx);
              }
            }
          } catch (insertErr) {
            console.error('Exception inserting notification record (per plan):', insertErr);
          }
        } catch (e) {
          console.error('Notification creation (server-side, per plan) failed:', e);
        }
      } else {
        console.log('Skipping in-app notification creation due to plan.');
      }

      // --- ⭐ بدء فترة التهدئة بعد الإرسال الناجح ---
      // أضف الـ IMEI إلى المجموعة وقم بإزالته بعد 30 ثانية.
      recentlyNotifiedByImei.set(imei, Date.now());
      setTimeout(() => {
        recentlyNotifiedByImei.delete(imei);
      }, 30000); // 30 ثانية

      // 📝 Audit Log: Record finder phone update
      await logAudit({
        userId: requesterId,
        action: 'update_finder_phone_by_imei',
        resourceType: 'phone_report',
        resourceId: foundReport.id,
        oldValues: { finder_phone: foundReport.finder_phone || null },
        newValues: { finder_phone: 'redacted', finder_user_id: requesterId },
        details: { imei_last_4: imei.slice(-4) },
        ip: req.headers['x-forwarded-for']?.split(',')[0] || req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        status: 'success'
      });

      res.json({ success: true, message: 'Notifications sent.' });
    } catch (err) {
      console.error('خطأ في إرسال الإشعارات:', err);
      res.status(500).json({ error: 'خطأ في إرسال الإشعارات' });
    }
  });

  app.post('/api/get-finder-phone', verifyJwtToken, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    let finderPhoneNumber = null;

    try {
      console.log(`البحث عن رقم هاتف للمستخدم بالمعرف: ${userId}`);

      // ⭐ إرسال طلبات البحث في كلا الجدولين في نفس الوقت
      const [userResult, businessResult] = await Promise.allSettled([
        supabase
          .from('users')
          .select('phone, country_code') // ⭐ إضافة country_code للاستعلام
          .eq('id', userId)
          .single(),
        supabase
          .from('businesses')
          .select('phone, country_code') // ⭐ إضافة country_code للاستعلام
          .eq('user_id', userId) // البحث باستخدام user_id بدلاً من id
          .single()
      ]);

      // ⭐ تحقق من نتيجة البحث في جدول users
      if (userResult.status === 'fulfilled' && userResult.value.data && !userResult.value.error) {
        const decryptedPhone = decryptField(userResult.value.data.phone) || userResult.value.data.phone;
        const countryCode = userResult.value.data.country_code || '+20'; // ⭐ استخراج كود الدولة

        if (decryptedPhone) {
          // ⭐ دمج كود الدولة مع رقم الهاتف
          const cleanPhone = decryptedPhone.replace(/\D/g, '');
          const fullPhone = `${countryCode}${cleanPhone}`;
          finderPhoneNumber = fullPhone;
          console.log('تم العثور على رقم هاتف في جدول users:', finderPhoneNumber);
        }
      }

      // ⭐ إذا لم يتم العثوره في users، تحقق من نتيجة البحث في جدول businesses
      if (!finderPhoneNumber && businessResult.status === 'fulfilled' && businessResult.value.data && !businessResult.value.error) {
        const decryptedPhone = decryptField(businessResult.value.data.phone) || businessResult.value.data.phone;
        const countryCode = businessResult.value.data.country_code || '+20'; // ⭐ استخراج كود الدولة

        if (decryptedPhone) {
          // ⭐ دمج كود الدولة مع رقم الهاتف
          const cleanPhone = decryptedPhone.replace(/\D/g, '');
          const fullPhone = countryCode.replace('+', '') + cleanPhone;
          finderPhoneNumber = fullPhone;
          console.log('تم العثور على رقم هاتف في جدول businesses:', finderPhoneNumber);
        }
      }

      // إذا تم العثور على الرقم في أي من الجدولين، أرسله
      if (finderPhoneNumber) {
        // إذا أرسلت الواجهة imei أو reportId، احفظ الهاتف كـ finder_phone في سجل البلاغ المناسب
        const { imei, reportId } = req.body || {};
        let updated = false;
        if (imei || reportId) {
          try {
            const enc = encryptAES(String(finderPhoneNumber));
            const encryptedVal = enc ? JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag }) : String(finderPhoneNumber);

            if (reportId) {
              const { error: upErr } = await supabase.from('phone_reports').update({ finder_phone: encryptedVal, finder_user_id: userId }).eq('id', reportId);
              if (!upErr) updated = true;
            } else if (imei) {
              const imeiHash = getImeiHash(imei);
              if (imeiHash) {
                const { data: report, error: reportErr } =
                  await supabase
                    .from('phone_reports')
                    .select('id')
                    .eq('imei_hash', imeiHash)
                    .maybeSingle();
                if (!reportErr && report) {
                  const { error: upErr2 } = await supabase
                    .from('phone_reports')
                    .update({
                      finder_phone: encryptedVal,
                      finder_user_id: userId
                    })
                    .eq('id', report.id);

                  if (!upErr2) {
                    updated = true;
                  }
                }
              } else {
                const { data: allReports, error: reportErr } = await supabase.from('phone_reports').select('id, imei').limit(1000);
                if (!reportErr && allReports && allReports.length) {
                  for (const r of allReports) {
                    try {
                      const dec = decryptField(r.imei) || r.imei;
                      if (dec && String(dec).replace(/\D/g, '') === String(imei).replace(/\D/g, '')) {
                        const { error: upErr2 } = await supabase.from('phone_reports').update({ finder_phone: encryptedVal, finder_user_id: userId }).eq('id', r.id);
                        if (!upErr2) { updated = true; break; }
                      }
                    } catch (e) {
                      // ignore decryption failures for individual rows
                    }
                  }
                }
              }
            }
          } catch (saveErr) {
            console.error('Failed to save finder phone to phone_reports:', saveErr);
          }
        }

        return res.status(200).json({ finderPhone: finderPhoneNumber, updated });
      } else {
        // إذا لم يتم العثور عليه في أي من الجدولين
        console.log('لم يتم العثور على رقم هاتف للمستخدم في أي من الجدولين.');
        res.status(404).json({ error: 'Phone number not found for the given userId in users or businesses table.' });
      }

    } catch (err) {
      console.error('Error in /api/get-finder-phone:', err);
      res.status(500).json({ error: 'An internal server error occurred' });
    }
  });
}
