import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Fingerprint } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// Define the interface for the Capacitor plugin
interface CapacitorSecureBiometricStorage {
  isAvailable(): Promise<{ isAvailable: boolean; error?: string }>;
  setItem(key: string, value: string, reason: string): Promise<{ value: string | null; error?: string }>;
}

const BIOMETRIC_AUTH_TOKEN_KEY = 'biometricAuthToken';

// Access the Capacitor plugin
const CapacitorSecureBiometricStorage = window.Capacitor?.Plugins?.CapacitorSecureBiometricStorage as CapacitorSecureBiometricStorage | undefined;

const EnableBiometricAuth: React.FC = () => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [isCheckingBiometrics, setIsCheckingBiometrics] = useState(true);

  useEffect(() => {
    const checkAvailability = async () => {
      const Fingerprint = (window as any).Fingerprint || ((window as any).cordova && (window as any).cordova.plugins && (window as any).cordova.plugins.fingerprint);
      
      if (!Fingerprint) {
        setIsBiometricAvailable(false);
        setIsCheckingBiometrics(false);
        return;
      }

      try {
        Fingerprint.isAvailable((result: any) => {
          setIsBiometricAvailable(true);
        }, (error: any) => {
          setIsBiometricAvailable(false);
        });
      } catch (error) {
        console.error('Error checking biometric availability:', error);
        setIsBiometricAvailable(false);
      } finally {
        setIsCheckingBiometrics(false);
      }
    };

    checkAvailability();
  }, []);

  const handleEnableBiometrics = async () => {
    if (!user || !(window as any).SecureStorage) return;

    try {
      // 1. جلب الجلسة الحالية للحصول على الـ refresh_token
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !sessionData.session) {
        toast({
          title: t('error'),
          description: t('session_not_found'),
          variant: 'destructive',
        });
        return;
      }

      const refreshToken = sessionData.session.refresh_token;

      // 2. حفظ الـ refresh_token في SecureStorage
      const ss = new (window as any).SecureStorage(() => {}, () => {}, 'my_app_storage');
      
      ss.set(
        () => {
          toast({
            title: t('success'),
            description: t('biometric_setup_success'),
          });
        },
        (error: any) => {
          toast({
            title: t('error'),
            description: t('biometric_setup_failed'),
            variant: 'destructive',
          });
        },
        BIOMETRIC_AUTH_TOKEN_KEY,
        refreshToken
      );
    } catch (error: any) {
      console.error('Error setting up biometric auth:', error);
      toast({
        title: t('error'),
        description: error.message || t('biometric_setup_failed'),
        variant: 'destructive',
      });
    }
  };


  if (!isBiometricAvailable || isCheckingBiometrics) {
    return null;
  }

  return (
  <div className="mb-6 p-4 glass-bg rounded-xl border border-imei-cyan border-opacity-20">
      <h3 className="text-white text-lg font-semibold mb-3">{t('biometric_auth')}</h3>
      <p className="text-gray-400 mb-4">{t('biometric_auth_description')}</p>
      <Button
        onClick={handleEnableBiometrics}
        className="w-full bg-imei-cyan hover:bg-imei-cyan/80"
      >
        <Fingerprint className="mr-2" />
        {t('enable_biometric_auth')}
      </Button>
    </div>
  );
};

export default EnableBiometricAuth;