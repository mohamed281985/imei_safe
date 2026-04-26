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
  // طلب صلاحية استقبال الإشعارات عند فتح صفحة تسجيل الدخول
  useEffect(() => {
    import('@/lib/fcm-capacitor').then(mod => {
      mod.registerFCMToken();
    });
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
              <LoginForm hidePhoneField biometricButton={<BiometricButton />} />
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
const BiometricButton: React.FC = () => {
  const { loginWithBiometricToken } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const handleBiometric = async () => {
    try {
      const Fingerprint = (window as any).Fingerprint || ((window as any).cordova && (window as any).cordova.plugins && (window as any).cordova.plugins.fingerprint);
      if (!Fingerprint) {
        toast({ title: t('error'), description: t('fingerprint_plugin_not_available'), variant: 'destructive' });
        return;
      }
      Fingerprint.show({
        clientId: "MyApp",
        clientSecret: "password", // Only for Android
        disableBackup: true, // Disable PIN/password fallback
        localizedFallbackTitle: "Use PIN", // iOS
        localizedReason: "Authenticate with fingerprint", // iOS
      }, function(successResult) {
        (async () => {
          // استخدام SecureStorage بدلاً من CapacitorSecureBiometricStorage
          if ((window as any).SecureStorage) {
            const ss = new (window as any).SecureStorage(
              () => { console.log('SecureStorage: Instance created for GET.'); },
              (error: any) => {
                console.error('SecureStorage: Instance creation failed for GET:', error); 
                toast({ title: t('secure_storage_init_failed_title'), description: t('secure_storage_init_failed_desc'), variant: 'destructive' });
                return; // لا نتابع إذا فشلت التهيئة
              },
              'my_app_storage'
            );
            await ss.get(
              async (token: string) => {
                if (token) {
                  const success = await loginWithBiometricToken?.(token);
                  if (success) {
                    navigate('/dashboard', { replace: true });
                  }
                } else {
                  toast({ title: t('error'), description: t('biometric_token_not_found'), variant: 'destructive' });
                }
              }, 
              (error: any) => {
                console.error('SecureStorage: Failed to get token.', typeof error === 'object' ? JSON.stringify(error) : String(error));
                // عرض رسالة خطأ أكثر وضوحًا للمستخدم
                toast({ title: t('biometric_not_activated_title'), description: t('biometric_not_activated_desc'), variant: 'destructive', duration: 7000 });
              },
              'biometricAuthToken'
            );
          } else {
            toast({ title: t('error'), description: t('secure_storage_not_available'), variant: 'destructive' });
          }
        })();
      }, function(errorResult) {
        console.debug('Fingerprint authentication failed');
        toast({ title: t('error'), description: t('authentication_failed'), variant: 'destructive' });
      });
    } catch (err) {
      console.error("Fingerprint auth failed:", err);
      toast({ title: t('error'), description: t('authentication_failed'), variant: 'destructive' });
    }
  };

  return (
    <Button
      type="button" 
      onClick={handleBiometric}
      className="rounded-full w-12 h-12 p-0 flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white"
    >
      <Fingerprint className="h-10 w-10 text-white" />
    </Button>
  );
};

export default Login;
