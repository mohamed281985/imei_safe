# Phase 4 Implementation Checklist

## ✅ تم إنشاؤه

### 1. Core Services
- ✅ `src/services/csrfService.ts` - CSRF token lifecycle management
  - `fetchCsrfToken()` - fetch from server or cache
  - `getToken()` - get cached or fetch new
  - `getStoredToken()` - read from localStorage only
  - `clearToken()` - clear from memory & storage
  - `isTokenValid()` - check expiry

### 2. Axios Integration
- ✅ `src/services/axiosInterceptor.ts` - automatic CSRF injection
  - Request interceptor: adds X-CSRF-Token header
  - Response interceptor: handles 403 errors
  - Auto token refresh: fetch new token on CSRF failure
  - Queue management: handles concurrent requests
  - Retry mechanism: re-attempt failed request with new token

### 3. React Hooks
- ✅ `src/hooks/useCsrfToken.ts` - token management hook
  - Fetches token on component mount
  - Returns: csrfToken, loading, error, refresh
  - Optional manual token refresh

- ✅ `src/hooks/useApiCall.ts` - API calls with CSRF protection
  - Wraps axios instance with interceptor
  - Handles POST, PUT, PATCH, DELETE
  - Returns: data, loading, error, execute, reset
  - Supports callbacks: onSuccess, onError

### 4. Context & Providers
- ✅ `src/contexts/CsrfContext.tsx` - application-wide CSRF provider
  - CsrfProvider component
  - useCsrfContext hook
  - Auto token refresh every 30 minutes
  - App-level error handling

### 5. Documentation
- ✅ `PHASE4_FRONTEND_CSRF_INTEGRATION.md` - comprehensive guide
  - Architecture overview
  - Component descriptions
  - Integration steps
  - Usage examples
  - Error handling guide
  - Testing procedures

---

## 📋 الخطوات المتبقية

### Step 1: تحديث `src/main.tsx` ⏳
```typescript
import { CsrfProvider } from '@/contexts/CsrfContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CsrfProvider>
      <App />
    </CsrfProvider>
  </React.StrictMode>,
);
```

### Step 2: تحديث axios instances في المشروع ⏳
البحث عن جميع `axios` calls واستبدالها بـ `useApiCall` hook أو استخدام `createAxiosInstance()`

**الملفات المحتملة:**
- `src/pages/` - form submissions, data fetching
- `src/components/` - API interactions
- `src/services/` - service layer functions

### Step 3: تحديث استمارات البيانات ⏳
```typescript
// قبل:
const [loading, setLoading] = useState(false)
const handleSubmit = async (data) => {
  setLoading(true)
  try {
    const res = await axios.post('/api/user', data)
    // ...
  } finally {
    setLoading(false)
  }
}

// بعد:
const { data, loading, execute } = useApiCall()
const handleSubmit = async (data) => {
  await execute('/api/user', 'post', data)
}
```

### Step 4: إضافة Error Boundaries ⏳
```typescript
import { useCsrfContext } from '@/contexts/CsrfContext'

function App() {
  const { loading: csrfLoading, error: csrfError } = useCsrfContext()
  
  if (csrfLoading) return <CsrfInitializingScreen />
  if (csrfError) return <CsrfErrorScreen error={csrfError} />
  
  return <MainApp />
}
```

### Step 5: تحديث `.env` ⏳
```env
VITE_API_URL=http://localhost:3001/api
```

### Step 6: تحديث `tsconfig.json` ⏳
تأكد من وجود:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### Step 7: تحديث `vite.config.ts` ⏳
```typescript
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

---

## 🧪 اختبار Phase 4

### اختبار 1: Token Generation ✅
- [ ] تطبيق يبدأ بدون أخطاء
- [ ] CSRF token يظهر في localStorage
- [ ] Token يحتوي على content (ليس فارغاً)

### اختبار 2: Request Interception ✅
- [ ] Open DevTools Network tab
- [ ] قم بإرسال POST request
- [ ] تحقق من وجود `X-CSRF-Token` header
- [ ] قيمة الـ header تطابق localStorage token

### اختبار 3: Token Refresh ✅
- [ ] امسح CSRF token من localStorage
- [ ] قم بإرسال POST request
- [ ] يجب أن يحصل تلقائياً على token جديد
- [ ] Request ينجح

### اختبار 4: CSRF Failure Handling ✅
- [ ] غيّر CSRF token في localStorage لقيمة خاطئة
- [ ] قم بإرسال POST request
- [ ] المتوقع: Server يرفع 403
- [ ] Interceptor يجلب token جديد
- [ ] Request يعاد محاولته تلقائياً
- [ ] Request ينجح في المحاولة الثانية

### اختبار 5: Concurrent Requests ✅
- [ ] أرسل 3 POST requests بسرعة
- [ ] كل واحد يجب أن يحصل على token
- [ ] جميعاً يجب أن ينجحوا
- [ ] فقط request واحد يجب أن يذهب إلى `/api/csrf-token`

### اختبار 6: Token Expiry ✅
- [ ] تشغيل التطبيق
- [ ] انتظر 30 دقيقة (أو تغيير الثابت للاختبار)
- [ ] Token يجب أن يتم تحديثه تلقائياً
- [ ] Requests تستمر بدون مشاكل

---

## 🐛 Troubleshooting

### المشكلة: "Cannot find module 'axios'"
**الحل:** 
```bash
npm install axios
# أو
bun install axios
```

### المشكلة: "useCsrfContext must be used inside CsrfProvider"
**الحل:** تأكد من wrapping التطبيق بـ CsrfProvider في main.tsx

### المشكلة: CSRF token لم يتم إضافة إلى headers
**الحل:** 
1. تأكد من استخدام `useApiCall` hook
2. تحقق من أن الـ method هو POST/PUT/DELETE
3. تحقق من Network tab للتأكد من الـ header موجود

### المشكلة: 403 errors لا تُصلح تلقائياً
**الحل:**
1. تأكد من أن `axiosInterceptor` مفعّل في `createAxiosInstance`
2. تحقق من أن Backend يرسل 403 لـ CSRF failures
3. تأكد من أن `/api/csrf-token` endpoint يعمل

### المشكلة: localStorage write errors
**الحل:** تشغيل في private window / incognito mode قد يساعد

---

## 📊 Migration Progress

```
Phase 4 Implementation Status
===================================

1. Backend CSRF Middleware         ✅ DONE (Phase 1)
   - CSRF token generation
   - CSRF validation

2. Frontend Service Layer          ✅ DONE
   - csrfService.ts
   - axiosInterceptor.ts

3. React Hooks                     ✅ DONE
   - useCsrfToken.ts
   - useApiCall.ts

4. Context Provider                ✅ DONE
   - CsrfContext.tsx
   - CsrfProvider component

5. Integration in Components       ⏳ TODO
   - Update main.tsx
   - Replace axios calls
   - Update forms

6. Testing                         ⏳ TODO
   - Unit tests
   - Integration tests
   - E2E tests

7. Production Deployment           ⏳ TODO (Phase 5)
   - Fix csurf installation
   - Environment setup
   - Security audit

===================================
Current: 50% Complete
Estimate: 30-40 minutes remaining
```

---

## 🔗 Related Files

**Backend (already done):**
- `paymop-server/middleware/csrf.js`
- `paymop-server/server.js` (integrated CSRF middleware)

**Frontend (this phase):**
- `src/services/csrfService.ts` ✅
- `src/services/axiosInterceptor.ts` ✅
- `src/hooks/useCsrfToken.ts` ✅
- `src/hooks/useApiCall.ts` ✅
- `src/contexts/CsrfContext.tsx` ✅

**Configuration:**
- `src/main.tsx` ⏳ (needs CsrfProvider)
- `src/vite-env.d.ts` (types)
- `.env` ⏳ (needs VITE_API_URL)

---

## 📝 Next Phase: Phase 5

**Production Hardening:**
1. Fix csurf package on Render
2. Rotate API keys
3. Enable RLS on all tables
4. Audit Git history for secrets
5. Final security penetration testing

---

**Status:** 🟠 Phase 4 - Partially Complete (60%)  
**Last Updated:** 2025-01-01  
**Assigned:** Frontend Security Integration  
**Priority:** 🔴 CRITICAL
