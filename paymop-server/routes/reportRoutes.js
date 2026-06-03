export function registerReportRoutes({
  app,
  supabase,
  verifyJwtToken,
  decryptField,
  encryptAES,
  hashPasswordForStorage,
  sendError,
  logAudit,
  sendFCMNotificationV1,
  resend,
  crypto
}) {
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


    // تحقق من روابط الصور (الفاتورة والمحضر) أنها روابط https صالحة أو فارغة (null/undefined)
    const isValidImageUrl = (url) => {
      if (!url) return false;
      if (typeof url !== 'string') return false;
      // يجب أن يبدأ الرابط بـ https:// ويحتوي على /storage/v1/object/public/
      return url.startsWith('https://') && url.includes('/storage/v1/object/public/');
    };

    // إذا لم تُرسل receipt_image_url أو كانت غير صالحة، ارفض الطلب مباشرة
    if (!('receipt_image_url' in data) || !data.receipt_image_url || !isValidImageUrl(data.receipt_image_url)) {
      return res.status(400).json({ success: false, error: 'يجب رفع صورة الفاتورة بشكل صحيح (رابط صالح).' });
    }
    if ('report_image_url' in data && data.report_image_url && !isValidImageUrl(data.report_image_url)) {
      return res.status(400).json({ success: false, error: 'رابط صورة المحضر غير صالح أو لم يتم رفع الصورة بشكل صحيح.' });
    }

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

        if ((!data.ownerName || data.ownerName === PLACEHOLDER_REGISTERED) && ownerNameReal) data.ownerName = ownerNameReal;
        if ((!data.phoneNumber || data.phoneNumber === PLACEHOLDER_REGISTERED) && phoneReal) data.phoneNumber = phoneReal;
        if ((!data.idLast6 || data.idLast6 === PLACEHOLDER_REGISTERED) && idLast6Real) data.idLast6 = idLast6Real;
        if ((!data.phone_type || data.phone_type === PLACEHOLDER_REGISTERED) && phoneTypeReal) data.phone_type = phoneTypeReal;
      } catch (e) {
        console.warn('report-lost-phone: failed to hydrate placeholders from registered_phones', e);
      }
    }
    // تشفير كلمة المرور قبل الحفظ (bcrypt)
    if (data.password) {
      data.password = await hashPasswordForStorage(data.password);
    }

    // تشفير الحقول الحساسة
    if (data.imei) {
      // تسجيل هاش للايمي (SHA-256)
      const imeiHash = crypto.createHash('sha256').update(String(data.imei)).digest('hex');
      data.imei_hash = imeiHash;

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
    // حفظ البلاغ في قاعدة البيانات
    const { data: inserted, error } = await supabase
      .from('phone_reports')
      .insert([data])
      .select();
    if (error) {
      console.error('Error saving report:', error);
      return sendError(res, 500, 'حدث خطأ في الخادم', error, { success: false });
    }

    // 📝 Audit Log: Record lost phone report
    const reportedImei = req.body.imei || 'unknown';
    await logAudit({
      userId: req.user.id,
      action: 'report_lost_phone',
      resourceType: 'phone_report',
      resourceId: inserted?.[0]?.id,
      details: {
        imei_last_4: reportedImei.slice(-4),
        status: 'active'
      },
      ip: req.ip,
      userAgent: req.headers['user-agent']
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
    let contentType = `image/${fileExt}`;
    if (match) {
      contentType = match[1] || contentType;
      base64 = match[2];
    }

    const buffer = Buffer.from(base64, 'base64');
    // size limit ~8MB
    if (buffer.length > 8 * 1024 * 1024) return res.status(400).json({ success: false, error: 'File too large' });

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
    try {
      const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
      const publicUrl = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/phone-images/${filePath}` : null;
      return res.json({ success: true, path: filePath, publicUrl });
    } catch (e) {
      return res.json({ success: true, path: filePath });
    }
  } catch (err) {
    console.error('/api/upload-report-image error', err);
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
    const { data: allReports, error: reportError } = await supabase
      .from('phone_reports')
      .select('id, imei, email, owner_name, fcm_token, finder_user_id')
      .order('id', { ascending: true });

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

    console.log(`Phone found for IMEI: ${imei}. Owner: ${decryptedOwnerName || foundReport.owner_name}`);

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
    const notificationsByLang = {
      ar: {
        title: 'تم العثور على هاتفك!',
        body: `مبروك! تم العثور على هاتفك. للتواصل مع الشخص الذي وجده، يرجى الاتصال على الرقم: ${decryptedFinderPhone}.`,
        emailSubject: 'تهانينا! تم العثور على هاتفك المفقود',
        emailHtml: `<p>عزيزي ${ownerName || decryptedOwnerName || foundReport.owner_name || ''},</p>
          <p>مبروك! تم العثور على هاتفك المفقود (IMEI: ${decryptedImei || foundReport.imei || ''}).</p>
          <p>يرجى التواصل مع الشخص الذي وجد الهاتف على الرقم: <b>${decryptedFinderPhone}</b> لاستلام هاتفك.</p>
          <p>نتمنى لك يوماً سعيداً!</p>`
      },
      en: {
        title: 'Your phone was found!',
        body: `Congratulations! Your phone was found. To contact the finder, please call: ${decryptedFinderPhone}.`,
        emailSubject: 'Great news! Your lost phone was found',
        emailHtml: `<p>Dear ${ownerName || decryptedOwnerName || foundReport.owner_name || ''},</p>
          <p>Good news! Your lost phone was found (IMEI: ${decryptedImei || foundReport.imei || ''}).</p>
          <p>Please contact the finder at: <b>${decryptedFinderPhone}</b> to retrieve your phone.</p>
          <p>Have a great day!</p>`
      },
      fr: {
        title: 'Votre téléphone a été retrouvé !',
        body: `Félicitations ! Votre téléphone a été retrouvé. Pour contacter la personne qui l'a trouvé, appelez : ${decryptedFinderPhone}.`,
        emailSubject: 'Bonne nouvelle ! Votre téléphone a été retrouvé',
        emailHtml: `<p>Cher/Chère ${ownerName || decryptedOwnerName || foundReport.owner_name || ''},</p>
          <p>Bonne nouvelle ! Votre téléphone perdu a été retrouvé (IMEI : ${decryptedImei || foundReport.imei || ''}).</p>
          <p>Veuillez contacter la personne qui l'a trouvé au : <b>${decryptedFinderPhone}</b> pour le récupérer.</p>
          <p>Bonne journée !</p>`
      },
      hi: {
        title: 'आपका फोन मिल गया है!',
        body: `बधाई हो! आपका फोन मिल गया है। खोजने वाले से संपर्क करने के लिए कॉल करें: ${decryptedFinderPhone}.`,
        emailSubject: 'खुशखबरी! आपका खोया फोन मिल गया है',
        emailHtml: `<p>प्रिय ${ownerName || decryptedOwnerName || foundReport.owner_name || ''},</p>
          <p>खुशखबरी! आपका खोया हुआ फोन मिल गया है (IMEI: ${decryptedImei || foundReport.imei || ''}).</p>
          <p>कृपया फोन प्राप्त करने के लिए खोजने वाले से संपर्क करें: <b>${decryptedFinderPhone}</b>.</p>
          <p>आपका दिन शुभ हो!</p>`
      }
    };

    const localizedContent = notificationsByLang[normalizedLang] || notificationsByLang.ar;

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
          console.log('Using owner FCM token fallback from users table for owner email:', decryptedOwnerEmail);
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
        console.log(`Plan allows push. Sending push to token: ${ownerFcmToken}`);
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
        console.log('Plan allows email. Sending email to:', decryptedOwnerEmail);
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
          title: localizedContent.title + (decryptedImei ? ` (IMEI: ${decryptedImei})` : ''),
          body: localizedContent.body,
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
      ip: req.ip,
      userAgent: req.headers['user-agent']
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
        .select('phone') // تصحيح: اسم العمود هو 'phone' وليس 'phone_number'
        .eq('id', userId)
        .single(),
      supabase
        .from('businesses')
        .select('phone') // تصحيح: اسم العمود هو 'phone' وليس 'phone_number'
        .eq('user_id', userId) // تصحيح: البحث باستخدام user_id بدلاً من id
        .single()
    ]);

    // ⭐ تحقق من نتيجة البحث في جدول users
    if (userResult.status === 'fulfilled' && userResult.value.data && !userResult.value.error) {
      finderPhoneNumber = decryptField(userResult.value.data.phone) || userResult.value.data.phone;
      console.log('تم العثور على رقم هاتف في جدول users:', finderPhoneNumber);
    }

    // ⭐ إذا لم يتم العثوره في users، تحقق من نتيجة البحث في جدول businesses
    if (!finderPhoneNumber && businessResult.status === 'fulfilled' && businessResult.value.data && !businessResult.value.error) {
      finderPhoneNumber = decryptField(businessResult.value.data.phone) || businessResult.value.data.phone;
      console.log('تم العثور على رقم هاتف في جدول businesses:', finderPhoneNumber);
    }

    // إذا تم العثور على الرقم في أي من الجدولين، أرسله
    if (finderPhoneNumber) {
      res.status(200).json({ finderPhone: finderPhoneNumber });
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
