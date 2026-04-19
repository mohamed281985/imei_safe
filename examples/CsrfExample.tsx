// examples/CsrfExample.tsx
// أمثلة عملية لاستخدام CSRF hooks في المكونات

import { useApiCall } from '../src/hooks/useApiCall';
import { useCsrfToken } from '../src/hooks/useCsrfToken';
import { useCsrfContext } from '../src/contexts/CsrfContext';
import { useState } from 'react';

/**
 * مثال 1: استمارة تسجيل بسيطة
 */
export function RegisterFormExample() {
  const { data, loading, error, execute } = useApiCall<{ userId: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = await execute('/api/auth/register', 'post', {
      email,
      password
    });

    if (result) {
      console.log('✅ تم التسجيل:', result.userId);
      // إعادة توجيه المستخدم
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="البريد الإلكتروني"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="كلمة المرور"
      />
      <button type="submit" disabled={loading}>
        {loading ? 'جاري التسجيل...' : 'تسجيل'}
      </button>
      {error && <p style={{ color: 'red' }}>❌ {error.message}</p>}
    </form>
  );
}

/**
 * مثال 2: استمارة دفع مع معالجة أخطاء متقدمة
 */
export function PaymentFormExample() {
  const { data, loading, error, execute } = useApiCall<{ transactionId: string }>();
  const [amount, setAmount] = useState('');

  const handlePayment = async () => {
    if (!amount) {
      alert('يرجى إدخال المبلغ');
      return;
    }

    const result = await execute('/api/payments/process', 'post', {
      amount: parseFloat(amount),
      currency: 'EGP'
    });

    if (result) {
      console.log('✅ تم الدفع:', result.transactionId);
      setAmount('');
      // إعادة توجيه للشكر
    }
  };

  return (
    <div>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="المبلغ"
      />
      <button onClick={handlePayment} disabled={loading}>
        {loading ? 'معالجة...' : 'ادفع'}
      </button>
      
      {error && (
        <div style={{ 
          backgroundColor: '#ffebee', 
          color: '#c62828', 
          padding: '10px',
          borderRadius: '4px'
        }}>
          <strong>خطأ:</strong> {error.message}
        </div>
      )}
    </div>
  );
}

/**
 * مثال 3: حذف مورد مع تأكيد
 */
export function DeleteResourceExample({ resourceId }: { resourceId: string }) {
  const { loading, error, execute } = useApiCall<{ message: string }>();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = async () => {
    const result = await execute(
      `/api/resources/${resourceId}`,
      'delete'
    );

    if (result) {
      console.log('✅ تم الحذف:', result.message);
      setShowConfirm(false);
      // تحديث الصفحة أو الـ state
    }
  };

  return (
    <div>
      {!showConfirm ? (
        <button onClick={() => setShowConfirm(true)} style={{ color: 'red' }}>
          حذف
        </button>
      ) : (
        <div style={{ backgroundColor: '#fff3cd', padding: '10px' }}>
          <p>هل أنت متأكد؟ هذا الإجراء لا يمكن التراجع عنه</p>
          <button
            onClick={handleDelete}
            disabled={loading}
            style={{ backgroundColor: '#dc3545', color: 'white' }}
          >
            {loading ? 'جاري الحذف...' : 'تأكيد الحذف'}
          </button>
          <button onClick={() => setShowConfirm(false)}>إلغاء</button>
        </div>
      )}
      
      {error && (
        <p style={{ color: 'red' }}>❌ {error.message}</p>
      )}
    </div>
  );
}

/**
 * مثال 4: استخدام Direct Hook (مدير الـ token)
 */
export function CsrfTokenStatusExample() {
  const { csrfToken, loading, error, refresh } = useCsrfToken();

  return (
    <div style={{ padding: '10px', border: '1px solid gray' }}>
      <h3>حالة CSRF Token</h3>
      
      {loading && <p>⏳ جاري جلب Token...</p>}
      {error && <p style={{ color: 'red' }}>❌ خطأ: {error.message}</p>}
      
      {csrfToken && (
        <div>
          <p>✅ Token موجود (طول: {csrfToken.length} حرف)</p>
          <p>Token: {csrfToken.substring(0, 20)}...</p>
        </div>
      )}
      
      <button onClick={refresh}>تحديث Manual</button>
    </div>
  );
}

/**
 * مثال 5: استخدام Context (Application-wide)
 */
export function AppStatusExample() {
  const { csrfToken, loading, error, refreshToken } = useCsrfContext();

  if (loading) {
    return <div>⏳ جاري تحميل الحماية...</div>;
  }

  if (error) {
    return (
      <div style={{ color: 'red' }}>
        ❌ خطأ في الحماية: {error.message}
        <button onClick={refreshToken}>إعادة محاولة</button>
      </div>
    );
  }

  return (
    <div style={{ color: 'green' }}>
      ✅ التطبيق محمي بـ CSRF Token
    </div>
  );
}

/**
 * مثال 6: استمارة تحديث الملف الشخصي مع Retry
 */
export function UpdateProfileExample({ userId }: { userId: string }) {
  const { data, loading, error, execute, reset } = useApiCall<{ success: boolean }>();
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = await execute(
      `/api/users/${userId}`,
      'put',
      formData
    );

    if (result) {
      console.log('✅ تم تحديث الملف الشخصي');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        placeholder="الاسم"
      />
      <input
        type="tel"
        value={formData.phone}
        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        placeholder="الهاتف"
      />
      <input
        type="text"
        value={formData.address}
        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
        placeholder="العنوان"
      />
      
      <button type="submit" disabled={loading}>
        {loading ? 'جاري التحديث...' : 'حفظ التغييرات'}
      </button>
      
      {error && (
        <div style={{ color: 'red' }}>
          ❌ {error.message}
          <button type="button" onClick={reset}>إغلاق</button>
        </div>
      )}
      
      {data?.success && (
        <div style={{ color: 'green' }}>
          ✅ تم الحفظ بنجاح
        </div>
      )}
    </form>
  );
}

/**
 * مثال 7: دالة مساعدة للـ API calls العامة
 */
export async function makeSecureApiCall<T = any>(
  url: string,
  method: string = 'get',
  data?: any
): Promise<T | null> {
  try {
    // استيراد axios instance
    const axiosModule = await import('../src/services/axiosInterceptor');
    const axiosInstance = axiosModule.default;
    
    let response: any;
    switch (method.toLowerCase()) {
      case 'post':
        response = await axiosInstance.post(url, data);
        break;
      case 'put':
        response = await axiosInstance.put(url, data);
        break;
      case 'delete':
        response = await axiosInstance.delete(url);
        break;
      default:
        response = await axiosInstance.get(url);
    }
    
    return response.data as T;
  } catch (error) {
    console.error('API Error:', error);
    return null;
  }
}

/**
 * مثال 8: جدول مع أزرار تحرير وحذف
 */
export function ResourceTableExample({ resources }: { resources: any[] }) {
  const { execute } = useApiCall();

  const handleEdit = async (id: string, updates: any) => {
    await execute(`/api/resources/${id}`, 'put', updates);
    // تحديث الجدول
  };

  const handleDelete = async (id: string) => {
    if (confirm('حذف؟')) {
      await execute(`/api/resources/${id}`, 'delete');
      // تحديث الجدول
    }
  };

  return (
    <table>
      <thead>
        <tr>
          <th>الاسم</th>
          <th>الإجراءات</th>
        </tr>
      </thead>
      <tbody>
        {resources.map((resource) => (
          <tr key={resource.id}>
            <td>{resource.name}</td>
            <td>
              <button onClick={() => handleEdit(resource.id, { name: 'جديد' })}>
                تحرير
              </button>
              <button onClick={() => handleDelete(resource.id)} style={{ color: 'red' }}>
                حذف
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
