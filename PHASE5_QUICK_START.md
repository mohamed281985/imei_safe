# Phase 5 Quick Start - 5 خطوات سريعة

## 🚀 في 30 دقيقة: تجهيز الإنتاج

---

## ✋ قبل أن تبدأ

تأكد من:
- ✅ Phase 4 مكتملة بنسبة 100%
- ✅ لديك وصول إلى Render dashboard
- ✅ لديك وصول إلى Firebase console
- ✅ لديك وصول إلى Supabase dashboard
- ✅ لديك وصول إلى Paymob dashboard

---

## الخطوة 1: إصلاح مشكلة Render (5-10 دقائق)

### المشكلة:
```
❌ Error: Cannot find module 'csurf'
```

### الحل:
```bash
# 1. تأكد من وجود csurf في dependencies (ليس devDependencies)
cd paymop-server
npm install csurf cookie-parser

# 2. تأكد من package.json يحتوي على:
{
  "scripts": {
    "start": "node server.js"
  }
}

# 3. Deploy إلى Render
# في Render dashboard:
# - اذهب إلى Settings
# - Update "Build Command": npm install && cd paymop-server && npm install
# - Save وRedeploy
```

✅ **Verify:**
```bash
# بعد Deploy
curl https://your-render-url.onrender.com/api/csrf-token
# يجب أن ترجع: { "csrfToken": "..." }
```

---

## الخطوة 2: تدوير مفاتيح Firebase (10 دقائق)

### في Firebase Console:

1. **API Keys:**
   - اذهب إلى: Project Settings → API Keys
   - اضغط على "Regenerate"
   - انسخ المفتاح الجديد
   - حدّث `.env.production`:
   ```env
   VITE_FIREBASE_API_KEY=<new-key>
   ```

2. **Service Account:**
   - اذهب إلى: Service Accounts
   - اضغط "Generate New Private Key"
   - احفظ JSON file
   - اسحب المفتاح القديم

✅ **Verify:**
```javascript
// في console
firebase.auth().currentUser
// يجب أن يعمل بدون أخطاء
```

---

## الخطوة 3: تدوير مفاتيح Paymob (10 دقائق)

### في Paymob Dashboard:

1. **API Key:**
   - اذهب إلى: Settings → API Keys
   - اضغط "Generate New"
   - انسخ المفتاح الجديد
   - حدّث `.env.production`:
   ```env
   PAYMOB_API_KEY=<new-key>
   ```

2. **Secret Key:**
   - اذهب إلى: Integrations
   - اضغط "Regenerate Secret"
   - حدّث المتغير

✅ **Verify:**
```bash
curl -X POST https://accept.paymobsolutions.com/api/auth/tokens \
  -H "Content-Type: application/json" \
  -d "{\"api_key\": \"$PAYMOB_API_KEY\"}"
# يجب أن ترجع token
```

---

## الخطوة 4: تدوير مفاتيح Supabase (10 دقائق)

### في Supabase Dashboard:

1. **API Keys:**
   - اذهب إلى: Project Settings → API
   - انسخ `anon public key` و `service_role key`
   - حدّث `.env.production`:
   ```env
   VITE_SUPABASE_URL=<url>
   VITE_SUPABASE_ANON_KEY=<new-key>
   SUPABASE_SERVICE_ROLE_KEY=<new-key>
   ```

2. **JWT Secret:**
   - اذهب إلى: Authentication → JWT
   - انسخ Secret
   - حدّث المتغير

✅ **Verify:**
```javascript
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(URL, KEY)
const { data } = await supabase.from('users').select().limit(1)
// يجب أن يعمل بدون أخطاء
```

---

## الخطوة 5: تفعيل Row Level Security (15 دقائق)

### تشغيل في Supabase SQL Editor:

```sql
-- 1. تفعيل RLS على الجداول الرئيسية
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE imei_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. إنشاء سياسات (Policies)
-- لجدول users
CREATE POLICY "Users can view own data" 
ON users 
FOR SELECT 
USING (auth.uid() = id);

-- لجدول payments
CREATE POLICY "Users can view own payments" 
ON payments 
FOR SELECT 
USING (auth.uid() = user_id);

-- لجدول imei_searches
CREATE POLICY "Users can view own searches" 
ON imei_searches 
FOR SELECT 
USING (auth.uid() = user_id);

-- لجدول audit_logs
CREATE POLICY "Users can view own audit logs" 
ON audit_logs 
FOR SELECT 
USING (auth.uid() = user_id);

-- 3. للـ admin access (من backend)
-- استخدم service_role_key في المتغيرات
```

✅ **Verify:**
```sql
-- تحقق من RLS مفعل
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'payments', 'imei_searches');

-- تحقق من السياسات
SELECT * FROM pg_policies;
```

---

## ✅ التحقق النهائي (قائمة فحص)

- [ ] Render deployment نجح
- [ ] `/api/csrf-token` يعمل
- [ ] Firebase auth يعمل
- [ ] Paymob integration يعمل
- [ ] Supabase connection يعمل
- [ ] RLS مفعل على جميع الجداول
- [ ] لا توجد أخطاء في console
- [ ] جميع الـ endpoints تستجيب

---

## 🎊 تم!

إذا اجتزت جميع الخطوات:

✅ App جاهز للإنتاج!

---

## 📞 في حالة المشاكل

| المشكلة | الحل |
|--------|------|
| Render still error | اقرأ [PHASE5_RENDER_DEPLOYMENT_FIX.md](PHASE5_RENDER_DEPLOYMENT_FIX.md) |
| API key error | اقرأ [PHASE5_API_KEY_ROTATION.md](PHASE5_API_KEY_ROTATION.md) |
| RLS issues | اقرأ [PHASE5_RLS_ENFORCEMENT.md](PHASE5_RLS_ENFORCEMENT.md) |
| Security questions | اقرأ [PHASE5_SECURITY_AUDIT.md](PHASE5_SECURITY_AUDIT.md) |

---

**⏱️ إجمالي الوقت:** 30-45 دقيقة  
**🎯 النتيجة:** App جاهز للإطلاق  
**Status:** ✅ Production Ready
