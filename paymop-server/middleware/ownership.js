// Middleware للتحقق من ملكية المورد
export const verifyResourceOwnership = (resourceTable = 'ads_payment', userIdField = 'user_id') => 
  async (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const resourceId = req.params.id || req.query.id;
    if (!resourceId) return res.status(400).json({ error: 'Missing resource ID' });

    try {
      // جلب المورد والتحقق من الملكية
      const { data: resource, error } = await req.supabase
        .from(resourceTable)
        .select(userIdField)
        .eq('id', resourceId)
        .single();

      if (error || !resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      // التحقق من أن المستخدم يمتلك المورد
      if (resource[userIdField] && resource[userIdField] !== userId) {
        return res.status(403).json({ error: 'Forbidden: not your resource' });
      }

      req.resource = resource;
      next();
    } catch (err) {
      console.error('Ownership check error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  };

export default verifyResourceOwnership;
