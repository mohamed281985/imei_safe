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

      const out = rows.map(r => ({ id: r.id, ...decryptDeep(r) }));
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
  app.get('/admin/ads_payment', async (req, res) => {
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

  // PATCH /admin/users/:id - update user status/role (accept Arabic status values)
  app.patch('/admin/users/:id', verifyJwtToken, async (req, res) => {
    try {
      const acting = req.user || null;
      const roleCheck = (acting && acting.role) ? String(acting.role).toLowerCase() : '';
      console.log('REQ USER =', req.user);
      console.log('ACTING =', acting);
      if (!roleCheck.includes('admin')) return res.status(403).json({ error: 'forbidden: admin only' });

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
  
  // PATCH /admin/accessories/:id - update accessory (admin light endpoint)
  app.patch('/admin/accessories/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });

      const updates = {};
      if (req.body.status !== undefined) updates.status = req.body.status;
      if (req.body.updated_at !== undefined) updates.updated_at = req.body.updated_at;
      else updates.updated_at = new Date().toISOString();

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

      return res.json({ ok: true, accessory: data });
    } catch (err) {
      console.error('PATCH /admin/accessories/:id unexpected', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  });
  
  // GET /admin/phones - list phones (decrypted) with images
  app.get('/admin/phones', async (req, res) => {
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
  app.get('/admin/accessories', async (req, res) => {
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

 // POST /admin/update-ads-price - update ads prices (admin only)
app.post('/admin/update-ads-price', verifyJwtToken, async (req, res) => {
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
        body: `سبب الرفض: ${rejectReason}`,
        type: 'phone_rejected',
        is_read: false,
        created_at: new Date().toISOString()
      };

      const { error: insertErr } = await supabase.from('notifications').insert(notif);
      if (insertErr) console.warn('/admin/reject-phone: notification insert failed', insertErr);

      try {
        if (typeof logAudit === 'function') {
          await logAudit({
            userId: null,
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

  // POST /admin/approve-phone - approve a registered phone and notify its owner
  app.post('/admin/approve-phone', async (req, res) => {
    try {
      //const user = req.user;
      //  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

      // const userRole = (user.role || '').toString().toLowerCase();
      // if (!userRole.includes('admin')) return res.status(403).json({ success: false, error: 'Forbidden: admin only' });

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

      // Insert a notification for the phone owner using server service-role client
      const notif = {
        user_id: targetUserId,
        title: 'تمت الموافقة على تسجيل الهاتف',
        body: 'تمت مراجعة طلب تسجيل الهاتف والموافقة عليه',
        type: 'phone_approved',
        is_read: false,
        created_at: new Date().toISOString()
      };

      const { error: insertErr } = await supabase.from('notifications').insert(notif);
      if (insertErr) console.warn('/admin/approve-phone: notification insert failed', insertErr);

      try {
        if (typeof logAudit === 'function') {
          await logAudit({
            userId: null,
            action: 'admin_approve_phone',
            resourceType: 'registered_phone',
            resourceId: phoneId,
            details: {},
            ip: req.ip,
            userAgent: req.headers['user-agent']
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

  // GET /admin/publish_ad - list published ads
  app.get('/admin/publish_ad', async (req, res) => {
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

  // GET /admin/plans - list available plans, sorted by price (asc)
  app.get('/admin/plans', async (req, res) => {
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
  app.get('/admin/ads_offar', async (req, res) => {
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
  app.get('/admin/transfers', async (req, res) => {
    try {
      // تحقق مبدئي من وجود توكن (يمكن استبداله بميدل وير JWT الحقيقي)
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'غير مصرح: مفقود رمز المصادقة' });
      }

      const { data, error } = await supabase
        .from('transfer_records')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const out = (data || []).map(r => ({ id: r.id, ...decryptDeep(r) }));
      return res.status(200).json(out);
    } catch (err) {
      console.error('Error fetching transfers:', err);
      return res.status(500).json({ error: 'خطأ في السيرفر', message: err && err.message ? err.message : String(err) });
    }
  });

  // GET /admin/businesses/:userId - get business details by user ID
  app.get('/admin/businesses/:userId', async (req, res) => {
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

      // إرجاع البيانات
      return res.status(200).json(decryptedData);
    } catch (error) {
      console.error('Error in business details API:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}

export default registerAdminRoutes;
