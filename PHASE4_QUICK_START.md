# Phase 4 Quick Start Guide - Frontend CSRF Integration

## 🚀 في 5 خطوات - البدء السريع

### الخطوة 1: إضافة CsrfProvider (2 دقيقة)

**ملف:** `src/main.tsx`

```typescript
// أضف هذا import
import { CsrfProvider } from './contexts/CsrfContext';

// غيّر هذا:
// <AdModalProvider>
//   <App />
// </AdModalProvider>

// إلى هذا:
<CsrfProvider>
  <AdModalProvider>
    <App />
  </AdModalProvider>
</CsrfProvider>
```

### الخطوة 2: تحديث البيئة (1 دقيقة)

**ملف:** `.env`

```env
VITE_API_URL=http://localhost:3001/api
```

### الخطوة 3: تحديث vite config (1 دقيقة)

**ملف:** `vite.config.ts`

```typescript
import path from 'path'

// أضف في resolve:
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
  },
}
```

### الخطوة 4: استبدل أول API call (2 دقيقة)

**قبل:**
```typescript
import axios from 'axios'

const handleSubmit = async (data) => {
  const response = await axios.post('/api/user', data)
}
```

**بعد:**
```typescript
import { useApiCall } from '@/hooks/useApiCall'

const { data, loading, error, execute } = useApiCall()

const handleSubmit = async (data) => {
  await execute('/api/user', 'post', data)
}
```

### الخطوة 5: اختبر (3 دقائق)

```bash
npm run dev

# اذهب إلى devTools → Network
# قم بإرسال POST request
# تحقق من وجود X-CSRF-Token header ✅
```

**المجموع:** ~15 دقيقة لكامل التكامل الأساسي! 🎉

---

## 📝 أمثلة عملية سريعة

### مثال 1: استمارة تسجيل

```typescript
import { useApiCall } from '@/hooks/useApiCall'

export function LoginForm() {
  const { data, loading, execute } = useApiCall<{ token: string }>()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    await execute('/api/auth/login', 'post', { email, password })
  }

  return (
    <form onSubmit={handleLogin}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
      <button disabled={loading}>{loading ? 'جاري...' : 'دخول'}</button>
      {data?.token && <p>✅ تم الدخول!</p>}
    </form>
  )
}
```

### مثال 2: حذف منتج

```typescript
const handleDelete = async (productId: string) => {
  const { execute } = useApiCall()
  await execute(`/api/products/${productId}`, 'delete')
}
```

### مثال 3: تحديث ملف شخصي

```typescript
const { execute, loading } = useApiCall()

await execute('/api/profile', 'put', {
  name: 'أحمد محمد',
  phone: '201234567890'
})
```

---

## 🧪 اختبار CSRF Token

### اختبار 1: Verify Token في localStorage
```javascript
// في DevTools Console:
localStorage.getItem('csrf_token')
// يجب أن يطبع value يشبه: "eyJhbGciOiJIUzI1NiIs..."
```

### اختبار 2: Verify Header في Network
```
1. افتح DevTools → Network tab
2. اضغط على زر "إرسال" في الفورم
3. اختر الـ POST request
4. انظر في Headers section
5. ابحث عن: X-CSRF-Token: [value]
```

### اختبار 3: Test Token Refresh
```javascript
// في Console:
localStorage.removeItem('csrf_token')
// الآن أرسل POST request
// يجب أن يجلب token جديد تلقائياً
```

### اختبار 4: Test Auto-Recovery
```javascript
// في Console:
localStorage.setItem('csrf_token', 'invalid_token')
// الآن أرسل POST request
// يجب أن يحصل على 403، ثم يحدّث token، ثم ينجح
```

---

## 🔍 Troubleshooting سريع

| المشكلة | الحل |
|--------|------|
| "Cannot find module @/hooks" | أضف path alias في vite.config.ts |
| "useCsrfContext error" | تأكد من CsrfProvider في main.tsx |
| Token لم يُضاف إلى headers | استخدم `useApiCall()` hook بدل axios |
| localStorage errors | حاول في normal window (ليس private) |
| CSRF validation fails | تأكد من `/api/csrf-token` يعمل |

---

## 📊 مراحل التطبيق

```
┌─────────────────────────────────────────┐
│  15 دقيقة: التكامل الأساسي            │
│  ├─ 2 دقيقة: CsrfProvider              │
│  ├─ 1 دقيقة: .env setup                │
│  ├─ 1 دقيقة: vite config               │
│  ├─ 2 دقيقة: أول API call             │
│  └─ 3 دقائق: اختبار                    │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│  20 دقيقة: تحديث باقي API calls        │
│  ├─ البحث عن جميع axios calls         │
│  ├─ استبدال بـ useApiCall              │
│  ├─ اختبار كل واحدة                   │
│  └─ commit التغييرات                  │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│  15 دقيقة: اختبار شامل                 │
│  ├─ Token management                   │
│  ├─ Error handling                     │
│  ├─ Concurrent requests                │
│  └─ Production readiness               │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│  ✅ Phase 4 COMPLETE!                  │
│  Ready for Phase 5: Production         │
└─────────────────────────────────────────┘
```

---

## 📚 المراجع السريعة

### Hooks
```typescript
// Token management
const { csrfToken, loading, error, refresh } = useCsrfToken()

// API calls
const { data, loading, error, execute, reset } = useApiCall()

// App-level context
const { csrfToken, loading, error, refreshToken } = useCsrfContext()
```

### Method Signatures
```typescript
// Execute API call
execute(url: string, method?: string, payload?: any): Promise<T>

// Supported methods: 'get', 'post', 'put', 'patch', 'delete'
```

### Common Patterns
```typescript
// Pattern 1: Simple call
await execute('/api/endpoint', 'post', data)

// Pattern 2: With response handling
const result = await execute('/api/endpoint', 'post', data)
if (result) { /* success */ }

// Pattern 3: With error handling
const { error } = useApiCall()
// error automatically set if request fails
```

---

## ⚠️ أهم نقاط أمان

✅ **أفعل:**
- استخدم `useApiCall()` للطلبات المعدلة
- فعّل CORS credentials في الـ requests
- اختبر token expiry و refresh
- راقب console للأخطاء

❌ **لا تفعل:**
- لا تُرسل token في URL parameters
- لا تضع token في localStorage بدون تشفير
- لا تتجاهل 403 errors
- لا تستخدم axios مباشرة (استخدم createAxiosInstance)

---

## 🎯 Success Indicators

بعد التطبيق، يجب أن تلاحظ:

✅ No CSRF errors (403 Forbidden)  
✅ Token appears in localStorage  
✅ X-CSRF-Token in request headers  
✅ Auto-recovery from token failures  
✅ All forms work normally  
✅ No console errors  

---

## 📞 الدعم

**مثال كامل يعمل:** `examples/CsrfExample.tsx`

**الوثائق الكاملة:**
- `PHASE4_FRONTEND_CSRF_INTEGRATION.md`
- `PHASE4_IMPLEMENTATION_CHECKLIST.md`
- `PHASE4_COMPLETION_REPORT.md`

---

## التالي: Phase 5

بعد إنجاز Phase 4:
1. ✅ Frontend CSRF Protection
2. ⏳ Backend cleanup و optimizations
3. ⏳ Production deployment
4. ⏳ Security audit final
5. ⏳ Launch! 🚀

---

**Status:** 🟢 Ready to Start  
**Difficulty:** 🟢 Easy (copy-paste templates)  
**Estimate:** 60 minutes total  
**Result:** Complete CSRF protection ✅
