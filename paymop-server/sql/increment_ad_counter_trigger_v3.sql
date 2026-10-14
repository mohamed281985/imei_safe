
-- =================================================================
-- مشغل (Trigger) لزيادة عداد الإعلانات في users_plans
-- عند تغيير is_active إلى true في ads_payment
-- الإصدار 3: تحويل الأعمدة النصية إلى أرقام قبل الزيادة
-- =================================================================

-- 1. إنشاء دالة تقوم بزيادة العداد المناسب بناءً على نوع الباقة
CREATE OR REPLACE FUNCTION increment_ad_counter_on_activate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_type TEXT;
BEGIN
  -- يتم التفعيل فقط عند تغيير is_active من false/null إلى true
  IF (TG_OP = 'UPDATE' AND OLD.is_active IS NOT TRUE AND NEW.is_active IS TRUE) OR
     (TG_OP = 'INSERT' AND NEW.is_active IS TRUE) THEN

    v_user_id := NEW.user_id;
    v_type := LOWER(COALESCE(NEW.type, ''));

    -- زيادة العداد المناسب في users_plans فقط إذا كان المستخدم موجوداً
    -- تحويل العمود من text إلى integer قبل الزيادة لتجنب خطأ text + integer
    IF v_type LIKE '%gold%' THEN
      UPDATE users_plans 
      SET gold_ad = CAST(COALESCE(gold_ad, '0') AS INTEGER) + 1 
      WHERE id = v_user_id;
    ELSIF v_type LIKE '%silver%' THEN
      UPDATE users_plans 
      SET silver_ad = CAST(COALESCE(silver_ad, '0') AS INTEGER) + 1 
      WHERE id = v_user_id;
    END IF;

    RAISE NOTICE 'Incremented ad counter for user % type %', v_user_id, v_type;

  END IF;

  RETURN NEW;
END;
$$;

-- 2. حذف المشغل القديم إن وُجد وإنشاء المشغل الجديد
DROP TRIGGER IF EXISTS trigger_increment_ad_counter ON ads_payment;

CREATE TRIGGER trigger_increment_ad_counter
  AFTER INSERT OR UPDATE OF is_active ON ads_payment
  FOR EACH ROW
  EXECUTE FUNCTION increment_ad_counter_on_activate();
