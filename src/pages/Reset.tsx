import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function Reset() {
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleReset = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    // Password strength validation: min 8 chars, at least one lowercase, one uppercase, one digit
    const pwd = password || '';
    const pwdValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(pwd);
    if (!pwdValid) {
      setError(t('password_requirements') || 'Password must be at least 8 characters and include uppercase, lowercase and a number.');
      setLoading(false);
      return;
    }
    // Supabase غالباً يرسل التوكنات داخل hash (#...) وليس query
    const queryParams = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const accessToken =
      hashParams.get('access_token') ||
      queryParams.get('access_token') ||
      queryParams.get('token') ||
      queryParams.get('resetToken');
    const refreshToken =
      hashParams.get('refresh_token') ||
      queryParams.get('refresh_token');
    if (!accessToken || !refreshToken) {
      setError(t('token_not_found'));
      setLoading(false);
      return;
    }
    try {
      // يتطلب توكنين صحيحين من رابط الاستعادة (access + refresh)
      const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (sessionError) {
        setError(t('failed') + ': ' + sessionError.message);
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(t('failed') + ': ' + error.message);
      } else {
        setSuccess(t('password_changed_successfully'));
        setTimeout(() => navigate('/login'), 1200);
      }
    } catch (e) {
      setError(t('unexpected_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '40px auto', padding: 24, background: '#222', borderRadius: 8, color: '#fff' }}>
      <h2 style={{ textAlign: 'center', color: '#ff9800' }}>
        {t('reset_password')}
      </h2>
      <input
        type="password"
        placeholder={t('new_password')}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 4, border: '1px solid #444', color: '#000', background: '#fff' }}
        disabled={loading}
      />
      <button onClick={handleReset} style={{ width: '100%', padding: 10, background: '#ff9800', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 'bold' }} disabled={loading}>
        {loading ? t('processing') : t('confirm')}
      </button>
      {error && <div style={{ color: 'red', marginTop: 12, textAlign: 'center' }}>{error}</div>}
      {success && <div style={{ color: 'green', marginTop: 12, textAlign: 'center' }}>{success}</div>}
    </div>
  );
}
