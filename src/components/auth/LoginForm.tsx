import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ArrowRight, Eye, EyeOff, Mail, Lock, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/supabase'; // استيراد supabase

// إضافة prop لإخفاء حقل رقم الهاتف
interface LoginFormProps {
  hidePhoneField?: boolean;
  biometricButton?: React.ReactNode; // Add this prop
}

export function LoginForm({
  hidePhoneField,
  biometricButton,
}: LoginFormProps) {
  const { login, logout, error } = useAuth();
  const { t, language } = useLanguage();
  const isRTL = language === 'ar';
  const navigate = useNavigate();
  const { toast } = useToast();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const redirect = params.get('redirect');
  const requestedReturnTo = location.state?.returnTo || redirect;
  const allowedReturnPaths = ['/register-phone', '/report', '/ownership-transfer', '/businesstransfer', '/BusinessTransferbuy', '/BusinessTransfersell'];
  const safeRedirect = allowedReturnPaths.includes(requestedReturnTo)
    ? requestedReturnTo
    : null;
  
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLoginError(null);
    
    try {
      // الآن دالة login ستقوم بالتحقق من حالة الحساب قبل تسجيل الدخول
      const result = await login(email, password, rememberMe) as { 
        success: boolean; 
        needsProfileCompletion?: boolean; 
        error?: string; 
      };
      
      if (result.success) {
        // تم تسجيل الدخول بنجاح والحساب ليس محظوراً
        toast({
          title: t('login_successful'),
          description: t('welcome_back')
        });

        if (result.needsProfileCompletion) {
          toast({
            title: 'إكمال الملف الشخصي',
            description: 'يرجى إكمال بياناتك التجارية للمتابعة.',
            variant: 'destructive',
          });
          navigate('/business-profile-complete', { replace: true });
        } else {
          if (safeRedirect) {
            navigate(safeRedirect, { replace: true, state: location.state?.returnState });
          } else {
            navigate('/dashboard', { replace: true });
          }
        }
      } else {
        if (result.error === 'account_pending_review') {
          setLoginError('الحساب قيد المراجعة بعد إعادة إرسال البيانات. يرجى الانتظار حتى اعتماد الحساب.');
          toast({ title: 'الحساب قيد المراجعة', description: 'سيتم تفعيل الحساب بعد انتهاء مراجعة البيانات.', variant: 'destructive' });
          return;
        }
        if (result.error === 'business_pending_review') {
          setLoginError('النشاط التجاري قيد المراجعة. عاود تسجيل الدخول في وقت لاحق بعد اعتماد الطلب.');
          toast({ title: 'النشاط التجاري قيد المراجعة', description: 'عاود تسجيل الدخول في وقت لاحق بعد انتهاء المراجعة.', variant: 'destructive' });
          return;
        }

        // التعامل مع رسالة الخطأ الجديدة من AuthContext
        if (result.error === 'user_banned') {
            setLoginError(t('account_banned_message'));
            toast({ title: t('account_banned_title'), description: t('account_banned_description'), variant: 'destructive' });
            return; // منع أي إجراء آخر
        }

        setLoginError(t('invalid_credentials'));
        toast({
          title: t('login_failed'),
          description: t('invalid_credentials'),
          variant: 'destructive'
        });
      }
    } catch (err) {
      console.error('Login error:', err);
      setLoginError(t('unexpected_error'));
      toast({
        title: t('login_error'),
        description: t('unexpected_error'),
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Placeholder for handleFingerprintLogin function
  const handleFingerprintLogin = () => {
    toast({
      title: t('fingerprint_login'),
      description: t('fingerprint_login_not_available')
    });
    // Implement your fingerprint login logic here
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" dir={isRTL ? 'rtl' : 'ltr'}>
      {loginError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{loginError}</AlertDescription>
        </Alert>
      )}

      <div>
        <label htmlFor="email" className="sr-only">
          {t('email')}
        </label>
        <div className="relative">
          <div className={`pointer-events-none absolute inset-y-0 flex items-center ${isRTL ? 'right-4' : 'left-4'}`}>
            <Mail size={21} className="text-slate-500" />
          </div>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`h-14 w-full rounded-xl border-2 border-[#dce4f0] bg-[#f3f6fc] text-base text-[#172d4d] placeholder:text-slate-500 focus-visible:border-sky-400 focus-visible:ring-sky-200 ${isRTL ? 'pr-12 text-right' : 'pl-12 text-left'}`}
            placeholder={t('email')}
            required
          />
        </div>
      </div>
      {/* إخفاء حقل رقم الهاتف إذا كان hidePhoneField = true */}
      {!hidePhoneField && (
        <div>
          <label htmlFor="phoneNumber" className="mb-1 block text-sm font-medium text-slate-800">
            {t('phone_number')}
          </label>
          <div className="relative">
            <div className={`pointer-events-none absolute inset-y-0 flex items-center ${isRTL ? 'right-4' : 'left-4'}`}>
              <Phone size={18} className="text-gray-400" />
            </div>
            <Input
              id="phoneNumber"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className={`h-14 w-full rounded-xl border-2 border-[#dce4f0] bg-[#f3f6fc] text-base text-[#172d4d] ${isRTL ? 'pr-12 text-right' : 'pl-12 text-left'}`}
              placeholder="+1234567890"
            />
          </div>
        </div>
      )}
      
      <div>
        <label htmlFor="password" className="sr-only">
          {t('password')}
        </label>
        <div className="relative">
          <div className={`pointer-events-none absolute inset-y-0 flex items-center ${isRTL ? 'right-4' : 'left-4'}`}>
            <Lock size={21} className="text-slate-500" />
          </div>
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`h-14 w-full rounded-xl border-2 border-[#dce4f0] bg-[#f3f6fc] text-base text-[#172d4d] placeholder:text-slate-500 focus-visible:border-sky-400 focus-visible:ring-sky-200 ${isRTL ? 'pl-14 pr-12 text-right' : 'pl-12 pr-14 text-left'}`}
            placeholder={t('password')}
            required
          />
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className={`absolute inset-y-0 flex h-full w-10 items-center justify-center rounded-md ${isRTL ? 'left-3' : 'right-3'}`}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <EyeOff size={20} className="text-slate-500" />
            ) : (
              <Eye size={20} className="text-slate-500" />
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600">
          {t(error)}
        </div>
      )}
      
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1">
        <Link to="/forgot-password" className="text-sm font-semibold text-orange-600 hover:text-orange-700 hover:underline">
          {t('forgot_password')}
        </Link>
        <div className="flex items-center gap-2">
          <input
            id="remember-me"
            name="remember-me"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-5 w-5 rounded border-2 border-slate-300 accent-sky-600 focus:ring-sky-500"
          />
          <label htmlFor="remember-me" className="block text-sm font-semibold text-[#102b55]">
            {t('remember_me')}
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button 
          type="submit" 
          className="flex h-14 flex-1 items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#0789e8] to-[#00a3ee] text-lg font-bold text-white shadow-[0_8px_18px_rgba(0,128,220,0.28)] transition-colors hover:from-[#0876cf] hover:to-[#0789df]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
            <ArrowRight className="h-5 w-5" />
          </span>
          <span dir="auto">{t('login')}</span>
        </Button>
        {biometricButton && (
          <div className="shrink-0">
            {biometricButton}
          </div>
        )} 
      </div>
    </form>
  );
}

export default LoginForm;
