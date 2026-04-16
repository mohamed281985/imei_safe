-- إنشاء bucket للصور إذا لم يكن موجوداً
INSERT INTO storage.buckets (id, name, public)
VALUES ('phone-images', 'phone-images', true)
ON CONFLICT (id) DO NOTHING;

-- التأكد من أن الـ bucket عام
UPDATE storage.buckets
SET public = true
WHERE name = 'phone-images';

-- إزالة سياسة القراءة العامة القديمة إن وجدت ثم إعادة إنشائها
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT
USING (bucket_id = 'phone-images');

-- إزالة السياسات المفتوحة السابقة إن وجدت
DROP POLICY IF EXISTS "Allow Uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow Updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow Deletions" ON storage.objects;

-- سياسة أكثر أمانًا: يتطلب مستخدم مصادق
CREATE POLICY "Allow Auth Uploads" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'phone-images'
  AND auth.role() = 'authenticated'
);

-- تحديث/حذف الملف مسموح فقط لصاحب الملف المصادق
CREATE POLICY "Allow Owner Updates" ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'phone-images'
  AND owner = auth.uid()
)
WITH CHECK (
  bucket_id = 'phone-images'
  AND owner = auth.uid()
);

CREATE POLICY "Allow Owner Deletions" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'phone-images'
  AND owner = auth.uid()
);
