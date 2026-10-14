// نقطة نهاية دفع العروض
import express from 'express';
import { createClient } from '@supabase/supabase-js';
const router = express.Router();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

router.post('/paymob/create-offer-payment', async (req, res) => {
  try {
    const { amount, email, name, phone, merchantOrderId, offerData, redirect_url_success, redirect_url_failed, offerId } = req.body;
    if (!amount) {
      return res.status(400).json({ error: 'المبلغ مطلوب' });
    }
    // TODO: أكمل خطوات الدفع كما في create-payment لكن مع جدول ads_offar
    // مثال: حفظ بيانات العرض وربطها بالطلب
    let newOfferId = null;
    if (offerId) {
      const { error: updateError } = await supabase
        .from('ads_offar')
        .update({ ...offerData })
        .eq('id', offerId);
      if (updateError) throw updateError;
    } else if (offerData) {
      const { data: insertedOffer, error: offerError } = await supabase
        .from('ads_offar')
        .insert([offerData])
        .select('id')
        .single();
      if (offerError) throw offerError;
      newOfferId = insertedOffer.id;
    }
    // TODO: أكمل خطوات الدفع مع Paymob كما في create-payment
    // ثم أرجع رابط الدفع للواجهة الأمامية
    res.json({ ok: true, offerId: newOfferId || offerId || null });
  } catch (e) {
    res.status(500).json({ error: typeof e === 'object' ? JSON.stringify(e) : String(e) });
  }
});

export default router;
