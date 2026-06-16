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
}, getTranslations) {
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

  // endpoint للإبلاغ عن هاتف مفقود
app.post('/api/report-lost-phone', async (req, res) => {
  try {
    const { imei, phoneNumber, countryCode } = req.body;

    // البحث عن الهاتف
    const { data: phoneData, error } = await supabase
      .from('registered_phones')
      .select('*')
      .eq('imei', imei)
      .single();

    if (error || !phoneData) {
      return res.status(404).json({ error: 'Phone not found' });
    }

    // تجهيز الاستجابة للواجهة الأمامية
    // تأكد من إرسال country_code منفصلاً
    const responsePayload = {
      found: true,
      ownerName: phoneData.owner_name,
      // إرسال الرقم والرمز منفصلين
      phoneNumber: phoneData.phone_number, 
      countryCode: phoneData.country_code,
      // ...
    };

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error('Error reporting phone:', error);
    return res.status(500).json({ error: 'Failed to report phone' });
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
      const translations = (typeof getTranslations === 'function') ? getTranslations(normalizedLang) : {};

      const title = translations['phone_found_success'] || translations['phone_found'] || (normalizedLang.startsWith('en') ? 'Your phone was found!' : 'تم العثور على هاتفك!');
      const body = (translations['owner_notified_success'] || translations['owner_notified'] || translations['owner_will_be_notified'])
        ? `${translations['owner_notified_success'] || translations['owner_notified'] || translations['owner_will_be_notified']} ${decryptedFinderPhone ? `: ${decryptedFinderPhone}` : ''}`
        : (normalizedLang.startsWith('en') ? `Congratulations! Your phone was found. To contact the finder, please call: ${decryptedFinderPhone}.` : `مبروك! تم العثور على هاتفك. للتواصل مع الشخص الذي وجده، يرجى الاتصال على الرقم: ${decryptedFinderPhone}.`);

      const emailSubject = translations['phone_found_success'] || title;
      const emailHtml = `<p>${(ownerName || decryptedOwnerName || foundReport.owner_name || '')}</p>
        <p>${translations['phone_found_success'] || 'Your phone was found'} (IMEI: ${decryptedImei || foundReport.imei || ''}).</p>
        <p>${body}</p>`;

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
