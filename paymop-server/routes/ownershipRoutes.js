import bcrypt from 'bcrypt';

const decryptedRequestCounts = {};

export function registerOwnershipRoutes({
  app,
  supabase,
  verifyJwtToken,
  verifyOwnerLimiter,
  sendError,
  decryptField,
  normalizeDigitsOnly,
  maskName,
  maskPhoneNumber,
  maskIdLast6,
  encryptAES,
  hashPasswordForStorage,
  logAudit,
  checkAuthBlocked,
  recordAuthFailure,
  clearAuthFailures
}) {
  app.post('/api/imei-masked-info', verifyJwtToken, async (req, res) => {
    try {
      const { imei } = req.body;
      const userId = req.user.id;
      if (!imei) return res.status(400).json({ error: 'IMEI required' });

      const { data: reports, error: reportError } = await supabase
        .from('phone_reports')
        .select('imei')
        .eq('status', 'active');

      if (reportError) throw reportError;

      const normalizedIncoming = normalizeDigitsOnly(imei);
      const activeReport = reports
        ? reports.find((r) => normalizeDigitsOnly(decryptField(r.imei)) === normalizedIncoming)
        : null;

      const { data: phones, error: phoneError } = await supabase
        .from('registered_phones')
        .select('*, receipt_image_url');
      if (phoneError) throw phoneError;

      if (process.env.NODE_ENV === 'development') {
        try {
          const decryptedList = (phones || []).map((p) => ({
            id: p.id,
            user_id: p.user_id,
            imei_decrypted: decryptField(p.imei)
          }));
          console.log('[IMEI-MASKED-INFO][DEBUG] incoming imei:', imei);
          console.log('[IMEI-MASKED-INFO][DEBUG] decrypted registered_phones sample (first 20):', decryptedList.slice(0, 20));
        } catch (dbgErr) {
          console.error('[IMEI-MASKED-INFO][DEBUG] failed to decrypt sample list:', dbgErr);
        }
      }

      const registeredPhone = phones
        ? phones.find((p) => normalizeDigitsOnly(decryptField(p.imei)) === normalizedIncoming)
        : null;

      if (activeReport) {
        if (registeredPhone) {
          const isOwner = userId && registeredPhone.user_id === userId;
          console.log('[IMEI-MASKED-INFO][REPORT+REG]', {
            imei,
            userId,
            registeredPhoneUserId: registeredPhone.user_id,
            isOwner,
            status: registeredPhone.status
          });

          if (registeredPhone.status === 'transferred') {
            if (userId && registeredPhone.user_id === userId) {
              const ownerName = decryptField(registeredPhone.owner_name) || registeredPhone.owner_name || '';
              const phoneNumber = decryptField(registeredPhone.phone_number) || registeredPhone.phone_number || '';
              const idLast6 = decryptField(registeredPhone.id_last6) || registeredPhone.id_last6 || '';
              const phoneType = registeredPhone.phone_type || '';
              const phoneImageUrl = registeredPhone.phone_image_url || '';
              return res.json({
                found: true,
                masked: false,
                isRegistered: true,
                isOwner: true,
                isTransferred: true,
                hasActiveReport: true,
                receipt_image_url: registeredPhone.receipt_image_url,
                owner_name: ownerName,
                phone_number: phoneNumber,
                id_last6: idLast6,
                maskedOwnerName: maskName(ownerName),
                maskedPhoneNumber: maskPhoneNumber(phoneNumber),
                maskedIdLast6: maskIdLast6(idLast6 || ''),
                phone_type: phoneType,
                phone_image_url: phoneImageUrl
              });
            }

            console.log('[IMEI-MASKED-INFO] transferred: returning masked transferred info');
            const decryptedPhoneNumber = decryptField(registeredPhone.phone_number);
            const decryptedIdLast6 = decryptField(registeredPhone.id_last6);
            const decryptedOwnerName = decryptField(registeredPhone.owner_name) || registeredPhone.owner_name || '';
            const maskedPhoneDetails = {
              maskedOwnerName: maskName(decryptedOwnerName),
              maskedPhoneNumber: maskPhoneNumber(decryptedPhoneNumber),
              maskedIdLast6: maskIdLast6(decryptedIdLast6 || ''),
              phone_type: registeredPhone.phone_type || '',
              phone_image_url: registeredPhone.phone_image_url || ''
            };
            return res.json({
              found: true,
              masked: true,
              isOtherUser: true,
              hasActiveReport: true,
              isTransferred: true,
              isRegistered: true,
              receipt_image_url: registeredPhone.receipt_image_url,
              ...maskedPhoneDetails
            });
          }

          const ownerName = decryptField(registeredPhone.owner_name) || registeredPhone.owner_name || '';
          const phoneNumber = decryptField(registeredPhone.phone_number) || registeredPhone.phone_number || '';
          const idLast6 = decryptField(registeredPhone.id_last6) || registeredPhone.id_last6 || '';
          const phoneType = registeredPhone.phone_type || '';
          const phoneImageUrl = registeredPhone.phone_image_url || '';

          const response = {
            found: true,
            masked: false,
            isRegistered: true,
            isOwner,
            hasActiveReport: true,
            receipt_image_url: registeredPhone.receipt_image_url,
            maskedOwnerName: maskName(ownerName),
            maskedPhoneNumber: maskPhoneNumber(phoneNumber),
            maskedIdLast6: maskIdLast6(idLast6),
            phone_type: phoneType,
            phone_image_url: phoneImageUrl
          };
          console.log('[IMEI-MASKED-INFO] Response:', response);
          return res.json(response);
        }

        return res.json({ found: true, masked: false, isRegistered: false, isOwner: false, hasActiveReport: true });
      }

      if (registeredPhone) {
        const isOwner = userId && registeredPhone.user_id === userId;
        console.log('[IMEI-MASKED-INFO][REG ONLY]', {
          imei,
          userId,
          registeredPhoneUserId: registeredPhone.user_id,
          isOwner,
          status: registeredPhone.status
        });

        if (registeredPhone.status === 'transferred') {
          if (userId && registeredPhone.user_id === userId) {
            const ownerName = decryptField(registeredPhone.owner_name) || registeredPhone.owner_name || '';
            const phoneNumber = decryptField(registeredPhone.phone_number) || registeredPhone.phone_number || '';
            const idLast6 = decryptField(registeredPhone.id_last6) || registeredPhone.id_last6 || '';
            const phoneType = registeredPhone.phone_type || '';
            const phoneImageUrl = registeredPhone.phone_image_url || '';
            return res.json({
              found: true,
              masked: false,
              isRegistered: true,
              isOwner: true,
              isTransferred: true,
              hasActiveReport: false,
              receipt_image_url: registeredPhone.receipt_image_url,
              owner_name: ownerName,
              phone_number: phoneNumber,
              id_last6: idLast6,
              maskedOwnerName: maskName(ownerName),
              maskedPhoneNumber: maskPhoneNumber(phoneNumber),
              maskedIdLast6: maskIdLast6(idLast6 || ''),
              phone_type: phoneType,
              phone_image_url: phoneImageUrl
            });
          }

          console.log('[IMEI-MASKED-INFO] transferred: returning masked transferred info');
          const decryptedPhoneNumber = decryptField(registeredPhone.phone_number);
          const decryptedIdLast6 = decryptField(registeredPhone.id_last6);
          const maskedOwnerRaw = (() => {
            try {
              return decryptField(registeredPhone.owner_name) || registeredPhone.owner_name || '';
            } catch {
              return registeredPhone.owner_name || '';
            }
          })();
          const maskedPhoneDetails = {
            maskedOwnerName: maskName(maskedOwnerRaw),
            maskedPhoneNumber: maskPhoneNumber(decryptedPhoneNumber),
            maskedIdLast6: maskIdLast6(decryptedIdLast6 || ''),
            phone_type: registeredPhone.phone_type || '',
            phone_image_url: registeredPhone.phone_image_url || ''
          };
          return res.json({
            found: true,
            masked: true,
            isOtherUser: true,
            isTransferred: true,
            isRegistered: true,
            hasActiveReport: false,
            receipt_image_url: registeredPhone.receipt_image_url,
            ...maskedPhoneDetails
          });
        }

        const ownerName = decryptField(registeredPhone.owner_name) || registeredPhone.owner_name || '';
        const phoneNumber = decryptField(registeredPhone.phone_number) || registeredPhone.phone_number || '';
        const idLast6 = decryptField(registeredPhone.id_last6) || registeredPhone.id_last6 || '';
        const phoneType = registeredPhone.phone_type || '';
        const phoneImageUrl = registeredPhone.phone_image_url || '';

        const response = {
          found: true,
          masked: true,
          isOwner,
          isRegistered: true,
          hasActiveReport: false,
          receipt_image_url: registeredPhone.receipt_image_url,
          maskedOwnerName: maskName(ownerName),
          maskedPhoneNumber: maskPhoneNumber(phoneNumber),
          maskedIdLast6: maskIdLast6(idLast6),
          phone_type: phoneType,
          phone_image_url: phoneImageUrl
        };
        console.log('[IMEI-MASKED-INFO] Response:', response);
        return res.json(response);
      }

      console.log('[IMEI-MASKED-INFO] Not registered: found=false');
      return res.json({ found: false, masked: false, isOwner: false, isRegistered: false, hasActiveReport: false });
    } catch (error) {
      console.error('Error in imei-masked-info:', error);
      return res.status(500).json({ error: 'Server error', details: error?.message || '' });
    }
  });

  app.post('/api/report-details-decrypted', verifyJwtToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const now = Date.now();
      const windowMs = 60 * 60 * 1000;
      const limit = 10;
      if (!decryptedRequestCounts[userId]) decryptedRequestCounts[userId] = [];
      decryptedRequestCounts[userId] = decryptedRequestCounts[userId].filter((ts) => now - ts < windowMs);
      if (decryptedRequestCounts[userId].length >= limit) {
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }
      decryptedRequestCounts[userId].push(now);

      const { reportId, id } = req.body;
      const targetId = reportId || id;
      if (!targetId) return res.status(400).json({ error: 'reportId is required' });

      const { data: report, error } = await supabase
        .from('phone_reports')
        .select('*')
        .eq('id', targetId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching report for decrypted details:', error);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!report) return res.status(404).json({ error: 'Report not found' });
      if (req.user.id !== report.user_id) {
        return res.status(403).json({ error: 'Forbidden: only owner can view decrypted details' });
      }

      const decrypted = {
        id: report.id,
        imei: decryptField(report.imei),
        owner_name: decryptField(report.owner_name) || report.owner_name,
        phone_number: decryptField(report.phone_number) || report.phone_number,
        phone_type: decryptField(report.phone_type) || report.phone_type,
        loss_location: decryptField(report.loss_location) || report.loss_location,
        loss_time: report.loss_time || null,
        id_last6: decryptField(report.id_last6) || report.id_last6,
        email: decryptField(report.email) || report.email,
        fcm_token: report.fcm_token || null,
        report_date: report.report_date || null,
        status: report.status || null,
        receipt_image_url: report.receipt_image_url || null,
        finder_phone: decryptField(report.finder_phone) || report.finder_phone || null
      };

      return res.json({ success: true, ...decrypted, data: decrypted });
    } catch (err) {
      console.error('Error in /api/report-details-decrypted:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/verify-seller-password', verifyJwtToken, async (req, res) => {
    try {
      const { imei, password } = req.body;
      const userId = req.user?.id;

      console.log('[verify-seller-password] userId:', userId, 'imei:', imei, 'password:', !!password);

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!imei || !password) return res.status(400).json({ error: 'imei and password required' });

      const userKey = req.user && req.user.id ? `uid:${req.user.id}` : `ip:${req.ip}`;
      const blocked = checkAuthBlocked(userKey);
      if (blocked.blocked) {
        const retryAfter = Math.ceil((blocked.retryAfterMs || 0) / 1000);
        return res.status(429).json({ ok: false, error: 'Rate limit exceeded', retryAfter });
      }

      const { data: phones, error } = await supabase
        .from('registered_phones')
        .select('id, imei, password, user_id')
        .limit(1000);
      if (error) throw error;

      const found = phones ? phones.find((p) => decryptField(p.imei) === imei) : null;
      if (!found) return res.status(404).json({ ok: false, error: 'Phone not found' });
      if (found.user_id !== req.user.id) return res.status(403).json({ ok: false, error: 'Not owner' });

      const passwordMatched = found.password
        ? await bcrypt.compare(String(password), String(found.password))
        : false;
      if (!passwordMatched) {
        recordAuthFailure(userKey);
        return res.json({ ok: false });
      }
      clearAuthFailures(userKey);

      return res.json({ ok: true });
    } catch (err) {
      console.error('verify-seller-password error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/transfer-ownership', verifyJwtToken, async (req, res) => {
    try {
      const { imei, sellerPassword, newOwner, new_receipt_image_url } = req.body;
      const userId = req.user?.id;

      if (!userId) return res.status(401).json({ error: 'Unauthorized: No user ID' });
      if (!imei || !sellerPassword || !newOwner) {
        return res.status(400).json({ error: 'imei, sellerPassword and newOwner required' });
      }

      const { data: phones, error } = await supabase
        .from('registered_phones')
        .select('*')
        .limit(1000);
      if (error) throw error;

      const registeredPhone = phones ? phones.find((p) => decryptField(p.imei) === imei) : null;
      if (!registeredPhone) return res.status(404).json({ error: 'Phone not found' });

      console.log('[transfer-ownership] registeredPhone (raw) for imei=', imei, {
        id: registeredPhone?.id,
        owner_name_raw: registeredPhone?.owner_name,
        maskedOwnerName: registeredPhone?.maskedOwnerName,
        phone_number_raw: registeredPhone?.phone_number,
        id_last6_raw: registeredPhone?.id_last6,
        status: registeredPhone?.status,
        user_id: registeredPhone?.user_id
      });

      if (registeredPhone.user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden: only current owner can transfer' });
      }

      const userKey = req.user && req.user.id ? `uid:${req.user.id}` : `ip:${req.ip}`;
      const blocked = checkAuthBlocked(userKey);
      if (blocked.blocked) {
        const retryAfter = Math.ceil((blocked.retryAfterMs || 0) / 1000);
        return res.status(429).json({ error: 'Rate limit exceeded', retryAfter });
      }

      const sellerPasswordMatched = registeredPhone.password
        ? await bcrypt.compare(String(sellerPassword), String(registeredPhone.password))
        : false;
      if (!sellerPasswordMatched) {
        recordAuthFailure(userKey);
        return res.status(401).json({ error: 'Incorrect seller password' });
      }
      clearAuthFailures(userKey);

      const previousOwnerIdLast6 = decryptField(registeredPhone.id_last6);
      const previousOwnerName = decryptField(registeredPhone.owner_name) || registeredPhone.owner_name || '';
      const previousOwnerPhone = decryptField(registeredPhone.phone_number) || registeredPhone.phone_number || '';

      const updateData = {};
      if (typeof newOwner.owner_name !== 'undefined') {
        if (newOwner.owner_name === null || newOwner.owner_name === '') {
          updateData.owner_name = null;
        } else {
          const encOwner = encryptAES(newOwner.owner_name);
          console.log('[transfer-ownership] incoming newOwner.owner_name:', newOwner.owner_name);
          console.log('[transfer-ownership] encryptAES result for owner_name:', encOwner);
          if (encOwner) {
            updateData.owner_name = JSON.stringify({
              encryptedData: encOwner.encryptedData,
              iv: encOwner.iv,
              authTag: encOwner.authTag
            });
          }
        }
      }

      if (typeof newOwner.phone_number !== 'undefined') {
        if (newOwner.phone_number === null || newOwner.phone_number === '') {
          updateData.phone_number = null;
        } else {
          const enc = encryptAES(newOwner.phone_number);
          if (enc) updateData.phone_number = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
        }
      }

      if (typeof newOwner.id_last6 !== 'undefined') {
        if (newOwner.id_last6 === null || newOwner.id_last6 === '') {
          updateData.id_last6 = null;
        } else {
          const enc = encryptAES(newOwner.id_last6);
          if (enc) updateData.id_last6 = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
        }
      }

      if (typeof newOwner.email !== 'undefined') {
        if (newOwner.email === null || newOwner.email === '') {
          updateData.email = null;
        } else {
          const enc = encryptAES(newOwner.email);
          if (enc) updateData.email = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
        }
      }

      if (typeof newOwner.phone_type !== 'undefined') updateData.phone_type = newOwner.phone_type;
      if (typeof newOwner.password !== 'undefined' && newOwner.password) {
        updateData.password = await hashPasswordForStorage(newOwner.password);
      }

      let buyerUserId = null;
      if (typeof newOwner.user_id !== 'undefined' && newOwner.user_id !== null) {
        buyerUserId = newOwner.user_id;
      } else if (newOwner.email) {
        try {
          const { data: userRecord, error: userError } = await supabase.from('users').select('id').eq('email', newOwner.email).maybeSingle();
          if (!userError && userRecord && userRecord.id) buyerUserId = userRecord.id;
        } catch (e) {
          console.error('transfer-ownership: failed to lookup buyer user by email in users table', e);
        }
      }
      updateData.user_id = buyerUserId;
      updateData.status = 'transferred';

      if ((typeof newOwner.email === 'undefined' || newOwner.email === null || newOwner.email === '') && buyerUserId) {
        try {
          const { data: userById, error: userByIdErr } = await supabase.from('users').select('email').eq('id', buyerUserId).maybeSingle();
          if (!userByIdErr && userById && userById.email) {
            const enc = encryptAES(userById.email);
            if (enc) updateData.email = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
          }
        } catch (e) {
          console.error('transfer-ownership: failed to fetch buyer email from users table', e);
        }
      }

      console.log('[transfer-ownership] updateData prepared:', updateData);

      const { data: updated, error: updateErr } = await supabase
        .from('registered_phones')
        .update(updateData)
        .eq('id', registeredPhone.id)
        .select();
      if (updateErr) {
        console.error('transfer-ownership: update registered_phones error:', updateErr);
        throw updateErr;
      }
      console.log('[transfer-ownership] registered_phones updated result:', updated);

      const encryptToJson = (value) => {
        if (value === null || value === undefined || String(value).trim() === '') return null;
        const enc = encryptAES(value);
        if (!enc) return null;
        return JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
      };

      const transferRecord = {
        date: new Date().toISOString(),
        imei: encryptToJson(imei),
        phone_type: newOwner.phone_type || registeredPhone.phone_type || null,
        seller_name: encryptToJson(previousOwnerName),
        seller_phone: encryptToJson(previousOwnerPhone),
        seller_id_last6: encryptToJson(previousOwnerIdLast6),
        buyer_name: encryptToJson(newOwner.owner_name || ''),
        buyer_phone: encryptToJson(newOwner.phone_number || ''),
        buyer_id_last6: encryptToJson(newOwner.id_last6 || null),
        receipt_image: new_receipt_image_url || registeredPhone.receipt_image_url || null,
        phone_image: registeredPhone.phone_image_url || null
      };

      const { data: transferInserted, error: transferErr } = await supabase
        .from('transfer_records')
        .insert([transferRecord])
        .select();

      if (transferErr) {
        console.error('transfer-ownership: failed to insert transfer record', transferErr);
      }

      await logAudit({
        userId,
        action: 'transfer_ownership',
        resourceType: 'phone',
        resourceId: registeredPhone.id,
        oldValues: { owner: previousOwnerName || 'Unknown', user_id: userId },
        newValues: { owner: newOwner.owner_name || 'Unknown', user_id: newOwner.email },
        details: { imei_last_4: imei.slice(-4), transferId: transferInserted?.[0]?.id },
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.json({
        success: true,
        data: updated,
        previousOwnerIdLast6,
        transferRecordId: transferInserted?.[0]?.id || null
      });
    } catch (err) {
      console.error('transfer-ownership error:', err);
      return sendError(res, 500, 'حدث خطأ في الخادم', err);
    }
  });

  app.post('/api/transfer-records', verifyJwtToken, async (req, res) => {
    try {
      const { imei } = req.body || {};
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!imei) return res.status(400).json({ error: 'imei is required' });

      const { data: ownPhones, error: ownPhonesErr } = await supabase
        .from('registered_phones')
        .select('imei')
        .eq('user_id', userId)
        .limit(1000);
      if (ownPhonesErr) throw ownPhonesErr;

      const imeiOwned = (ownPhones || []).some((p) => {
        const decImei = decryptField(p.imei) || p.imei;
        return normalizeDigitsOnly(decImei) === normalizeDigitsOnly(imei);
      });
      if (!imeiOwned) return res.status(403).json({ error: 'Not authorized' });

      const { data: records, error } = await supabase
        .from('transfer_records')
        .select('*')
        .order('date', { ascending: false })
        .limit(1000);
      if (error) throw error;

      const filtered = (records || []).filter((r) => {
        const decImei = decryptField(r.imei) || r.imei;
        return normalizeDigitsOnly(decImei) === normalizeDigitsOnly(imei);
      });

      const decrypted = filtered.map((r) => ({
        ...r,
        imei: decryptField(r.imei) || r.imei,
        seller_name: decryptField(r.seller_name) || r.seller_name,
        seller_phone: decryptField(r.seller_phone) || r.seller_phone,
        seller_id_last6: decryptField(r.seller_id_last6) || r.seller_id_last6,
        buyer_name: decryptField(r.buyer_name) || r.buyer_name,
        buyer_phone: decryptField(r.buyer_phone) || r.buyer_phone,
        buyer_id_last6: decryptField(r.buyer_id_last6) || r.buyer_id_last6
      }));

      try {
        const withUrls = [];
        for (const record of decrypted) {
          const copy = { ...record };

          try {
            const phoneImage = copy.phone_image;
            if (phoneImage && typeof phoneImage === 'string' && !phoneImage.startsWith('http') && !phoneImage.startsWith('data:') && !phoneImage.startsWith('blob:')) {
              const cleaned = String(phoneImage).replace(/^\/+/, '');
              const { data: urlData, error: urlErr } = await supabase.storage.from('registerphone').createSignedUrl(cleaned, 300);
              if (!urlErr && urlData && urlData.signedUrl) copy.phone_image = urlData.signedUrl;
            }
          } catch {
          }

          try {
            const receiptImage = copy.receipt_image;
            if (receiptImage && typeof receiptImage === 'string' && !receiptImage.startsWith('http') && !receiptImage.startsWith('data:') && !receiptImage.startsWith('blob:')) {
              const cleaned = String(receiptImage).replace(/^\/+/, '');
              const bucket = cleaned.startsWith('receipts/') ? 'transfer-assets' : 'registerphone';
              const { data: urlData, error: urlErr } = await supabase.storage.from(bucket).createSignedUrl(cleaned, 300);
              if (!urlErr && urlData && urlData.signedUrl) copy.receipt_image = urlData.signedUrl;
            }
          } catch {
          }

          withUrls.push(copy);
        }

        return res.json({ success: true, data: withUrls });
      } catch (e) {
        console.warn('/api/transfer-records/verify-owner: failed to generate signed URLs for images', e?.message || e);
        return res.json({ success: true, data: decrypted });
      }
    } catch (err) {
      console.error('transfer-records error:', err);
      return res.status(500).json({ error: 'Server error', details: err?.message || '' });
    }
  });

  app.post('/api/transfer-records/verify-owner', verifyOwnerLimiter, async (req, res) => {
    try {
      const { imei, ownerPassword } = req.body || {};
      if (!imei || !ownerPassword) return res.status(400).json({ error: 'imei and ownerPassword are required' });

      const { data: phones, error: phonesErr } = await supabase
        .from('registered_phones')
        .select('id, user_id, imei, password')
        .limit(1000);
      if (phonesErr) throw phonesErr;

      const matching = (phones || []).find((p) => {
        const dec = decryptField(p.imei) || p.imei;
        return normalizeDigitsOnly(dec) === normalizeDigitsOnly(imei);
      });
      if (!matching) return res.status(404).json({ error: 'Owner not found for IMEI' });

      const storedHash = matching.password;
      if (!storedHash) return res.status(400).json({ error: 'No registration password set for this IMEI' });

      const passwordMatches = await bcrypt.compare(String(ownerPassword), String(storedHash));
      if (!passwordMatches) return res.status(401).json({ error: 'Invalid owner credentials' });

      const { data: records, error } = await supabase
        .from('transfer_records')
        .select('*')
        .order('date', { ascending: false })
        .limit(1000);
      if (error) throw error;

      const filtered = (records || []).filter((r) => {
        const decImei = decryptField(r.imei) || r.imei;
        return normalizeDigitsOnly(decImei) === normalizeDigitsOnly(imei);
      });

      const decrypted = filtered.map((r) => ({
        ...r,
        imei: decryptField(r.imei) || r.imei,
        seller_name: decryptField(r.seller_name) || r.seller_name,
        seller_phone: decryptField(r.seller_phone) || r.seller_phone,
        seller_id_last6: decryptField(r.seller_id_last6) || r.seller_id_last6,
        buyer_name: decryptField(r.buyer_name) || r.buyer_name,
        buyer_phone: decryptField(r.buyer_phone) || r.buyer_phone,
        buyer_id_last6: decryptField(r.buyer_id_last6) || r.buyer_id_last6
      }));

      return res.json({ success: true, data: decrypted });
    } catch (err) {
      console.error('/api/transfer-records/verify-owner error:', err);
      return res.status(500).json({ error: 'Server error', details: err?.message || '' });
    }
  });

  // Endpoint: حل البلاغات بناءً على imei مشفّر (مستخدم في الواجهة عند تأكيد العثور)
  app.post('/api/resolve-report', verifyJwtToken, async (req, res) => {
    try {
      const { imei_encrypted } = req.body || {};
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      if (!imei_encrypted) return res.status(400).json({ success: false, error: 'imei_encrypted is required' });

      // حاول استخراج قيمة IMEI من الحمولة المشفّرة المرسلة
      const incomingImei = decryptField(imei_encrypted) || null;
      if (!incomingImei) return res.status(400).json({ success: false, error: 'Invalid imei_encrypted' });
      const normalizedIncoming = normalizeDigitsOnly(incomingImei);

      // جلب كل البلاغات الفعالة لمستخدمنا أو عامة للبحث
      const { data: reports, error: fetchErr } = await supabase
        .from('phone_reports')
        .select('*')
        .limit(1000);
      if (fetchErr) throw fetchErr;

      const matching = (reports || []).filter((r) => {
        try {
          const dec = decryptField(r.imei) || r.imei;
          // Match active reports for the same IMEI regardless of who created the report
          return normalizeDigitsOnly(dec) === normalizedIncoming && r.status === 'active';
        } catch (e) {
          return false;
        }
      });

      console.log('[resolve-report] normalizedIncoming:', normalizedIncoming, 'matchingCount:', matching.length);

      if (!matching || matching.length === 0) {
        return res.status(404).json({ success: false, error: 'Report not found' });
      }

      const ids = matching.map(m => m.id);
      const { data: updated, error: updateErr } = await supabase
        .from('phone_reports')
        .update({ status: 'resolved' })
        .in('id', ids)
        .select();
      if (updateErr) throw updateErr;

      // Audit
      for (const id of ids) {
        try {
          await logAudit({
            userId,
            action: 'resolve_report',
            resourceType: 'phone_report',
            resourceId: id,
            oldValues: { status: 'active' },
            newValues: { status: 'resolved' },
            ip: req.ip,
            userAgent: req.headers['user-agent']
          });
        } catch (auditErr) {
          console.warn('resolve-report: audit log failed', auditErr);
        }
      }

      return res.json({ success: true, data: updated });
    } catch (err) {
      console.error('resolve-report error:', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  app.post('/api/update-phone-status', verifyJwtToken, async (req, res) => {
    try {
      const { ids, status } = req.body;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });
      if (!status) return res.status(400).json({ error: 'status required' });

      // Build update payload. If confirming ownership, set last_confirmed_at timestamp.
      const updatePayload = { status };
      if (status === 'approved') {
        updatePayload.last_confirmed_at = new Date().toISOString();
      }

      console.log('[update-phone-status] userId:', userId, 'ids:', ids, 'status:', status);
      const { data, error } = await supabase
        .from('registered_phones')
        .update(updatePayload)
        .in('id', ids)
        .eq('user_id', userId)
        .select();

      if (error) throw error;

      try {
        // Audit log for ownership updates
        for (const updated of data || []) {
          await logAudit({
            userId,
            action: status === 'approved' ? 'confirm_ownership' : 'update_phone_status',
            resourceType: 'registered_phone',
            resourceId: updated.id,
            newValues: { status: updatePayload.status, last_confirmed_at: updatePayload.last_confirmed_at || null },
            ip: req.ip,
            userAgent: req.headers['user-agent']
          });
        }
      } catch (auditErr) {
        console.warn('Failed to write audit for update-phone-status:', auditErr);
      }

      return res.json({ success: true, data });
    } catch (err) {
      console.error('update-phone-status error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/reset-registered-phone-password', verifyJwtToken, async (req, res) => {
    try {
      const { imei, newPassword } = req.body;
      if (!imei || !newPassword) return res.status(400).json({ error: 'imei and newPassword required' });

      const { data: phones, error } = await supabase
        .from('registered_phones')
        .select('id, imei, email, user_id')
        .limit(1000);
      if (error) throw error;

      const found = phones ? phones.find((p) => decryptField(p.imei) === imei) : null;
      if (!found) return res.status(404).json({ error: 'Phone not found' });

      const userKey = req.user && req.user.id ? `uid:${req.user.id}` : `ip:${req.ip}`;
      const blocked = checkAuthBlocked(userKey);
      if (blocked.blocked) {
        const retryAfter = Math.ceil((blocked.retryAfterMs || 0) / 1000);
        return res.status(429).json({ error: 'Rate limit exceeded', retryAfter });
      }

      if (found.email !== req.user.email && found.user_id !== req.user.id) {
        recordAuthFailure(userKey);
        return res.status(403).json({ error: 'Not authorized to reset password for this phone' });
      }

      const hashed = await hashPasswordForStorage(newPassword);
      const { data: updated, error: updateErr } = await supabase
        .from('registered_phones')
        .update({ password: hashed })
        .eq('id', found.id)
        .select();
      if (updateErr) throw updateErr;

      clearAuthFailures(userKey);

      await logAudit({
        userId: req.user?.id,
        action: 'reset_registered_phone_password',
        resourceType: 'registered_phone',
        resourceId: found.id,
        details: { imei_last_4: decryptField(found.imei).slice(-4) },
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.json({ success: true, data: updated });
    } catch (err) {
      console.error('reset-registered-phone-password error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });
}
