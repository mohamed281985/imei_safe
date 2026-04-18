# Phase 4: Frontend CSRF Integration - دليل التكامل

## المحتويات
1. [نظرة عامة](#نظرة-عامة)
2. [المكونات المنشأة](#المكونات-المنشأة)
3. [التكامل في التطبيق](#التكامل-في-التطبيق)
4. [أمثلة الاستخدام](#أمثلة-الاستخدام)
5. [معالجة الأخطاء](#معالجة-الأخطاء)
6. [الاختبار](#الاختبار)

---

## نظرة عامة

في Phase 4، نقوم بتكامل CSRF protection على مستوى Frontend لضمان أن جميع الطلبات المعدلة (POST, PUT, DELETE) تحتوي على CSRF token صحيح.

### المعمارية:
```
App.tsx (CsrfProvider)
    ↓
useApiCall hook (في أي مكون)
    ↓
axiosInterceptor (يضيف X-CSRF-Token header تلقائياً)
    ↓
Backend API (يتحقق من CSRF token عبر middleware)
```

---

## المكونات المنشأة

### 1. `src/services/csrfService.ts`
**الوظيفة:** إدارة دورة حياة CSRF token (جلب، تخزين، تحديث)

**الميزات:**
- جلب token من `/api/csrf-token`
- تخزين في localStorage مع expiry time (1 ساعة)
- تخزين مؤقت في الذاكرة
- تحقق من صحة التوقيت
- تنظيف تلقائي عند انتهاء الصلاحية

```typescript
const token = await csrfService.getToken(); // جلب أو استخدام المحفوظ
const newToken = await csrfService.fetchCsrfToken(); // جلب جديد دائماً
csrfService.clearToken(); // تنظيف
```

### 2. `src/services/axiosInterceptor.ts`
**الوظيفة:** إضافة CSRF token تلقائياً إلى جميع الطلبات

**الميزات:**
- إضافة `X-CSRF-Token` header تلقائياً
- معالجة 403 errors (CSRF failure)
- تحديث token تلقائي عند الفشل
- إعادة محاولة الطلب الفاشل
- طابور انتظار للطلبات المتزامنة

```typescript
const axiosInstance = createAxiosInstance();
// كل الطلبات ستحصل على X-CSRF-Token header تلقائياً
const response = await axiosInstance.post('/api/user', userData);
```

### 3. `src/hooks/useCsrfToken.ts`
**الوظيفة:** React hook لجلب وإدارة CSRF token

**الاستخدام:**
```typescript
const { csrfToken, loading, error, refresh } = useCsrfToken();
```

### 4. `src/hooks/useApiCall.ts`
**الوظيفة:** Custom hook لـ API calls مع CSRF protection مدمجة

**الاستخدام:**
```typescript
const { data, loading, error, execute } = useApiCall();
await execute('/api/user', 'post', userData);
```

### 5. `src/contexts/CsrfContext.tsx`
**الوظيفة:** React Context لتوفير CSRF token على مستوى التطبيق

**الاستخدام:**
```typescript
const { csrfToken, loading, error, refreshToken } = useCsrfContext();
```

---

## التكامل في التطبيق

### Step 1: تحديث `src/main.tsx`
أضف CsrfProvider في جذر التطبيق:

```typescript
import { CsrfProvider } from '@/contexts/CsrfContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CsrfProvider>
      <App />
    </CsrfProvider>
  </React.StrictMode>,
);
```

### Step 2: استخدام في Components
استخدم `useApiCall` بدلاً من axios مباشرة:

```typescript
import { useApiCall } from '@/hooks/useApiCall';

function UserForm() {
  const { data, loading, error, execute } = useApiCall({
    onSuccess: (data) => console.log('نجح:', data),
    onError: (error) => console.error('فشل:', error)
  });

  const handleSubmit = async (userData: any) => {
    await execute('/api/user', 'post', userData);
  };

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      handleSubmit({ name: 'أحمد' });
    }}>
      {loading && <p>جاري الإرسال...</p>}
      {error && <p style={{color: 'red'}}>خطأ: {error.message}</p>}
      <button type="submit">إرسال</button>
    </form>
  );
}
```

### Step 3: استخدام Context مباشرة (إذا لزم الأمر)
```typescript
import { useCsrfContext } from '@/contexts/CsrfContext';

function MyComponent() {
  const { csrfToken, refreshToken, loading } = useCsrfContext();

  if (loading) return <p>جاري تحميل الحماية...</p>;

  console.log('CSRF Token:', csrfToken);
  
  return <div>محمي بـ CSRF Token ✓</div>;
}
```

---

## أمثلة الاستخدام

### مثال 1: استمارة إنشاء مستخدم

```typescript
import { useApiCall } from '@/hooks/useApiCall';

export function RegisterForm() {
  const { data, loading, error, execute } = useApiCall<{ id: string }>();
  const [formData, setFormData] = useState({ email: '', password: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await execute('/api/auth/register', 'post', formData);
    if (result) {
      console.log('تم التسجيل بنجاح:', result.id);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        placeholder="البريد الإلكتروني"
      />
      <input
        type="password"
        value={formData.password}
        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
        placeholder="كلمة المرور"
      />
      <button type="submit" disabled={loading}>
        {loading ? 'جاري...' : 'تسجيل'}
      </button>
      {error && <p style={{color: 'red'}}>{error.message}</p>}
    </form>
  );
}
```

### مثال 2: استمارة دفع

```typescript
export function PaymentForm() {
  const { data, loading, error, execute } = useApiCall<{ transactionId: string }>();

  const handlePayment = async () => {
    const paymentData = {
      amount: 100,
      currency: 'EGP',
      description: 'شراء منتج'
    };

    const result = await execute('/api/payments/create', 'post', paymentData);
    
    if (result) {
      console.log('تم الدفع:', result.transactionId);
      // إعادة توجيه للصفحة التالية
    }
  };

  return (
    <div>
      <button onClick={handlePayment} disabled={loading}>
        {loading ? 'معالجة...' : 'ادفع الآن'}
      </button>
      {error && <div style={{color: 'red'}}>خطأ: {error.message}</div>}
    </div>
  );
}
```

### مثال 3: حذف مورد (DELETE)

```typescript
export function DeleteResourceButton({ resourceId }: { resourceId: string }) {
  const { error, execute } = useApiCall<{ message: string }>();

  const handleDelete = async () => {
    if (confirm('هل أنت متأكد؟')) {
      const result = await execute(`/api/resource/${resourceId}`, 'delete');
      if (result) {
        console.log('تم الحذف بنجاح');
      }
    }
  };

  return (
    <div>
      <button onClick={handleDelete} style={{color: 'red'}}>
        حذف
      </button>
      {error && <p style={{color: 'red'}}>{error.message}</p>}
    </div>
  );
}
```

---

## معالجة الأخطاء

### 1. CSRF Token Invalid (403)
عند فشل التحقق من token:

```typescript
// axiosInterceptor يعيد تلقائياً:
// 1. جلب token جديد
// 2. إضافته إلى الطلب الأصلي
// 3. إعادة محاولة الطلب
// 4. إذا فشل مجدداً → ترجع error
```

### 2. Network Error
```typescript
const { data, loading, error, execute } = useApiCall({
  onError: (error) => {
    if (error.message.includes('Network')) {
      console.log('خطأ في الاتصال - تحقق من الشبكة');
    }
  }
});
```

### 3. CSRF Initialization Failed
```typescript
import { CsrfProvider } from '@/contexts/CsrfContext';

// في main.tsx
<CsrfProvider>
  {/* إذا فشل التحميل، سيظهر loading indicator */}
  <App />
</CsrfProvider>
```

---

## الاختبار

### اختبار 1: تحقق من إضافة Token
```typescript
// في DevTools Console:
localStorage.getItem('csrf_token') // يجب أن يحتوي على token

// في Network Tab:
// POST /api/user
// Headers → X-CSRF-Token: [token value]
```

### اختبار 2: اختبار Token Refresh
```typescript
// امسح token من localStorage وحاول إرسال طلب
localStorage.removeItem('csrf_token');
// axiosInterceptor سيجلب token جديد تلقائياً
```

### اختبار 3: اختبار Error Handling
```typescript
// استبدل CSRF token بقيمة خاطئة
localStorage.setItem('csrf_token', 'invalid_token');
// حاول إرسال طلب - يجب أن يتم تحديثه تلقائياً
```

### اختبار 4: اختبار Request Queue
```typescript
// أرسل طلبات متعددة بسرعة قبل تحديث token
Promise.all([
  execute('/api/endpoint1', 'post'),
  execute('/api/endpoint2', 'post'),
  execute('/api/endpoint3', 'post')
]);
// يجب أن تنجح جميعاً مع token واحد
```

---

## التحديثات المطلوبة

### تحديث البيئة (`.env`)
```env
VITE_API_URL=http://localhost:3001/api
```

### تحديث `tsconfig.json` (إذا لم يكن موجود)
تأكد من وجود alias `@/`:
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

### تحديث `vite.config.ts`
```typescript
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

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

## خطوات التطبيق

1. ✅ تم إنشاء `csrfService.ts` - إدارة token
2. ✅ تم إنشاء `axiosInterceptor.ts` - إضافة تلقائية للـ header
3. ✅ تم إنشاء `useCsrfToken.ts` - React hook
4. ✅ تم إنشاء `useApiCall.ts` - API calls hook
5. ✅ تم إنشاء `CsrfContext.tsx` - Application-wide provider
6. ⏳ **التالي:** تحديث `src/main.tsx` لاستخدام CsrfProvider
7. ⏳ **التالي:** تحديث جميع API calls لاستخدام `useApiCall`
8. ⏳ **التالي:** الاختبار الشامل

---

## ملخص الأمان

✅ **CSRF Protection:** كل POST/PUT/DELETE يحتوي على token  
✅ **Token Refresh:** تحديث تلقائي عند الحاجة  
✅ **Error Recovery:** إعادة محاولة تلقائية عند فشل  
✅ **Queue Management:** معالجة الطلبات المتزامنة بشكل آمن  
✅ **localStorage Expiry:** Token ينتهي بعد ساعة واحدة  

---

## الخطوة التالية: Phase 5

بعد إكمال Phase 4، سننتقل إلى:
- **Phase 5: Production Hardening**
  - إصلاح مشكلة csurf على Render
  - تدوير مفاتيح API (Firebase, Paymob, Supabase)
  - تفعيل Row Level Security على جميع الجداول
  - فحص الأسرار في Git history

---

**Status:** 🟠 Phase 4 - In Progress  
**Completion Estimate:** 30-40 دقيقة  
**Priority:** 🔴 HIGH - جزء حرج من الحماية
