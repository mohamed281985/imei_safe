import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { getSecureItem, setSecureItem, removeSecureItem } from '@/utils/secureStorage';

export default function Reset() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // حالة لتخزين صحة كلمة المرور (لكل شرط)
  const [passwordValid, setPasswordValid] = useState({
    length: false,
    number: false,
    uppercase: false,
    lowercase: false,
  });

  useEffect(() => {
    const handleIncoming = async () => {
      try {
        const params = new URLSearchParams(location.search || window.location.search || '');
        const code = params.get('code');
        const access = params.get('access_token') || params.get('token');
        if (access) {
          await setSecureItem('resetToken', access);
          return;
        }
        if (code) {
          setLoading(true);
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setError('فشل التحقق: ' + error.message);
          } else {
            const token = data?.session?.access_token;
            const refresh = data?.session?.refresh_token;
            if (token) {
              await setSecureItem('resetToken', token);
              if (refresh) await setSecureItem('resetRefresh', refresh);
            } else {
              setError('لم يتم العثور على رمز الجلسة بعد التحقق');
            }
          }
          setLoading(false);
        }
      } catch (e) {
        setError('خطأ أثناء معالجة الرابط');
        setLoading(false);
      }
    };
    handleIncoming();
  }, [location]);

  // دالة للتحقق من صحة كلمة المرور وتحديث الحالة
  const validatePassword = (value) => {
    setPasswordValid({
      length: value.length >= 8,
      number: /\d/.test(value),
      uppercase: /[A-Z]/.test(value),
      lowercase: /[a-z]/.test(value),
    });
  };

  // استدعاء دالة التحقق عند تغيير كلمة المرور
  const handlePasswordChange = (e) => {
    const value = e.target.value;
    setPassword(value);
    validatePassword(value);
  };

  const handleReset = async () => {
    setError('');
    setSuccess('');
    
    // التحقق من أن جميع شروط كلمة المرور محققة قبل الإرسال
    if (!Object.values(passwordValid).every(Boolean)) {
      setError('الرجاء استيفاء جميع شروط كلمة المرور');
      return;
    }

    setLoading(true);
    const token = await getSecureItem('resetToken');
    if (!token) {
      setError('رمز غير موجود');
      setLoading(false);
      return;
    }
    try {
      await supabase.auth.setSession({ access_token: token, refresh_token: token });
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError('❌ فشل: ' + error.message);
      } else {
        setSuccess('✅ تم التغيير بنجاح');
        removeSecureItem('resetToken');
        setTimeout(() => navigate('/login'), 1200);
      }
    } catch (e) {
      setError('حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '40px auto', padding: 24, background: '#222', borderRadius: 8, color: '#fff' }}>
      <h2 style={{ textAlign: 'center', color: '#ff9800', marginBottom: 20 }}>إعادة تعيين كلمة المرور</h2>
      
      <input
        type="password"
        placeholder="كلمة المرور الجديدة"
        onChange={handlePasswordChange}
        style={{ width: '100%', marginBottom: 12, padding: 12, borderRadius: 4, border: '1px solid #444', color: '#000', background: '#fff', outline: 'none' }}
        disabled={loading}
      />

      {/* قائمة شروط كلمة المرور */}
      <div style={{ fontSize: '0.85rem', marginBottom: 20, color: '#ccc' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
          <span style={{ color: passwordValid.length ? 'green' : 'red', marginLeft: 5 }}>
            {passwordValid.length ? '✓' : '✗'}
          </span>
          8 أحرف على الأقل
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
          <span style={{ color: passwordValid.number ? 'green' : 'red', marginLeft: 5 }}>
            {passwordValid.number ? '✓' : '✗'}
          </span>
          تحتوي على رقم
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
          <span style={{ color: passwordValid.uppercase ? 'green' : 'red', marginLeft: 5 }}>
            {passwordValid.uppercase ? '✓' : '✗'}
          </span>
          تحتوي على حرف كبير (A-Z)
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ color: passwordValid.lowercase ? 'green' : 'red', marginLeft: 5 }}>
            {passwordValid.lowercase ? '✓' : '✗'}
          </span>
          تحتوي على حرف صغير (a-z)
        </div>
      </div>

      <button 
        onClick={handleReset} 
        style={{ 
          width: '100%', 
          padding: 10, 
          background: '#ff9800', 
          color: '#fff', 
          border: 'none', 
          borderRadius: 4, 
          fontWeight: 'bold',
          opacity: (!Object.values(passwordValid).every(Boolean) || loading) ? 0.5 : 1,
          cursor: (!Object.values(passwordValid).every(Boolean) || loading) ? 'not-allowed' : 'pointer'
        }} 
        disabled={!Object.values(passwordValid).every(Boolean) || loading}
      >
        {loading ? 'جاري التغيير...' : 'تأكيد'}
      </button>
      
      {error && <div style={{ color: 'red', marginTop: 12, textAlign: 'center' }}>{error}</div>}
      {success && <div style={{ color: 'green', marginTop: 12, textAlign: 'center' }}>{success}</div>}
    </div>
  );
}
