-- نظام إدارة حملات الإشعارات - قاعدة البيانات
-- Supabase SQL Schema

-- ==================== جدول notification_campaigns ====================
-- تم الاعتماد على الجدول الموجود والإضافة فقط للأعمدة الجديدة

CREATE TABLE IF NOT EXISTS notification_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- محتوى الحملة
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  
  -- استهداف
  audience TEXT,                    -- 'all', 'segment', 'niche', etc.
  metadata JSONB,                   -- بيانات إضافية (campaign_type, etc.)
  scheduled_at TIMESTAMP,           -- للجدولة المستقبلية
  campaign_type TEXT,               -- نوع الحملة (seasonal, promotion, etc.)
  
  -- التتبع العام
  created_by UUID NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- مرحلة الإرسال للموافقة
  submitted_by UUID,
  submitted_at TIMESTAMP,
  
  -- مرحلة الموافقة
  approved_by UUID,
  approved_at TIMESTAMP,
  
  -- مرحلة الإرسال
  started_at TIMESTAMP,
  
  -- مرحلة الإلغاء
  cancelled_by UUID,
  cancelled_at TIMESTAMP,
  cancel_reason TEXT,
  
  -- النتيجة النهائية
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  failure_reason TEXT,
  
  -- الإحصائيات (اختياري)
  total_sent INT DEFAULT 0,
  total_delivered INT DEFAULT 0,
  total_failed INT DEFAULT 0,
  total_read INT DEFAULT 0,
  
  -- القيود الخارجية
  CONSTRAINT fk_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT fk_submitted_by FOREIGN KEY (submitted_by) REFERENCES auth.users(id),
  CONSTRAINT fk_approved_by FOREIGN KEY (approved_by) REFERENCES auth.users(id),
  CONSTRAINT fk_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES auth.users(id),
  
  -- التحقق من الحالات
  CONSTRAINT valid_status CHECK (
    status IN ('draft', 'pending_approval', 'approved', 'sending', 'completed', 'failed', 'cancelled')
  )
);

-- الفهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_notification_campaigns_status 
  ON notification_campaigns(status);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_created_by 
  ON notification_campaigns(created_by);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_approved_by 
  ON notification_campaigns(approved_by);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_created_at 
  ON notification_campaigns(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_campaign_type 
  ON notification_campaigns(campaign_type);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_audience 
  ON notification_campaigns(audience);

-- تعليق الجدول
COMMENT ON TABLE notification_campaigns IS 'جدول حملات الإشعارات مع دعم نموذج موافقة متعدد المستويات';

-- التعليقات على الأعمدة
COMMENT ON COLUMN notification_campaigns.id IS 'معرف الحملة الفريد';
COMMENT ON COLUMN notification_campaigns.title IS 'عنوان الحملة';
COMMENT ON COLUMN notification_campaigns.message IS 'محتوى الرسالة';
COMMENT ON COLUMN notification_campaigns.status IS 'حالة الحملة (draft, pending_approval, approved, sending, completed, failed, cancelled)';
COMMENT ON COLUMN notification_campaigns.audience IS 'الجمهور المستهدف';
COMMENT ON COLUMN notification_campaigns.metadata IS 'بيانات JSON إضافية';
COMMENT ON COLUMN notification_campaigns.scheduled_at IS 'وقت الجدولة (إذا كانت الحملة مجدولة)';
COMMENT ON COLUMN notification_campaigns.created_by IS 'معرف منشئ الحملة';
COMMENT ON COLUMN notification_campaigns.submitted_by IS 'معرف من أرسل الحملة للموافقة';
COMMENT ON COLUMN notification_campaigns.submitted_at IS 'وقت إرسال الحملة للموافقة';
COMMENT ON COLUMN notification_campaigns.approved_by IS 'معرف من وافق على الحملة';
COMMENT ON COLUMN notification_campaigns.approved_at IS 'وقت الموافقة';
COMMENT ON COLUMN notification_campaigns.started_at IS 'وقت بدء الإرسال';
COMMENT ON COLUMN notification_campaigns.completed_at IS 'وقت انتهاء الإرسال';
COMMENT ON COLUMN notification_campaigns.cancelled_by IS 'معرف من ألغى الحملة';
COMMENT ON COLUMN notification_campaigns.cancelled_at IS 'وقت الإلغاء';
COMMENT ON COLUMN notification_campaigns.cancel_reason IS 'سبب الإلغاء';

-- ==================== جدول admin_permissions ====================
-- تحديث الجدول الموجود أو الإنشاء إذا لم يكن موجوداً

CREATE TABLE IF NOT EXISTS admin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  
  -- الصلاحيات
  can_send_notifications BOOLEAN DEFAULT FALSE,
  can_approve_notifications BOOLEAN DEFAULT FALSE,
  
  -- صلاحيات أخرى (اختياري)
  can_manage_users BOOLEAN DEFAULT FALSE,
  can_manage_reports BOOLEAN DEFAULT FALSE,
  can_manage_ads BOOLEAN DEFAULT FALSE,
  can_view_analytics BOOLEAN DEFAULT FALSE,
  
  -- التتبع
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by UUID,
  
  -- القيود الخارجية
  CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_updated_by FOREIGN KEY (updated_by) REFERENCES auth.users(id)
);

-- الفهارس
CREATE INDEX IF NOT EXISTS idx_admin_permissions_user_id 
  ON admin_permissions(user_id);

-- تعليق الجدول
COMMENT ON TABLE admin_permissions IS 'صلاحيات الأدمن للعمليات المختلفة';
COMMENT ON COLUMN admin_permissions.can_send_notifications IS 'يمكنه إنشاء واختبار الحملات';
COMMENT ON COLUMN admin_permissions.can_approve_notifications IS 'يمكنه الموافقة وإرسال الحملات';

-- ==================== جدول notification_campaign_logs ====================
-- جدول اختياري لتتبع تفصيلي

CREATE TABLE IF NOT EXISTS notification_campaign_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  
  action TEXT NOT NULL,  -- 'created', 'submitted', 'approved', 'sent', 'failed', etc.
  performed_by UUID NOT NULL,
  
  old_status TEXT,
  new_status TEXT,
  
  details JSONB,  -- معلومات إضافية
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_campaign_id FOREIGN KEY (campaign_id) REFERENCES notification_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_performed_by FOREIGN KEY (performed_by) REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_notification_campaign_logs_campaign_id 
  ON notification_campaign_logs(campaign_id);

CREATE INDEX IF NOT EXISTS idx_notification_campaign_logs_performed_by 
  ON notification_campaign_logs(performed_by);

CREATE INDEX IF NOT EXISTS idx_notification_campaign_logs_created_at 
  ON notification_campaign_logs(created_at DESC);

-- ==================== Trigger لتحديث updated_at ====================

CREATE OR REPLACE FUNCTION update_notification_campaigns_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notification_campaigns_update_timestamp ON notification_campaigns;

CREATE TRIGGER notification_campaigns_update_timestamp
  BEFORE UPDATE ON notification_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_campaigns_timestamp();

-- ==================== View للحملات النشطة ====================

CREATE OR REPLACE VIEW active_notification_campaigns AS
SELECT 
  id,
  title,
  message,
  status,
  audience,
  created_by,
  created_at,
  submitted_at,
  approved_at,
  started_at,
  completed_at
FROM notification_campaigns
WHERE status NOT IN ('cancelled', 'completed', 'failed')
ORDER BY created_at DESC;

-- ==================== View للحملات المكتملة ====================

CREATE OR REPLACE VIEW completed_notification_campaigns AS
SELECT 
  id,
  title,
  message,
  status,
  created_by,
  approved_by,
  created_at,
  completed_at,
  total_sent,
  total_delivered,
  total_read,
  CASE 
    WHEN total_sent > 0 THEN ROUND((total_delivered::NUMERIC / total_sent) * 100, 2)
    ELSE 0
  END AS delivery_rate
FROM notification_campaigns
WHERE status IN ('completed', 'failed')
ORDER BY completed_at DESC;

-- ==================== بيانات العينة (Development فقط) ====================

-- أولاً، تحقق إذا كانت البيانات موجودة بالفعل
DO $$
DECLARE
  test_user_id UUID;
BEGIN
  -- إنشاء مستخدم اختبار أو الحصول على معرفه
  -- ملاحظة: استبدل هذا بـ معرف حقيقي من جدول auth.users
  
  -- إدراج صلاحيات العينة (إذا لم تكن موجودة)
  INSERT INTO admin_permissions (user_id, can_send_notifications, can_approve_notifications, created_at, updated_at)
  SELECT 
    (SELECT id FROM auth.users LIMIT 1),
    true,
    true,
    NOW(),
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM admin_permissions WHERE can_send_notifications = true LIMIT 1
  );
  
  -- إدراج حملة عينة
  INSERT INTO notification_campaigns (
    title,
    message,
    status,
    audience,
    metadata,
    created_by,
    created_at,
    updated_at
  )
  SELECT
    'حملة العينة - للاختبار فقط',
    'هذه حملة عينة لاختبار النظام',
    'draft',
    'all',
    '{\"is_sample\": true}'::jsonb,
    (SELECT id FROM auth.users LIMIT 1),
    NOW(),
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM notification_campaigns WHERE title LIKE 'حملة العينة%'
  );
  
  RAISE NOTICE 'تم إدراج البيانات الافتراضية بنجاح';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'بيانات افتراضية موجودة بالفعل أو حدث خطأ: %', SQLERRM;
END $$;

-- ==================== إحصائيات ====================

-- عدد الحملات النشطة
SELECT COUNT(*) as active_campaigns FROM active_notification_campaigns;

-- عدد الحملات المكتملة
SELECT COUNT(*) as completed_campaigns FROM completed_notification_campaigns;

-- عدد الحملات حسب الحالة
SELECT 
  status,
  COUNT(*) as count
FROM notification_campaigns
GROUP BY status
ORDER BY count DESC;

-- معدل الموافقة
SELECT 
  COUNT(CASE WHEN approved_at IS NOT NULL THEN 1 END) as approved_count,
  COUNT(*) as total_count,
  ROUND(100.0 * COUNT(CASE WHEN approved_at IS NOT NULL THEN 1 END) / COUNT(*), 2) as approval_rate
FROM notification_campaigns
WHERE status != 'draft';

-- ==================== اختبار القيود ====================

-- سيفشل: حالة غير صحيحة
-- INSERT INTO notification_campaigns (title, message, status, created_by)
-- VALUES ('Test', 'Test', 'invalid_status', (SELECT id FROM auth.users LIMIT 1));

-- سينجح: حالة صحيحة
-- INSERT INTO notification_campaigns (title, message, status, created_by)
-- VALUES ('Test', 'Test', 'draft', (SELECT id FROM auth.users LIMIT 1));

-- ==================== ملاحظات ====================
/*
1. تأكد من وجود جدول auth.users من Firebase/Supabase
2. استبدل (SELECT id FROM auth.users LIMIT 1) بـ معرف حقيقي
3. استخدم RLS policies لحماية البيانات
4. أضف subscriptions لتتبع التغييرات في الوقت الفعلي (إذا لزم)
5. استخدم triggers لتحديث الإحصائيات تلقائياً
6. قم بعمل backup منتظم للبيانات المهمة
*/

-- ==================== RLS Policies ====================
-- (اختياري - تطبيق حسب احتياجات الأمان)

-- تفعيل RLS
ALTER TABLE notification_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_campaign_logs ENABLE ROW LEVEL SECURITY;

-- سياسة: يمكن للمسؤول فقط عرض جميع الحملات
CREATE POLICY \"admin_view_all_campaigns\" ON notification_campaigns
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_permissions
      WHERE user_id = auth.uid()
      AND (can_send_notifications OR can_approve_notifications)
    )
  );

-- سياسة: يمكن لمنشئ الحملة عرض حملته
CREATE POLICY \"creator_view_own_campaign\" ON notification_campaigns
  FOR SELECT
  USING (created_by = auth.uid());

-- سياسة: فقط المسؤول يمكنه تحديث الحملات
CREATE POLICY \"admin_update_campaigns\" ON notification_campaigns
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admin_permissions
      WHERE user_id = auth.uid()
      AND can_approve_notifications
    )
  );

-- سياسة: يمكن لمنشئ الحملة إنشاء حملات
CREATE POLICY \"creator_insert_campaign\" ON notification_campaigns
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- ==================== الخلاصة ====================
-- الجداول المنشأة:
-- 1. notification_campaigns (الرئيسي)
-- 2. admin_permissions (الصلاحيات)
-- 3. notification_campaign_logs (السجل التفصيلي)
--
-- الـ Views:
-- 1. active_notification_campaigns (الحملات النشطة)
-- 2. completed_notification_campaigns (الحملات المكتملة)
--
-- الـ Triggers:
-- 1. notification_campaigns_update_timestamp (تحديث الوقت)
--
-- RLS Policies:
-- 1. admin_view_all_campaigns
-- 2. creator_view_own_campaign
-- 3. admin_update_campaigns
-- 4. creator_insert_campaign
