import { supabase } from '../lib/supabase';

/**
 * وظيفة مساعدة لتخزين رقم بطاقة البائع في جدول transfer_records
 * 
 * @param imei رقم IMEI للهاتف
 * @param sellerId رقم بطاقة البائع (آخر 6 أرقام)
 * @returns وعد بنتيجة العملية (نجاح/فشل)
 */
export const storeSellerIdForTransfer = async (imei: string, sellerId: string): Promise<boolean> => {
  if (!imei) return false;

  // التأكد من القيمة
  const idToStore = sellerId?.trim() || 'غير متوفر';
  // Attempting to store seller id (masked in client context). Debug log suppressed.

  try {
    // الحصول على آخر سجل نقل لهذا IMEI
    const { data: latestTransfer, error: fetchError } = await supabase
      .from('transfer_records')
      .select('id, created_at, imei, seller_id_last6')
      .eq('imei', imei)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !latestTransfer) {
      console.debug('❌ لم يتم العثور على سجل نقل: تفاصيل داخليه محفوظة للسجلات.');

      // محاولة إنشاء سجل جديد
      return await createNewTransferRecord(imei, idToStore);
    }

    // تحديث السجل الموجود
    console.debug('✅ تم العثور على سجل نقل (id):', latestTransfer?.id || 'unknown');

    // تحقق إذا كان الحقل فارغًا
    if (!latestTransfer.seller_id_last6) {
      const { data, error } = await supabase
        .from('transfer_records')
        .update({ seller_id_last6: idToStore })
        .eq('id', latestTransfer.id)
        .select();

      if (error) {
        console.debug('❌ فشل تحديث سجل النقل:', error?.message || error);
        return false;
      }

      console.debug('✅ تم تحديث سجل النقل بنجاح (id):', data?.id || 'unknown');
      return true;
    } else {
      console.debug('ℹ️ سجل النقل يحتوي بالفعل على seller_id_last6 (مقنع).');
      return true;
    }
  } catch (error) {
    console.debug('❌ خطأ غير متوقع أثناء تخزين رقم بطاقة البائع:', error?.message || error);
    return false;
  }
};

/**
 * إنشاء سجل نقل جديد في حالة عدم وجود سجل
 * 
 * @param imei رقم IMEI للهاتف
 * @param sellerId رقم بطاقة البائع
 * @returns وعد بنتيجة العملية (نجاح/فشل)
 */
const createNewTransferRecord = async (imei: string, sellerId: string): Promise<boolean> => {
  try {
    // طلب إلى السيرفر للحصول على معلومات الهاتف المقنعة (السيرفر يتولى فك التشفير)
    try {
      let jwt = '';
      try { const { data: { session } } = await supabase.auth.getSession(); jwt = session?.access_token || ''; } catch (e) { jwt = ''; }
      const resp = await fetch('/api/imei-masked-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(jwt ? { 'Authorization': `Bearer ${jwt}` } : {}) },
        body: JSON.stringify({ imei })
      });
      const info = await resp.json();

      const seller_name = info?.maskedOwnerName || '';
      const seller_phone = info?.maskedPhoneNumber || '';

      // إنشاء سجل نقل جديد باستخدام القيم المقنعة
      const { data, error } = await supabase
        .from('transfer_records')
        .insert([
          {
            imei: imei,
            seller_id_last6: sellerId,
            seller_name,
            seller_phone,
            transfer_date: new Date().toISOString()
          }
        ])
        .select();

      if (error) {
        console.debug('❌ فشل إنشاء سجل نقل جديد:', error?.message || error);
        // محاولة أخيرة - حفظ في جدول مخصص
        return await storeInBackupTable(imei, sellerId);
      }

      console.debug('✅ تم إنشاء سجل نقل جديد بنجاح (id):', data?.id || 'unknown');
      return true;
    } catch (e) {
      console.debug('❌ خطأ أثناء جلب معلومات الهاتف من السيرفر:', e?.message || e);
      return await storeInBackupTable(imei, sellerId);
    }
  } catch (error) {
    console.debug('❌ خطأ غير متوقع أثناء إنشاء سجل نقل جديد:', error?.message || error);

    // محاولة الحفظ في جدول احتياطي
    return await storeInBackupTable(imei, sellerId);
  }
};

/**
 * تخزين رقم بطاقة البائع في جدول احتياطي
 * (يُستخدم فقط في حالة فشل جميع المحاولات السابقة)
 * 
 * @param imei رقم IMEI للهاتف
 * @param sellerId رقم بطاقة البائع
 * @returns وعد بنتيجة العملية (نجاح/فشل)
 */
const storeInBackupTable = async (imei: string, sellerId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('seller_id_backup')
      .upsert([
        {
          imei: imei,
          seller_id_last6: sellerId,
          created_at: new Date().toISOString()
        }
      ], { onConflict: 'imei' })
      .select();

    if (error) {
      console.debug('❌ فشل تخزين رقم البطاقة في الجدول الاحتياطي:', error?.message || error);
      return false;
    }

    console.debug('✅ تم تخزين رقم البطاقة في الجدول الاحتياطي بنجاح (id):', data?.id || 'unknown');
    return true;
  } catch (error) {
    console.debug('❌ خطأ غير متوقع أثناء تخزين رقم البطاقة في الجدول الاحتياطي:', error?.message || error);
    return false;
  }
};

/**
 * وظيفة للبحث عن رقم بطاقة البائع باستخدام IMEI
 * 
 * @param imei رقم IMEI للهاتف
 * @returns وعد برقم بطاقة البائع أو نص فارغ
 */
export const getSellerIdByImei = async (imei: string): Promise<string> => {
  if (!imei) return '';

  try {
    // البحث في جدول سجلات النقل أولاً
    const { data: transferData, error: transferError } = await supabase
      .from('transfer_records')
      .select('seller_id_last6')
      .eq('imei', imei)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!transferError && transferData?.seller_id_last6) {
      return transferData.seller_id_last6;
    }

    // إذا لم يتم العثور على البيانات، ابحث في الجدول الاحتياطي
    const { data: backupData, error: backupError } = await supabase
      .from('seller_id_backup')
      .select('seller_id_last6')
      .eq('imei', imei)
      .single();

    if (!backupError && backupData?.seller_id_last6) {
      return backupData.seller_id_last6;
    }

    return '';
  } catch (error) {
    console.debug('❌ خطأ أثناء البحث عن رقم بطاقة البائع:', error?.message || error);
    return '';
  }
};
