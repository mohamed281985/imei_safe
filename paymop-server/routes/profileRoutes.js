export function registerProfileRoutes({
  app,
  supabase,
  sendError,
  decryptField,
  isDevelopment,
  devBypassToken,
  logAudit,
}) {
  app.get('/api/decrypted-user', async (req, res) => {
    try {
      let userId = null;

      const authHeader = req.headers['authorization'];
      if (authHeader && String(authHeader).startsWith('Bearer ')) {
        const token = String(authHeader).slice(7);
        const { data: authData, error: authErr } = await supabase.auth.getUser(token);
        if (authErr) {
          console.error('/api/decrypted-user auth error:', authErr?.message || authErr);
          return res.status(401).json({ error: 'Failed to verify token', details: authErr?.message });
        }
        if (!authData || !authData.user) {
          console.error('/api/decrypted-user auth data missing');
          return res.status(401).json({ error: 'Unauthorized - no user data' });
        }
        userId = authData.user.id;
      } else if (isDevelopment && devBypassToken && req.headers['x-api-key'] === devBypassToken) {
        userId = req.query.user_id;
        if (!userId) return res.status(400).json({ error: 'missing user_id (dev bypass)' });
      } else {
        return res.status(401).json({ error: 'Unauthorized - missing auth' });
      }

      const { data: userRow, error: userErr } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
      if (userErr) {
        console.error('/api/decrypted-user users fetch error:', userErr?.message || userErr);
        return res.status(500).json({ error: 'Failed to fetch user data', details: userErr?.message });
      }

      const { data: businessRow, error: businessErr } = await supabase.from('businesses').select('*').eq('user_id', userId).maybeSingle();
      if (businessErr) {
        console.error('/api/decrypted-user businesses fetch error:', businessErr?.message || businessErr);
        return res.status(500).json({ error: 'Failed to fetch business data', details: businessErr?.message });
      }

      const out = { user: null, business: null };

      if (userRow) {
        try {
          out.user = {
            id: userRow.id,
            email: userRow.email || null,
            full_name: decryptField(userRow.full_name),
            phone: decryptField(userRow.phone),
            id_last6: decryptField(userRow.id_last6),
            role: userRow.role || null,
            // ✅ إضافة country_code
            country_code: userRow.country_code || null 
          };
        } catch (error) {
          console.error('/api/decrypted-user user decrypt error:', error?.message || error);
          return res.status(500).json({ error: 'Failed to decrypt user data', details: error?.message });
        }
      }

      if (businessRow) {
        try {
          out.business = {
            id: businessRow.id,
            email: businessRow.email || null,
            store_name: businessRow.store_name || null,
            owner_name: decryptField(businessRow.owner_name),
            phone: decryptField(businessRow.phone),
            address: decryptField(businessRow.address),
            business_type: businessRow.business_type || null,
            id_last6: decryptField(businessRow.id_last6),
            // ✅ إضافة country_code
            country_code: businessRow.country_code || null
          };
        } catch (error) {
          console.error('/api/decrypted-user business decrypt error:', error?.message || error);
          return res.status(500).json({ error: 'Failed to decrypt business data', details: error?.message });
        }
      }

      return res.json(out);
    } catch (error) {
      console.error('/api/decrypted-user error:', error?.message || error);
      return sendError(res, 500, 'Server error', error);
    }
  });

      // Endpoint: تسجيل/تحديث FCM token عند تسجيل الدخول من الجهاز
      app.post('/api/register-fcm-token', async (req, res) => {
        try {
          const { fcm_token: fcmToken } = req.body || {};
          if (!fcmToken || typeof fcmToken !== 'string') return res.status(400).json({ error: 'Missing fcm_token' });

          // احصل على معرف المستخدم عبر Authorization header أو تجاوز التطوير
          let userId = null;
          const authHeader = req.headers['authorization'];
          if (authHeader && String(authHeader).startsWith('Bearer ')) {
            const token = String(authHeader).slice(7);
            const { data: authData, error: authErr } = await supabase.auth.getUser(token);
            if (authErr) {
              console.error('/api/register-fcm-token auth error:', authErr?.message || authErr);
              try {
                await logAudit({
                  userId: null,
                  action: 'unauthorized_access',
                  resourceType: 'user',
                  resourceId: null,
                  details: { reason: authErr?.message || 'Failed to verify token' },
                  ip: req.headers['x-forwarded-for']?.split(',')[0] || req.ip || null,
                  userAgent: req.headers['user-agent'] || null,
                  status: 'failed',
                  errorMessage: authErr?.message || 'Failed to verify token'
                });
              } catch (e) {
                console.warn('/api/register-fcm-token unauthorized audit failed:', e?.message || e);
              }
              return res.status(401).json({ error: 'Failed to verify token' });
            }
            if (!authData || !authData.user) return res.status(401).json({ error: 'Unauthorized - no user data' });
            userId = authData.user.id;
          } else if (isDevelopment && devBypassToken && req.headers['x-api-key'] === devBypassToken) {
            userId = req.body.user_id || req.query.user_id;
            if (!userId) return res.status(400).json({ error: 'missing user_id (dev bypass)' });
          } else {
            try {
              await logAudit({
                userId: null,
                action: 'unauthorized_access',
                resourceType: 'user',
                resourceId: null,
                details: { reason: 'Unauthorized - missing auth' },
                ip: req.headers['x-forwarded-for']?.split(',')[0] || req.ip || null,
                userAgent: req.headers['user-agent'] || null,
                status: 'failed',
                errorMessage: 'Unauthorized - missing auth'
              });
            } catch (e) {
              console.warn('/api/register-fcm-token missing-auth audit failed:', e?.message || e);
            }
            return res.status(401).json({ error: 'Unauthorized - missing auth' });
          }

          // تحديث حقل fcm_token في جدول users
          const { data, error } = await supabase.from('users').update({ fcm_token: fcmToken }).eq('id', userId).select().maybeSingle();
          if (error) {
            console.error('/api/register-fcm-token update error:', error);
            return sendError(res, 500, 'Failed to update fcm_token', error);
          }

          try {
            await logAudit({
              userId: userId || null,
              action: 'update_fcm_token',
              resourceType: 'user',
              resourceId: userId || null,
              oldValues: null,
              newValues: { fcm_token_updated: true },
              details: { source: 'register-fcm-token' },
              ip: req.headers['x-forwarded-for']?.split(',')[0] || req.ip || null,
              userAgent: req.headers['user-agent'] || null,
              status: 'success'
            });
          } catch (e) {
            console.warn('/api/register-fcm-token audit failed:', e?.message || e);
          }

          return res.json({ success: true, data });
        } catch (err) {
          console.error('/api/register-fcm-token error:', err);
          return sendError(res, 500, 'Server error', err);
        }
      });
}
