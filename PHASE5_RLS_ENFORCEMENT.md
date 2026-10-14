# Phase 5.3: Row Level Security (RLS) - تفعيل الحماية على مستوى الصف

**Status:** 🟡 IN PROGRESS  
**Priority:** 🔴 CRITICAL  
**Time Estimate:** 30-45 minutes  

---

## 📖 ما هو Row Level Security؟

**RLS** هو آلية أمان في قاعدة البيانات تسمح بـ:
- ✅ تحديد من يمكنه رؤية أي بيانات
- ✅ منع cross-user data access (IDOR)
- ✅ فرض قيود على المستوى الداخلي (Database level)
- ✅ توازن بين الأمان والأداء

---

## 🎯 الهدف

**Before (بدون RLS):**
```sql
-- أي مستخدم يمكنه الوصول إلى أي بيانات
SELECT * FROM payments;  -- يرى جميع الـ payments!
```

**After (مع RLS):**
```sql
-- كل مستخدم يرى بيانات نفسه فقط
SELECT * FROM payments;  -- يرى payments نفسه فقط
```

---

## 📋 الجداول المطلوب تفعيل RLS عليها

1. **users** - بيانات المستخدم
2. **payments** - تحويلات الدفع
3. **imei_searches** - عمليات البحث
4. **notifications** - الإشعارات
5. **audit_logs** - السجلات التدقيقية
6. **offers** - العروض (إن وجدت)

---

## 🔧 SQL Code - تفعيل RLS

### الخطوة 1: تفعيل RLS على الجداول

```sql
-- في Supabase SQL Editor
-- تفعيل RLS على الجداول الرئيسية

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imei_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- تحقق من أن RLS مفعل
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'payments', 'imei_searches', 'notifications', 'audit_logs');
-- يجب أن يرجع rowsecurity = true لجميع الجداول
```

---

### الخطوة 2: إنشاء Policies للمستخدمين

**لجدول users:**

```sql
-- سياسة: المستخدم يرى بيانات نفسه فقط
CREATE POLICY "Users can view their own data"
ON public.users
FOR SELECT
USING (auth.uid() = id);

-- سياسة: المستخدم يعدل بيانات نفسه فقط
CREATE POLICY "Users can update their own data"
ON public.users
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- سياسة: لا يمكن حذف المستخدمين (يدوياً فقط)
-- لم نضيف DELETE policy لمنع الحذف الخطأ
```

**لجدول payments:**

```sql
-- سياسة: المستخدم يرى تحويلاته فقط
CREATE POLICY "Users can view their own payments"
ON public.payments
FOR SELECT
USING (auth.uid() = user_id);

-- سياسة: المستخدم يُنشئ تحويلات باسم نفسه
CREATE POLICY "Users can create own payments"
ON public.payments
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- سياسة: المستخدم يعدل تحويلاته فقط (الحالة المعلقة)
CREATE POLICY "Users can update pending payments"
ON public.payments
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id);
```

**لجدول imei_searches:**

```sql
-- سياسة: المستخدم يرى عمليات بحثه فقط
CREATE POLICY "Users can view their own searches"
ON public.imei_searches
FOR SELECT
USING (auth.uid() = user_id);

-- سياسة: المستخدم يُنشئ عمليات بحث باسم نفسه
CREATE POLICY "Users can create own searches"
ON public.imei_searches
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- سياسة: المستخدم يحذف عمليات بحثه الخاصة
CREATE POLICY "Users can delete their own searches"
ON public.imei_searches
FOR DELETE
USING (auth.uid() = user_id);
```

**لجدول notifications:**

```sql
-- سياسة: المستخدم يرى إشعاراته فقط
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

-- سياسة: المستخدم يحدّث حالة إشعاراته
CREATE POLICY "Users can update their notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

**لجدول audit_logs:**

```sql
-- سياسة: المستخدم يرى السجلات الخاصة به فقط
CREATE POLICY "Users can view their own audit logs"
ON public.audit_logs
FOR SELECT
USING (auth.uid() = user_id);

-- ملاحظة: لا INSERT/UPDATE/DELETE للـ users
-- فقط الـ service role يمكنه الكتابة
```

---

### الخطوة 3: إنشاء Policies لـ Admin/Service Role

```sql
-- Admin/Service Role يمكنه فعل كل شيء
-- هذه السياسات تستخدم service_role_key من البيئة

CREATE POLICY "Service role can do anything"
ON public.users
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can do anything"
ON public.payments
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can do anything"
ON public.imei_searches
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can do anything"
ON public.notifications
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can do anything"
ON public.audit_logs
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

---

### الخطوة 4: التحقق من السياسات

```sql
-- عرض جميع السياسات
SELECT * FROM pg_policies;

-- عرض السياسات لجدول معين
SELECT * FROM pg_policies WHERE tablename = 'users';

-- عرض الأدوار (roles)
SELECT * FROM pg_roles WHERE rolname LIKE '%service%';
```

---

## 🧪 اختبار RLS

### اختبر محلياً (للتطوير)

```bash
# في paymop-server/test-rls.js

const { createClient } = require('@supabase/supabase-js');

// اختبر مع authenticated user
async function testUserAccess() {
  const user1 = createClient(
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { 
      auth: { 
        user: { id: 'user-1' }
      }
    }
  );
  
  // يجب أن يرى بيانات user-1 فقط
  const { data: payments1 } = await user1
    .from('payments')
    .select();
  console.log('User 1 payments:', payments1.length);
  
  // user-2 يجب أن لا يرى بيانات user-1
  const user2 = createClient(
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { 
      auth: { 
        user: { id: 'user-2' }
      }
    }
  );
  
  const { data: payments2 } = await user2
    .from('payments')
    .select();
  console.log('User 2 payments:', payments2.length);
  
  // يجب أن تكون مختلفة
  console.assert(
    JSON.stringify(payments1) !== JSON.stringify(payments2),
    'RLS might not be working!'
  );
}

testUserAccess().catch(console.error);
```

### اختبر في المتصفح

```javascript
// في DevTools Console

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(URL, ANON_KEY);

// بعد تسجيل الدخول
const { data: { user } } = await supabase.auth.getUser();
console.log('Current user:', user.id);

// جرّب قراءة البيانات
const { data: payments, error } = await supabase
  .from('payments')
  .select();

if (error) {
  console.error('RLS blocked access:', error);
} else {
  console.log('Your payments:', payments);
  // يجب أن ترى فقط بيانات نفسك
}
```

---

## 📊 Policies Summary

| الجدول | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| users | ✅ self | ❌ no | ✅ self | ❌ no |
| payments | ✅ self | ✅ self | ⚠️ pending only | ❌ no |
| imei_searches | ✅ self | ✅ self | ❌ no | ✅ self |
| notifications | ✅ self | ❌ no | ✅ self | ✅ self |
| audit_logs | ✅ self | ❌ no | ❌ no | ❌ no |

---

## ⚠️ نقاط مهمة

### 1. Service Role Exception
```javascript
// في Backend، استخدم service_role_key:
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // يتجاوز RLS
);

// هذا يمكنه فعل أي شيء
await supabase.from('users').select();
```

### 2. Performance Note
```sql
-- RLS قد يؤثر على الأداء قليلاً
-- لكن الأمان أهم!
-- استخدم indexes للتحسين:

CREATE INDEX idx_payments_user_id 
ON payments(user_id);

CREATE INDEX idx_users_id 
ON users(id);
```

### 3. Testing Required
```sql
-- اختبر جميع السيناريوهات:
-- ✅ User يرى بيانات نفسه
-- ❌ User لا يرى بيانات آخرين
-- ✅ Admin يرى الكل
-- ❌ Anonymous يرى لا شيء
```

---

## ✅ Deployment Checklist

```
□ RLS مفعل على جميع الجداول
□ جميع السياسات منشأة
□ اختبار SELECT يعمل
□ اختبار INSERT يعمل
□ اختبار UPDATE يعمل
□ اختبار DELETE يعمل
□ Service role يمكنه الوصول
□ Regular users محصورون
□ Performance مقبول
□ لا توجد أخطاء في Logs
```

---

## 🚨 في حالة المشاكل

**مشكلة: "Permission denied" error**
```sql
-- تحقق من السياسات
SELECT * FROM pg_policies WHERE tablename = 'your_table';

-- أعد تشغيل السياسات
ALTER TABLE your_table DISABLE ROW LEVEL SECURITY;
ALTER TABLE your_table ENABLE ROW LEVEL SECURITY;
```

**مشكلة: Service role لا يمكنه الوصول**
```javascript
// استخدم service_role_key (ليس anon key)
const supabase = createClient(URL, SERVICE_ROLE_KEY);
```

**مشكلة: RLS بطيء جداً**
```sql
-- أضف indexes
CREATE INDEX idx_table_user_id ON your_table(user_id);
```

---

## ✅ النتيجة المتوقعة

```
Before:
❌ Any user can see others' data
❌ No database-level protection
❌ IDOR vulnerabilities possible

After:
✅ Users only see their data
✅ Database enforces isolation
✅ IDOR protection at DB level
✅ Layered security
```

---

**Status:** Ready for RLS Implementation  
**Next:** Task 4 - Final Security Audit
