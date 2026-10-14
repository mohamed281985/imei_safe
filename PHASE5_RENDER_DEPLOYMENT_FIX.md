# Phase 5.1: Fix Render Deployment - csurf Package Issue

**Status:** 🟡 IN PROGRESS  
**Priority:** 🔴 CRITICAL  
**Time Estimate:** 30-45 minutes  

---

## 🔴 المشكلة

عند محاولة الوصول إلى API على Render:

```
Error: Cannot find module 'csurf'
```

### السبب:
- `csurf` مُثبت محلياً (local) لكن ليس على Render
- قد يكون في `devDependencies` بدلاً من `dependencies`
- Build script لا ينصب الـ packages الازمة

---

## ✅ الحل الشامل

### الخطوة 1: تحديث package.json (5 دقائق)

**في جذر المشروع:**

```json
// package.json
{
  "name": "vite_react_shadcn_ts",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "start-server": "node paymop-server/server.js",
    "postinstall": "cd paymop-server && npm install"
  },
  "dependencies": {
    // ... existing dependencies
  }
}
```

**في paymop-server/package.json:**

تأكد من أن هذه موجودة في `dependencies` (ليس `devDependencies`):

```json
{
  "dependencies": {
    "express": "^4.x",
    "csurf": "^1.11.0",
    "cookie-parser": "^1.4.6",
    "express-session": "^1.17.3",
    "express-rate-limit": "^6.x",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.x",
    "axios": "^1.x",
    "dotenv": "^16.x",
    "firebase-admin": "^11.x",
    "pg": "^8.x",
    "uuid": "^9.x"
  }
}
```

---

### الخطوة 2: التحقق من Render Configuration (10 دقائق)

**في Render Dashboard:**

1. **اذهب إلى:** Services → Your Service → Settings

2. **تحقق من Build Command:**
   ```bash
   npm install
   # أو بشكل أفضل:
   npm install && cd paymop-server && npm install
   ```

3. **تحقق من Start Command:**
   ```bash
   node paymop-server/server.js
   # أو
   npm run start-server
   ```

4. **البيئة Variables:**
   ```
   NODE_ENV=production
   SUPABASE_URL=https://...
   SUPABASE_SERVICE_ROLE_KEY=...
   FIREBASE_SERVICE_ACCOUNT_KEY=...
   # ... جميع المتغيرات الأخرى
   ```

---

### الخطوة 3: اختبار محلياً (5 دقائق)

```bash
# 1. اذهب إلى paymop-server
cd paymop-server

# 2. حذف node_modules
rm -r node_modules

# 3. تثبيت من جديد
npm install

# 4. اختبر أن الـ modules موجودة
node -e "console.log(require('csurf'))"
# يجب أن يطبع: [Function: csrf]

# 5. شغّل الـ server
node server.js
# يجب أن يبدأ بدون أخطاء
```

---

### الخطوة 4: Deploy إلى Render (10 دقائق)

**الخيار 1: من Render Dashboard**

1. اذهب إلى: Services → Your Service
2. انقر: Manual Deploy → Latest Commit
3. انتظر حتى ينتهي (5-10 دقائق)

**الخيار 2: من Git (تلقائي)**

```bash
# دفع التغييرات إلى GitHub
git add package.json paymop-server/package.json
git commit -m "fix: ensure csurf installed on Render"
git push

# Render سيعيد البناء تلقائياً
```

---

### الخطوة 5: التحقق من النجاح (5 دقائق)

```bash
# 1. اختبر الـ CSRF endpoint
curl https://your-service-name.onrender.com/api/csrf-token

# يجب أن ترجع:
# {
#   "csrfToken": "eyJhbGciOiJIUzI1NiIs..."
# }

# 2. اختبر endpoint آخر
curl https://your-service-name.onrender.com/api/health
```

**أو في DevTools:**

```javascript
// في Browser Console
fetch('https://your-service-name.onrender.com/api/csrf-token')
  .then(r => r.json())
  .then(d => console.log(d))
  .catch(e => console.error(e))
```

---

## 🔍 استكشاف الأخطاء

### المشكلة: لا يزال الخطأ "Cannot find module 'csurf'"

**الحل:**

1. **تحقق من Render Logs:**
   ```
   Dashboard → Services → Logs tab
   ابحث عن: "npm install"
   ```

2. **تأكد من Build Command:**
   ```bash
   # يجب أن يكون:
   npm install && cd paymop-server && npm install
   ```

3. **إعادة البناء:**
   - اضغط "Clear build cache" ثم "Manual Deploy"

4. **تحقق من package.json:**
   ```bash
   # تأكد من عدم وجود أي أخطاء في JSON
   node -c package.json
   ```

### المشكلة: Server timeout

**الحل:**

```bash
# 1. اختبر locally
npm run dev

# 2. تحقق من .env
# تأكد من أن جميع المتغيرات موجودة

# 3. تحقق من Supabase connection
# جرّب الاتصال مباشرة
```

### المشكلة: Port already in use

**الحل:**

```javascript
// في server.js
const PORT = process.env.PORT || 3001
// Render يستخدم PORT من environment
```

---

## 📊 ملخص الملفات المطلوبة

```
Root/
├── package.json              (تحديث مع postinstall)
└── paymop-server/
    ├── package.json          (تحديث مع csurf, cookie-parser)
    ├── server.js
    ├── middleware/
    │   └── csrf.js
    └── ...
```

---

## ✅ Checklist

- [ ] تحديث `package.json` في الجذر
- [ ] تحديث `paymop-server/package.json`
- [ ] تأكد من `csurf` في dependencies
- [ ] اختبر محلياً: `npm install && npm run dev`
- [ ] تأكد من Build Command في Render
- [ ] Deploy إلى Render
- [ ] اختبر `/api/csrf-token` endpoint
- [ ] تحقق من عدم وجود أخطاء في Logs

---

## 🎯 النتيجة المتوقعة

**قبل:**
```
❌ Error: Cannot find module 'csurf'
Server failed to start
```

**بعد:**
```
✅ Server started on port 3001
✅ GET /api/csrf-token returns token
✅ All endpoints working
```

---

## 📞 تحتاج مساعدة إضافية؟

- **مشاكل Build؟** → تحقق من Render Logs
- **مشاكل Dependencies؟** → تحقق من package.json
- **مشاكل Connection؟** → تحقق من .env variables

---

**Status:** Ready to Deploy  
**Next:** Task 2 - API Key Rotation
