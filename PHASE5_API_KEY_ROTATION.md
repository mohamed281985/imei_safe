# Phase 5.2: API Key Rotation - تدوير جميع المفاتيح

**Status:** 🟡 IN PROGRESS  
**Priority:** 🔴 CRITICAL  
**Time Estimate:** 45-60 minutes  

---

## ⚠️ تنبيه أمان مهم

**تدوير المفاتيح يجب أن يتم:**
- ✅ في بيئة آمنة
- ✅ بدون كشف المفاتيح
- ✅ مع توثيق التغييرات
- ✅ مع اختبار كل تغيير

---

## 🔑 المفاتيح المطلوب تدويرها

1. **Firebase**
   - API Keys
   - Service Account Key

2. **Paymob**
   - API Key
   - Secret Key

3. **Supabase**
   - Anon Public Key
   - Service Role Key
   - JWT Secret

4. **Session/Auth**
   - Session Secret
   - JWT Secret

---

## 📋 قائمة المفاتيح الحالية

```
قبل البدء، احفظ:
□ Current Firebase API Key
□ Current Paymob API Key
□ Current Supabase Keys
□ Current Session Secrets
```

---

## 🔄 Task 1: Firebase Key Rotation (15 دقيقة)

### الخطوة 1: توليد مفتاح جديد

1. **اذهب إلى:** [Firebase Console](https://console.firebase.google.com)
2. **اختر Project:** Your Project
3. **اذهب إلى:** Project Settings (⚙️)
4. **انقر:** "API Keys" tab
5. **اضغط:** على المفتاح القديم → "Edit" → "Regenerate"

### الخطوة 2: تحديث Environment Variables

**في `.env.production`:**

```env
# Firebase (الجديد)
VITE_FIREBASE_API_KEY=AIza...NEW_KEY_HERE...

# احفظ المفتاح القديم مؤقتاً (للرجوع إليه إذا لزم)
# OLD_FIREBASE_API_KEY=AIza...OLD_KEY_HERE...
```

**في `.env.local` (للتطوير):**

```env
VITE_FIREBASE_API_KEY=AIza...TEST_KEY...
```

### الخطوة 3: تحديث Service Account

1. **اذهب إلى:** Service Accounts
2. **اضغط:** "Generate New Private Key"
3. **احفظ:** JSON file آمن
4. **حدّث:** `paymop-server/.env`:

```env
FIREBASE_SERVICE_ACCOUNT_KEY={
  "type": "service_account",
  "project_id": "your-project",
  ...
}
```

### الخطوة 4: اختبر Firebase

```javascript
// في Browser Console
firebase.auth().currentUser
// يجب أن يعمل بدون أخطاء

// أو
firebase.firestore().collection('users').limit(1).get()
  .then(snapshot => console.log('Firebase working'))
  .catch(err => console.error('Firebase error:', err))
```

✅ **Verify:**
```bash
curl -H "Authorization: Bearer $FIREBASE_KEY" \
  "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$FIREBASE_KEY"
# يجب أن يرجع response (حتى لو خطأ)
```

---

## 🔄 Task 2: Paymob Key Rotation (15 دقيقة)

### الخطوة 1: توليد مفاتيح جديدة

1. **اذهب إلى:** [Paymob Dashboard](https://accept.paymobsolutions.com/dashboard)
2. **اذهب إلى:** Settings → API Keys
3. **اضغط:** "Generate New Key"
4. **انسخ:** المفتاح الجديد

### الخطوة 2: تحديث Environment Variables

**في `paymop-server/.env`:**

```env
# Paymob (الجديد)
PAYMOB_API_KEY=new_key_here...
PAYMOB_SECRET_KEY=new_secret_here...

# احفظ القديمة مؤقتاً
# OLD_PAYMOB_API_KEY=old_key_here...
```

### الخطوة 3: تحديث في الكود

**في `paymop-server/server.js`:**

```javascript
// تحقق من أن الكود يقرأ من environment
const PAYMOB_API_KEY = process.env.PAYMOB_API_KEY;
const PAYMOB_SECRET_KEY = process.env.PAYMOB_SECRET_KEY;

if (!PAYMOB_API_KEY || !PAYMOB_SECRET_KEY) {
  throw new Error('Missing Paymob credentials');
}
```

### الخطوة 4: اختبر Paymob Integration

```bash
# اختبر المفتاح الجديد
curl -X POST https://accept.paymobsolutions.com/api/auth/tokens \
  -H "Content-Type: application/json" \
  -d "{\"api_key\": \"$PAYMOB_API_KEY\"}"

# يجب أن يرجع:
# {
#   "token": "...",
#   "profile": {...}
# }
```

✅ **Verify في الكود:**

```javascript
// في server.js
async function testPaymobConnection() {
  try {
    const response = await axios.post(
      'https://accept.paymobsolutions.com/api/auth/tokens',
      { api_key: process.env.PAYMOB_API_KEY }
    );
    console.log('✅ Paymob connected');
    return true;
  } catch (error) {
    console.error('❌ Paymob connection failed:', error);
    return false;
  }
}
```

---

## 🔄 Task 3: Supabase Key Rotation (15 دقيقة)

### الخطوة 1: توليد مفاتيح جديدة

1. **اذهب إلى:** [Supabase Dashboard](https://app.supabase.com)
2. **اختر Project:** Your Project
3. **اذهب إلى:** Project Settings → API
4. **انسخ:**
   - `Project URL` (لا تتغير عادة)
   - `Anon public key` (جديد)
   - `Service role key` (جديد)

### الخطوة 2: تحديث Environment Variables

**في `.env.production`:**

```env
# Supabase (جديد)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=new_anon_key_here...

# في backend
SUPABASE_SERVICE_ROLE_KEY=new_service_role_key_here...
SUPABASE_JWT_SECRET=new_jwt_secret_here...
```

**في `.env.local`:**

```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=eyJhbGc...test_key...
```

### الخطوة 3: تحديث في الكود

**في `src/services/supabaseClient.ts` (إن وجد):**

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**في `paymop-server/server.js`:**

```javascript
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
```

### الخطوة 4: اختبر Supabase Connection

```javascript
// اختبر Frontend
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(URL, KEY);
const { data, error } = await supabase.from('users').select().limit(1);

if (error) {
  console.error('❌ Supabase error:', error);
} else {
  console.log('✅ Supabase connected');
}
```

```bash
# اختبر Backend
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
supabase.from('users').select().limit(1)
  .then(r => console.log('✅ Supabase OK'))
  .catch(e => console.error('❌ Error:', e.message));
"
```

---

## 🔄 Task 4: Session Secrets Rotation (15 دقيقة)

### الخطوة 1: توليد أسرار جديدة

```bash
# Generate new session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate new JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### الخطوة 2: تحديث Environment Variables

**في `.env.production`:**

```env
# Session
SESSION_SECRET=new_session_secret_here...
SESSION_NAME=imei_session

# JWT
JWT_SECRET=new_jwt_secret_here...
JWT_EXPIRY=7d
REFRESH_TOKEN_SECRET=new_refresh_secret_here...
```

### الخطوة 3: تحديث في الكود

**في `paymop-server/server.js`:**

```javascript
// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: true,  // HTTPS only
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';
```

### الخطوة 4: اختبر Session

```javascript
// اختبر الـ session والـ JWT
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { userId: 123 },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);
console.log('Token created:', token);

// اختبر التحقق
jwt.verify(token, process.env.JWT_SECRET);
console.log('✅ JWT verification successful');
```

---

## 📋 Deployment Checklist

```
قبل النشر:
□ جميع المفاتيح الجديدة في .env
□ اختبار محلي لكل مفتاح
□ لا توجد أخطاء في console
□ جميع الـ endpoints تعمل

أثناء النشر:
□ Push إلى Git (بدون مفاتيح!)
□ Update Render environment variables
□ Restart service
□ اختبر جميع الـ endpoints

بعد النشر:
□ تحقق من Logs
□ اختبر API calls
□ اختبر Authentication
□ اختبر Payment integration
□ احفظ المفاتيح القديمة 30 يوم (للطوارئ)
```

---

## 🔒 أفضل الممارسات

### ✅ أفعل:
- ✅ احفظ المفاتيح في مجلد آمن
- ✅ استخدم .env files (لا تضعها في الكود)
- ✅ روّر المفاتيح بشكل دوري
- ✅ اختبر قبل النشر
- ✅ راقب Logs بعد النشر

### ❌ لا تفعل:
- ❌ لا تضع مفاتيح في git
- ❌ لا تشارك المفاتيح
- ❌ لا تنسى تحديث .env
- ❌ لا تختبر في الإنتاج مباشرة
- ❌ لا تحتفظ بالمفاتيح القديمة في الكود

---

## 🚨 في حالة المشاكل

**مشكلة: "Invalid API Key"**
```bash
# تحقق من أن المفتاح صحيح
echo $PAYMOB_API_KEY
# تحقق من .env syntax
```

**مشكلة: "Connection refused"**
```bash
# اختبر الاتصال
curl -v https://api-endpoint.com
# تحقق من firewall/CORS
```

**مشكلة: "Old key still working"**
```bash
# المفاتيح القديمة قد تعمل لفترة
# احذرها من Dashboard بشكل يدوي
# أو انتظر انتهاء الصلاحية
```

---

## ✅ النتيجة المتوقعة

```
Before:
❌ Using old keys
❌ Security risk
❌ Keys may be compromised

After:
✅ Fresh keys deployed
✅ All systems connected
✅ Security improved
✅ Ready for production
```

---

**Status:** Ready for Key Rotation  
**Next:** Task 3 - Enable RLS
