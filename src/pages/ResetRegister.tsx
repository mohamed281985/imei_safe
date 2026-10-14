import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, useLocation } from 'react-router-dom';
import PageContainer from '@/components/PageContainer';
import AppNavbar from '@/components/AppNavbar';
import BackButton from '@/components/BackButton';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import { useLanguage } from '../contexts/LanguageContext';

export default function ResetRegister() {
  useScrollToTop();
  const { t } = useLanguage();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const imei = location.state?.imei; // جلب رقم IMEI من الحالة

  // عرض معاينة مقنّعة من الـ IMEI فقط (آخر 4 أرقام) لتقليل تسريب المعلومات الحساسة
  const maskedImei = imei ? `****${String(imei).slice(-4)}` : '';

  const handleReset = async () => {
    setError('');
    setLoading(true);

    // Password complexity: minimum 8 chars, at least one lowercase, one uppercase, and one digit
    const pwd = password || '';
    const pwdValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(pwd);
    if (!pwdValid) {
      setError(t('password_requirements') || 'Password must be at least 8 characters and include uppercase, lowercase and a number.');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError(t('passwords_dont_match'));
      setLoading(false);
      return;
    }

    if (!currentPassword.trim()) {
      setError(t('seller_password_required') || 'Current password is required.');
      setLoading(false);
      return;
    }

    if (imei) {
      // --- السلوك الجديد: إعادة تعيين كلمة مرور الهاتف ---
      try {
        // استخدام API السيرفر لضمان التعامل الصحيح مع البيانات المشفرة (IMEI)
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch('https://imei-safe.me/api/reset-phone-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ imei, currentPassword, newPassword: password })
        });

        if (!response.ok) {
          const result = await response.json();
          setError(t('failed') + ': ' + (result.error || 'Failed to reset password'));
        } else {
          toast({
            title: t('success_title'),
            description: t('password_changed_successfully'),
          });
          setTimeout(() => navigate('/report', { state: { imei } }), 2000);
        }
      } catch (e: any) {
        setError(t('unexpected_error') + ': ' + e.message);
      } finally {
        setLoading(false);
      }
    } else {
      setError(t('token_not_found'));
      setLoading(false);
    }
  };

  return (
    <PageContainer>
      <AppNavbar />
      <div className="flex items-center mb-6 gap-4">
        <BackButton to="/profile-menu" />
        <h1 className="text-2xl font-bold text-black">
          {t('reset_register_password')}
        </h1>
      </div>

      <div className="max-w-md mx-auto bg-gray-800 p-8 rounded-lg shadow-lg border border-gray-700">
        <div className="space-y-6">
          <p className="text-center text-gray-300">
            {t('changing_password_for_phone')}
            <span className="font-bold text-cyan-400 block mt-2">{maskedImei}</span>
          </p>
          
          <div className="space-y-2">
            <label htmlFor="currentPassword" className="block text-white font-medium mb-1">
              {t('seller_current_password')}
            </label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full"
              placeholder={t('enter_seller_current_password')}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-white font-medium mb-1">
              {t('new_password')}
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full"
              placeholder="********"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="block text-white font-medium mb-1">
              {t('confirm_password')}
            </label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full"
              placeholder="********"
              disabled={loading}
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <Button onClick={handleReset} className="w-full bg-orange-500 hover:bg-orange-600" disabled={loading}>
            {loading ? t('processing') : t('update_password')}
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
