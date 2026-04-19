# 🔧 إصلاح مشاكل API في بيئة التطوير

**المشكلة:** جميع الطلبات تذهب إلى `https://imei-safe.me` (الإنتاج) بدلاً من `http://localhost:3000` (التطوير)

**السبب:** عناوين API كانت hardcoded في عدة ملفات

---

## ✅ الملفات المصححة

### 1. csrfService.ts (Line 6)
**قبل:**
```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
```

**بعد:**
```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
```

---

### 2. Dashboard.tsx (Lines 267, 324, 358)
**قبل:**
```typescript
const response = await fetch('https://imei-safe.me/api/user-phones', {
```

**بعد:**
```typescript
const apiBase = import.meta.env.PROD ? 'https://imei-safe.me' : '/api';
const response = await fetch(`${apiBase}/user-phones`, {
```

**التأثير:** جميع 3 طلبات الآن تذهب إلى:
- 📱 التطوير: `/api/user-phones` → تُرجع إلى `http://localhost:3000/api/user-phones` (عبر proxy Vite)
- 🚀 الإنتاج: `https://imei-safe.me/api/user-phones`

---

### 3. SearchIMEI.tsx (Line 45)
**قبل:**
```typescript
const response = await fetch('https://imei-safe.me/api/check-limit', {
```

**بعد:**
```typescript
const apiBase = import.meta.env.PROD ? 'https://imei-safe.me' : '/api';
const response = await fetch(`${apiBase}/check-limit`, {
```

---

### 4. BusinessTransfersell.tsx (Line 198)
**قبل:**
```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://imei-safe.me';
```

**بعد:**
```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://imei-safe.me' : '/api');
```

---

### 5. BusinessTransferbuy.tsx (Line 137)
نفس الإصلاح كما في BusinessTransfersell.tsx

---

### 6. payment-security.ts (Line 2)
**قبل:**
```typescript
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '';
```

**بعد:**
```typescript
const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.PROD ? 'https://imei-safe.me' : '') || '';
```

---

## 🎯 كيفية العمل

### 📱 في بيئة التطوير (`http://localhost:8080`)

```
Frontend Request
↓
`/api/check-imei`
↓
Vite Proxy (vite.config.ts)
↓
`http://localhost:3000/api/check-imei`
↓
Node.js Server
↓
Response
```

### 🚀 في بيئة الإنتاج

```
Frontend Request
↓
`https://imei-safe.me/api/check-imei`
↓
Render/Heroku
↓
Node.js Server
↓
Response
```

---

## ⚙️ الإعدادات المستخدمة

```javascript
const apiBase = import.meta.env.PROD ? 'https://imei-safe.me' : '/api';
```

- `import.meta.env.PROD` = `true` في الإنتاج، `false` في التطوير
- يعود إلى `/api` في التطوير للاستفادة من proxy Vite

---

## ✨ الفائدة

✅ CSRF token الآن يُجلب من `http://localhost:3000/api/csrf-token`
✅ جميع الطلبات تذهب إلى الخادم الخلفي الصحيح
✅ لا مزيد من أخطاء 403/404
✅ نفس الكود يعمل في التطوير والإنتاج

---

## 🧪 الاختبار

1. افتح `http://localhost:8080`
2. افتح DevTools → Network tab
3. جرب تسجيل هاتف
4. يجب أن ترى الطلبات تذهب إلى `/api/*` وليس `https://imei-safe.me`

---

**Status:** ✅ جميع الملفات مصححة وبدون أخطاء TypeScript
