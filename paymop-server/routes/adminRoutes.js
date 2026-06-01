export function registerAdminRoutes({ app, supabase, decryptField, verifyJwtToken, logAudit, csrfProtection }) {
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

  // POST /admin/reject-phone - mark phone rejected and notify owner
  app.post('/admin/reject-phone', async (req, res) => {
    try {
      // Require admin role
      if (!req.user || String(req.user.role).toLowerCase().indexOf('admin') === -1) {
        return res.status(403).json({ error: 'Forbidden: admin only' });
      }
      const { phoneId, reason } = req.body || {};
      if (!phoneId || !reason) return res.status(400).json({ error: 'phoneId and reason required' });

      // fetch phone to get owner user_id
      const { data: phone, error: phoneErr } = await supabase.from('phones').select('*').eq('id', phoneId).maybeSingle();
      if (phoneErr) throw phoneErr;
      if (!phone) return res.status(404).json({ error: 'phone not found' });

      const user_id = phone.user_id || phone.userId || phone.owner_id || phone.owner || null;

      // update phone status to 'rejected'
      const { data: updated, error: updateErr } = await supabase.from('phones').update({ status: 'rejected' }).eq('id', phoneId).select().maybeSingle();
      if (updateErr) throw updateErr;

      // insert notification for owner
      if (user_id) {
        const notif = {
          user_id: user_id,
          title: 'تم رفض طلب تسجيل الهاتف',
          message: reason,
          is_read: false
        };
        const { error: notifErr } = await supabase.from('notifications').insert(notif);
        if (notifErr) console.warn('/admin/reject-phone: notification insert failed', notifErr);
      } else {
        console.warn('/admin/reject-phone: phone has no user_id', phoneId);
      }

      // Audit log (best-effort)
      try {
        if (typeof logAudit === 'function') {
          await logAudit({
            userId: req.user?.id || null,
            action: 'reject_phone',
            resourceType: 'phone',
            resourceId: phoneId,
            details: { reason },
            ip: req.ip,
            userAgent: req.headers['user-agent']
          });
        }
      } catch (auditErr) {
        console.warn('/admin/reject-phone: audit log failed', auditErr);
      }

      return res.json({ success: true });
    } catch (err) {
      console.error('/admin/reject-phone error', err);
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
}

export default registerAdminRoutes;
