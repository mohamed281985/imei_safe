import crypto from 'crypto';

export function registerNotificationRoutes({
  app,
  supabase,
  verifyJwtToken,
  sendError,
  sendFCMNotificationV1,
  getFCMTokenByImei,
  searchImeiLimiter,
  decryptField,
  normalizeDigitsOnly,
  logAudit: rawLogAudit,
  checkUserLimit
}) {
const logAudit = (config) => rawLogAudit({ supabase, ...config });

const getImeiHash = (imei) => {
  try {
    const normalized = normalizeDigitsOnly(imei);
    if (!normalized) return null;
    return crypto.createHash('sha256').update(String(normalized)).digest('hex');
  } catch (e) {
    console.error('notificationRoutes.getImeiHash error:', e);
    return null;
  }
};

app.post('/api/send-fcm-v1', verifyJwtToken, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
    }
    const { token, title, body, data } = req.body;
    const result = await sendFCMNotificationV1({ token, title, body, data });
    res.json({ success: true, result });
  } catch (err) {
    console.error('FCM V1 Error:', err);
    return sendError(res, 500, 'حدث خطأ في الخادم', err, { success: false });
  }
});

app.post('/api/update-fcm-token', verifyJwtToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      try {
        await logAudit({
          userId: req.user?.id || null,
          action: 'unauthorized_access',
          resourceType: 'user',
          resourceId: null,
          details: { reason: 'Unauthorized' },
          ip: req.headers['x-forwarded-for']?.split(',')[0] || req.ip || null,
          userAgent: req.headers['user-agent'] || null,
          status: 'failed',
          errorMessage: 'Unauthorized'
        });
      } catch (e) {
        console.warn('/api/update-fcm-token unauthorized audit failed:', e?.message || e);
      }
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { fcmToken } = req.body;
    if (!fcmToken || typeof fcmToken !== 'string') {
      return res.status(400).json({ success: false, error: 'fcmToken is required' });
    }

    const { data: currentUser, error: currentUserErr } = await supabase
      .from('users')
      .select('id, fcm_token')
      .eq('id', userId)
      .maybeSingle();
    if (currentUserErr) {
      console.error('Failed to fetch current user FCM token:', currentUserErr);
      return res.status(500).json({ success: false, error: 'Failed to fetch current user token' });
    }
    const currentToken = currentUser?.fcm_token || null;
    if (currentToken && String(currentToken) === String(fcmToken)) {
      return res.json({ success: true, message: 'No changes detected' });
    }

    const updates = {
      fcm_token: fcmToken,
      updated_at: new Date().toISOString()
    };

    const { error: userError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId);

    if (userError) {
      console.error('Failed to update user FCM token:', userError);
      return res.status(500).json({ success: false, error: 'Failed to update user FCM token' });
    }

    const { error: reportError } = await supabase
      .from('phone_reports')
      .update({ fcm_token: fcmToken })
      .eq('user_id', userId);

    if (reportError) {
      console.error('Failed to update fcm_token on phone_reports for user:', reportError);
      // لا نوقف العملية، لأن التحديث في users يكفي في أغلب الحالات
    }

    try {
      await logAudit({
        userId: req.user?.id || null,
        action: 'update_fcm_token',
        resourceType: 'user',
        resourceId: userId,
        oldValues: { fcm_token: currentToken ? 'masked' : null },
        newValues: { fcm_token: 'masked' },
        details: { updatedReports: !reportError },
        ip: req.headers['x-forwarded-for']?.split(',')[0] || req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        status: 'success'
      });
    } catch (e) {
      console.warn('/api/update-fcm-token audit failed:', e?.message || e);
    }

    res.json({ success: true, message: 'FCM token updated successfully' });
  } catch (err) {
    console.error('Error in /api/update-fcm-token:', err);
    return sendError(res, 500, 'حدث خطأ في الخادم', err, { success: false });
  }
});

// نقطة نهاية لإرسال إشعارات باستخدام IMEI
app.post('/api/send-notification-by-imei', verifyJwtToken, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
    }
    const { imei, title, body, data } = req.body;

    // التحقق من وجود البيانات المطلوبة
    if (!imei || !title || !body) {
      return res.status(400).json({ success: false, error: 'البيانات المطلوبة مفقودة (imei, title, body)' });
    }

    // البحث عن FCM token باستخدام IMEI
    const fcmToken = await getFCMTokenByImei(imei);

    if (!fcmToken) {
      return res.status(404).json({ success: false, error: 'لم يتم العثور على FCM token لهذا الـ IMEI' });
    }

    // إضافة معلومات إضافية إلى البيانات
    const notificationData = {
      ...data,
      imei,
      timestamp: new Date().toISOString()
    };

    // إرسال الإشعار
    let result;
    try {
      result = await sendFCMNotificationV1({
        token: fcmToken,
        title,
        body,
        data: notificationData
      });
    } catch (fcmError) {
      console.error('فشل إرسال الإشعار عبر FCM:', fcmError);
      // لا نرجع خطأ هنا، فقط نستمر في تسجيل الإشعار في قاعدة البيانات
    }

    // تسجيل الإشعار في قاعدة البيانات (اختياري)
    try {
      const { error: dbError } = await supabase
        .from('notifications')
        .insert([{
          imei,
          title,
          body,
          data: notificationData,
          status: result ? 'sent' : 'failed'
        }]);

      if (dbError) {
        console.error('خطأ في تسجيل الإشعار في قاعدة البيانات:', dbError);
      }
    } catch (dbErr) {
      console.error('خطأ في تسجيل الإشعار في قاعدة البيانات:', dbErr);
    }

    res.json({
      success: true,
      result,
      message: result ? 'Notification sent successfully' : 'Notification recorded but failed to send'
    });
  } catch (err) {
    console.error('خطأ في إرسال الإشعار:', err);
    return sendError(res, 500, 'حدث خطأ في الخادم', err, { success: false });
  }
});

// نقطة نهاية للبحث عن IMEI
app.post('/api/search-imei', searchImeiLimiter, async (req, res) => {
  try {
    const { imei, userId } = req.body;

    if (!imei) {
      return res.status(400).json({ error: 'IMEI is required' });
    }

    // التحقق من صحة الـ IMEI (يجب أن يكون 14-15 رقم)
    if (!/^\d{14,15}$/.test(imei)) {
      return res.status(400).json({ error: 'Invalid IMEI format' });
    }

    // التحقق من صحة التوكن واستخراج userId منه
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    // استخدام userId من التوكن بدلاً من الطلب
    const authenticatedUserId = user.id;
// التحقق من حد البحث من داخل السيرفر نفسه
const limitResult = await checkUserLimit(
  authenticatedUserId,
  user.email,
  'search_imei'
);

if (!limitResult.allowed) {
  return res.status(403).json(limitResult);
}
    // 1. البحث في الهواتف المسجلة
    // ملاحظة: لا يمكن البحث المباشر بالقيمة المشفرة لأن التشفير يستخدم IV عشوائي (قيم مختلفة لنفس الـ IMEI)
    // لذلك نجلب البيانات ونفك تشفيرها للمقارنة
    const { data: allPhones, error: regError } = await supabase
      .from('registered_phones')
      .select('imei, registration_date, status, user_id');

    if (regError) {
      console.error('Error searching for registered phone:', regError);
      throw regError;
    }

    // فك تشفير IMEI المخزن ومقارنته مع الـ IMEI المرسل (تطبيع إلى أرقام فقط)
    const normalizedIncoming = normalizeDigitsOnly(imei);
    const regPhone = allPhones ? allPhones.find(p => normalizeDigitsOnly(decryptField(p.imei)) === normalizedIncoming) : null;

    // 2. البحث في البلاغات
    const imeiHash = getImeiHash(imei);
    let allReports = [];
    let reportError = null;

    if (imeiHash) {
      const result = await supabase
        .from('phone_reports')
        .select('imei_hash, imei, status, report_date, updated_at, loss_location, loss_time, user_id, anther_number, whatsapp')
        .eq('imei_hash', imeiHash)
        .in('status', ['active', 'resolved']);
      allReports = result.data || [];
      reportError = result.error;
    }

    if ((!allReports || !allReports.length) && reportError === null) {
      const legacy = await supabase
        .from('phone_reports')
        .select('imei_hash, imei, status, report_date, updated_at, loss_location, loss_time, user_id, anther_number, whatsapp')
        .in('status', ['active', 'resolved']);
      allReports = legacy.data || [];
      reportError = legacy.error;
    }

    if (reportError) {
      console.error('Error searching for reported phone:', reportError);
      throw reportError;
    }

    // ابحث عن أي بلاغ موجود: سنُظهر البلاغ فقط إذا كان "active" صريحاً
    // تحقق هل المستخدم هو المالك (بمقارنة userId فقط)
    let isOwner = false;
    if (regPhone && regPhone.user_id && authenticatedUserId && regPhone.user_id === authenticatedUserId) {
      isOwner = true;
    }
    // ابحث عن بلاغ active يطابق الـ IMEI
    const activeReportAny = allReports ? allReports.find(r => {
      if (r.imei_hash && imeiHash) {
        return r.imei_hash === imeiHash && r.status === 'active';
      }
      try {
        return normalizeDigitsOnly(decryptField(r.imei)) === normalizedIncoming && r.status === 'active';
      } catch (e) {
        return false;
      }
    }) : null;

    if (activeReportAny) {
      // يوجد بلاغ فعال — نُظهره بغض النظر عن هوية المبلغ
      // فك تشفير رقم الواتساب إن وجد
      let whatsappNumber = null;
      if (activeReportAny.anther_number) {
        try {
          whatsappNumber = decryptField(activeReportAny.anther_number);
        } catch (e) {
          console.warn('Error decrypting whatsapp number:', e);
        }
      }
      
      res.json({
        found: true,
        masked: true,
        isOwner: isOwner,
        status: activeReportAny.status,
        report_date: activeReportAny.report_date,
        resolved_date: activeReportAny.resolved_date || activeReportAny.updated_at,
        loss_location: activeReportAny.loss_location,
        loss_time: activeReportAny.loss_time,
        whatsapp_number: whatsappNumber,
        whatsapp: activeReportAny.whatsapp || false,
        registered: !!regPhone,
        isRegistered: !!regPhone,
        registeredPhone: regPhone ? { registration_date: regPhone.registration_date, status: regPhone.status, user_id: regPhone.user_id } : null
      });
    } else if (regPhone && isOwner) {
      // الهاتف مسجل للمستخدم الحالي ولا يوجد بلاغ فعال
      res.json({
        found: false,
        masked: true,
        isOwner: true,
        registered: true,
        isRegistered: true,
        registeredPhone: { registration_date: regPhone.registration_date, status: regPhone.status, user_id: regPhone.user_id }
      });
    } else if (regPhone) {
      // الهاتف مسجل لمستخدم آخر
      res.json({
        found: false,
        masked: true,
        isOwner: false,
        registered: true,
        isRegistered: true,
        registeredPhone: { registration_date: regPhone.registration_date, status: regPhone.status, user_id: regPhone.user_id }
      });
    } else {
      // الهاتف غير مسجل ولا يوجد بلاغ
      res.json({
        found: false,
        masked: false,
        isOwner: false,
        registered: false
      });
    }

    // تسجيل البحث الناجح للتحليل وإحصائيات الاستخدام
    try {
      await supabase.from('search_history').insert({
        user_id: authenticatedUserId,
        imei: imei,
        found: !!activeReportAny || !!regPhone,
        created_at: new Date().toISOString()
      });
      // زيادة عدد مرات الاستخدام بعد نجاح البحث
await updateSearchUsage(authenticatedUserId);
    } catch (logError) {
      // لا نوقف العملية إذا فشل تسجيل البحث
      console.error('Error logging search history:', logError);
    }
  } catch (error) {
    console.error('Error searching IMEI:', error);
    res.status(500).json({ error: 'Error searching IMEI' });
  }
});

// نقطة نهاية لجلب تفاصيل المالك باستخدام IMEI (بما في ذلك حالة الواتساب ورقم الواتساب مفكوكاً)
app.post('/api/get-owner-details-by-imei', verifyJwtToken, async (req, res) => {
  try {
    const { imei } = req.body || {};
    if (!imei) return res.status(400).json({ error: 'IMEI is required' });

    // جلب كل البلاغات الممكنة ثم المقارنة عبر imei_hash أو بفك التشفير كنسخة احتياطية
    const imeiHash = getImeiHash(imei);
    let reports = [];
    let reportsErr = null;

    if (imeiHash) {
      const result = await supabase
        .from('phone_reports')
        .select('id, imei_hash, imei, user_id, whatsapp, anther_number, status')
        .eq('imei_hash', imeiHash)
        .in('status', ['active', 'resolved']);
      reports = result.data || [];
      reportsErr = result.error;
    }

    if ((!reports || !reports.length) && reportsErr === null) {
      const result = await supabase
        .from('phone_reports')
        .select('id, imei_hash, imei, user_id, whatsapp, anther_number, status')
        .in('status', ['active', 'resolved']);
      reports = result.data || [];
      reportsErr = result.error;
    }

    if (reportsErr) {
      console.error('/api/get-owner-details-by-imei: failed to fetch reports', reportsErr);
      return res.status(500).json({ error: 'Failed to fetch reports' });
    }

    const normalizedIncoming = normalizeDigitsOnly(String(imei));
    const match = (reports || []).find(r => {
      if (r.imei_hash && imeiHash) {
        return r.imei_hash === imeiHash;
      }
      try {
        const dec = decryptField(r.imei);
        return normalizeDigitsOnly(String(dec || '')) === normalizedIncoming;
      } catch (e) {
        return false;
      }
    });

    if (!match) return res.status(404).json({ error: 'Owner not found' });

    // فك تشفير رقم الواتساب المخزن في anther_number إن وُجد
    let whatsappNumber = null;
    if (match.anther_number) {
      try {
        whatsappNumber = decryptField(match.anther_number);
      } catch (e) {
        console.warn('/api/get-owner-details-by-imei: failed to decrypt anther_number', e);
      }
    }

    // جلب دور المستخدم من جدول users
    let role = null;
    try {
      const { data: userRow, error: userErr } = await supabase.from('users').select('role').eq('id', match.user_id).maybeSingle();
      if (!userErr && userRow) role = userRow.role || null;
    } catch (e) {
      console.warn('/api/get-owner-details-by-imei: failed to fetch user role', e);
    }

    return res.json({
      user_id: match.user_id,
      role,
      whatsapp_enabled: !!match.whatsapp,
      whatsapp_number: whatsappNumber
    });
  } catch (e) {
    console.error('/api/get-owner-details-by-imei error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// نقطة نهاية لإرسال إشعارات من هاتف لآخر
app.post('/api/send-notification', verifyJwtToken, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
    }
    const { receiverToken, title, body, data } = req.body;
    const senderId = req.user?.id || null;

    // التحقق من وجود البيانات المطلوبة
    if (!receiverToken || !title || !body) {
      return res.status(400).json({ success: false, error: 'البيانات المطلوبة مفقودة (receiverToken, title, body)' });
    }

    // إضافة معلومات المرسل إلى البيانات
    const notificationData = {
      ...data,
      senderId,
      timestamp: new Date().toISOString()
    };

    // إرسال الإشعار
    const result = await sendFCMNotificationV1({
      token: receiverToken,
      title,
      body,
      data: notificationData
    });

    // تسجيل الإشعار في قاعدة البيانات (اختياري)
    if (senderId) {
      try {
        const { error: dbError } = await supabase
          .from('notifications')
          .insert([{
            sender_id: senderId,
            receiver_token: receiverToken,
            title,
            body,
            data: notificationData,
            status: 'sent'
          }]);

        if (dbError) {
          console.error('خطأ في تسجيل الإشعار في قاعدة البيانات:', dbError);
        }
      } catch (dbErr) {
        console.error('خطأ في تسجيل الإشعار في قاعدة البيانات:', dbErr);
      }
    }

    res.json({ success: true, result });
  } catch (err) {
    console.error('خطأ في إرسال الإشعار:', err);
    return sendError(res, 500, 'حدث خطأ في الخادم', err, { success: false });
  }
});
}
