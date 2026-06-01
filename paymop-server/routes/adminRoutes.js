export function registerAdminRoutes({ app, supabase, decryptField, verifyJwtToken, logAudit }) {
  // Deep decrypt helper: recursively decrypt strings or encrypted objects.
  const decryptDeep = (value) => {
    try {
      if (value === null || typeof value === 'undefined') return null;

      // If it's an array, decrypt each element
      if (Array.isArray(value)) return value.map((v) => decryptDeep(v));

      // If it's an object, check if it's an encrypted payload object
      if (typeof value === 'object') {
        if (!value) return null;
        if (value.encryptedData && value.iv && value.authTag) {
          // decryptField accepts object form too
          return decryptField(value);
        }
        // Otherwise recursively process keys and return a plain object
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
          // if original contains obvious encrypted markers, don't return raw
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

  // GET /admin/dashboard - summary + recent samples
  app.get('/admin/dashboard', async (req, res) => {
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
  app.get('/admin/reports', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);
      const { data, error } = await supabase.from('phone_reports').select('*').order('report_date', { ascending: false }).limit(limit);
      if (error) throw error;
      const out = (data || []).map(r => ({ id: r.id, ...decryptDeep(r) }));
      return res.json({ ok: true, reports: out });
    } catch (err) {
      console.error('/admin/reports error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /admin/ads - list phone ads (decrypted)
  app.get('/admin/ads', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);
      const { data, error } = await supabase.from('ads_payment').select('*').order('id', { ascending: false }).limit(limit);
      if (error) throw error;
      const out = (data || []).map(p => ({ id: p.id, ...decryptDeep(p) }));
      return res.json({ ok: true, ads: out });
    } catch (err) {
      console.error('/admin/ads error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

    // Backwards-compatible alias: GET /admin/ads_payment
    app.get('/admin/ads_payment', async (req, res) => {
      try {
        const limit = Math.min(Number(req.query.limit || 200), 1000);
         const { data, error } = await supabase.from('ads_payment').select('*').order('id', { ascending: false }).limit(limit);
        if (error) throw error;
        const out = (data || []).map(p => ({ id: p.id, ...decryptDeep(p) }));
        return res.json({ ok: true, ads_payment: out });
      } catch (err) {
        console.error('/admin/ads_payment error', err);
        return res.status(500).json({ error: 'Server error' });
      }
    });

  // GET /admin/users - list users (decrypted)
  app.get('/admin/users', async (req, res) => {
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

  // GET /admin/phones - list phones (decrypted)
  app.get('/admin/phones', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);
      const { data, error } = await supabase.from('phones').select('*').order('id', { ascending: false }).limit(limit);
      if (error) throw error;
      const out = (data || []).map(p => ({ id: p.id, ...decryptDeep(p) }));
      return res.json({ ok: true, phones: out });
    } catch (err) {
      console.error('/admin/phones error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /admin/accessories - list accessories (decrypted)
  app.get('/admin/accessories', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);
      const { data, error } = await supabase.from('accessories').select('*').order('id', { ascending: false }).limit(limit);
      if (error) throw error;
      const out = (data || []).map(a => ({ id: a.id, ...decryptDeep(a) }));
      return res.json({ ok: true, accessories: out });
    } catch (err) {
      console.error('/admin/accessories error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /admin/ads_price - list ads price rows, optional ?type=...
  app.get('/admin/ads_price', async (req, res) => {
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

  // GET /admin/game_win - list game wins
  app.get('/admin/game_win', async (req, res) => {
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
  app.get('/admin/user_rewards', async (req, res) => {
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
  app.get('/admin/ownerships', async (req, res) => {
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
  app.get('/admin/registered_phones', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 1000);
      const { data, error } = await supabase.from('registered_phones').select('*').order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      const out = (data || []).map(r => ({ id: r.id, ...decryptDeep(r) }));
      return res.json({ ok: true, registered_phones: out });
    } catch (err) {
      console.error('/admin/registered_phones error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /admin/stats - counts
  app.get('/admin/stats', async (req, res) => {
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
  app.post('/admin/reject-phone', async (req, res) => {
    try {
     // const user = req.user;
     // if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

     // const userRole = (user.role || '').toString().toLowerCase();
     // if (!userRole.includes('admin')) return res.status(403).json({ success: false, error: 'Forbidden: admin only' });

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

      // Insert a notification for the phone owner using server service-role client
      const notif = {
        user_id: targetUserId,
        title: 'تم رفض تسجيل الهاتف',
        message: `سبب الرفض: ${rejectReason}`,
        type: 'phone_rejected',
        is_read: false,
        created_at: new Date().toISOString()
      };

      const { error: insertErr } = await supabase.from('notifications').insert(notif);
      if (insertErr) console.warn('/admin/reject-phone: notification insert failed', insertErr);

      try {
        if (typeof logAudit === 'function') {
          await logAudit({
            userId: user.id || null,
            action: 'admin_reject_phone',
            resourceType: 'registered_phone',
            resourceId: phoneId,
            details: { rejectReason },
            ip: req.ip,
            userAgent: req.headers['user-agent']
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

  app.post('/admin/notifications', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      if (!authHeader) return res.status(401).json({ error: 'Unauthorized: missing token' });
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

      // validate auth token with Supabase
      const { data: authData, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !authData || !authData.user) return res.status(401).json({ error: 'Unauthorized: invalid token' });

      const user = authData.user;

      // fetch app role
      const { data: appUser, error: roleErr } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
      if (roleErr) console.warn('/admin/notifications role fetch error', roleErr);
      const role = appUser && appUser.role ? String(appUser.role).toLowerCase() : 'free_user';
      if (!role.includes('admin')) return res.status(403).json({ error: 'Forbidden: admin only' });

      const { user_id = null, title, message, metadata = null } = req.body || {};
      if (!title || !message) return res.status(400).json({ error: 'title and message required' });

      const notif = { user_id: user_id, title: title, message: message, is_read: false, metadata };
      const { data: inserted, error: insertErr } = await supabase.from('notifications').insert(notif).select().maybeSingle();
      if (insertErr) throw insertErr;

      try {
        if (typeof logAudit === 'function') {
          await logAudit({
            userId: user.id || null,
            action: 'admin_post_notification',
            resourceType: 'notification',
            resourceId: inserted && inserted.id ? inserted.id : null,
            details: { user_id, title },
            ip: req.ip,
            userAgent: req.headers['user-agent']
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
}

export default registerAdminRoutes;
