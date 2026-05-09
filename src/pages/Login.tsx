import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import PageContainer from '../components/PageContainer';
import BackButton from '../components/BackButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Logo from '../components/Logo';
import LoginForm from '../components/auth/LoginForm';
import AuthLinks from '../components/auth/AuthLinks';
import { Button } from '@/components/ui/button';
import { Fingerprint } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext'; // استيراد AuthContext
import { useScrollToTop } from '../hooks/useScrollToTop';

const Login: React.FC = () => {
  useScrollToTop();
  const { t } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { loginWithBiometricToken } = useAuth();

  // وظيفة لتشغيل البصمة تلقائياً أو عند الضغط على الزر
  const triggerBiometric = async (isAutoTrigger = false) => {
    try {
      const Fingerprint = (window as any).Fingerprint || ((window as any).cordova && (window as any).cordova.plugins && (window as any).cordova.plugins.fingerprint);
      
      if (!Fingerprint) {
        if (!isAutoTrigger) {
          toast({ title: t('error'), description: t('fingerprint_plugin_not_available'), variant: 'destructive' });
        }
        return;
      }

      // التحقق من وجود توكن قبل إظهار واجهة البصمة
      if (!(window as any).SecureStorage) return;
      
      const ss = new (window as any).SecureStorage(() => {}, () => {}, 'my_app_storage');
      
      ss.get(
        (token: string) => {
          if (!token) {
            if (!isAutoTrigger) toast({ title: t('error'), description: t('biometric_token_not_found'), variant: 'destructive' });
            return;
          }

          // إذا وجدنا توكن، نظهر واجهة البصمة
          Fingerprint.show({
            clientId: "MyApp",
            clientSecret: "password",
            disableBackup: true,
            localizedFallbackTitle: "Use PIN",
            localizedReason: "Authenticate with fingerprint",
          }, function(successResult) {
            (async () => {
              const success = await loginWithBiometricToken?.(token);
              if (success) {
                localStorage.removeItem('auto_logged_out');
                localStorage.removeItem('manual_logout');
                navigate('/dashboard', { replace: true });
              } else {
                toast({ title: t('error'), description: t('biometric_login_failed'), variant: 'destructive' });
              }
            })();
          }, function(errorResult) {
            console.debug('Fingerprint authentication failed');
            if (!isAutoTrigger) toast({ title: t('error'), description: t('authentication_failed'), variant: 'destructive' });
          });
        },
        () => {
          if (!isAutoTrigger) toast({ title: t('error'), description: t('biometric_not_activated_desc'), variant: 'destructive' });
        },
        'biometricAuthToken'
      );
    } catch (err) {
      console.error("Fingerprint auth failed:", err);
    }
  };

  // طلب صلاحية استقبال الإشعارات والتحقق من الخروج التلقائي
  useEffect(() => {
    import('@/lib/fcm-capacitor').then(mod => {
      mod.registerFCMToken();
    });

    const autoLoggedOut = localStorage.getItem('auto_logged_out');
    if (autoLoggedOut === 'true') {
      // إذا كان خروجاً تلقائياً، نحاول تشغيل البصمة مباشرة
      setTimeout(() => triggerBiometric(true), 1000); // تأخير بسيط لضمان تحميل الإضافات
    }
  }, []);

  return (
    <PageContainer>
      <div className="flex flex-col items-center justify-center min-h-screen p-2">
        <div className="w-full flex items-center justify-center mb-6 mt-4">
          <div className="flex-1 flex justify-center">
            <Logo size="lg" className="mb-6" />
          </div>
        </div>
        <div className="w-full max-w-md mt-2">
          <Card className="shadow-md border-t-4 border-t-orange-500 glass-bg" style={{background: 'rgba(255,255,255,0.18)'}}>
            <CardHeader className="pb-2">
            <div className="relative flex items-center justify-center">
              <BackButton to="/welcome" className="!right-0 !left-auto absolute" />
              <CardTitle className="w-full text-2xl md:text-3xl font-bold text-orange-600 text-center tracking-tight">
                {t('login')}
              </CardTitle>
            </div>
          </CardHeader>
            <CardContent className="space-y-4 p-2">
              <LoginForm hidePhoneField biometricButton={<BiometricButton onTrigger={() => triggerBiometric(false)} />} />
              <AuthLinks />
              <div className="text-center text-base md:text-lg font-bold mt-2">
                <Link to="/forgot-password" className="text-orange-500 hover:underline">
                  {t('forgot_password')}
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
};

// زر جديد لتجربة window.Fingerprint
const BiometricButton: React.FC<{ onTrigger: () => void }> = ({ onTrigger }) => {
  return (
    <Button
      type="button" 
      onClick={onTrigger}
      className="rounded-full w-12 h-12 p-0 flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white"
    >
      <Fingerprint className="h-10 w-10 text-white" />
    </Button>
  );
};

export default Login;
