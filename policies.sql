-- إنشاء bucket للصور إذا لم يكن موجوداً
INSERT INTO storage.buckets (id, name, public)
VALUES ('phone-images', 'phone-images', true)
ON CONFLICT (id) DO NOTHING;

-- التأكد من أن الـ bucket عام
UPDATE storage.buckets
SET public = true
WHERE name = 'phone-images';

-- سياسة للسماح بالوصول العام لقراءة الصور
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT
USING (bucket_id = 'phone-images');

-- سياسة للسماح برفع الصور
CREATE POLICY "Allow Uploads" ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'phone-images');

-- سياسة للسماح بتحديث الصور
CREATE POLICY "Allow Updates" ON storage.objects
FOR UPDATE
USING (bucket_id = 'phone-images');

-- سياسة للسماح بحذف الصور
CREATE POLICY "Allow Deletions" ON storage.objects
FOR DELETE
USING (bucket_id = 'phone-images');
