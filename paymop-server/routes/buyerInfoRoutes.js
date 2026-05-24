export function registerBuyerInfoRoutes({
  app,
  supabase,
  verifyJwtToken,
  sendError,
  decryptField
}) {
  app.get('/api/my-buyer-info', verifyJwtToken, async (req, res) => {
    try {
      const userId = req.user.id;

      // جلب بيانات المستخدم من جدول users
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (userErr) {
        console.error('/api/my-buyer-info users fetch error:', userErr?.message || userErr);
        return res.status(500).json({ error: 'Failed to fetch user data', details: userErr?.message });
      }

      // جلب بيانات المتجر التجاري إذا كان المستخدم من نوع business
      const { data: businessRow, error: businessErr } = await supabase
        .from('businesses')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (businessErr) {
        console.error('/api/my-buyer-info businesses fetch error:', businessErr?.message || businessErr);
        return res.status(500).json({ error: 'Failed to fetch business data', details: businessErr?.message });
      }

      // تحديد البيانات التي سيتم إرجاعها
      let buyerData = {
        user_id: userId,
        name: '',
        phone: '',
        email: '',
        idLast6: ''
      };

      // إذا كان المستخدم من نوع business، استخدم بيانات المتجر
      if (userRow && userRow.role === 'business' && businessRow) {
        try {
          buyerData.name = decryptField(businessRow.owner_name) || '';
          buyerData.phone = decryptField(businessRow.phone) || '';
          buyerData.email = businessRow.email || '';
          buyerData.idLast6 = decryptField(businessRow.id_last6) || '';
        } catch (error) {
          console.error('/api/my-buyer-info business decrypt error:', error?.message || error);
          return res.status(500).json({ error: 'Failed to decrypt business data', details: error?.message });
        }
      } else if (userRow) {
        // للمستخدم العادي، استخدم بيانات المستخدم مباشرة
        try {
          buyerData.name = decryptField(userRow.full_name) || '';
          buyerData.phone = decryptField(userRow.phone) || '';
          buyerData.email = userRow.email || '';
          buyerData.idLast6 = decryptField(userRow.id_last6) || '';
        } catch (error) {
          console.error('/api/my-buyer-info user decrypt error:', error?.message || error);
          return res.status(500).json({ error: 'Failed to decrypt user data', details: error?.message });
        }
      }

      // التحقق من أن الاسم لا يحتوي على إيميل
      if (buyerData.name && buyerData.name.includes('@')) {
        console.warn('/api/my-buyer-info: name contains email, clearing it');
        buyerData.name = '';
      }

      // إرجاع البيانات
      return res.json({
        data: buyerData,
        success: true
      });
    } catch (error) {
      console.error('/api/my-buyer-info error:', error?.message || error);
      return sendError(res, 500, 'Server error', error);
    }
  });
}
