// Audit Logging Helper
export async function logAudit(supabaseOrConfig, configOrUndefined) {
  try {
    // Support two calling styles:
    // 1. logAudit(supabase, { userId, action, ... }) - explicit supabase
    // 2. logAudit({ supabase, userId, action, ... }) - supabase carried in config
    // 3. logAudit({ userId, action, ... }) - legacy implicit style
    
    let supabase;
    let config;
    
    // If second argument is provided, first arg is supabase
    if (configOrUndefined !== undefined) {
      supabase = supabaseOrConfig;
      config = configOrUndefined;
    } else {
      // Only one argument: assume config object and accept an embedded supabase client.
      config = supabaseOrConfig;
      supabase = config && typeof config === 'object' ? (config.supabase || null) : null;

      if (!supabase || !supabase.from) {
        console.warn('[logAudit] Supabase not provided, skipping audit log');
        return;
      }
    }

    const {
      userId,
      action,
      resourceType,
      resourceId,
      oldValues = null,
      newValues = null,
      ipAddress = null,
      ip = null,
      userAgent = null,
      status = 'success',
      details = null
    } = config;
    const resolvedIpAddress = ipAddress || ip || null;
    if (!action) return;

    // Ignore non-security ad/payment audits by policy
    const flatText = `${String(action || '')} ${String(resourceType || '')} ${JSON.stringify(details || {})}`.toLowerCase();
    if (/(\bpaymob\b|\bpayment\b|\bads\b|\bad\b|\bads_payment\b|\bads_offar\b|\bpublish_ad\b|\boffer\b)/.test(flatText)) {
      return;
    }
    if (action === 'update_subscription') {
      return;
    }

    // Ignore noisy successful seller-password checks; keep failures only
    if (action === 'verify_seller_password' && status === 'success') {
      return;
    }

    // Sanitize sensitive values
    const sanitizeValues = (obj) => {
      if (!obj) return null;
      const copy = JSON.parse(JSON.stringify(obj));
      const sensitiveFields = ['password', 'token', 'secret', 'key', 'private_key'];
      
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        for (const k of Object.keys(o)) {
          if (sensitiveFields.some(f => k.toLowerCase().includes(f))) {
            o[k] = '***REDACTED***';
          } else if (typeof o[k] === 'object') {
            walk(o[k]);
          }
        }
      };
      walk(copy);
      return copy;
    };

    const sanitizeForCompare = (obj) => {
      if (obj === null || typeof obj === 'undefined') return null;
      const sanitized = sanitizeValues(obj);
      if (sanitized === null || typeof sanitized === 'undefined') return null;
      try {
        const sortKeys = (value) => {
          if (Array.isArray(value)) return value.map(sortKeys);
          if (value && typeof value === 'object') {
            return Object.keys(value).sort().reduce((acc, key) => {
              acc[key] = sortKeys(value[key]);
              return acc;
            }, {});
          }
          return value;
        };
        return sortKeys(sanitized);
      } catch {
        return sanitized;
      }
    };

    const areDeepEqual = (a, b) => {
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch {
        return false;
      }
    };

    // Skip if no supabase (for endpoints that don't use audit logging)
    if (!supabase || !supabase.from) {
      return;
    }

    // Ignore no-op update logs (old/new are effectively identical)
    const normalizedOld = sanitizeForCompare(oldValues);
    const normalizedNew = sanitizeForCompare(newValues);
    if (normalizedOld !== null && normalizedNew !== null && areDeepEqual(normalizedOld, normalizedNew)) {
      return;
    }

    // Deduplicate equivalent logs within the last 30 seconds
    try {
      const dedupeSince = new Date(Date.now() - 30 * 1000).toISOString();
      let q = supabase
        .from('audit_logs')
        .select('id, user_id, resource_type, resource_id, status, new_values, created_at')
        .eq('action', action)
        .gte('created_at', dedupeSince)
        .order('created_at', { ascending: false })
        .limit(50);

      if (resourceType) q = q.eq('resource_type', resourceType);
      if (status) q = q.eq('status', status);

      const { data: recentRows, error: dedupeErr } = await q;
      if (!dedupeErr && Array.isArray(recentRows) && recentRows.length > 0) {
        const targetUserId = userId ?? null;
        const targetResourceId = resourceId ?? null;
        const targetNewValues = sanitizeForCompare(newValues);

        const duplicate = recentRows.some((row) => {
          const sameUser = (row?.user_id ?? null) === targetUserId;
          const sameResourceId = (row?.resource_id ?? null) === targetResourceId;
          const sameNewValues = areDeepEqual(sanitizeForCompare(row?.new_values ?? null), targetNewValues);
          return sameUser && sameResourceId && sameNewValues;
        });

        if (duplicate) {
          return;
        }
      }
    } catch {
      // Do not block main flow if dedupe check fails
    }

    const { error } = await supabase
      .from('audit_logs')
      .insert([{
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        old_values: normalizedOld,
        new_values: normalizedNew,
        ip_address: resolvedIpAddress,
        user_agent: userAgent,
        status: status,
        created_at: new Date().toISOString()
      }]);
    
    if (error) {
      console.error('Audit log error:', error);
    }
  } catch (err) {
    console.error('Failed to log audit:', err);
    // لا نعيد الخطأ - العملية الرئيسية يجب أن تستمر
  }
}

export default logAudit;
