import { sendFCMNotificationV1 } from '../server.js';
import { getMessaging } from '../firebaseAdmin.js';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import {
  createOrRefreshRecoveryCard,
  normalizeStoragePath
} from '../utils/qrCardUtils.js';
export function registerAdminRoutes({ app, supabase, decryptField, verifyJwtToken, logAudit: rawLogAudit, resend, sendFCMNotificationV1: sendFCMFn }) {
  const logAudit = (config) => rawLogAudit({ supabase, ...config });
  // Deep decrypt helper: recursively decrypt strings or encrypted objects.
  const decryptDeep = (value) => {
    try {
      if (value === null || typeof value === 'undefined') return null;

      // If it's an array, decrypt each element
      if (Array.isArray(value)) return value.map((v) => decryptDeep(v));

      // If it's an object, recursively decrypt its keys or handle encrypted object form
      if (typeof value === 'object') {
        if (!value) return null;
        if (value.encryptedData && value.iv && value.authTag) {
          // decryptField accepts object form too
          return decryptField(value);
        }
        const out = {};
        for (const k of Object.keys(value)) {
          out[k] = decryptDeep(value[k]);
        }
        return out;
      }

      // If it's a string, attempt to decrypt; if decryptField returns null
      // and the original looks like an encrypted payload, return null to avoid
      // exposing encryptedData/iv/authTag. Otherwise return the decrypted
      // result or the original string.
      if (typeof value === 'string') {
        const attempted = decryptField(value);
        if (attempted === null) {
          if (value.includes('encryptedData') || value.includes('authTag') || value.includes('iv')) return null;
          return value;
        }
        return attempted;
      }

      // For other types (number, boolean), return as-is
      return value;
    } catch (e) {
      return null;
    }
  };

  // ✅ SECURITY: Shared guard for admin-only endpoints. Must be used together
  // with verifyJwtToken (which populates req.user.role from the `users` table)
  // on every route under /admin/* that returns or mutates sensitive data.
  const requireAdmin = (req, res, next) => {
    const roleCheck = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : '';
    if (!roleCheck.includes('admin')) {
      return res.status(403).json({ success: false, error: 'forbidden: admin only' });
    }
    return next();
  };

  // Load translations (best-effort) from frontend `src/translations` folder.
  const translations = {};
  const loadTranslations = () => {
    try {
      const translationsDir = path.resolve(process.cwd(), 'src', 'translations');
      if (!fs.existsSync(translationsDir)) return;
      const files = fs.readdirSync(translationsDir);
      for (const f of files) {
        try {
          if (!f.endsWith('.ts') && !f.endsWith('.js') && !f.endsWith('.json')) continue;
          const full = path.join(translationsDir, f);
          const content = fs.readFileSync(full, 'utf8');
          // Convert a TS `export default { ... }` into a JS module export and evaluate safely
          let js = content;
          js = js.replace(/export\s+default/, 'module.exports =');
          const sandbox = { module: { exports: {} }, exports: {} };
          vm.createContext(sandbox);
          try {
            vm.runInContext(js, sandbox, { timeout: 1000 });
          } catch (e) {
            // If parsing fails, skip
          }
          const obj = sandbox.module && sandbox.module.exports ? sandbox.module.exports : sandbox.exports;
          const lang = f.split('.')[0];
          translations[lang] = obj || {};
        } catch (e) {
          // ignore individual file errors
        }
      }
    } catch (e) {
      console.warn('loadTranslations failed', e);
    }
  };
  loadTranslations();

  const getLangKey = (lang) => (lang || '').toString().toLowerCase();

  const getNotificationText = (lang, key, fallbackEn, fallbackAr) => {
    try {
      const k = key || '';
      const l = getLangKey(lang);
      if (l && translations[l] && translations[l][k]) return translations[l][k];
      // try simple language match
      if (l && l.startsWith('ar')) return fallbackAr || fallbackEn;
      return fallbackEn || fallbackAr || key;
    } catch (e) {
      return fallbackEn || fallbackAr || key;
    }
  };

  // دالة إرسال البريد الإلكتروني باستخدام Resend
  const sendEmail = async ({ to, subject, text, html }) => {
    if (!resend) {
      console.warn('Resend is not available. Email will not be sent.');
      return;
    }
    try {
      const response = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to: to.trim(),
        subject: subject,
        html: html || `<p>${text}</p>`
      });
      console.log('Email sent successfully via Resend:', response);
      return response;
    } catch (error) {
      console.error('Error sending email via Resend:', error);
      throw error;
    }
  };

  const getAuditIp = (req) => req.headers['x-forwarded-for']?.split(',')[0] || req.ip || null;

  const toBoolean = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      return v === 'true' || v === '1' || v === 'yes' || v === 'y';
    }
    return false;
  };

  async function canSendNotifications(userId) {
    try {
      if (!userId) return false;
      const { data, error } = await supabase
        .from('admin_permissions')
        .select('can_send_notifications')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.warn('canSendNotifications: permissions lookup failed', error);
        return false;
      }

      return toBoolean(data?.can_send_notifications);
    } catch (e) {
      console.warn('canSendNotifications: unexpected error', e);
      return false;
    }
  }

  async function canApproveNotifications(userId) {
    try {
      if (!userId) return false;
      const { data, error } = await supabase
        .from('admin_permissions')
        .select('can_approve_notifications')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.warn('canApproveNotifications: permissions lookup failed', error);
        return false;
      }

      return toBoolean(data?.can_approve_notifications);
    } catch (e) {
      console.warn('canApproveNotifications: unexpected error', e);
      return false;
    }
  }

  const getSignedBusinessImageUrl = async (pathOrUrl) => {
    if (!pathOrUrl || typeof pathOrUrl !== 'string') return null;

    let filePath = pathOrUrl;

    // إذا كان رابطاً كاملاً استخرج المسار داخل البوكت
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      const marker = '/business-assets/';
      const index = filePath.indexOf(marker);

      if (index === -1) {
        return filePath;
      }

      filePath = filePath.substring(index + marker.length);
    }
    console.log("FILEPATH =", filePath);
    console.log("PATH:", pathOrUrl);
    try {
      const { data, error } = await supabase.storage
        .from('business-assets')

        .createSignedUrl(filePath, 60 * 60);

      if (error) {
        console.warn('Could not create signed URL:', filePath, error);
        return null;
      }

      return data?.signedUrl || data?.signed_url || null;
    } catch (err) {
      console.warn('Unexpected error:', err);
      return null;
    }
  };

  const signBusinessImages = async (businessRow) => {
    const signedRow = { ...businessRow };
    signedRow.store_image_url = await getSignedBusinessImageUrl(signedRow.store_image_url);
    signedRow.license_image_url = await getSignedBusinessImageUrl(signedRow.license_image_url);
    return signedRow;
  };

  // GET /admin/businesses - list businesses filtered by status and optional search
  app.get('/admin/businesses', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const statusFilter =
        typeof req.query.status === 'string'
          ? req.query.status.trim()
          : '';

      const search =
        typeof req.query.search === 'string'
          ? req.query.search.trim()
          : '';

      let query = supabase.from('businesses').select('*');

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      // NOTE: many fields are stored encrypted in the DB, so server-side
      // ILIKE on those columns will not match. We fetch rows (optionally
      // filtered by status) and apply the search on decrypted values below.
      // Keep the query minimal to avoid unnecessary server-side filtering.

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        return res.status(500).json({ error: 'Failed to fetch businesses' });
      }
      let out = [];
      for (const row of data || []) {
        const decrypted = decryptDeep(row);
        const signed = await signBusinessImages(decrypted);
        out.push(signed);
      }

      // If search keyword provided, filter in-memory on decrypted fields.
      if (search) {
        const keyword = String(search).trim();
        const keywordLower = keyword.toLowerCase();
        const digitsOnly = keyword.replace(/\D/g, '');

        out = out.filter(item => {
          try {
            const store = (item.store_name || '').toString().toLowerCase();
            const owner = (item.owner_name || '').toString().toLowerCase();
            const email = (item.email || '').toString().toLowerCase();
            const phone = (item.phone || '').toString();
            const country = (item.country_code || '').toString();

            // If the keyword looks like a phone (has digits), match against
            // country+phone and phone alone (digits-only comparison).
            if (digitsOnly.length >= 3) {
              const combined = (country + phone).replace(/\D/g, '');
              if (combined.includes(digitsOnly)) return true;
              if (phone.replace(/\D/g, '').includes(digitsOnly)) return true;
            }

            // Otherwise match text fields (store name, owner name, email)
            if (store.includes(keywordLower)) return true;
            if (owner.includes(keywordLower)) return true;
            if (email.includes(keywordLower)) return true;

            return false;
          } catch (e) {
            return false;
          }
        });
      }

      return res.status(200).json(out);
    } catch (error) {
      console.error('/admin/businesses list unexpected error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /admin/businesses/:userId/approve - approve a business verification request
  app.post('/admin/businesses/:userId/approve', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      if (!userId || typeof userId !== 'string') return res.status(400).json({ error: 'User ID is required' });

      const { data, error } = await supabase
        .from('businesses')
        .update({ status: 'approved', reason: null })
        .eq('user_id', userId)
        .select()
        .maybeSingle();

      if (error) {
        console.error('/admin/businesses/:userId/approve error:', error);
        return res.status(500).json({ error: 'Failed to approve business' });
      }
      if (!data) {
        return res.status(404).json({ error: 'Business not found' });
      }

      try {
        await logAudit({
          userId: req.user?.id || null,
          action: 'approve_business',
          resourceType: 'businesses',
          resourceId: userId,
          oldValues: null,
          newValues: { status: 'approved', reason: null },
          details: { route: '/admin/businesses/:userId/approve' },
          ip: getAuditIp(req),
          userAgent: req.headers['user-agent'] || null,
          status: 'success'
        });
      } catch (e) {
        console.warn('/admin/businesses/:userId/approve audit failed', e);
      }

      // جلب بيانات المستخدم لإرسال الإشعارات والبريد الإلكتروني
      const { data: userData, error: userErr } = await supabase
        .from('users')
        .select('email, fcm_token, language')
        .eq('id', userId)
        .maybeSingle();

      if (!userErr && userData) {
        // 1. إدراج إشعار في جدول الإشعارات
        const notifTitle = getNotificationText(userData?.language, 'business.approved_title', 'Business Registration Approved', 'تمت الموافقة على تسجيل نشاطك التجاري');
        const notifBody = getNotificationText(userData?.language, 'business.approved_body', 'Your business registration has been approved. You can now access all features.', 'تمت مراجعة تسجيل نشاطك التجاري والموافقة عليه. يمكنك الآن الوصول إلى جميع الميزات.');
        
        const notif = {
          user_id: userId,
          title: notifTitle,
          body: notifBody,
          type: 'business_approved',
          is_read: false,
          created_at: new Date().toISOString()
        };

        const { error: notifErr } = await supabase.from('notifications').insert(notif);
        if (notifErr) console.warn('/admin/businesses/:userId/approve notification insert failed', notifErr);

        // 2. إرسال إشعار FCM
        if (userData.fcm_token && sendFCMFn) {
          try {
            const fcmTitle = getNotificationText(userData?.language, 'business.approved_fcm_title', 'Business Approved', 'تمت الموافقة على نشاطك');
            const fcmBody = getNotificationText(userData?.language, 'business.approved_fcm_body', 'Check the app for more details.', 'يرجى مراجعة التطبيق لمعرفة التفاصيل.');
            await sendFCMFn({
              token: userData.fcm_token,
              title: fcmTitle,
              body: fcmBody
            });
            console.log('FCM business approval sent successfully');
          } catch (fcmErr) {
            console.warn('/admin/businesses/:userId/approve FCM error:', fcmErr);
          }
        }

        // 3. إرسال بريد إلكتروني
        if (userData.email) {
          try {
            const emailSubject = getNotificationText(userData?.language, 'business.approved_email_subject', 'Business Registration Approved', 'تمت الموافقة على تسجيل نشاطك التجاري');
            const emailBody = getNotificationText(userData?.language, 'business.approved_email_body', 
              'Your business registration has been successfully approved. You can now access all features and manage your business profile.',
              'تمت مراجعة تسجيل نشاطك التجاري والموافقة عليه بنجاح. يمكنك الآن الوصول إلى جميع الميزات وإدارة ملف نشاطك التجاري.'
            );
            
            await sendEmail({
              to: userData.email,
              subject: emailSubject,
              text: emailBody,
              html: `<p>${emailBody}</p>`
            });
            console.log('Business approval email sent successfully');
          } catch (emailErr) {
            console.warn('/admin/businesses/:userId/approve email error:', emailErr);
          }
        }
      }

      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('/admin/businesses/:userId/approve unexpected error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /admin/businesses/:userId/reject - reject a business verification request with a reason
  app.post('/admin/businesses/:userId/reject', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (!userId || typeof userId !== 'string') return res.status(400).json({ error: 'User ID is required' });
      if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });

      const { data, error } = await supabase
        .from('businesses')
        .update({ status: 'rejected', reason })
        .eq('user_id', userId)
        .select()
        .maybeSingle();

      if (error) {
        console.error('/admin/businesses/:userId/reject error:', error);
        return res.status(500).json({ error: 'Failed to reject business' });
      }
      if (!data) {
        return res.status(404).json({ error: 'Business not found' });
      }

      try {
        await logAudit({
          userId: req.user?.id || null,
          action: 'reject_business',
          resourceType: 'businesses',
          resourceId: userId,
          oldValues: null,
          newValues: { status: 'rejected', reason },
          details: { route: '/admin/businesses/:userId/reject' },
          ip: getAuditIp(req),
          userAgent: req.headers['user-agent'] || null,
          status: 'success'
        });
      } catch (e) {
        console.warn('/admin/businesses/:userId/reject audit failed', e);
      }

      // جلب بيانات المستخدم لإرسال الإشعارات والبريد الإلكتروني
      const { data: userData, error: userErr } = await supabase
        .from('users')
        .select('email, fcm_token, language')
        .eq('id', userId)
        .maybeSingle();

      if (!userErr && userData) {
        // 1. إدراج إشعار في جدول الإشعارات
        const notifTitle = getNotificationText(userData?.language, 'business.rejected_title', 'Business Registration Rejected', 'تم رفض تسجيل نشاطك التجاري');
        const notifBody = getNotificationText(userData?.language, 'business.rejected_body', `Rejection reason: ${reason}`, `سبب الرفض: ${reason}`);
        
        const notif = {
          user_id: userId,
          title: notifTitle,
          body: notifBody,
          type: 'business_rejected',
          is_read: false,
          created_at: new Date().toISOString()
        };

        const { error: notifErr } = await supabase.from('notifications').insert(notif);
        if (notifErr) console.warn('/admin/businesses/:userId/reject notification insert failed', notifErr);

        // 2. إرسال إشعار FCM
        if (userData.fcm_token && sendFCMFn) {
          try {
            const fcmTitle = getNotificationText(userData?.language, 'business.rejected_fcm_title', 'Business Registration Rejected', 'تم رفض تسجيل نشاطك');
            const fcmBody = getNotificationText(userData?.language, 'business.rejected_fcm_body', 'Please check the app for more details.', 'يرجى مراجعة التطبيق لمعرفة التفاصيل.');
            await sendFCMFn({
              token: userData.fcm_token,
              title: fcmTitle,
              body: fcmBody
            });
            console.log('FCM business rejection sent successfully');
          } catch (fcmErr) {
            console.warn('/admin/businesses/:userId/reject FCM error:', fcmErr);
          }
        }

        // 3. إرسال بريد إلكتروني
        if (userData.email) {
          try {
            const emailSubject = getNotificationText(userData?.language, 'business.rejected_email_subject', 'Business Registration Rejected', 'تم رفض تسجيل نشاطك التجاري');
            const emailBody = getNotificationText(userData?.language, 'business.rejected_email_body', 
              `Your business registration was rejected. Reason: ${reason}`,
              `تم رفض تسجيل نشاطك التجاري. السبب: ${reason}`
            );
            
            await sendEmail({
              to: userData.email,
              subject: emailSubject,
              text: emailBody,
              html: `<p>${emailBody}</p>`
            });
            console.log('Business rejection email sent successfully');
          } catch (emailErr) {
            console.warn('/admin/businesses/:userId/reject email error:', emailErr);
          }
        }
      }

      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('/admin/businesses/:userId/reject unexpected error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /admin/notification-campaigns - create notification campaign as draft (no FCM send)
  app.post('/admin/notification-campaigns', verifyJwtToken, async (req, res) => {
    try {
      const acting = req.user || null;
      if (!acting?.id) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const allowed = await canSendNotifications(acting.id);
      if (!allowed) {
        try {
          await logAudit({
            userId: acting.id,
            action: 'forbidden_access',
            resourceType: 'notification_campaign',
            resourceId: null,
            details: { reason: 'missing can_send_notifications permission', route: '/admin/notification-campaigns' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/notification-campaigns POST forbidden audit failed', e);
        }
        return res.status(403).json({ success: false, error: 'forbidden: missing can_send_notifications permission' });
      }

      const { title, message, audience = null, metadata = null, scheduled_at = null } = req.body || {};
      const normalizedTitle = typeof title === 'string' ? title.trim() : '';
      const normalizedMessage = typeof message === 'string' ? message.trim() : '';

      if (!normalizedTitle || !normalizedMessage) {
        return res.status(400).json({ success: false, error: 'title and message are required' });
      }

      const now = new Date().toISOString();
      const insertPayload = {
        title: normalizedTitle,
        message: normalizedMessage,
        audience,
        metadata,
        scheduled_at,
        status: 'draft',
        created_by: acting.id,
        created_at: now,
        updated_at: now
      };

      const { data, error } = await supabase
        .from('notification_campaigns')
        .insert(insertPayload)
        .select('*')
        .maybeSingle();

      if (error) {
        console.error('/admin/notification-campaigns POST error', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to create campaign' });
      }

      try {
        await logAudit({
          userId: acting.id,
          action: 'admin_create_notification_campaign',
          resourceType: 'notification_campaign',
          resourceId: data?.id || null,
          newValues: { title: normalizedTitle, status: 'draft' },
          details: { created_by: acting.id },
          ip: getAuditIp(req),
          userAgent: req.headers['user-agent'] || null,
          status: 'success'
        });
      } catch (e) {
        console.warn('/admin/notification-campaigns POST audit failed', e);
      }

      return res.status(201).json({ success: true, data: data || null });
    } catch (err) {
      console.error('/admin/notification-campaigns POST unexpected error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // POST /admin/create-special-ad - create special ad via admin secret and service role
  // POST /admin/create-special-ad
  app.post(
    '/admin/create-special-ad',
    verifyJwtToken,
    requireAdmin,
    async (req, res) => {
      try {
        const body = req.body;

        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return res.status(400).json({
            success: false,
            error: 'Request body must be an object'
          });
        }

        const insertPayload = {
          ...body,
          transaction: 'admin_special',
          payment_status: 'paid',
          is_active: true,
          type: 'special'
        };

        const { data, error } = await supabase
          .from('ads_payment')
          .insert(insertPayload)
          .select('id')
          .maybeSingle();

        if (error) {
          console.error('/admin/create-special-ad insert error', error);
          return res.status(500).json({
            success: false,
            error: error.message || 'Failed to create special ad'
          });
        }

        try {
          await logAudit({
            userId: req.user?.id || null,
            action: 'admin_create_special_ad',
            resourceType: 'ads_payment',
            resourceId: data?.id || null,
            newValues: insertPayload,
            details: {
              route: '/admin/create-special-ad'
            },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'success'
          });
        } catch (e) {
          console.warn('/admin/create-special-ad audit failed', e);
        }

        return res.status(201).json({
          success: true,
          id: data?.id || null
        });

      } catch (err) {
        console.error('/admin/create-special-ad unexpected error', err);

        return res.status(500).json({
          success: false,
          error: 'Server error'
        });
      }
    }
  );

  // POST /admin/create-publish-ad - admin creates a publish ad (creates ads_payment then publish_ad)
  app.post(
    '/admin/create-publish-ad',
    verifyJwtToken,
    requireAdmin,
    async (req, res) => {
      try {
        const body = req.body;

        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return res.status(400).json({
            success: false,
            error: 'Request body must be an object'
          });
        }

        const {
          image_url,
          expires_at,
          duration_days,
          page,
          page_name,
          is_active = false,
          upload_date,
          type: incomingType
        } = body || {};

        // Basic validation
        if (!image_url || !upload_date || !expires_at || typeof duration_days === 'undefined') {
          return res.status(400).json({ success: false, error: 'Missing required fields: image_url, upload_date, expires_at, duration_days' });
        }

        const now = new Date().toISOString();

        const insertPayload = {
          ...body,
          transaction: 'admin_publish',
          payment_status: 'paid',
          is_paid: true,
          is_active: false,
          type: 'publish',
          payment_date: now
        };

        const { data: adsData, error: adsErr } = await supabase
          .from('ads_payment')
          .insert(insertPayload)
          .select('*')
          .maybeSingle();

        if (adsErr || !adsData) {
          console.error('/admin/create-publish-ad ads_payment insert error', adsErr);
          return res.status(500).json({ success: false, error: adsErr?.message || 'Failed to create ads_payment' });
        }

        // Build publish_ad payload and associate with ads_payment
        const publishPayload = {
          ad_id: adsData.id,
          image_url,
          expires_at,
          duration_days,
          page,
          page_name,
          is_active: toBoolean(is_active),
          upload_date,
          type: 'publish',
          transaction: 'admin_publish',
          created_at: now,
          updated_at: now
        };

        const { data: pubData, error: pubErr } = await supabase
          .from('publish_ad')
          .insert(publishPayload)
          .select('id')
          .maybeSingle();

        if (pubErr || !pubData) {
          console.error('/admin/create-publish-ad publish_ad insert error', pubErr);
          // Rollback ads_payment
          try {
            await supabase.from('ads_payment').delete().eq('id', adsData.id);
          } catch (delErr) {
            console.error('/admin/create-publish-ad rollback failed', delErr);
          }
          return res.status(500).json({ success: false, error: pubErr?.message || 'Failed to create publish_ad; ads_payment rolled back' });
        }

        try {
          await logAudit({
            userId: req.user?.id || null,
            action: 'admin_create_publish_ad',
            resourceType: 'publish_ad',
            resourceId: pubData?.id || null,
            newValues: publishPayload,
            details: { ads_payment_id: adsData.id, route: '/admin/create-publish-ad' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'success'
          });
        } catch (e) {
          console.warn('/admin/create-publish-ad audit failed', e);
        }

        return res.status(201).json({
          success: true,
          ads_payment_id: adsData.id,
          publish_ad_id: pubData.id
        });
      } catch (err) {
        console.error('/admin/create-publish-ad unexpected error', err);
        return res.status(500).json({ success: false, error: 'Server error' });
      }
    }
  );
  app.get(
    '/admin/publish_ads',
    verifyJwtToken,
    requireAdmin,
    async (req, res) => {
      try {
        const { data, error } = await supabase
          .from('publish_ad')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          return res.status(500).json({
            success: false,
            error: error.message
          });
        }

        return res.json({
          success: true,
          publish_ads: data
        });

      } catch (err) {
        console.error(err);
        return res.status(500).json({
          success: false,
          error: 'Server error'
        });
      }
    }
  );
  app.patch(
    '/admin/publish_ads',
    verifyJwtToken,
    requireAdmin,
    async (req, res) => {
      try {
        const { ad_id, is_active } = req.body;

        if (!ad_id) {
          return res.status(400).json({
            success: false,
            error: 'ad_id is required'
          });
        }

        const { data, error } = await supabase
          .from('publish_ad')
          .update({
            is_active: !!is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', ad_id)
          .select()
          .single();

        if (error) {
          return res.status(500).json({
            success: false,
            error: error.message
          });
        }

        return res.json({
          success: true,
          data
        });

      } catch (err) {
        console.error(err);
        return res.status(500).json({
          success: false,
          error: 'Server error'
        });
      }
    }
  );
  app.delete(
    '/admin/publish_ads',
    verifyJwtToken,
    requireAdmin,
    async (req, res) => {
      try {
        const { ad_id } = req.body;

        if (!ad_id) {
          return res.status(400).json({
            success: false,
            error: 'ad_id is required'
          });
        }

        const { error } = await supabase
          .from('publish_ad')
          .delete()
          .eq('id', ad_id);

        if (error) {
          return res.status(500).json({
            success: false,
            error: error.message
          });
        }

        return res.json({
          success: true
        });

      } catch (err) {
        console.error(err);
        return res.status(500).json({
          success: false,
          error: 'Server error'
        });
      }
    }
  );
  // GET /admin/notification-campaigns - list notification campaigns
  app.get('/admin/notification-campaigns', verifyJwtToken, async (req, res) => {
    try {
      const acting = req.user || null;
      if (!acting?.id) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const allowed = await canSendNotifications(acting.id);
      if (!allowed) {
        try {
          await logAudit({
            userId: acting.id,
            action: 'forbidden_access',
            resourceType: 'notification_campaign',
            resourceId: null,
            details: { reason: 'missing can_send_notifications permission', route: '/admin/notification-campaigns' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/notification-campaigns GET forbidden audit failed', e);
        }
        return res.status(403).json({ success: false, error: 'forbidden: missing can_send_notifications permission' });
      }

      const parsedPage = Math.max(Number(req.query.page || 1), 1);
      const parsedLimit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
      const offset = (parsedPage - 1) * parsedLimit;

      const sortOrder = String(req.query.sort_order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
      const status = req.query.status ? String(req.query.status) : null;

      let countQuery = supabase.from('notification_campaigns').select('id', { count: 'exact', head: true });
      let dataQuery = supabase
        .from('notification_campaigns')
        .select('*')
        .order('created_at', { ascending: sortOrder === 'asc' })
        .range(offset, offset + parsedLimit - 1);

      if (status) {
        countQuery = countQuery.eq('status', status);
        dataQuery = dataQuery.eq('status', status);
      }

      const [{ count, error: countErr }, { data, error: dataErr }] = await Promise.all([countQuery, dataQuery]);

      if (countErr || dataErr) {
        console.error('/admin/notification-campaigns GET error', countErr || dataErr);
        return res.status(500).json({ success: false, error: 'Failed to fetch campaigns' });
      }

      const total = Number(count || 0);
      const totalPages = Math.max(Math.ceil(total / parsedLimit), 1);

      return res.json({
        success: true,
        data: Array.isArray(data) ? data : [],
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          totalPages,
          hasNextPage: parsedPage < totalPages,
          hasPrevPage: parsedPage > 1
        }
      });
    } catch (err) {
      console.error('/admin/notification-campaigns GET unexpected error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // GET /admin/notification-campaigns/:id - get one notification campaign
  app.get('/admin/notification-campaigns/:id', verifyJwtToken, async (req, res) => {
    try {
      const acting = req.user || null;
      if (!acting?.id) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const allowed = await canSendNotifications(acting.id);
      if (!allowed) {
        try {
          await logAudit({
            userId: acting.id,
            action: 'forbidden_access',
            resourceType: 'notification_campaign',
            resourceId: req.params?.id || null,
            details: { reason: 'missing can_send_notifications permission', route: '/admin/notification-campaigns/:id' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/notification-campaigns/:id GET forbidden audit failed', e);
        }
        return res.status(403).json({ success: false, error: 'forbidden: missing can_send_notifications permission' });
      }

      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Missing campaign id' });
      }

      const { data, error } = await supabase
        .from('notification_campaigns')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('/admin/notification-campaigns/:id GET error', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to fetch campaign' });
      }

      if (!data) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }

      return res.json({ success: true, data });
    } catch (err) {
      console.error('/admin/notification-campaigns/:id GET unexpected error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // Helper: valid campaign statuses
  const VALID_CAMPAIGN_STATUSES = new Set([
    'draft',
    'pending_approval',
    'approved',
    'sending',
    'completed',
    'failed',
    'cancelled'
  ]);

  // Helper: validate campaign status transitions
  const isValidTransition = (fromStatus, toStatus) => {
    const transitions = {
      draft: ['pending_approval', 'cancelled'],
      pending_approval: ['approved', 'cancelled', 'draft'],
      approved: ['sending', 'cancelled'],
      sending: ['completed', 'failed'],
      completed: [],
      failed: ['sending'],
      cancelled: []
    };
    return (transitions[fromStatus] || []).includes(toStatus);
  };

  // PATCH /admin/notification-campaigns/:id/submit - submit draft for approval
  app.patch('/admin/notification-campaigns/:id/submit', verifyJwtToken, async (req, res) => {
    try {
      const acting = req.user || null;
      if (!acting?.id) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const allowed = await canSendNotifications(acting.id);
      if (!allowed) {
        try {
          await logAudit({
            userId: acting.id,
            action: 'forbidden_access',
            resourceType: 'notification_campaign',
            resourceId: req.params?.id || null,
            details: { reason: 'missing can_send_notifications permission', route: '/admin/notification-campaigns/:id/submit' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/notification-campaigns/:id/submit forbidden audit failed', e);
        }
        return res.status(403).json({ success: false, error: 'forbidden: missing can_send_notifications permission' });
      }

      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Missing campaign id' });
      }

      const { data: campaign, error: fetchErr } = await supabase
        .from('notification_campaigns')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (fetchErr) {
        console.error('/admin/notification-campaigns/:id/submit fetch error', fetchErr);
        return res.status(500).json({ success: false, error: 'Failed to fetch campaign' });
      }

      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }

      if (campaign.status !== 'draft') {
        return res.status(400).json({ success: false, error: `Cannot submit campaign with status=${campaign.status}` });
      }

      const now = new Date().toISOString();
      const { data: updated, error: updateErr } = await supabase
        .from('notification_campaigns')
        .update({
          status: 'pending_approval',
          submitted_by: acting.id,
          submitted_at: now,
          updated_at: now
        })
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (updateErr) {
        console.error('/admin/notification-campaigns/:id/submit update error', updateErr);
        return res.status(500).json({ success: false, error: 'Failed to update campaign' });
      }

      try {
        await logAudit({
          userId: acting.id,
          action: 'submit_notification_campaign',
          resourceType: 'notification_campaign',
          resourceId: id,
          oldValues: { status: campaign.status },
          newValues: { status: 'pending_approval' },
          details: { submitted_by: acting.id },
          ip: getAuditIp(req),
          userAgent: req.headers['user-agent'] || null,
          status: 'success'
        });
      } catch (e) {
        console.warn('/admin/notification-campaigns/:id/submit audit failed', e);
      }

      return res.json({ success: true, data: updated });
    } catch (err) {
      console.error('/admin/notification-campaigns/:id/submit unexpected error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // PATCH /admin/notification-campaigns/:id/approve - approve campaign for sending
  app.patch('/admin/notification-campaigns/:id/approve', verifyJwtToken, async (req, res) => {
    try {
      const acting = req.user || null;
      if (!acting?.id) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const allowed = await canApproveNotifications(acting.id);
      if (!allowed) {
        try {
          await logAudit({
            userId: acting.id,
            action: 'forbidden_access',
            resourceType: 'notification_campaign',
            resourceId: req.params?.id || null,
            details: { reason: 'missing can_approve_notifications permission', route: '/admin/notification-campaigns/:id/approve' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/notification-campaigns/:id/approve forbidden audit failed', e);
        }
        return res.status(403).json({ success: false, error: 'forbidden: missing can_approve_notifications permission' });
      }

      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Missing campaign id' });
      }

      const { data: campaign, error: fetchErr } = await supabase
        .from('notification_campaigns')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (fetchErr) {
        console.error('/admin/notification-campaigns/:id/approve fetch error', fetchErr);
        return res.status(500).json({ success: false, error: 'Failed to fetch campaign' });
      }

      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }

      if (campaign.status !== 'pending_approval') {
        return res.status(400).json({ success: false, error: `Cannot approve campaign with status=${campaign.status}` });
      }

      // Prevent creator from approving their own campaign
      if (campaign.created_by === acting.id) {
        return res.status(403).json({ success: false, error: 'Cannot approve your own campaign' });
      }

      const now = new Date().toISOString();
      const { data: updated, error: updateErr } = await supabase
        .from('notification_campaigns')
        .update({
          status: 'approved',
          approved_by: acting.id,
          approved_at: now,
          updated_at: now
        })
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (updateErr) {
        console.error('/admin/notification-campaigns/:id/approve update error', updateErr);
        return res.status(500).json({ success: false, error: 'Failed to update campaign' });
      }

      try {
        await logAudit({
          userId: acting.id,
          action: 'approve_notification_campaign',
          resourceType: 'notification_campaign',
          resourceId: id,
          oldValues: { status: campaign.status },
          newValues: { status: 'approved', approved_by: acting.id },
          details: { approved_by: acting.id },
          ip: getAuditIp(req),
          userAgent: req.headers['user-agent'] || null,
          status: 'success'
        });
      } catch (e) {
        console.warn('/admin/notification-campaigns/:id/approve audit failed', e);
      }

      return res.json({ success: true, data: updated });
    } catch (err) {
      console.error('/admin/notification-campaigns/:id/approve unexpected error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // PATCH /admin/notification-campaigns/:id/cancel - cancel campaign
  app.patch('/admin/notification-campaigns/:id/cancel', verifyJwtToken, async (req, res) => {
    try {
      const acting = req.user || null;
      if (!acting?.id) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const allowed = await canApproveNotifications(acting.id);
      if (!allowed) {
        try {
          await logAudit({
            userId: acting.id,
            action: 'forbidden_access',
            resourceType: 'notification_campaign',
            resourceId: req.params?.id || null,
            details: { reason: 'missing can_approve_notifications permission', route: '/admin/notification-campaigns/:id/cancel' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/notification-campaigns/:id/cancel forbidden audit failed', e);
        }
        return res.status(403).json({ success: false, error: 'forbidden: missing can_approve_notifications permission' });
      }

      const id = req.params.id;
      const { reason } = req.body || {};
      const cancelReason = typeof reason === 'string' ? reason.trim() : null;

      if (!id) {
        return res.status(400).json({ success: false, error: 'Missing campaign id' });
      }

      const { data: campaign, error: fetchErr } = await supabase
        .from('notification_campaigns')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (fetchErr) {
        console.error('/admin/notification-campaigns/:id/cancel fetch error', fetchErr);
        return res.status(500).json({ success: false, error: 'Failed to fetch campaign' });
      }

      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }

      // Cannot cancel completed campaigns
      if (campaign.status === 'completed') {
        return res.status(400).json({ success: false, error: 'Cannot cancel completed campaign' });
      }

      const now = new Date().toISOString();
      const { data: updated, error: updateErr } = await supabase
        .from('notification_campaigns')
        .update({
          status: 'cancelled',
          cancelled_by: acting.id,
          cancelled_at: now,
          cancel_reason: cancelReason,
          updated_at: now
        })
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (updateErr) {
        console.error('/admin/notification-campaigns/:id/cancel update error', updateErr);
        return res.status(500).json({ success: false, error: 'Failed to update campaign' });
      }

      try {
        await logAudit({
          userId: acting.id,
          action: 'cancel_notification_campaign',
          resourceType: 'notification_campaign',
          resourceId: id,
          oldValues: { status: campaign.status },
          newValues: { status: 'cancelled', cancel_reason: cancelReason },
          details: { cancelled_by: acting.id, reason: cancelReason },
          ip: getAuditIp(req),
          userAgent: req.headers['user-agent'] || null,
          status: 'success'
        });
      } catch (e) {
        console.warn('/admin/notification-campaigns/:id/cancel audit failed', e);
      }

      return res.json({ success: true, data: updated });
    } catch (err) {
      console.error('/admin/notification-campaigns/:id/cancel unexpected error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // POST /admin/notification-campaigns/:id/send - send approved campaign
  app.post('/admin/notification-campaigns/:id/send', verifyJwtToken, async (req, res) => {
    try {
      const acting = req.user || null;
      if (!acting?.id) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const allowed = await canApproveNotifications(acting.id);
      if (!allowed) {
        try {
          await logAudit({
            userId: acting.id,
            action: 'forbidden_access',
            resourceType: 'notification_campaign',
            resourceId: req.params?.id || null,
            details: { reason: 'missing can_approve_notifications permission', route: '/admin/notification-campaigns/:id/send' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/notification-campaigns/:id/send forbidden audit failed', e);
        }
        return res.status(403).json({ success: false, error: 'forbidden: missing can_approve_notifications permission' });
      }

      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Missing campaign id' });
      }

      const { data: campaign, error: fetchErr } = await supabase
        .from('notification_campaigns')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (fetchErr) {
        console.error('/admin/notification-campaigns/:id/send fetch error', fetchErr);
        return res.status(500).json({ success: false, error: 'Failed to fetch campaign' });
      }

      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }

      if (campaign.status !== 'approved') {
        return res.status(400).json({ success: false, error: `Campaign must be approved before sending (current status=${campaign.status})` });
      }

      if (!campaign.approved_by) {
        return res.status(400).json({ success: false, error: 'Campaign missing approval' });
      }

      // Prevent creator from sending their own campaign
      if (campaign.created_by === acting.id) {
        return res.status(403).json({ success: false, error: 'Cannot send your own campaign' });
      }

      const now = new Date().toISOString();

      // Update to 'sending' status
      const { data: updated, error: updateErr } = await supabase
        .from('notification_campaigns')
        .update({
          status: 'sending',
          started_at: now,
          updated_at: now
        })
        .eq('id', id)
        .eq('status', 'approved')  // Transaction: only update if still approved
        .select('*')
        .maybeSingle();

      if (updateErr) {
        console.error('/admin/notification-campaigns/:id/send update error', updateErr);
        return res.status(500).json({ success: false, error: 'Failed to start sending' });
      }

      if (!updated) {
        return res.status(400).json({ success: false, error: 'Campaign status changed or not found. Cannot send.' });
      }

      // Fetch users with non-null FCM tokens
      const { data: users, error: usersErr } = await supabase
        .from('users')
        .select('id, fcm_token')
        .not('fcm_token', 'is', null);

      if (usersErr) {
        console.error('/admin/notification-campaigns/:id/send users fetch error', usersErr);
        await supabase
          .from('notification_campaigns')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', id);
        return res.status(500).json({ success: false, error: 'Failed to fetch FCM tokens' });
      }

      const tokenRows = (Array.isArray(users) ? users : [])
        .map((u) => ({ userId: u.id, token: typeof u.fcm_token === 'string' ? u.fcm_token.trim() : '' }))
        .filter((row) => row.token.length > 0);

      const completedAt = new Date().toISOString();

      try {
        let successCount = 0;
        let failureCount = 0;
        const invalidTokenUserIds = [];

        // Firebase multicast supports up to 500 tokens per request
        for (let i = 0; i < tokenRows.length; i += 500) {
          const chunk = tokenRows.slice(i, i + 500);
          const tokens = chunk.map((r) => r.token);

          if (!tokens.length) continue;

          const messaging = getMessaging();
          const response = await messaging.sendEachForMulticast({
            tokens,
            notification: {
              title: campaign.title,
              body: campaign.message
            },
            data: {
              campaign_id: String(campaign.id),
              type: 'admin_campaign'
            }
          });

          successCount += Number(response.successCount || 0);
          failureCount += Number(response.failureCount || 0);

          response.responses.forEach((result, index) => {
            if (!result.success && result.error?.code === 'messaging/registration-token-not-registered') {
              const hit = chunk[index];
              if (hit?.userId) invalidTokenUserIds.push(hit.userId);
            }
          });
        }

        if (invalidTokenUserIds.length > 0) {
          const uniqueUserIds = [...new Set(invalidTokenUserIds)];
          const { error: clearTokenErr } = await supabase
            .from('users')
            .update({ fcm_token: null })
            .in('id', uniqueUserIds);
          if (clearTokenErr) {
            console.error('/admin/notification-campaigns/:id/send invalid token cleanup error', clearTokenErr);
          }
        }

        const { data: completed, error: completeErr } = await supabase
          .from('notification_campaigns')
          .update({
            status: 'completed',
            completed_at: completedAt,
            sent_count: successCount,
            failed_count: failureCount,
            updated_at: completedAt
          })
          .eq('id', id)
          .select('*')
          .maybeSingle();

        if (completeErr) {
          console.error('/admin/notification-campaigns/:id/send completion update error', completeErr);
          await supabase
            .from('notification_campaigns')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', id);
          return res.status(500).json({ success: false, error: 'Failed to complete campaign after send' });
        }

        try {
          await logAudit({
            userId: acting.id,
            action: 'send_notification_campaign',
            resourceType: 'notification_campaign',
            resourceId: id,
            oldValues: { status: campaign.status },
            newValues: {
              status: 'completed',
              sent_count: successCount,
              failed_count: failureCount,
              completed_at: completedAt
            },
            details: { sent_by: acting.id, invalid_tokens_cleared: invalidTokenUserIds.length },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'success'
          });
        } catch (e) {
          console.warn('/admin/notification-campaigns/:id/send audit failed', e);
        }

        return res.json({
          success: true,
          data: completed,
          summary: {
            totalTokens: tokenRows.length,
            sent_count: successCount,
            failed_count: failureCount,
            invalid_tokens_cleared: invalidTokenUserIds.length
          }
        });
      } catch (sendErr) {
        console.error('/admin/notification-campaigns/:id/send firebase send error', sendErr);

        await supabase
          .from('notification_campaigns')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        return res.status(500).json({ success: false, error: 'Campaign send failed' });
      }
    } catch (err) {
      console.error('/admin/notification-campaigns/:id/send unexpected error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // POST /admin/notification-campaigns/:id/test - send test notification to current admin
  app.post('/admin/notification-campaigns/:id/test', verifyJwtToken, async (req, res) => {
    try {
      const acting = req.user || null;
      if (!acting?.id) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const allowed = await canSendNotifications(acting.id);
      if (!allowed) {
        try {
          await logAudit({
            userId: acting.id,
            action: 'forbidden_access',
            resourceType: 'notification_campaign',
            resourceId: req.params?.id || null,
            details: { reason: 'missing can_send_notifications permission', route: '/admin/notification-campaigns/:id/test' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/notification-campaigns/:id/test forbidden audit failed', e);
        }
        return res.status(403).json({ success: false, error: 'forbidden: missing can_send_notifications permission' });
      }

      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Missing campaign id' });
      }

      const { data: campaign, error: fetchErr } = await supabase
        .from('notification_campaigns')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (fetchErr) {
        console.error('/admin/notification-campaigns/:id/test fetch error', fetchErr);
        return res.status(500).json({ success: false, error: 'Failed to fetch campaign' });
      }

      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }

      // Get current admin's FCM token
      const { data: adminUser, error: userErr } = await supabase
        .from('users')
        .select('fcm_token')
        .eq('id', acting.id)
        .maybeSingle();

      if (userErr) {
        console.error('/admin/notification-campaigns/:id/test user fetch error', userErr);
        return res.status(500).json({ success: false, error: 'Failed to fetch user' });
      }

      let fcmSent = false;
      if (adminUser?.fcm_token) {
        try {
          await sendFCMNotificationV1({
            token: adminUser.fcm_token,
            title: campaign.title,
            body: campaign.message,
            data: {
              type: 'notification_campaign_test',
              campaignId: String(campaign.id),
              testSentAt: new Date().toISOString()
            }
          });
          fcmSent = true;
          console.log(`Test notification sent to admin ${acting.id}`);
        } catch (fcmErr) {
          console.warn(`Test notification FCM error for admin ${acting.id}:`, fcmErr);
        }
      }

      try {
        await logAudit({
          userId: acting.id,
          action: 'test_notification_campaign',
          resourceType: 'notification_campaign',
          resourceId: id,
          details: { test_sent_to: acting.id, fcm_sent: fcmSent, campaign_status: campaign.status },
          ip: getAuditIp(req),
          userAgent: req.headers['user-agent'] || null,
          status: 'success'
        });
      } catch (e) {
        console.warn('/admin/notification-campaigns/:id/test audit failed', e);
      }

      return res.json({
        success: true,
        message: 'Test notification sent',
        data: {
          campaignId: campaign.id,
          testSentTo: acting.id,
          fcmSent,
          campaignStatus: campaign.status
        }
      });
    } catch (err) {
      console.error('/admin/notification-campaigns/:id/test unexpected error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // Enhanced GET /admin/notification-campaigns with filters, search, and summary
  app.get('/admin/notification-campaigns/enhanced', verifyJwtToken, async (req, res) => {
    try {
      const acting = req.user || null;
      if (!acting?.id) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const allowed = await canSendNotifications(acting.id);
      if (!allowed) {
        try {
          await logAudit({
            userId: acting.id,
            action: 'forbidden_access',
            resourceType: 'notification_campaign',
            resourceId: null,
            details: { reason: 'missing can_send_notifications permission', route: '/admin/notification-campaigns/enhanced' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/notification-campaigns/enhanced forbidden audit failed', e);
        }
        return res.status(403).json({ success: false, error: 'forbidden: missing can_send_notifications permission' });
      }

      const parsedPage = Math.max(Number(req.query.page || 1), 1);
      const parsedLimit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
      const offset = (parsedPage - 1) * parsedLimit;

      const sortOrder = String(req.query.sort_order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
      const status = req.query.status ? String(req.query.status) : null;
      const search = req.query.search ? String(req.query.search).trim() : null;
      const createdBy = req.query.created_by ? String(req.query.created_by) : null;
      const audience = req.query.audience ? String(req.query.audience) : null;
      const campaignType = req.query.campaign_type ? String(req.query.campaign_type) : null;

      const dateFrom = req.query.date_from ? new Date(String(req.query.date_from)) : null;
      const dateTo = req.query.date_to ? new Date(String(req.query.date_to)) : null;

      if (dateFrom && Number.isNaN(dateFrom.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid date_from' });
      }
      if (dateTo && Number.isNaN(dateTo.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid date_to' });
      }

      const applyFilters = (q, options = {}) => {
        const { countOnly = false } = options;

        let query = q;

        if (status) query = query.eq('status', status);
        if (createdBy) query = query.eq('created_by', createdBy);
        if (audience) query = query.ilike('audience', `%${audience}%`);
        if (campaignType) query = query.eq('campaign_type', campaignType);

        if (dateFrom) query = query.gte('created_at', dateFrom.toISOString());
        if (dateTo) query = query.lte('created_at', dateTo.toISOString());

        return query;
      };

      let countQuery = applyFilters(
        supabase.from('notification_campaigns').select('id', { count: 'exact', head: true })
      );

      let dataQuery = applyFilters(
        supabase
          .from('notification_campaigns')
          .select('*')
          .order('created_at', { ascending: sortOrder === 'asc' })
          .range(offset, offset + parsedLimit - 1)
      );

      // Get summary counts by status
      const statusCountQueries = {
        draft: applyFilters(supabase.from('notification_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'draft')),
        pending_approval: applyFilters(supabase.from('notification_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval')),
        approved: applyFilters(supabase.from('notification_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'approved')),
        sending: applyFilters(supabase.from('notification_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'sending')),
        completed: applyFilters(supabase.from('notification_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'completed')),
        failed: applyFilters(supabase.from('notification_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'failed')),
        cancelled: applyFilters(supabase.from('notification_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'cancelled'))
      };

      const [
        { count: totalCount, error: totalErr },
        { data, error: dataErr },
        { count: draftCount, error: draftErr },
        { count: pendingCount, error: pendingErr },
        { count: approvedCount, error: approvedErr },
        { count: sendingCount, error: sendingErr },
        { count: completedCount, error: completedErr },
        { count: failedCount, error: failedErr },
        { count: cancelledCount, error: cancelledErr }
      ] = await Promise.all([
        countQuery,
        dataQuery,
        statusCountQueries.draft,
        statusCountQueries.pending_approval,
        statusCountQueries.approved,
        statusCountQueries.sending,
        statusCountQueries.completed,
        statusCountQueries.failed,
        statusCountQueries.cancelled
      ]);

      if (totalErr || dataErr) {
        console.error('/admin/notification-campaigns/enhanced query error', totalErr || dataErr);
        return res.status(500).json({ success: false, error: 'Failed to fetch campaigns' });
      }

      const total = Number(totalCount || 0);
      const totalPages = Math.max(Math.ceil(total / parsedLimit), 1);
      const safeData = Array.isArray(data) ? data : [];

      // Check user permissions
      const canApprove = await canApproveNotifications(acting.id);
      const canSend = allowed;

      return res.json({
        success: true,
        data: safeData,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          totalPages,
          hasNextPage: parsedPage < totalPages,
          hasPrevPage: parsedPage > 1
        },
        summary: {
          totalRecords: total,
          pageRecords: safeData.length,
          statusCounts: {
            draft: Number(draftCount || 0),
            pending_approval: Number(pendingCount || 0),
            approved: Number(approvedCount || 0),
            sending: Number(sendingCount || 0),
            completed: Number(completedCount || 0),
            failed: Number(failedCount || 0),
            cancelled: Number(cancelledCount || 0)
          },
          filtersApplied: {
            status: status || null,
            search: search || null,
            created_by: createdBy || null,
            audience: audience || null,
            campaign_type: campaignType || null,
            date_from: dateFrom ? dateFrom.toISOString() : null,
            date_to: dateTo ? dateTo.toISOString() : null,
            sort_order: sortOrder
          }
        },
        permissions: {
          can_send_notifications: canSend,
          can_approve_notifications: canApprove,
          user_id: acting.id
        }
      });
    } catch (err) {
      console.error('/admin/notification-campaigns/enhanced unexpected error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // GET /admin/audit-logs - list audit logs with filters + pagination + insights (admin only)
  app.get('/admin/audit-logs', verifyJwtToken, async (req, res) => {
    try {
      const acting = req.user || null;
      const roleCheck = (acting && acting.role) ? String(acting.role).toLowerCase() : '';

      if (!roleCheck.includes('admin')) {
        try {
          await logAudit({
            userId: acting?.id || null,
            action: 'forbidden_access',
            resourceType: 'audit_logs',
            resourceId: null,
            details: { reason: 'forbidden: admin only', route: '/admin/audit-logs' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed',
            errorMessage: 'forbidden: admin only'
          });
        } catch (e) {
          console.warn('/admin/audit-logs forbidden audit failed', e);
        }
        return res.status(403).json({ success: false, error: 'forbidden: admin only' });
      }

      const {
        user_id,
        ip_address,
        action,
        resource_type,
        status,
        from_date,
        to_date,
        sort_by,
        sort_order,
        page,
        limit
      } = req.query || {};

      const parsedPage = Math.max(Number(page || 1), 1);
      const parsedLimit = Math.min(Math.max(Number(limit || 50), 1), 200);
      const offset = (parsedPage - 1) * parsedLimit;

      const allowedSortColumns = new Set([
        'created_at',
        'action',
        'status',
        'resource_type',
        'resource_id',
        'user_id',
        'ip_address'
      ]);
      const sortBy = allowedSortColumns.has(String(sort_by || 'created_at')) ? String(sort_by || 'created_at') : 'created_at';
      const sortOrder = String(sort_order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

      const fromIso = from_date ? new Date(String(from_date)) : null;
      const toIso = to_date ? new Date(String(to_date)) : null;

      if (from_date && Number.isNaN(fromIso?.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid from_date' });
      }
      if (to_date && Number.isNaN(toIso?.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid to_date' });
      }

      const applyFilters = (q, options = {}) => {
        const { includeAction = true, overrideAction = null } = options;

        let query = q;

        if (user_id) query = query.eq('user_id', String(user_id));
        if (ip_address) query = query.ilike('ip_address', `%${String(ip_address)}%`);
        if (resource_type) query = query.eq('resource_type', String(resource_type));
        if (status) query = query.eq('status', String(status));

        if (includeAction && action) query = query.eq('action', String(action));
        if (overrideAction) query = query.eq('action', String(overrideAction));

        if (fromIso) query = query.gte('created_at', fromIso.toISOString());
        if (toIso) query = query.lte('created_at', toIso.toISOString());

        return query;
      };

      const countQuery = applyFilters(
        supabase.from('audit_logs').select('id', { count: 'exact', head: true })
      );

      const dataQuery = applyFilters(
        supabase
          .from('audit_logs')
          .select('id, user_id, action, resource_type, resource_id, old_values, new_values, ip_address, user_agent, status, created_at')
          .order(sortBy, { ascending: sortOrder === 'asc' })
          .range(offset, offset + parsedLimit - 1)
      );

      const failedCountQuery = applyFilters(
        supabase.from('audit_logs').select('id', { count: 'exact', head: true }).eq('status', 'failed')
      );

      const successCountQuery = applyFilters(
        supabase.from('audit_logs').select('id', { count: 'exact', head: true }).eq('status', 'success')
      );

      const unauthorizedCountQuery = applyFilters(
        supabase.from('audit_logs').select('id', { count: 'exact', head: true }),
        { includeAction: false, overrideAction: 'unauthorized_access' }
      );

      const forbiddenCountQuery = applyFilters(
        supabase.from('audit_logs').select('id', { count: 'exact', head: true }),
        { includeAction: false, overrideAction: 'forbidden_access' }
      );

      const [
        { count: totalCount, error: totalErr },
        { data, error: dataErr },
        { count: failedCount, error: failedErr },
        { count: successCount, error: successErr },
        { count: unauthorizedCount, error: unauthorizedErr },
        { count: forbiddenCount, error: forbiddenErr }
      ] = await Promise.all([
        countQuery,
        dataQuery,
        failedCountQuery,
        successCountQuery,
        unauthorizedCountQuery,
        forbiddenCountQuery
      ]);

      if (totalErr || dataErr || failedErr || successErr || unauthorizedErr || forbiddenErr) {
        console.error('/admin/audit-logs query error', totalErr || dataErr || failedErr || successErr || unauthorizedErr || forbiddenErr);
        return res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
      }

      const total = Number(totalCount || 0);
      const totalPages = Math.max(Math.ceil(total / parsedLimit), 1);
      const safeData = Array.isArray(data) ? data : [];

      const pageUniqueIps = new Set(safeData.map(r => r?.ip_address).filter(Boolean));
      const pageActionsCount = safeData.reduce((acc, row) => {
        const key = row?.action || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const topRiskActions = Object.entries(pageActionsCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([act, count]) => ({ action: act, count }));

      const failed = Number(failedCount || 0);
      const success = Number(successCount || 0);
      const unauthorized = Number(unauthorizedCount || 0);
      const forbidden = Number(forbiddenCount || 0);

      return res.json({
        success: true,
        data: safeData,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          totalPages,
          hasNextPage: parsedPage < totalPages,
          hasPrevPage: parsedPage > 1
        },
        summary: {
          totalRecords: total,
          pageRecords: safeData.length,
          statusCounts: {
            success,
            failed,
            other: Math.max(total - success - failed, 0)
          },
          filtersApplied: {
            user_id: user_id || null,
            ip_address: ip_address || null,
            action: action || null,
            resource_type: resource_type || null,
            status: status || null,
            from_date: fromIso ? fromIso.toISOString() : null,
            to_date: toIso ? toIso.toISOString() : null,
            sort_by: sortBy,
            sort_order: sortOrder
          }
        },
        securityInsights: {
          failedRate: total > 0 ? Number(((failed / total) * 100).toFixed(2)) : 0,
          unauthorizedAttempts: unauthorized,
          forbiddenAttempts: forbidden,
          suspiciousAttempts: unauthorized + forbidden,
          uniqueIpCountInPage: pageUniqueIps.size,
          topRiskActions
        }
      });
    } catch (err) {
      console.error('/admin/audit-logs error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // GET /admin/dashboard - summary + recent samples
  app.get('/admin/dashboard', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const [{ data: usersCount }, { data: reportsCount }, { data: adsCount }, { data: transfersCount }] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact' }),
        supabase.from('phone_reports').select('id', { count: 'exact' }),
        supabase.from('phones').select('id', { count: 'exact' }),
        supabase.from('transfer_records').select('id', { count: 'exact' })
      ]);

      const recentReports = (await supabase.from('phone_reports').select('*').order('report_date', { ascending: false }).limit(10)).data || [];
      const recentAds = (await supabase.from('phones').select('*').order('id', { ascending: false }).limit(10)).data || [];
      const recentUsers = (await supabase.from('users').select('*').order('id', { ascending: false }).limit(10)).data || [];
      const recentTransfers = (await supabase.from('transfer_records').select('*').order('id', { ascending: false }).limit(10)).data || [];

      return res.json({
        stats: {
          users: Array.isArray(usersCount) ? usersCount.length : (usersCount ?? 0),
          reports: Array.isArray(reportsCount) ? reportsCount.length : (reportsCount ?? 0),
          ads: Array.isArray(adsCount) ? adsCount.length : (adsCount ?? 0),
          transfer_records: Array.isArray(transfersCount) ? transfersCount.length : (transfersCount ?? 0)
        },
        recent: {
          reports: recentReports.map(r => ({ id: r.id, ...decryptDeep(r) })),
          ads: recentAds.map(a => ({ id: a.id, ...decryptDeep(a) })),
          users: recentUsers.map(u => ({ id: u.id, ...decryptDeep(u) })),
          transfer_records: recentTransfers.map(t => ({ id: t.id, ...decryptDeep(t) }))
        }
      });
    } catch (err) {
      console.error('/admin/dashboard error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /admin/reports - list reports (decrypted)
  app.get('/admin/reports', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);
      const filter = (req.query.filter || '').toString();
      const imei = req.query.imei || null;
      const imei_hash = req.query.imei_hash || null;
      const phone = req.query.phone || null;

      let q = supabase.from('phone_reports').select('*').order('report_date', { ascending: false }).limit(limit);

      if (filter && filter !== 'all') {
        const f = filter.toString().toLowerCase();
        if (f === 'paid' || f === 'unpaid') {
          q = q.eq('is_paid', f === 'paid');
        } else if (filter.includes(',')) {
          const vals = filter.split(',').map(s => s.trim()).filter(Boolean);
          if (vals.length) q = q.in('status', vals);
        } else {
          q = q.eq('status', filter);
        }
      }

      try {
        if (imei_hash) {
          q = q.eq('imei_hash', imei_hash.toString());
        } else if (imei) {
          try {
            const { createHash } = await import('crypto');
            const h = createHash('sha256').update(String(imei).replace(/\D/g, '')).digest('hex');
            q = q.eq('imei_hash', h);
          } catch (e) {
            console.warn('/admin/reports: server hashing unavailable; please call with imei_hash', e);
          }
        }
      } catch (e) {
        console.warn('/admin/reports: hash handling error', e);
      }

      const { data, error } = await q;
      if (error) throw error;

      let rows = (data || []);

      // If client requested filtering by whether the report's IMEI is registered in the system
      // use the stored imei_hash on phone_reports and compare against registered_phones.imei_hash
      const registeredFilter = req.query.registered;
      if (typeof registeredFilter !== 'undefined' && registeredFilter !== null && String(registeredFilter).trim() !== '') {
        const val = String(registeredFilter).toLowerCase();
        const wantRegistered = (val === 'true' || val === '1' || val === 'yes' || val === 'registered');
        try {
          const { data: regRows, error: regErr } = await supabase.from('registered_phones').select('imei_hash');
          if (!regErr && Array.isArray(regRows)) {
            const regSet = new Set(regRows.map(r => r.imei_hash).filter(Boolean));
            rows = rows.filter(r => {
              const h = r.imei_hash || null;
              if (h) return wantRegistered ? regSet.has(h) : !regSet.has(h);
              // If report lacks imei_hash, treat it as unregistered
              return !wantRegistered;
            });
          }
        } catch (e) {
          console.warn('/admin/reports: registered filter error', e);
        }
      }

      // If client requested phone search, decrypt rows and filter in-memory (note: unindexed, may be slow)
      if (phone) {
        const normalizedPhone = String(phone).replace(/\D/g, '');
        rows = rows.filter(r => {
          try {
            const dec = decryptDeep(r);
            const p = dec && dec.phone_number ? dec.phone_number : null;
            if (!p) return false;
            const normalized = String(p).replace(/\D/g, '');
            return normalized.includes(normalizedPhone) || normalized === normalizedPhone;
          } catch (e) {
            return false;
          }
        });
      }

      const out = rows.map(r => ({
        id: r.id,
        ...decryptDeep(r)
      }));

      for (const r of out) {

        // ===== صورة الفاتورة =====
        if (
          r.receipt_image_url &&
          !r.receipt_image_url.startsWith("http")
        ) {
          const { data } = await supabase.storage
            .from("registerphone")
            .createSignedUrl(r.receipt_image_url, 3600);

          if (data?.signedUrl) {
            r.receipt_image_url = data.signedUrl;
          }
        }

        // ===== صورة المحضر =====
        if (
          r.report_image_url &&
          !r.report_image_url.startsWith("http")
        ) {
          const { data } = await supabase.storage
            .from("phone_reports")
            .createSignedUrl(r.report_image_url, 3600);

          if (data?.signedUrl) {
            r.report_image_url = data.signedUrl;
          }
        }
      }

      res.json(out);
      return res.json({ ok: true, reports: out });
    } catch (err) {
      console.error('/admin/reports error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // PATCH /admin/reports/:id - update report status
  app.patch('/admin/reports/:id', verifyJwtToken, async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        try {
          await logAudit({
            userId: null,
            action: 'unauthorized_access',
            resourceType: 'phone_reports',
            resourceId: req.params.id || null,
            details: { reason: 'Missing authentication', endpoint: '/admin/reports/:id' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/reports/:id auth audit failed', e);
        }
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const userRole = (user.role || '').toString().toLowerCase();
      if (!userRole.includes('admin')) {
        try {
          await logAudit({
            userId: user.id,
            action: 'forbidden_access',
            resourceType: 'phone_reports',
            resourceId: req.params.id || null,
            details: { reason: 'Non-admin attempting to update report', user_role: userRole },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/reports/:id forbidden audit failed', e);
        }
        return res.status(403).json({ error: 'Forbidden: admin only' });
      }

      const { id } = req.params;
      const { status } = req.body;

      const normalizedStatus = typeof status === 'string' ? status.trim() : status;
      if (!normalizedStatus) {
        return res.status(400).json({ error: 'status is required' });
      }

      const { data: existing, error: existingError } = await supabase
        .from('phone_reports')
        .select('id, status, user_id')
        .eq('id', id)
        .maybeSingle();

      if (existingError) {
        console.error(existingError);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!existing) {
        return res.status(404).json({ error: 'Report not found' });
      }

      const oldStatus = typeof existing.status === 'string' ? existing.status.trim() : existing.status;
      if (oldStatus === normalizedStatus) {
        return res.json({
          success: true,
          message: 'No changes detected',
          data: existing
        });
      }

      const { data, error } = await supabase
        .from('phone_reports')
        .update({ status: normalizedStatus })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error(error);
        return res.status(500).json({ error: 'Database error' });
      }

      try {
        await logAudit({
          userId: user.id,
          action: 'update_report_status',
          resourceType: 'phone_reports',
          resourceId: data?.id || null,
          oldValues: { status: oldStatus || null },
          newValues: { status: data?.status || normalizedStatus },
          details: { admin_id: user.id, report_owner: existing.user_id },
          ip: getAuditIp(req),
          userAgent: req.headers['user-agent'] || null,
          status: 'success'
        });
      } catch (e) {
        console.warn('/admin/reports/:id audit failed', e);
      }

      /* رسائل الإشعارات */
      const notificationMessages = {
        active: {
          title: 'تم اعتماد بلاغ فقدان هاتفك',
          body: 'تم الانتهاء من مراجعة بلاغ فقدان هاتفك واعتماده بنجاح. سيظل البلاغ نشطًا داخل النظام، وسيتم إشعارك فور حدوث أي تحديث يتعلق به.'
        },

        rejected: {
          title: 'تعذر اعتماد البلاغ',
          body: 'بعد مراجعة البلاغ، تعذر اعتماده في الوقت الحالي لعدم اكتمال البيانات أو الحاجة إلى مستندات إضافية. يرجى مراجعة تفاصيل البلاغ وإعادة إرساله بعد استيفاء المتطلبات.'
        },

        resolved: {
          title: 'تم حل البلاغ بنجاح',
          body: 'يسعدنا إبلاغك بأنه تم إغلاق البلاغ بعد حل المشكلة المتعلقة بالهاتف. نشكرك على ثقتك في IMEI Safe، ونتمنى لك تجربة آمنة دائمًا.'
        }
      };

      const notification = notificationMessages[normalizedStatus];

      if (notification) {

        /* إشعار داخلي داخل التطبيق */
        const { error: notificationError } = await supabase
          .from('notifications')
          .insert({
            user_id: data.user_id,
            title: notification.title,
            body: notification.body,
            type: 'report_update',
            is_read: false,
            created_at: new Date().toISOString()
          });

        if (notificationError) {
          console.error('Notification Insert Error:', notificationError);
        } else {
          console.log('Notification inserted successfully');
        }

        /* الحصول على FCM Token */
        const { data: user } = await supabase
          .from('users')
          .select('fcm_token')
          .eq('id', data.user_id)
          .single();

        /* إرسال إشعار خارجي */
        if (user?.fcm_token) {
          try {
            await sendFCMNotificationV1({
              token: user.fcm_token,
              title: notification.title,
              body: notification.body,
              data: {
                type: 'report_update',
                reportId: String(data.id),
                status: status
              }
            });

            console.log('Report FCM sent successfully');
          } catch (fcmError) {
            console.error('Report FCM Error:', fcmError);
          }
        }
      }


      return res.json({
        success: true,
        data
      });

    } catch (err) {
      console.error('/admin/reports/:id error', err);
      return res.status(500).json({
        error: 'Server error'
      });
    }
  });

  // GET /admin/ads - list phone ads (decrypted)
  app.get('/admin/ads', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);
      const filter = (req.query.filter || '').toString();
      const user_id = req.query.user_id || null;
      const id = req.query.id || null;
      const type = req.query.type || null;
      const phone_id = req.query.phone_id || null;

      let q = supabase.from('ads_payment').select('*').order('id', { ascending: false }).limit(limit);

      if (filter && filter !== 'all') {
        if (filter.includes(',')) {
          const vals = filter.split(',').map(s => s.trim()).filter(Boolean);
          if (vals.length) q = q.in('status', vals);
        } else {
          q = q.eq('status', filter);
        }
      }
      if (user_id) q = q.eq('user_id', user_id);
      if (id) q = q.eq('id', id);
      if (type) q = q.eq('type', type);
      if (phone_id) q = q.eq('phone_id', phone_id);

      const { data, error } = await q;
      if (error) throw error;
      const out = (data || []).map(p => ({ id: p.id, ...decryptDeep(p) }));
      return res.json({ ok: true, ads: out });
    } catch (err) {
      console.error('/admin/ads error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // Backwards-compatible alias: GET /admin/ads_payment
  app.get('/admin/ads_payment', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);
      const filter = (req.query.filter || '').toString();
      const user_id = req.query.user_id || null;
      const id = req.query.id || null;
      const type = req.query.type || null;
      const phone_id = req.query.phone_id || null;

      let q = supabase.from('ads_payment').select('*').order('id', { ascending: false }).limit(limit);

      if (filter && filter !== 'all') {
        const f = filter.toString().toLowerCase();
        if (f === 'paid' || f === 'unpaid') {
          q = q.eq('is_paid', f === 'paid');
        } else if (filter.includes(',')) {
          const vals = filter.split(',').map(s => s.trim()).filter(Boolean);
          if (vals.length) q = q.in('status', vals);
        } else {
          q = q.eq('status', filter);
        }
      }
      if (user_id) q = q.eq('user_id', user_id);
      if (id) q = q.eq('id', id);
      if (type) q = q.eq('type', type);
      if (phone_id) q = q.eq('phone_id', phone_id);

      const { data, error } = await q;
      if (error) throw error;
      const out = (data || []).map(p => ({ id: p.id, ...decryptDeep(p) }));
      return res.json({ ok: true, ads_payment: out });
    } catch (err) {
      console.error('/admin/ads_payment error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });
  app.get('/admin/special_ads', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('Special_Ad')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;

      return res.json({
        ok: true,
        special_ads: data
      });
    } catch (err) {
      console.error('/admin/special_ads error:', err);
      return res.status(500).json({
        ok: false,
        error: 'Server error'
      });
    }
  });
  // ------------------------------------------------------------------
  // Admin: Manage Special_Ad table (service-role client expected)
  // PATCH /admin/special_ads/:id - update is_active
  app.patch('/admin/special_ads/:id', verifyJwtToken, async (req, res) => {
    try {
      const acting = req.user || null;
      if (!acting?.id) return res.status(401).json({ success: false, error: 'Unauthorized' });

      // ensure admin role
      const roleCheck = (acting.role || '').toString().toLowerCase();
      if (!roleCheck.includes('admin')) return res.status(403).json({ success: false, error: 'forbidden: admin only' });

      const id = req.params.id;
      if (!id) return res.status(400).json({ success: false, error: 'missing id' });

      const { is_active } = req.body || {};
      if (typeof is_active === 'undefined') return res.status(400).json({ success: false, error: 'is_active is required' });

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('Special_Ad')
        .update({ is_active: !!is_active, updated_at: now })
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) {
        console.error('/admin/special_ads/:id PATCH error', error);
        return res.status(500).json({ success: false, error: 'Database error' });
      }

      try {
        await logAudit({
          userId: acting.id,
          action: 'admin_update_special_ad',
          resourceType: 'Special_Ad',
          resourceId: id,
          oldValues: null,
          newValues: { is_active: !!is_active },
          ip: req.ip,
          userAgent: req.headers['user-agent'] || null,
          status: 'success'
        });
      } catch (e) {
        console.warn('/admin/special_ads/:id PATCH audit failed', e);
      }

      return res.json({ success: true });
    } catch (err) {
      console.error('/admin/special_ads/:id PATCH unexpected error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // DELETE /admin/special_ads/:id - delete special ad (service-role)
  app.delete('/admin/special_ads/:id', verifyJwtToken, async (req, res) => {
    try {
      const acting = req.user || null;
      if (!acting?.id) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const roleCheck = (acting.role || '').toString().toLowerCase();
      if (!roleCheck.includes('admin')) return res.status(403).json({ success: false, error: 'forbidden: admin only' });

      const id = req.params.id;
      if (!id) return res.status(400).json({ success: false, error: 'missing id' });

      // Attempt to delete the row
      const { data, error } = await supabase
        .from('Special_Ad')
        .delete()
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) {
        console.error('/admin/special_ads/:id DELETE error', error);
        return res.status(500).json({ success: false, error: 'Database error' });
      }

      try {
        await logAudit({
          userId: acting.id,
          action: 'admin_delete_special_ad',
          resourceType: 'Special_Ad',
          resourceId: id,
          details: { deleted: true },
          ip: req.ip,
          userAgent: req.headers['user-agent'] || null,
          status: 'success'
        });
      } catch (e) {
        console.warn('/admin/special_ads/:id DELETE audit failed', e);
      }

      return res.json({ success: true });
    } catch (err) {
      console.error('/admin/special_ads/:id DELETE unexpected error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // GET /admin/users - list users (decrypted)
  app.get('/admin/users', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);
      const { data, error } = await supabase.from('users').select('*').order('id', { ascending: false }).limit(limit);
      if (error) throw error;
      const out = (data || []).map(u => ({ id: u.id, ...decryptDeep(u) }));

      return res.json({ ok: true, users: out });
    } catch (err) {
      console.error('/admin/users error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // PATCH /admin/users/:id - update user status/role (accept Arabic status values)
  app.patch('/admin/users/:id', verifyJwtToken, async (req, res) => {
    try {
      const acting = req.user || null;
      const roleCheck = (acting && acting.role) ? String(acting.role).toLowerCase() : '';
      if (!roleCheck.includes('admin')) {
        try {
          await logAudit({
            userId: req.user?.id || null,
            action: 'forbidden_access',
            resourceType: 'users',
            resourceId: req.params?.id || null,
            details: { reason: 'forbidden: admin only' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed',
            errorMessage: 'forbidden: admin only'
          });
        } catch (e) {
          console.warn('/admin/users/:id forbidden audit failed', e);
        }
        return res.status(403).json({ error: 'forbidden: admin only' });
      }

      const id = req.params.id;
      if (!id) return res.status(400).json({ error: 'missing id' });

      let { status, role } = req.body || {};
      const payload = {};
      if (typeof role !== 'undefined' && role !== null && String(role).trim() !== '') payload.role = role;

      if (typeof status !== 'undefined' && status !== null && String(status).trim() !== '') {
        const s = String(status).trim().toLowerCase();
        const activeSet = new Set(['نشط', 'active', 'فعال', '1', 'true', 'yes']);
        const blockedSet = new Set(['محظور', 'blocked', 'banned', '0', 'false', 'no']);
        let mapped = null;
        if (activeSet.has(s)) mapped = 'active';
        else if (blockedSet.has(s)) mapped = 'blocked';
        if (!mapped) return res.status(400).json({ error: 'invalid status value' });
        payload.status = mapped;
      }

      if (Object.keys(payload).length === 0) return res.status(400).json({ error: 'nothing to update' });

      const { data: existingUser, error: existingUserErr } = await supabase
        .from('users')
        .select('id, role, status')
        .eq('id', id)
        .maybeSingle();
      if (existingUserErr) return res.status(500).json({ error: existingUserErr.message || 'failed to fetch current user' });
      if (!existingUser) return res.status(404).json({ error: 'user not found' });

      const oldValues = {
        role: existingUser.role ?? null,
        status: existingUser.status ?? null
      };
      const mergedNewValues = {
        role: typeof payload.role !== 'undefined' ? payload.role : oldValues.role,
        status: typeof payload.status !== 'undefined' ? payload.status : oldValues.status
      };
      if (oldValues.role === mergedNewValues.role && oldValues.status === mergedNewValues.status) {
        return res.json({ ok: true, message: 'No changes detected', user: existingUser });
      }

      const { data, error } = await supabase.from('users').update(payload).eq('id', id).select().maybeSingle();
      if (error) return res.status(500).json({ error: error.message || 'update failed' });
      if (!data) return res.status(404).json({ error: 'user not found' });

      try {
        if (typeof logAudit === 'function') {
          await logAudit({
            userId: acting && acting.id ? acting.id : null,
            action: 'admin_update_user',
            resourceType: 'user',
            resourceId: id,
            oldValues,
            newValues: mergedNewValues,
            details: { changes: payload },
            ip: req.ip,
            userAgent: req.headers['user-agent']
          });
        }
      } catch (e) {
        console.warn('/admin/users patch: audit failed', e);
      }

      return res.json({ ok: true, user: data });
    } catch (err) {
      console.error('/admin/users patch error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });
 app.patch('/admin/phones', verifyJwtToken, async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized'
      });
    }

    const userRole = (user.role || '').toLowerCase();
    if (!userRole.includes('admin')) {
      return res.status(403).json({
        ok: false,
        error: 'Forbidden: admin only'
      });
    }

    // يستقبل ?id=eq.123
    const idParam = req.query.id;

    if (!idParam || typeof idParam !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Missing id'
      });
    }

    const id = Number(idParam.replace('eq.', ''));

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid id'
      });
    }

    const updates = {};

    if (req.body.status !== undefined) {
      updates.status = req.body.status;
    }

    updates.updated_at = new Date().toISOString();

    const { data: existingPhone, error: fetchError } = await supabase
      .from('phones')
      .select('id,status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      return res.status(500).json({
        ok: false,
        error: fetchError.message
      });
    }

    if (!existingPhone) {
      return res.status(404).json({
        ok: false,
        error: 'Phone not found'
      });
    }

    const { data, error } = await supabase
      .from('phones')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    try {
      if (typeof logAudit === 'function') {
        await logAudit({
          userId: user.id,
          action: 'admin_update_phone',
          resourceType: 'phones',
          resourceId: String(id),
          oldValues: {
            status: existingPhone.status
          },
          newValues: updates,
          details: {
            admin_id: user.id
          },
          ip: getAuditIp(req),
          userAgent: req.headers['user-agent'] || null,
          status: 'success'
        });
      }
    } catch (e) {
      console.warn('Phone audit failed', e);
    }

    return res.json({
      ok: true,
      phone: data
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: 'Server error'
    });
  }
});
  // PATCH /admin/accessories/:id - update accessory (admin light endpoint)
  app.patch('/admin/accessories/:id', verifyJwtToken, async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        try {
          await logAudit({
            userId: null,
            action: 'unauthorized_access',
            resourceType: 'accessories',
            resourceId: req.params.id || null,
            details: { reason: 'Missing authentication', endpoint: '/admin/accessories/:id' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/accessories/:id auth audit failed', e);
        }
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }

      const userRole = (user.role || '').toString().toLowerCase();
      if (!userRole.includes('admin')) {
        try {
          await logAudit({
            userId: user.id,
            action: 'forbidden_access',
            resourceType: 'accessories',
            resourceId: req.params.id || null,
            details: { reason: 'Non-admin attempting to update accessory', user_role: userRole },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/accessories/:id forbidden audit failed', e);
        }
        return res.status(403).json({ ok: false, error: 'Forbidden: admin only' });
      }

      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });

      const updates = {};
      if (req.body.status !== undefined) updates.status = req.body.status;
      if (req.body.updated_at !== undefined) updates.updated_at = req.body.updated_at;
      else updates.updated_at = new Date().toISOString();

      const { data: existingAccessory, error: existingAccessoryErr } = await supabase
        .from('accessories')
        .select('id, status')
        .eq('id', id)
        .maybeSingle();
      if (existingAccessoryErr) {
        console.error('PATCH /admin/accessories/:id fetch existing error', existingAccessoryErr);
        return res.status(500).json({ ok: false, error: existingAccessoryErr.message || existingAccessoryErr });
      }
      if (!existingAccessory) {
        return res.status(404).json({ ok: false, error: 'Accessory not found' });
      }

      const statusProvided = typeof req.body.status !== 'undefined';
      const oldStatus = existingAccessory.status ?? null;
      const newStatus = statusProvided ? (updates.status ?? null) : oldStatus;
      if (statusProvided && oldStatus === newStatus) {
        return res.json({ ok: true, message: 'No changes detected', accessory: existingAccessory });
      }

      const { data, error } = await supabase
        .from('accessories')
        .update(updates)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) {
        console.error('PATCH /admin/accessories/:id error', error);
        return res.status(500).json({ ok: false, error: error.message || error });
      }

      try {
        if (typeof logAudit === 'function') {
          await logAudit({
            userId: user.id,
            action: 'admin_update_accessory',
            resourceType: 'accessories',
            resourceId: id.toString(),
            oldValues: { status: existingAccessory.status },
            newValues: updates,
            details: { admin_id: user.id },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'success'
          });
        }
      } catch (e) {
        console.warn('PATCH /admin/accessories/:id audit failed', e);
      }

      return res.json({ ok: true, accessory: data });
    } catch (err) {
      console.error('PATCH /admin/accessories/:id unexpected', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  });

  // GET /admin/phones - list phones (decrypted) with images
  app.get('/admin/phones', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);

      // جلب بيانات الهواتف فقط
      const { data: phones, error: phonesError } = await supabase
        .from('phones')
        .select('*')
        .order('id', { ascending: false })
        .limit(limit);

      if (phonesError) {
        console.error('Error fetching phones:', phonesError);
        throw phonesError;
      }

      // جلب معرفات الهواتف
      const phoneIds = phones.map(p => p.id);

      // جلب الصور لجميع الهواتف دفعة واحدة
      let imagesMap = {};
      if (phoneIds.length > 0) {
        // استخدام استعلام SQL مباشر لتجنب مشاكل العلاقات
        const { data: images, error: imagesError } = await supabase
          .from('phone_images')
          .select('id, phone_id, image_path, main_image')
          .in('phone_id', phoneIds);

        if (imagesError) {
          console.error('Error fetching phone images:', imagesError);
        } else if (images) {
          // تنظيم الصور في خريطة حسب معرف الهاتف
          imagesMap = images.reduce((acc, img) => {
            if (!acc[img.phone_id]) {
              acc[img.phone_id] = [];
            }
            acc[img.phone_id].push({
              id: img.id,
              image_path: img.image_path,
              main_image: img.main_image
            });
            return acc;
          }, {});
        }
      }

      // معالجة البيانات وفك تشفيرها
      const out = (phones || []).map(p => {
        // فك تشفير بيانات الهاتف
        const decryptedPhone = decryptDeep(p);

        // إضافة الصور من الخريطة
        const images = imagesMap[p.id] || [];

        return {
          id: p.id,
          ...decryptedPhone,
          images: images
        };
      });

      return res.json({ ok: true, phones: out });
    } catch (err) {
      console.error('/admin/phones error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /admin/accessories - list accessories (decrypted) with images
  app.get('/admin/accessories', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);

      // جلب بيانات الإكسسوارات فقط
      const { data: accessories, error: accessoriesError } = await supabase
        .from('accessories')
        .select('*')
        .order('id', { ascending: false })
        .limit(limit);

      if (accessoriesError) {
        console.error('Error fetching accessories:', accessoriesError);
        throw accessoriesError;
      }

      // جلب معرفات الإكسسوارات
      const accessoryIds = accessories.map(a => a.id);

      // جلب الصور لجميع الإكسسوارات دفعة واحدة
      let imagesMap = {};
      if (accessoryIds.length > 0) {
        // استخدام استعلام SQL مباشر لتجنب مشاكل العلاقات
        const { data: images, error: imagesError } = await supabase
          .from('accessory_images')
          .select('id, accessory_id, image_path, main_image')
          .in('accessory_id', accessoryIds);

        if (imagesError) {
          console.error('Error fetching accessory images:', imagesError);
        } else if (images) {
          // تنظيم الصور في خريطة حسب معرف الإكسسوار
          imagesMap = images.reduce((acc, img) => {
            if (!acc[img.accessory_id]) {
              acc[img.accessory_id] = [];
            }
            acc[img.accessory_id].push({
              id: img.id,
              image_path: img.image_path,
              main_image: img.main_image
            });
            return acc;
          }, {});
        }
      }

      // معالجة البيانات وفك تشفيرها
      const out = (accessories || []).map(a => {
        // فك تشفير بيانات الإكسسوار
        const decryptedAccessory = decryptDeep(a);

        // إضافة الصور من الخريطة
        const images = imagesMap[a.id] || [];

        return {
          id: a.id,
          ...decryptedAccessory,
          images: images
        };
      });

      return res.json({ ok: true, accessories: out });
    } catch (err) {
      console.error('/admin/accessories error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /admin/ads_price - list ads price rows, optional ?type=...
  app.get('/admin/ads_price', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);
      let q = supabase.from('ads_price').select('*').order('id', { ascending: false }).limit(limit);
      if (req.query.type) q = q.eq('type', req.query.type);
      const { data, error } = await q;
      if (error) throw error;
      const out = (data || []).map(p => ({ id: p.id, ...decryptDeep(p) }));
      return res.json({ ok: true, ads_price: out });
    } catch (err) {
      console.error('/admin/ads_price error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /admin/update-ads-price - update ads prices (admin only)
  app.post('/admin/update-ads-price', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const { prices } = req.body;

      if (!prices || !Array.isArray(prices)) {
        return res.status(400).json({ error: 'بيانات الأسعار غير صالحة' });
      }

      // تحديث كل سعر في قاعدة البيانات
      const updatePromises = prices.map(async (price) => {
        const { id, duration_days, amount } = price; // إزالة bonus_offer

        if (!id) {
          throw new Error('معرف السعر مفقود');
        }

        const { data, error } = await supabase
          .from('ads_price')
          .update({
            duration_days,
            amount
            // إزالة bonus_offer
          })
          .eq('id', id);

        if (error) {
          throw error;
        }

        return data;
      });

      await Promise.all(updatePromises);

      // تسجيل العملية في سجل التدقيق
      try {
        const acting = req.user || null;
        if (typeof logAudit === 'function') {
          await logAudit({
            userId: acting && acting.id ? acting.id : null,
            action: 'admin_update_ads_price',
            resourceType: 'ads_price',
            resourceId: null,
            details: { count: prices.length },
            ip: req.ip,
            userAgent: req.headers['user-agent']
          });
        }
      } catch (e) {
        console.warn('/admin/update-ads-price: audit failed', e);
      }

      res.status(200).json({
        success: true,
        message: 'تم تحديث الأسعار بنجاح'
      });
    } catch (error) {
      console.error('خطأ في تحديث الأسعار:', error);
      res.status(500).json({
        error: error.message || 'حدث خطأ أثناء تحديث الأسعار'
      });
    }
  });

  // GET /admin/game_win - list game wins
  app.get('/admin/game_win', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);
      const { data, error } = await supabase.from('game_win').select('*').order('id', { ascending: false }).limit(limit);
      if (error) throw error;
      const out = (data || []).map(g => ({ id: g.id, ...decryptDeep(g) }));
      return res.json({ ok: true, game_win: out });
    } catch (err) {
      console.error('/admin/game_win error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /admin/user_rewards - list user rewards
  app.get('/admin/user_rewards', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);
      const { data, error } = await supabase.from('user_rewards').select('*').order('id', { ascending: false }).limit(limit);
      if (error) throw error;
      const out = (data || []).map(u => ({ id: u.id, ...decryptDeep(u) }));
      return res.json({ ok: true, user_rewards: out });
    } catch (err) {
      console.error('/admin/user_rewards error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /admin/ownerships - list registered phones (decrypted)
  app.get('/admin/ownerships', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);
      const { data, error } = await supabase.from('registered_phones').select('*').order('id', { ascending: false }).limit(limit);
      if (error) throw error;
      const out = (data || []).map(r => ({ id: r.id, ...decryptDeep(r) }));

      return res.json({ ok: true, ownerships: out });
    } catch (err) {
      console.error('/admin/ownerships error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // Backwards-compatible alias: GET /admin/registered_phones
  app.get('/admin/registered_phones', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);
      const filter = (req.query.filter || '').toString();
      const imei = req.query.imei || null;
      const imei_hash = req.query.imei_hash || null;

      // Build query and apply optional status filter (supports single value or comma-separated list)
      let q = supabase.from('registered_phones').select('*').order('created_at', { ascending: false }).limit(limit);
      if (filter && filter !== 'all') {
        if (filter.includes(',')) {
          const vals = filter.split(',').map(s => s.trim()).filter(Boolean);
          if (vals.length) q = q.in('status', vals);
        } else {
          q = q.eq('status', filter);
        }
      }

      // If the client provided an imei_hash we can query directly. If they provided plain
      // `imei`, try to compute sha256 on the server (Node ESM import). If server-side
      // hashing isn't available, clients should call with `imei_hash` instead.
      try {
        if (imei_hash) {
          q = q.eq('imei_hash', imei_hash.toString());
        } else if (imei) {
          try {
            const { createHash } = await import('crypto');
            const h = createHash('sha256').update(String(imei)).digest('hex');
            q = q.eq('imei_hash', h);
          } catch (e) {
            console.warn('server hashing unavailable; please call with imei_hash', e);
          }
        }
      } catch (e) {
        console.warn('/admin/registered_phones: hash handling error', e);
      }

      const { data, error } = await q;
      if (error) throw error;
      const out = [];

      for (const row of (data || [])) {
        const r = { id: row.id, ...decryptDeep(row) };

        // صورة الهاتف
        if (r.phone_image_url) {
          const { data: signed } = await supabase.storage
            .from('registerphone')
            .createSignedUrl(r.phone_image_url, 300);

          if (signed?.signedUrl) {
            r.phone_image_url = signed.signedUrl;
          }
        }

        // صورة الفاتورة
        if (r.receipt_image_url) {
          const { data: signed } = await supabase.storage
            .from('registerphone')
            .createSignedUrl(r.receipt_image_url, 300);

          if (signed?.signedUrl) {
            r.receipt_image_url = signed.signedUrl;
          }
        }

        out.push(r);
      }

      return res.json({
        ok: true,
        registered_phones: out,
      });
    } catch (err) {
      console.error('/admin/registered_phones error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /admin/ownership_verification_requests - list ownership verification requests
  app.get('/admin/ownership_verification_requests', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const { limit = 100 } = req.query;

      const { data, error } = await supabase
        .from('ownership_verification_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Number(limit));

      if (error) {
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }

      const out = [];

      for (const row of (data || [])) {
        const r = {
          id: row.id,
          ...decryptDeep(row),
        };

        // إنشاء Signed URL لصورة الهاتف
        if (r.phone_image) {
          try {
            const path = normalizeStoragePath(r.phone_image);

            // console.log("Bucket:", "registerphone");
            //console.log("Original:", r.phone_image);
            //console.log("Path:", path);

            const { data: signed, error } = await supabase.storage
              .from("registerphone")
              .createSignedUrl(path, 3600);

            //console.log("Signed:", signed);
            //console.log("Error:", error);

            if (!error && signed?.signedUrl) {
              r.phone_image = signed.signedUrl;
            }
          } catch (e) {
            console.error("phone_image signed url error:", e);
          }
        }

        out.push(r);
      }
      return res.json({
        success: true,
        ownership_verification_requests: out
      });
    } catch (err) {
      console.error('/admin/ownership_verification_requests error', err);
      return res.status(500).json({
        success: false,
        error: 'Server error'
      });
    }
  });

  // PATCH /admin/ownership_verification_requests/:id - update ownership verification request
  app.patch('/admin/ownership_verification_requests/:id', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Missing request id' });
      }

      const { status, review_notes } = req.body || {};
      const updates = {};

      if (typeof status !== 'undefined' && status !== null) {
        updates.status = String(status).toLowerCase();
      }

      if (typeof review_notes !== 'undefined' && review_notes !== null) {
        updates.review_notes = review_notes;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, error: 'Nothing to update' });
      }

      updates.updated_at = new Date().toISOString();

      const { data: existing, error: fetchErr } = await supabase
        .from('ownership_verification_requests')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (fetchErr) {
        console.error('PATCH /admin/ownership_verification_requests/:id fetch error', fetchErr);
        return res.status(500).json({ success: false, error: 'Database error' });
      }

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Request not found' });
      }

      const { data, error } = await supabase
        .from('ownership_verification_requests')
        .update(updates)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) {
        console.error('PATCH /admin/ownership_verification_requests/:id update error', error);
        return res.status(500).json({ success: false, error: 'Failed to update request' });
      }

      try {
        if (typeof logAudit === 'function') {
          await logAudit({
            userId: user.id,
            action: 'admin_update_ownership_verification_request',
            resourceType: 'ownership_verification_requests',
            resourceId: id,
            oldValues: { status: existing.status, review_notes: existing.review_notes },
            newValues: updates,
            details: { admin_id: user.id },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'success'
          });
        }
      } catch (e) {
        console.warn('PATCH /admin/ownership_verification_requests/:id audit failed', e);
      }

      // إرسال إشعارات عند تغيير الحالة
      const targetUserId = data.user_id || existing.user_id;
      if (targetUserId && updates.status && updates.status !== existing.status) {
        const notificationMessages = {
          approved: {
            title: 'تمت الموافقة على التحقق من الملكية',
            body: 'تمت مراجعة طلب التحقق من ملكيتك بنجاح والموافقة عليه.'
          },
          rejected: {
            title: 'تم رفض التحقق من الملكية',
            body: 'للأسف، لم يتم الموافقة على طلب التحقق من ملكيتك في الوقت الحالي.'
          },
          pending: {
            title: 'تم تحديث حالة الطلب',
            body: 'تم تحديث حالة طلب التحقق من ملكيتك.'
          }
        };

        const notification = notificationMessages[updates.status];

        if (notification) {
          // إشعار داخل التطبيق
          const { error: notificationError } = await supabase
            .from('notifications')
            .insert({
              user_id: targetUserId,
              title: notification.title,
              body: notification.body,
              type: 'ownership_verification_update',
              is_read: false,
              created_at: new Date().toISOString()
            });

          if (notificationError) {
            console.error('Notification Insert Error:', notificationError);
          } else {
            console.log('Notification inserted successfully');
          }

          // جلب FCM Token المستخدم وإرسال إشعار خارجي
          try {
            const { data: userData, error: userErr } = await supabase
              .from('users')
              .select('fcm_token, language')
              .eq('id', targetUserId)
              .single();

            if (!userErr && userData?.fcm_token) {
              await sendFCMNotificationV1({
                token: userData.fcm_token,
                title: notification.title,
                body: notification.body
              });

              console.log('FCM notification sent successfully');
            }
          } catch (err) {
            console.error('FCM Error:', err);
          }
        }
      }

      return res.json({
        success: true,
        data: { id: data.id, ...decryptDeep(data) }
      });
    } catch (err) {
      console.error('PATCH /admin/ownership_verification_requests/:id error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // GET /admin/stats - counts
  app.get('/admin/stats', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const [{ count: usersCount }, { count: reportsCount }, { count: adsCount }, { count: transfersCount }] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact' }),
        supabase.from('phone_reports').select('*', { count: 'exact' }),
        supabase.from('phones').select('*', { count: 'exact' }),
        supabase.from('transfer_records').select('*', { count: 'exact' })
      ]);
      return res.json({
        users: Number(usersCount || 0),
        reports: Number(reportsCount || 0),
        ads: Number(adsCount || 0),
        transfer_records: Number(transfersCount || 0)
      });
    } catch (err) {
      console.error('/admin/stats error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /admin/notifications - create a notification (admin only)
  // POST /admin/reject-phone - reject a registered phone and notify its owner
  app.post('/admin/reject-phone', verifyJwtToken, async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        try {
          await logAudit({
            userId: null,
            action: 'unauthorized_access',
            resourceType: 'registered_phone',
            resourceId: null,
            details: { reason: 'Missing authentication', endpoint: '/admin/reject-phone' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/reject-phone auth audit failed', e);
        }
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const userRole = (user.role || '').toString().toLowerCase();
      if (!userRole.includes('admin')) {
        try {
          await logAudit({
            userId: user.id,
            action: 'forbidden_access',
            resourceType: 'registered_phone',
            resourceId: null,
            details: { reason: 'Non-admin attempting to reject phone', user_role: userRole },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/reject-phone forbidden audit failed', e);
        }
        return res.status(403).json({ success: false, error: 'Forbidden: admin only' });
      }

      const { phoneId, rejectReason } = req.body || {};
      if (!phoneId || !rejectReason) return res.status(400).json({ success: false, error: 'phoneId and rejectReason required' });

      // Update the registered_phones row: set status=rejected and save reason in review_status
      const { data: updatedPhone, error: updateErr } = await supabase
        .from('registered_phones')
        .update({ status: 'rejected', review_status: 'بيانات خاطئة' })
        .eq('id', phoneId)
        .select('id, user_id')
        .maybeSingle();
      if (updateErr) throw updateErr;
      if (!updatedPhone) return res.status(404).json({ success: false, error: 'phone_not_found' });

      const targetUserId = updatedPhone.user_id || null;
      const { data: userRow } = await supabase
        .from('users')
        .select('language')
        .eq('id', targetUserId)
        .single();
      // Insert a notification for the phone owner using server service-role client
      const notifTitle = getNotificationText(userRow?.language, 'admin.reject_phone_title', 'Phone Registration Rejected', 'تم رفض تسجيل الهاتف');
      const notifBody = getNotificationText(userRow?.language, 'admin.reject_phone_body', `Rejection reason: ${rejectReason}`, `سبب الرفض: ${rejectReason}`);
      const notif = {
        user_id: targetUserId,
        title: notifTitle,
        body: notifBody,
        type: 'phone_rejected',
        is_read: false,
        created_at: new Date().toISOString()
      };

      const { error: insertErr } = await supabase.from('notifications').insert(notif);
      try {
        const { data: userRow, error: userErr } = await supabase
          .from('users')
          .select('fcm_token, language')
          .eq('id', updatedPhone.user_id)
          .single();

        if (!userErr && userRow?.fcm_token) {
          const fcmTitle = getNotificationText(userRow?.language, 'admin.reject_phone_fcm_title', 'Phone Registration Rejected', 'تم رفض تسجيل الهاتف');
          const fcmBody = getNotificationText(userRow?.language, 'admin.reject_phone_fcm_body', 'Please check the app for more details.', 'يرجى مراجعة التطبيق لمعرفة التفاصيل.');
          await sendFCMNotificationV1({
            token: userRow.fcm_token,
            title: fcmTitle,
            body: fcmBody
          });

          console.log('FCM reject sent successfully');
        }
      } catch (err) {
        console.error('FCM Reject Error:', err);
      }
      if (insertErr) console.warn('/admin/reject-phone: notification insert failed', insertErr);

      try {
        if (typeof logAudit === 'function') {
          await logAudit({
            userId: user.id,
            action: 'admin_reject_phone',
            resourceType: 'registered_phone',
            resourceId: phoneId,
            newValues: { status: 'rejected', review_status: 'بيانات خاطئة' },
            details: { admin_id: user.id, target_user: targetUserId, rejectReason },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'success'
          });
        }
      } catch (e) {
        console.warn('/admin/reject-phone: audit failed', e);
      }

      return res.json({ success: true });
    } catch (err) {
      console.error('/admin/reject-phone error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // POST /admin/approve-phone - approve a registered phone and notify its owner
  app.post('/admin/approve-phone', verifyJwtToken, async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        try {
          await logAudit({
            userId: null,
            action: 'unauthorized_access',
            resourceType: 'registered_phone',
            resourceId: null,
            details: { reason: 'Missing authentication', endpoint: '/admin/approve-phone' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/approve-phone auth audit failed', e);
        }
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const userRole = (user.role || '').toString().toLowerCase();
      if (!userRole.includes('admin')) {
        try {
          await logAudit({
            userId: user.id,
            action: 'forbidden_access',
            resourceType: 'registered_phone',
            resourceId: null,
            details: { reason: 'Non-admin attempting to approve phone', user_role: userRole },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed'
          });
        } catch (e) {
          console.warn('/admin/approve-phone forbidden audit failed', e);
        }
        return res.status(403).json({ success: false, error: 'Forbidden: admin only' });
      }

      const { phoneId } = req.body || {};
      if (!phoneId) return res.status(400).json({ success: false, error: 'phoneId required' });

      const now = new Date().toISOString();

      // Update the registered_phones row: set status=approved, review_status and review_date
      const { data: updatedPhone, error: updateErr } = await supabase
        .from('registered_phones')
        .update({ status: 'approved', review_status: 'تمت المراجعة', review_date: now })
        .eq('id', phoneId)
        .select('id, user_id')
        .maybeSingle();
      if (updateErr) throw updateErr;
      if (!updatedPhone) return res.status(404).json({ success: false, error: 'phone_not_found' });

      const targetUserId = updatedPhone.user_id || null;
      const { data: userRow } = await supabase
        .from('users')
        .select('language')
        .eq('id', targetUserId)
        .single();
      // Insert a notification for the phone owner using server service-role client
      const notifTitle = getNotificationText(userRow?.language, 'admin.approve_phone_title', 'Phone Registration Approved', 'تمت الموافقة على تسجيل الهاتف');
      const notifBody = getNotificationText(userRow?.language, 'admin.approve_phone_body', 'Your phone registration request has been approved', 'تمت مراجعة طلب تسجيل الهاتف والموافقة عليه');
      const notif = {
        user_id: targetUserId,
        title: notifTitle,
        body: notifBody,
        type: 'phone_approved',
        is_read: false,
        created_at: new Date().toISOString()
      };

      const { error: insertErr } = await supabase.from('notifications').insert(notif);
      try {
        const { data: userRow, error: userErr } = await supabase
          .from('users')
          .select('fcm_token, language')
          .eq('id', targetUserId)
          .single();

        if (!userErr && userRow?.fcm_token) {
          const fcmTitle = getNotificationText(userRow?.language, 'admin.approve_phone_fcm_title', 'Phone Registration Approved', 'تمت الموافقة على تسجيل الهاتف');
          const fcmBody = getNotificationText(userRow?.language, 'admin.approve_phone_fcm_body', 'Your phone registration request has been approved', 'تمت مراجعة طلب تسجيل الهاتف والموافقة عليه');
          await sendFCMNotificationV1({
            token: userRow.fcm_token,
            title: fcmTitle,
            body: fcmBody
          });

          console.log('FCM sent successfully');
        }
      } catch (err) {
        console.error('FCM Error:', err);
      }

      if (insertErr) console.warn('/admin/approve-phone: notification insert failed', insertErr);

      try {
        if (typeof logAudit === 'function') {
          await logAudit({
            userId: user.id,
            action: 'admin_approve_phone',
            resourceType: 'registered_phone',
            resourceId: phoneId,
            newValues: { status: 'approved', review_status: 'تمت المراجعة' },
            details: { admin_id: user.id, target_user: targetUserId },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'success'
          });
        }
      } catch (e) {
        console.warn('/admin/approve-phone: audit failed', e);
      }

      return res.json({ success: true });
    } catch (err) {
      console.error('/admin/approve-phone error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  app.post('/admin/notifications', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      if (!authHeader) {
        try {
          await logAudit({
            userId: null,
            action: 'unauthorized_access',
            resourceType: 'notification',
            resourceId: null,
            details: { reason: 'Unauthorized: missing token' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed',
            errorMessage: 'Unauthorized: missing token'
          });
        } catch (e) {
          console.warn('/admin/notifications missing-token audit failed', e);
        }
        return res.status(401).json({ error: 'Unauthorized: missing token' });
      }
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

      // validate auth token with Supabase
      const { data: authData, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !authData || !authData.user) {
        try {
          await logAudit({
            userId: null,
            action: 'unauthorized_access',
            resourceType: 'notification',
            resourceId: null,
            details: { reason: 'Unauthorized: invalid token' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed',
            errorMessage: authErr?.message || 'Unauthorized: invalid token'
          });
        } catch (e) {
          console.warn('/admin/notifications invalid-token audit failed', e);
        }
        return res.status(401).json({ error: 'Unauthorized: invalid token' });
      }

      const user = authData.user;

      // fetch app role
      const { data: appUser, error: roleErr } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
      if (roleErr) console.warn('/admin/notifications role fetch error', roleErr);
      const role = appUser && appUser.role ? String(appUser.role).toLowerCase() : 'free_user';
      if (!role.includes('admin')) {
        try {
          await logAudit({
            userId: user.id || null,
            action: 'forbidden_access',
            resourceType: 'notification',
            resourceId: null,
            details: { reason: 'Forbidden: admin only' },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'failed',
            errorMessage: 'Forbidden: admin only'
          });
        } catch (e) {
          console.warn('/admin/notifications forbidden audit failed', e);
        }
        return res.status(403).json({ error: 'Forbidden: admin only' });
      }

      const { user_id = null, title, message, metadata = null } = req.body || {};
      if (!title || !message) return res.status(400).json({ error: 'title and message required' });

      const notif = { user_id: user_id, title: title, message: message, is_read: false, metadata };
      const { data: inserted, error: insertErr } = await supabase.from('notifications').insert(notif).select().maybeSingle();
      if (insertErr) throw insertErr;

      try {
        if (typeof logAudit === 'function') {
          await logAudit({
            userId: user.id,
            action: 'admin_post_notification',
            resourceType: 'notification',
            resourceId: inserted && inserted.id ? inserted.id : null,
            newValues: { user_id, title, message: message.substring(0, 100) },
            details: { admin_id: user.id, target_user: user_id },
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'success'
          });
        }
      } catch (e) {
        console.warn('/admin/notifications: audit failed', e);
      }

      return res.json({ success: true, notification: inserted || null });
    } catch (err) {
      console.error('/admin/notifications error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /admin/publish_ad - list published ads
  app.get('/admin/publish_ad', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);
      const { data, error } = await supabase.from('publish_ad').select('*').order('id', { ascending: false }).limit(limit);
      if (error) throw error;
      const out = (data || []).map(p => ({ id: p.id, ...decryptDeep(p) }));
      return res.json({ ok: true, data: out });
    } catch (err) {
      console.error('/admin/publish_ad error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /admin/publish_ads - create new published ad
  app.post('/admin/publish_ads', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const {
        ad_id,
        image_url,
        is_active,
        location,
        shop_name,
        phone_number,
        longitude,
        latitude,
        created_at,
        expires_at
      } = req.body || {};

      // التحقق من البيانات المطلوبة
      if (!ad_id) {
        return res.status(400).json({ success: false, error: 'ad_id مطلوب' });
      }
      if (!image_url) {
        return res.status(400).json({ success: false, error: 'image_url مطلوب' });
      }

      const payload = {
        ad_id: Number(ad_id),
        image_url: String(image_url).trim(),
        page: page ? String(page).trim() : null,
        is_active: typeof is_active !== 'undefined' ? Boolean(is_active) : true,
        location: location ? String(location).trim() : null,
        shop_name: shop_name ? String(shop_name).trim() : null,
        phone_number: phone_number ? String(phone_number).trim() : null,
        longitude: typeof longitude !== 'undefined' && longitude !== null ? Number(longitude) : null,
        latitude: typeof latitude !== 'undefined' && latitude !== null ? Number(latitude) : null,
        created_at: created_at ? new Date(created_at).toISOString() : new Date().toISOString(),
        expires_at: expires_at ? new Date(expires_at).toISOString() : null
      };

      const { data: inserted, error } = await supabase.from('publish_ad').insert(payload).select().maybeSingle();
      if (error) {
        console.error('/admin/publish_ads POST insert error', error);
        return res.status(500).json({ success: false, error: error.message || 'خطأ في إدراج البيانات' });
      }
      if (!inserted) {
        return res.status(500).json({ success: false, error: 'فشل في إنشاء الإعلان المنشور' });
      }

      try {
        if (typeof logAudit === 'function') {
          await logAudit({
            userId: req.user?.id || null,
            action: 'admin_create_publish_ad',
            resourceType: 'publish_ad',
            resourceId: inserted.id,
            newValues: inserted,
            ip: getAuditIp(req),
            userAgent: req.headers['user-agent'] || null,
            status: 'success'
          });
        }
      } catch (e) {
        console.warn('/admin/publish_ads POST audit failed', e);
      }

      return res.json({
        success: true,
        data: [{ id: inserted.id, ...decryptDeep(inserted) }]
      });
    } catch (err) {
      console.error('/admin/publish_ads POST error', err);
      return res.status(500).json({ success: false, error: 'خطأ في السيرفر' });
    }
  });

  // GET /admin/plans - list available plans, sorted by price (asc)
  app.get('/admin/plans', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const { data, error } = await supabase.from('plans').select('*').order('price', { ascending: true });
      if (error) throw error;

      const out = (data || []).map(p => {
        const dec = decryptDeep(p) || {};
        return {
          id: dec.id ?? p.id ?? null,
          name: dec.name ?? p.name ?? null,
          price: dec.price ?? p.price ?? null,
          duration_days: dec.duration_days ?? p.duration_days ?? null,
          Publish_Ad: dec.Publish_Ad ?? dec.publish_ad ?? dec.publishAds ?? dec.publish_ads ?? p.Publish_Ad ?? p.publish_ad ?? p.publishAds ?? p.publish_ads ?? null
        };
      });

      return res.json({ ok: true, plans: out });
    } catch (err) {
      console.error('/admin/plans error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /admin/package-ads - compute user's package ad allowance and remaining
  app.get('/admin/package-ads', verifyJwtToken, async (req, res) => {
    try {
      const acting = req.user || null;
      const roleCheck = (acting && acting.role) ? String(acting.role).toLowerCase() : '';
      if (!roleCheck.includes('admin')) return res.status(403).json({ success: false, error: 'forbidden: admin only' });

      const userId = req.query.user_id;
      if (!userId) return res.status(400).json({ success: false, error: 'Missing user_id' });

      // 1) fetch user
      const { data: userRow, error: userErr } = await supabase.from('users').select('id, role, expires_at').eq('id', userId).maybeSingle();
      if (userErr) throw userErr;
      if (!userRow) return res.status(404).json({ success: false, error: 'User not found' });

      const role = userRow.role || null;
      const expiresAt = userRow.expires_at || null;
      // 2) جلب الخطة (مطابقة على عمود `type`) — استخدم Supabase بدلاً من `db`
      let publishAdsCount = 0;
      let planRow = null;

      if (role) {
        // محاولة تطابق حالة غير حساسة لحالة الأحرف على عمود `type`
        try {
          const { data: exactPlan, error: exactErr } = await supabase.from('plans').select('*').ilike('type', role).maybeSingle();
          if (exactErr) console.warn('/admin/package-ads: plan exact fetch warning', exactErr);
          planRow = exactPlan || null;
        } catch (e) {
          console.warn('/admin/package-ads: plan exact fetch exception', e);
        }
      }

      if (!planRow && role) {
        try {
          const { data: likeType, error: likeTypeErr } = await supabase.from('plans').select('*').ilike('type', `%${role}%`).limit(1);
          if (likeTypeErr) console.warn('/admin/package-ads: plan like-type warning', likeTypeErr);
          if (Array.isArray(likeType) && likeType.length) planRow = likeType[0];
        } catch (e) {
          console.warn('/admin/package-ads: plan like-type exception', e);
        }
      }

      if (!planRow && role) {
        try {
          const { data: likeName, error: likeNameErr } = await supabase.from('plans').select('*').ilike('name', `%${role}%`).limit(1);
          if (likeNameErr) console.warn('/admin/package-ads: plan like-name warning', likeNameErr);
          if (Array.isArray(likeName) && likeName.length) planRow = likeName[0];
        } catch (e) {
          console.warn('/admin/package-ads: plan like-name exception', e);
        }
      }

      // كحل احتياطي: خذ أول خطة إن لم نجد تطابقاً
      if (!planRow) {
        try {
          const { data: anyPlans, error: anyErr } = await supabase.from('plans').select('*').limit(1);
          if (anyErr) console.warn('/admin/package-ads: fallback plan fetch warning', anyErr);
          if (Array.isArray(anyPlans) && anyPlans.length) planRow = anyPlans[0];
        } catch (e) {
          console.warn('/admin/package-ads: fallback plan fetch exception', e);
        }
      }

      if (planRow) {
        publishAdsCount = Number(
          planRow.publish_ad ??
          planRow.Publish_Ad ??
          planRow.PublishAd ??
          planRow.publishAd ??
          planRow.publish_ads ??
          0
        ) || 0;
      } else {
        publishAdsCount = 0;
      }

      console.debug('package-ads: role=', role, 'matchedPlan=', planRow ? (planRow.type || planRow.name) : null, 'publishAdsCount=', publishAdsCount);

      // 3) latest paid package row for the user (prefer payment_date then upload_date)
      const { data: paidRows, error: paidErr } = await supabase
        .from('ads_payment')
        .select('payment_date, upload_date')
        .eq('user_id', userId)
        .eq('is_paid', true)
        .order('payment_date', { ascending: false })
        .order('upload_date', { ascending: false })
        .limit(1);
      if (paidErr) console.warn('/admin/package-ads: paid fetch warning', paidErr);
      const paidRow = Array.isArray(paidRows) && paidRows.length ? paidRows[0] : null;

      let packageStartDate;
      if (paidRow) {
        const d = paidRow.payment_date || paidRow.upload_date;
        packageStartDate = d ? new Date(d) : new Date();
      } else {
        const expiry = expiresAt ? new Date(expiresAt) : new Date();
        packageStartDate = new Date(expiry);
        packageStartDate.setDate(packageStartDate.getDate() - 30);
      }

      // 4) fetch ads_payments for user and filter by date client-side (coalesce upload_date/payment_date)
      const { data: adsRows, error: adsErr } = await supabase
        .from('ads_payment')
        .select('id, upload_date, payment_date, status, transaction')
        .eq('user_id', userId);
      if (adsErr) console.warn('/admin/package-ads: ads fetch warning', adsErr);
      const rows = Array.isArray(adsRows) ? adsRows : [];

      const actualPublishedCount = rows.filter(a => {
        try {
          if (a.transaction === 'bonus_add') return false;
          const dt = a.upload_date || a.payment_date;
          if (!dt) return false;
          const d = new Date(dt);
          if (d < packageStartDate) return false;
          const st = (a.status || '').toLowerCase();
          return st === 'pending' || st === 'approved' || st === 'paid';
        } catch (e) {
          return false;
        }
      }).length;

      const remaining = Math.max(0, publishAdsCount - actualPublishedCount);

      return res.json({ success: true, data: { total: publishAdsCount, remaining, actualPublishedCount, packageStartDate: packageStartDate.toISOString() } });
    } catch (err) {
      console.error('GET /admin/package-ads error', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // PATCH /admin/ads-payment/:id - update ads_payment record (admin only)
  app.patch('/admin/ads-payment/:id', verifyJwtToken, async (req, res) => {
    try {
      console.log('PATCH /admin/ads-payment called. body:', JSON.stringify(req.body));
      const acting = req.user || null;
      const roleCheck = (acting && acting.role) ? String(acting.role).toLowerCase() : '';
      if (!roleCheck.includes('admin')) {
        console.log('Forbidden: user is not admin', acting ? acting.id : null);
        return res.status(403).json({ success: false, error: 'forbidden: admin only' });
      }

      const id = req.params.id;
      console.log('Updating ads_payment id=', id);
      if (!id) return res.status(400).json({ success: false, error: 'missing id' });

      // Only allow specific fields to be updated via this admin endpoint
      const { is_active, status, amount, paymob_order_id, ads_payment_id } = req.body || {};
      const updateObj = {};
      if (typeof is_active !== 'undefined') updateObj.is_active = is_active;
      if (typeof status !== 'undefined') updateObj.status = status;
      if (typeof amount !== 'undefined') updateObj.amount = amount;
      if (typeof paymob_order_id !== 'undefined') updateObj.paymob_order_id = paymob_order_id;
      if (typeof ads_payment_id !== 'undefined') updateObj.ads_payment_id = ads_payment_id;

      if (Object.keys(updateObj).length === 0) {
        return res.status(400).json({ success: false, error: 'nothing to update' });
      }

      try {
        const { data: updated, error } = await supabase
          .from('ads_payment')
          .update(updateObj)
          .eq('id', id)
          .select()
          .maybeSingle();

        console.log('ads_payment update result for id=', id, 'error=', error, 'updated=', updated);
        if (error) return res.status(500).json({ success: false, error: error.message || error });
        return res.json({ success: true, data: updated });
      } catch (e) {
        console.error('ads_payment update exception:', e);
        return res.status(500).json({ success: false, error: e.message || 'update failed' });
      }
    } catch (err) {
      console.error('/admin/ads-payment error', err);
      return res.status(500).json({ success: false, error: err.message || 'Server error' });
    }
  });

  // PATCH /admin/ads_payment - update ads_payment by id from request body or query (admin only)
  // Accepts id in body (`{ id: 123 }`) or in query (`?id=eq.123` or `?id=123`).
  app.patch('/admin/ads_payment', verifyJwtToken, async (req, res) => {
    try {
      console.log('PATCH /admin/ads_payment called. body:', JSON.stringify(req.body), 'query:', JSON.stringify(req.query));
      const acting = req.user || null;
      const roleCheck = (acting && acting.role) ? String(acting.role).toLowerCase() : '';
      if (!roleCheck.includes('admin')) {
        console.log('Forbidden: user is not admin', acting ? acting.id : null);
        return res.status(403).json({ success: false, error: 'forbidden: admin only' });
      }

      // Helper: extract id from body or query (supports formats like "eq.593")
      const extractId = (r) => {
        if (r.body && r.body.id) return r.body.id;
        const q = r.query && r.query.id;
        if (!q) return null;
        const m = String(q).match(/^(?:eq\.)?(.+)$/);
        return m ? m[1] : null;
      };

      const id = extractId(req);
      console.log('ads_payment id from body/query =', id);
      if (!id) return res.status(400).json({ success: false, error: 'Missing id in request body or query' });

      const { status, amount, is_active, paymob_order_id, ads_payment_id } = req.body || {};
      const updateObj = {};
      if (typeof is_active !== 'undefined') updateObj.is_active = is_active;
      if (typeof status !== 'undefined') updateObj.status = status;
      if (typeof amount !== 'undefined') updateObj.amount = amount;
      if (typeof paymob_order_id !== 'undefined') updateObj.paymob_order_id = paymob_order_id;
      if (typeof ads_payment_id !== 'undefined') updateObj.ads_payment_id = ads_payment_id;

      if (Object.keys(updateObj).length === 0) {
        return res.status(400).json({ success: false, error: 'nothing to update' });
      }

      try {
        const { data: updated, error } = await supabase
          .from('ads_payment')
          .update(updateObj)
          .eq('id', id)
          .select()
          .maybeSingle();

        console.log('ads_payment update result for id=', id, 'error=', error, 'updated=', updated);
        if (error) return res.status(500).json({ success: false, error: error.message || error });
        
        return res.json({ success: true, data: updated });
      } catch (e) {
        console.error('ads_payment update exception:', e);
        return res.status(500).json({ success: false, error: e.message || 'update failed' });
      }
    } catch (err) {
      console.error('/admin/ads_payment error', err);
      return res.status(500).json({ success: false, error: err.message || 'Server error' });
    }
  });

  // GET /admin/ads_offar - list ads_offar (decrypted)
  app.get('/admin/ads_offar', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      // الحصول على نوع العرض من الاستعلام (Query Parameter)
      const { type } = req.query;

      if (!type) {
        return res.status(400).json({ error: 'نوع العرض (type) مطلوب' });
      }

      // جلب البيانات من جدول ads_offar في Supabase
      const { data, error } = await supabase
        .from('ads_offar')
        .select('*')
        .eq('type', type); // تصفية النتائج حسب النوع

      if (error) {
        throw error;
      }

      // فك تشفير البيانات قبل إرجاعها
      const out = (data || []).map(item => ({ id: item.id, ...decryptDeep(item) }));

      // إرجاع البيانات
      return res.status(200).json(out);

    } catch (error) {
      console.error('Error fetching ads_offar:', error);
      return res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
  });

  // GET /admin/transfers - list transfer_records (decrypted)
  // ✅ SECURITY FIX: Previously this only checked that the Authorization header
  // *started with* "Bearer " without validating the token itself, so any random
  // string after "Bearer " was accepted. Now uses the real verifyJwtToken +
  // requireAdmin guards, consistent with the rest of the admin routes.
  app.get('/admin/transfers', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('transfer_records')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const out = [];

      for (const row of (data || [])) {
        const record = {
          id: row.id,
          ...decryptDeep(row)
        };

        // صورة الجهاز
        if (record.phone_image && !record.phone_image.startsWith("http")) {
          const { data: phoneUrl } = await supabase.storage
            .from("registerphone")
            .createSignedUrl(record.phone_image, 300);

          if (phoneUrl?.signedUrl) {
            record.phone_image = phoneUrl.signedUrl;
          }
        }
        // إيصال البائع

        if (record.seller_receipt_image_url) {
          const { data } = await supabase.storage
            .from("registerphone")
            .createSignedUrl(record.seller_receipt_image_url, 300);

          if (data?.signedUrl) {
            record.seller_receipt_image_url = data.signedUrl;
          }
        }
        // إيصال المشتري
        if (record.receipt_image && !record.receipt_image.startsWith("http")) {
          const { data: receiptUrl } = await supabase.storage
            .from("registerphone")
            .createSignedUrl(record.receipt_image, 300);

          if (receiptUrl?.signedUrl) {
            record.receipt_image = receiptUrl.signedUrl;
          }
        }

        out.push(record);
      }

      return res.status(200).json(out);

      return res.status(200).json(out);
    } catch (err) {
      console.error('Error fetching transfers:', err);
      return res.status(500).json({ error: 'خطأ في السيرفر', message: err && err.message ? err.message : String(err) });
    }
  });

  // GET /admin/businesses/:userId - get business details by user ID
  app.get('/admin/businesses/:userId', verifyJwtToken, requireAdmin, async (req, res) => {
    try {
      // استخراج معرف المستخدم من المسار
      const { userId } = req.params;

      // التحقق من أن معرف المستخدم موجود
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // التحقق من أن معرف المستخدم هو UUID صالح
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      // جلب بيانات النشاط التجاري من Supabase
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('user_id', userId);

      // التحقق من وجود خطأ
      if (error) {
        console.error('Error fetching business details:', error);
        return res.status(500).json({ error: 'Failed to fetch business details' });
      }

      // التحقق من وجود بيانات
      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Business details not found' });
      }

      // فك تشفير البيانات قبل إرجاعها
      const decryptedData = decryptDeep(data[0]);
      const signedData = await signBusinessImages(decryptedData);

      try {
        await logAudit({
          userId: req.user?.id || null,
          action: 'admin_view_decrypted_data',
          resourceType: 'businesses',
          resourceId: userId,
          oldValues: null,
          newValues: null,
          details: { route: '/admin/businesses/:userId' },
          ip: getAuditIp(req),
          userAgent: req.headers['user-agent'] || null,
          status: 'success'
        });
      } catch (e) {
        console.warn('/admin/businesses/:userId view audit failed', e);
      }

      // إرجاع البيانات
      return res.status(200).json(signedData);
    } catch (error) {
      console.error('Error in business details API:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}

export default registerAdminRoutes;
