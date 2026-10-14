
-- =================================================================
-- مشغل (Trigger) لزيادة عداد الإعلانات في users_plans
-- عند تغيير is_active إلى true في ads_payment ونسخ السجل إلى publish_ad
-- =================================================================

-- 1. إنشاء دالة تقوم بزيادة العداد المناسب بناءً على نوع الباقة
CREATE OR REPLACE FUNCTION increment_ad_counter_on_activate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_type TEXT;
  v_column_name TEXT;
BEGIN
  -- يتم التفعيل فقط عند تغيير is_active من false/null إلى true
  IF (TG_OP = 'UPDATE' AND OLD.is_active IS NOT TRUE AND NEW.is_active IS TRUE) OR
     (TG_OP = 'INSERT' AND NEW.is_active IS TRUE) THEN

    v_user_id := NEW.user_id;
    v_type := LOWER(COALESCE(NEW.type, ''));

    -- تحديد العمود المناسب بناءً على نوع الباقة
    IF v_type LIKE '%gold%' THEN
      v_column_name := 'gold_ad';
    ELSIF v_type LIKE '%silver%' THEN
      v_column_name := 'silver_ad';
    ELSE
      -- إذا كان النوع لا يحتوي على gold أو silver، لا نفعل شيء
      RETURN NEW;
    END IF;

    -- زيادة العداد في users_plans
    -- أولاً: التأكد من وجود سجل للمستخدم في users_plans
    INSERT INTO users_plans (id, user_id, role, silver_ad, gold_ad)
    VALUES (
      v_user_id,
      v_user_id,
      COALESCE(NEW.type, 'free_user'),
      CASE WHEN v_column_name = 'silver_ad' THEN 1 ELSE 0 END,
      CASE WHEN v_column_name = 'gold_ad' THEN 1 ELSE 0 END
    )
    ON CONFLICT (id) DO UPDATE SET
      silver_ad = CASE 
        WHEN v_column_name = 'silver_ad' 
        THEN users_plans.silver_ad + 1 
        ELSE users_plans.silver_ad 
      END,
      gold_ad = CASE 
        WHEN v_column_name = 'gold_ad' 
        THEN users_plans.gold_ad + 1 
        ELSE users_plans.gold_ad 
      END;

    RAISE NOTICE 'Incremented % for user %', v_column_name, v_user_id;

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

-- =================================================================
-- ملاحظة: إذا كان المشغل trigger_copy_ad يعمل AFTER INSERT/UPDATE
-- على ads_payment، فقد تحتاج لترتيب ترتيب المشغلات.
-- يمكنك التأكد من الترتيب باستخدام:
-- SELECT tgname, tgrelid::regclass FROM pg_trigger 
-- WHERE tgrelid = 'ads_payment'::regclass ORDER BY tgname;
-- =================================================================
