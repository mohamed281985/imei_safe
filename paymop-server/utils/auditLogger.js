// Audit Logging Helper
export async function logAudit(supabase, { 
  userId, 
  action, 
  resourceType, 
  resourceId, 
  oldValues = null, 
  newValues = null, 
  ipAddress = null,
  userAgent = null,
  status = 'success'
}) {
  try {
    // لا تسجل البيانات الحساسة جداً
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
