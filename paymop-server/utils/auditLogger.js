// Audit Logging Helper
export async function logAudit(supabaseOrConfig, configOrUndefined) {
  try {
    // Support two calling styles:
    // 1. logAudit(supabase, { userId, action, ... }) - explicit supabase
    // 2. logAudit({ userId, action, ... }) - implicit supabase from import
    
    let supabase;
    let config;
    
    // If second argument is provided, first arg is supabase
    if (configOrUndefined !== undefined) {
      supabase = supabaseOrConfig;
      config = configOrUndefined;
    } else {
      // Only one argument: import supabase from server context
      // For now, if supabase not provided, we'll skip audit logging to prevent crashes
      if (!supabaseOrConfig || typeof supabaseOrConfig !== 'object' || !supabaseOrConfig.from) {
        // Not a supabase instance, assume it's config object
        config = supabaseOrConfig;
        // Skip audit logging if supabase not available
        console.warn('[logAudit] Supabase not provided, skipping audit log');
        return;
      }
      supabase = supabaseOrConfig;
      config = {};
    }

    const {
      userId,
      action,
      resourceType,
      resourceId,
      oldValues = null,
      newValues = null,
      ipAddress = null,
      userAgent = null,
      status = 'success',
      details = null
    } = config;
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

    const { error } = await supabase
      .from('audit_logs')
      .insert([{
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        old_values: sanitizeValues(oldValues),
        new_values: sanitizeValues(newValues),
        ip_address: ipAddress,
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
