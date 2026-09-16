import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import PageContainer from '../components/PageContainer';
import BackButton from '../components/BackButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <PageContainer clearBackground edgeToEdge>
      <div
        className="relative z-0 flex min-h-[100dvh] w-full flex-col items-center justify-start overflow-x-hidden rounded-3xl px-3 pb-10 pt-[24vh] sm:px-4 sm:pb-16 sm:pt-[33vh]"
        style={{
          backgroundImage: "url('/login-background.jpeg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="relative z-10 flex w-full flex-col items-center">
        <div className="w-full max-w-lg">
          <Card className="rounded-xl border-t-4 border-t-orange-500 border-b-4 border-b-orange-500 shadow-[0_12px_35px_rgba(0,0,0,0.35)] glass-bg backdrop-blur-[28px] backdrop-saturate-150" style={{background: 'rgba(255,255,255,0.65)'}}>
            <CardHeader className="p-4 pb-1">
            <div className="relative flex items-center justify-center">
              <BackButton to="/welcome" className="!right-0 !left-auto absolute" />
              <CardTitle className="w-full text-2xl md:text-3xl font-bold text-orange-600 text-center tracking-tight">
                {t('login')}
              </CardTitle>
            </div>
          </CardHeader>
            <CardContent className="space-y-3 p-3 sm:p-4">
              <LoginForm hidePhoneField biometricButton={<BiometricButton />} />
              <AuthLinks />
            </CardContent>
          </Card>
        </div>
        </div>
      </div>
    </PageContainer>
  );
};

// زر جديد لتجربة window.Fingerprint
const BiometricButton: React.FC = () => {
  const { loginWithBiometricToken } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleBiometric = async () => {
    try {
      console.log('تشغيل handleBiometric...');
      const Fingerprint = (window as any).Fingerprint || ((window as any).cordova && (window as any).cordova.plugins && (window as any).cordova.plugins.fingerprint);
      if (!Fingerprint) {
        console.log('Fingerprint plugin not available');
        toast({ title: 'خطأ', description: 'Fingerprint plugin not available', variant: 'destructive' });
        return;
      }
      // طباعة محتوى window.Capacitor و window.cordova و window.SecureStorage
      console.log('window.Capacitor:', (window as any).Capacitor);
      console.log('window.Capacitor.Plugins:', (window as any).Capacitor?.Plugins);
      console.log('window.cordova:', (window as any).cordova);
      console.log('window.SecureStorage:', (window as any).SecureStorage);
      console.log('استدعاء Fingerprint.show...');
      Fingerprint.show({
        clientId: "MyApp",
        clientSecret: "password", // Only for Android
        disableBackup: true, // Disable PIN/password fallback
        localizedFallbackTitle: "Use PIN", // iOS
        localizedReason: "Authenticate with fingerprint", // iOS
      }, function(successResult) {
        (async () => {
          console.log('Fingerprint success callback:', successResult);
          toast({ title: 'نجاح', description: typeof successResult === 'object' ? JSON.stringify(successResult) : String(successResult) });
          // استخدام SecureStorage بدلاً من CapacitorSecureBiometricStorage
          if ((window as any).SecureStorage) {
            const ss = new (window as any).SecureStorage(
              () => { console.log('SecureStorage: Instance created for GET.'); },
              (error: any) => {
                console.error('SecureStorage: Instance creation failed for GET:', error); 
                toast({ title: 'خطأ فني', description: 'فشل تهيئة وحدة التخزين الآمنة. لا يمكن استخدام البصمة حالياً.', variant: 'destructive' });
                return; // لا نتابع إذا فشلت التهيئة
              },
              'my_app_storage'
            );
            await ss.get(
              async (token: string) => {
                console.log('تم جلب التوكن من SecureStorage:', token);
                if (token) {
                  const loginSuccess = await loginWithBiometricToken?.(token);
                  console.log('نتيجة loginWithBiometricToken:', loginSuccess);
                  if (loginSuccess) {
                    toast({ title: 'نجاح', description: 'تم تسجيل الدخول بالبصمة بنجاح' });
                    navigate('/dashboard');
                  } else {
                    toast({ title: 'خطأ', description: 'فشل التحقق من التوكن', variant: 'destructive' });
                  }
                } else {
                  toast({ title: 'خطأ', description: 'لم يتم العثور على توكن البصمة', variant: 'destructive' });
                }
              }, 
              (error: any) => {
                console.error('SecureStorage: Failed to get token.', typeof error === 'object' ? JSON.stringify(error) : String(error));
                // عرض رسالة خطأ أكثر وضوحًا للمستخدم
                toast({ title: 'البصمة غير مفعلة', description: 'لاستخدام البصمة، يرجى تسجيل الدخول بكلمة المرور مرة واحدة على الأقل.', variant: 'destructive', duration: 7000 });
              },
              'biometricAuthToken'
            );
          } else {
            toast({ title: 'خطأ', description: 'خدمة SecureStorage غير متوفرة', variant: 'destructive' });
          }
        })();
      }, function(errorResult) {
        console.log('Fingerprint error callback:', errorResult);
        toast({ title: 'خطأ', description: typeof errorResult === 'object' ? JSON.stringify(errorResult) : String(errorResult), variant: 'destructive' });
      });
    } catch (err) {
      console.error("Fingerprint auth failed:", err);
      toast({ title: 'خطأ', description: 'Authentication failed', variant: 'destructive' });
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
