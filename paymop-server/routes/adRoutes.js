export function registerAdRoutes({
  app,
  supabase,
  verifyJwtToken,
  sendError,
  decryptField,
  normalizeTextForCompare,
  normalizeDigitsOnly,
}) {
  app.get('/api/ad/:id', verifyJwtToken, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id is required' });
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { data, error } = await supabase
        .from('ads_payment')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('/api/ad/:id supabase error:', error);
        return sendError(res, 500, 'Database error', error);
      }
      if (!data) return res.status(404).json({ error: 'Not found' });

      const out = {
        id: data.id,
        amount: data.amount ?? null,
        type: data.type ?? null,
        payment_status: data.payment_status ?? null,
        is_paid: data.is_paid ?? null,
        is_active: data.is_active ?? null,
        payment_date: data.payment_date ?? null,
        paymob_order_id: data.paymob_order_id ?? null,
        merchant_order_id: data.merchant_order_id ?? null,
        offer_id: data.offer_id ?? null,
        duration_days: data.duration_days ?? null,
        expires_at: data.expires_at ?? null,
        image_url: data.image_url ?? null,
        store_name: data.store_name ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        created_at: data.created_at ?? null,
        updated_at: data.updated_at ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        owner_name: data.owner_name ?? null
      };

      try { out.store_name = decryptField(out.store_name); } catch (_error) { out.store_name = null; }
      try { out.phone = decryptField(out.phone); } catch (_error) { out.phone = null; }
      try { out.email = decryptField(out.email); } catch (_error) { out.email = null; }
      try { out.owner_name = decryptField(out.owner_name); } catch (_error) { out.owner_name = null; }

      return res.json({ ok: true, ad: out });
    } catch (error) {
      console.error('/api/ad/:id error:', error);
      return sendError(res, 500, 'Server error', error);
    }
  });

  app.get('/api/ad-redirect/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id is required' });

      const { data, error } = await supabase
        .from('ads_payment')
        .select('id, type, is_active, is_paid, payment_status, expires_at, phone')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('/api/ad-redirect/:id supabase error:', error);
        return sendError(res, 500, 'Database error', error);
      }
      if (!data) return res.status(404).json({ error: 'Not found' });
      if (!data.is_active || !data.is_paid || data.payment_status !== 'paid') {
        return res.status(404).json({ error: 'Ad not available' });
      }
      if (data.expires_at && new Date(data.expires_at) <= new Date()) {
        return res.status(404).json({ error: 'Ad expired' });
      }

      const redirectUrl = normalizeRedirectUrl(decryptField(data.phone));
      if (!redirectUrl) {
        return res.status(404).json({ error: 'Invalid redirect URL' });
      }

      return res.redirect(redirectUrl);
    } catch (error) {
      console.error('/api/ad-redirect/:id error:', error);
      return sendError(res, 500, 'Server error', error);
    }
  });

  app.post('/api/validate-other-registration-data', verifyJwtToken, async (req, res) => {
    const { ownerName, phoneNumber, id_last6 } = req.body || {};
    const normalizedIncomingName = normalizeTextForCompare(ownerName);
    const normalizedIncomingPhone = normalizeDigitsOnly(phoneNumber);
    const normalizedIncomingIdLast6 = normalizeDigitsOnly(id_last6);

    if (!normalizedIncomingName || !normalizedIncomingPhone || !normalizedIncomingIdLast6) {
      return res.status(400).json({ valid: false, error: 'missing_required_fields' });
    }

    if (normalizedIncomingIdLast6.length !== 6) {
      return res.status(400).json({ valid: false, error: 'invalid_id_last6' });
    }

    try {
      const { data: usersRows, error: usersError } = await supabase
        .from('users')
        .select('id, full_name, phone, id_last6');

      if (usersError) {
        console.error('/api/validate-other-registration-data users fetch error:', usersError);
        return res.status(500).json({ valid: false, error: 'database_error' });
      }

      const match = (usersRows || []).find((row) => {
        const dbName = normalizeTextForCompare(decryptField(row.full_name) || row.full_name || '');
        const dbPhone = normalizeDigitsOnly(decryptField(row.phone) || row.phone || '');
        const dbIdLast6 = normalizeDigitsOnly(decryptField(row.id_last6) || row.id_last6 || '');
        const phoneMatches =
          dbPhone === normalizedIncomingPhone ||
          dbPhone.endsWith(normalizedIncomingPhone) ||
          normalizedIncomingPhone.endsWith(dbPhone);

        return dbName === normalizedIncomingName && phoneMatches && dbIdLast6 === normalizedIncomingIdLast6;
      });

      if (!match) {
        return res.status(200).json({ valid: false, error: 'data_mismatch' });
      }

      return res.status(200).json({ valid: true, userId: match.id });
    } catch (error) {
      console.error('/api/validate-other-registration-data error:', error);
      return res.status(500).json({ valid: false, error: 'server_error' });
    }
  });

  app.get('/api/ad-website-decrypted-public/:id', async (req, res) => {
    try {
      const adId = req.params.id;
      if (!adId) {
        return res.status(400).json({ error: 'Ad ID is required' });
      }

      const { data: ad, error: fetchError } = await supabase
        .from('ads_payment')
        .select('id, phone, is_active, is_paid, payment_status, expires_at')
        .eq('id', adId)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching ad for decryption:', fetchError);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!ad) {
        return res.status(404).json({ error: 'Ad not found' });
      }
      if (!ad.is_active || !ad.is_paid || ad.payment_status !== 'paid') {
        return res.status(404).json({ error: 'Ad not available' });
      }
      if (ad.expires_at && new Date(ad.expires_at) <= new Date()) {
        return res.status(404).json({ error: 'Ad expired' });
      }

      let finalUrl = decryptField(ad.phone);
      if (finalUrl && /^\+?[0-9]{8,15}$/.test(String(finalUrl).trim())) {
        finalUrl = `https://wa.me/${String(finalUrl).trim().replace(/\D/g, '')}`;
      }

      return res.json({ success: true, website_url: finalUrl });
    } catch (error) {
      console.error('Error in /api/ad-website-decrypted-public/:id:', error);
      return res.status(500).json({ error: 'Server error' });
    }
  });
}

function normalizeRedirectUrl(url) {
  if (!url) return null;
  let normalized = String(url).trim();
  if (!normalized) return null;

  if (/^(\+?[0-9]{8,15})$/.test(normalized)) {
    return `https://wa.me/${normalized.replace(/\D/g, '')}`;
  }

  const normalizeWhatsappPath = (path) => {
    const [pathOnly, queryString] = path.split('?');
    if (/^message\//i.test(pathOnly)) {
      const messageId = pathOnly.replace(/^message\//i, '').trim();
      if (!messageId) return null;
      if (/^[0-9+]+$/.test(messageId)) {
        const query = new URLSearchParams(queryString || '');
        const text = query.get('text');
        const textParam = text ? `&text=${encodeURIComponent(text)}` : '';
        return `https://api.whatsapp.com/send?phone=${messageId.replace(/\D/g, '')}${textParam}`;
      }
      return `https://chat.whatsapp.com/${encodeURIComponent(messageId)}`;
    }

    return `https://api.whatsapp.com/${path}`;
  };

  if (/^whatsapp:\/\//i.test(normalized)) {
    return normalizeWhatsappPath(normalized.replace(/^whatsapp:\/\//i, ''));
  }

  if (/^https?:\/\//i.test(normalized)) {
    try {
      const urlObj = new URL(normalized);
      if (/^wa\.me$/i.test(urlObj.hostname)) {
        const cleanPath = urlObj.pathname.replace(/\D/g, '');
        return `https://wa.me/${cleanPath}${urlObj.search}`;
      }
      if (/^api\.whatsapp\.com$/i.test(urlObj.hostname) || /^chat\.whatsapp\.com$/i.test(urlObj.hostname) || /^web\.whatsapp\.com$/i.test(urlObj.hostname)) {
        if (/^\/message\//i.test(urlObj.pathname)) {
          return normalizeWhatsappPath(`${urlObj.pathname.slice(1)}${urlObj.search}`);
        }
        return normalized;
      }
    } catch (_error) {
      return normalized;
    }
    return normalized;
  }

  if (/^wa\.me\//i.test(normalized) || /^api\.whatsapp\.com\//i.test(normalized) || /^chat\.whatsapp\.com\//i.test(normalized) || /^web\.whatsapp\.com\//i.test(normalized)) {
    return `https://${normalized}`;
  }
  if (/^\/\//.test(normalized)) {
    return `https:${normalized}`;
  }
  return `https://${normalized}`;
}
