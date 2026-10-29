import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import BackButton from '../components/BackButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import LoginForm from '../components/auth/LoginForm';
import AuthLinks from '../components/auth/AuthLinks';
import { Button } from '@/components/ui/button';
import { Fingerprint, UserRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useScrollToTop } from '../hooks/useScrollToTop';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const languageOptions = [
  { code: 'en', name: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'ar', name: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629', flag: '\u{1F1EA}\u{1F1EC}' },
  { code: 'fr', name: 'Fran\u00e7ais', flag: '\u{1F1EB}\u{1F1F7}' },
  { code: 'hi', name: '\u0939\u093f\u0928\u094d\u0926\u0940', flag: '\u{1F1EE}\u{1F1F3}' },
] as const;

const Login: React.FC = () => {
  useScrollToTop();
  const { t, language, changeLanguage } = useLanguage();
  const navigate = useNavigate();
  
  return (
    <div 
      className="relative flex min-h-screen items-center justify-center overflow-x-hidden bg-cover bg-center bg-no-repeat px-4 py-8 sm:px-6"
      style={{ 
        backgroundImage: "url('/login-background.jpeg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <div className="flex w-full flex-col items-center justify-center py-12 sm:py-16">
        <div className="w-full max-w-2xl">
          <Card className="overflow-hidden rounded-[28px] border border-white/80 bg-white/95 shadow-[0_18px_55px_rgba(13,57,105,0.22)] backdrop-blur-sm"
                style={{ 
                  background: 'rgba(255, 255, 255, 0.96)',
                }}>
            <CardHeader className="px-5 pb-1 pt-4 sm:px-8 sm:pt-6">
              <div className="relative flex min-h-12 items-center justify-center">
                <DropdownMenu dir="ltr">
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={t('select_language')}
                      title={t('select_language')}
                      dir="ltr"
                      style={{ borderRadius: '9999px' }}
                      className="absolute left-0 z-10 inline-flex h-11 w-11 items-center justify-center !rounded-full border border-sky-100 bg-white p-0 text-slate-900 shadow-[0_4px_14px_rgba(15,67,110,0.16)] hover:border-sky-200 hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500"
                    >
                      <span className="text-xl font-bold leading-none" aria-hidden="true">
                        {languageOptions.find((option) => option.code === language)?.flag}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={6} dir="ltr" className="w-40 max-w-[calc(100vw-2rem)] rounded-xl border-sky-100 bg-white p-1.5 text-slate-900 shadow-lg">
                    {languageOptions.map((option) => (
                      <DropdownMenuItem
                        key={option.code}
                        onSelect={() => changeLanguage(option.code)}
                        dir="ltr"
                        className="w-full cursor-pointer gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:bg-sky-50 focus:text-sky-900"
                      >
                        <span className="text-lg leading-none" aria-hidden="true">{option.flag}</span>
                        <span className="font-medium" dir="auto">{option.name}</span>
                        {language === option.code && <span className="ml-auto text-sky-700" aria-label="Selected">✓</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <BackButton to="/welcome" className="!absolute !right-0 !left-auto !h-10 !w-10 !rounded-full !border !border-sky-100 !bg-white !p-0 !shadow-[0_4px_14px_rgba(15,67,110,0.16)] [&_svg]:!text-orange-500" />
                <CardTitle className="w-full px-14 text-center text-2xl font-bold text-[#102b55] sm:text-3xl">
                  {t('login')}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-5 pb-5 pt-2 sm:px-8 sm:pb-6">
              <LoginForm hidePhoneField biometricButton={<BiometricButton />} />
              <AuthLinks />
              <Button type="button" className="h-14 w-full gap-3 rounded-xl bg-[#ff7900] text-lg font-bold text-white shadow-[0_8px_18px_rgba(255,119,0,0.25)] hover:bg-[#e86a00] sm:text-xl" onClick={() => {
                sessionStorage.setItem('imei_guest_mode', 'true');
                navigate('/dashboard', { replace: true });
              }}>
                <UserRound size={25} />
                {t('guest_login')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
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
