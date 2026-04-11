import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';
import { supabase } from '@/lib/supabase';
import { Mail, Store, User, Phone, MapPin, Briefcase, Lock, Camera } from 'lucide-react';
import CountryCodeSelector from '../components/CountryCodeSelector';
import { useToast } from '@/hooks/use-toast';
import PageContainer from '../components/PageContainer';
import { useScrollToTop } from '../hooks/useScrollToTop';
import { useLanguage } from '../contexts/LanguageContext';

export default function BusinessSignup() {
  useScrollToTop();
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    storeName: '',
    ownerName: '',
    phone: '',
    address: '',
    businessType: '',
    id_last6: '',
    password: '',
    confirmPassword: ''
  });
  // metadata state synced from formData (ensures complete metadata sent)
  const [metadata, setMetadata] = useState({
    full_name: '',
    phone: '',
    role: 'free_business',
    store_name: '',
    address: '',
    business_type: '',
    id_last6: ''
  });
  // إضافة حالة رمز الدولة
  const [countryCode, setCountryCode] = useState('+20');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  
  // إضافة حالات للتحقق من البريد الإلكتروني
  const [emailExists, setEmailExists] = useState<boolean>(false);
  const [checkingEmail, setCheckingEmail] = useState<boolean>(false);
  const [lastCheckedEmail, setLastCheckedEmail] = useState<string>('');
  const [isEmailRegistered, setIsEmailRegistered] = useState<boolean>(false);

  // password checklist state
  const [pwdFocused, setPwdFocused] = useState<boolean>(false);
  const [pwdChecks, setPwdChecks] = useState({
    minLength: false,
    hasUpper: false,
    hasLower: false,
    hasNumber: false,
    hasSpecial: false,
  });

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let processedValue = value;
    if (name === 'phone') {
      processedValue = value.replace(/\D/g, '');
      if (processedValue.startsWith('0')) {
        processedValue = processedValue.replace(/^0+/, '');
      }
    }
    if (name === 'id_last6') {
      processedValue = value.replace(/\D/g, '').slice(0, 6);
    }
    setFormData(prev => ({
      ...prev,
      [name]: processedValue
    }));

    // Avoid client-side email enumeration: do not query server on each keystroke.
    if (name === 'email') {
      setEmailExists(false);
      setCheckingEmail(false);
      setIsEmailRegistered(false);
      setLastCheckedEmail('');
      // server will validate on submit
    }
  };

  // update password checks live
  useEffect(() => {
    const pw = formData.password || '';
    setPwdChecks({
      minLength: pw.length >= 8,
      hasUpper: /[A-Z]/.test(pw),
      hasLower: /[a-z]/.test(pw),
      hasNumber: /\d/.test(pw),
      hasSpecial: /[\W_]/.test(pw),
    });
  }, [formData.password]);

  // keep metadata in sync with formData and countryCode so signup payload is complete
  useEffect(() => {
    const fullPhoneNumber = countryCode + formData.phone;
    setMetadata({
      full_name: formData.ownerName,
      phone: fullPhoneNumber,
      role: 'free_business',
      store_name: formData.storeName,
      address: formData.address,
      business_type: formData.businessType,
      id_last6: formData.id_last6
    });
  }, [formData, countryCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // تحقق من الصحة الأساسية للحقول قبل الإرسال
    const pw = formData.password || '';
    if (pw !== formData.confirmPassword) {
      toast({ title: t('verification_error'), description: t('passwords_dont_match_message'), variant: 'destructive' });
      setLoading(false);
      return;
    }

    // قوة كلمة المرور: 8+ أحرف، حرف كبير، حرف صغير، رقم، رمز خاص
    const strongPwd = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!strongPwd.test(pw)) {
      toast({ title: t('weak_password'), description: t('password_strength_requirements') || 'Password must be 8+ chars with upper, lower, number and special char', variant: 'destructive' });
      setLoading(false);
      return;
    }

    // تحقق من اسم المتجر واسم المالك والعنوان
    if (!formData.storeName || formData.storeName.trim().length < 2) {
      toast({ title: t('error'), description: t('store_name_too_short') || 'Store name is too short', variant: 'destructive' });
      setLoading(false);
      return;
    }
    if (!formData.ownerName || formData.ownerName.trim().length < 2) {
      toast({ title: t('error'), description: t('owner_name_too_short') || 'Owner name is too short', variant: 'destructive' });
      setLoading(false);
      return;
    }
    if (!formData.address || formData.address.trim().length < 5) {
      toast({ title: t('error'), description: t('address_too_short') || 'Address is too short', variant: 'destructive' });
      setLoading(false);
      return;
    }

    // تحقق من رقم الهاتف (أرقام فقط، بين 7 و15 رقم بدون رمز الدولة)
    const fullPhoneNumber = countryCode + formData.phone;
    const digitsOnly = fullPhoneNumber.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      toast({ title: t('error'), description: t('invalid_phone_number') || 'Phone number appears invalid', variant: 'destructive' });
      setLoading(false);
      return;
    }

    try {
      // Use Supabase client-side signup so Supabase sends verification email.
      // ensure metadata phone is up-to-date
      const signupMetadata = { ...metadata, phone: fullPhoneNumber };
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: signupMetadata
        }
      });

      if (error) throw error;

      // Inform user to check email for verification link
      toast({
        title: t('verification_email_sent_title') || t('registration_success_title'),
        description: t('verification_email_sent_message') || 'A verification email was sent. Please confirm to complete registration.',
        duration: 9000,
      });

      // Create application-level `users` row on the server (encrypted)
      try {
        const payload = {
          id: data?.user?.id,
          email: formData.email,
          metadata: signupMetadata
        };
        fetch('/api/create-app-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch((e) => console.warn('create-app-user failed', e));
      } catch (e) {
        console.warn('create-app-user error', e);
      }

      // Optionally redirect to a page telling user to check email
      setTimeout(() => { window.location.href = '/login'; }, 1200);
    } catch (error: any) {
      toast({ title: t('error'), description: error?.message || String(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer>
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="w-full max-w-6xl mt-8 mb-8">
          <Card className="shadow-md border-t-4 border-t-orange-500 glass-bg p-6 md:p-8" style={{background: 'rgba(255,255,255,0.18)'}}>
            <h1 className="text-2xl font-semibold mb-2 text-center text-orange-500">{t('business_signup_title')}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-black text-sm font-medium mb-1">{t('email_label')}</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail size={18} className="text-gray-400" />
              </div>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder={t('email_placeholder')}
                value={formData.email}
                onChange={handleInputChange}
                required
                className={`input-field w-full pl-10 ${emailExists ? 'border-red-500' : ''}`}
              />
              {/* no live email existence indicator to prevent user enumeration */}
            </div>
          </div>
          <div>
            <label htmlFor="storeName" className="block text-black text-sm font-medium mb-1">{t('store_name_label')}</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Store size={18} className="text-gray-400" />
              </div>
              <Input
                id="storeName"
                name="storeName"
                placeholder={t('store_name_placeholder')}
                value={formData.storeName}
                onChange={handleInputChange}
                required
                className="input-field w-full pl-10"
              />
            </div>
          </div>
          <div>
            <label htmlFor="ownerName" className="block text-black text-sm font-medium mb-1">{t('owner_name_label')}</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User size={18} className="text-gray-400" />
              </div>
              <Input
                id="ownerName"
                name="ownerName"
                placeholder={t('owner_name_placeholder')}
                value={formData.ownerName}
                onChange={handleInputChange}
                required
                className="input-field w-full pl-10"
              />
            </div>
          </div>
          <div>
            <label htmlFor="phone" className="block text-black text-sm font-medium mb-1">{t('phone_label')}</label>
            <div className="flex gap-2 items-center">
              <CountryCodeSelector
                value={countryCode}
                onChange={setCountryCode}
                disabled={loading}
              />
              <div className="relative w-full">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Phone size={18} className="text-gray-400" />
                </div>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder={t('phone_placeholder')}
                  value={formData.phone}
                  onChange={handleInputChange}
                  required
                  className="input-field w-full pl-10"
                />
              </div>
            </div>
          </div>
          <div>
            <label htmlFor="address" className="block text-black text-sm font-medium mb-1">{t('address_label')}</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin size={18} className="text-gray-400" />
              </div>
              <Input
                id="address"
                name="address"
                placeholder={t('address_placeholder')}
                value={formData.address}
                onChange={handleInputChange}
                required
                className="input-field w-full pl-10"
              />
            </div>
          </div>
          <div>
            <label htmlFor="businessType" className="block text-black text-sm font-medium mb-1">{t('business_type_label')}</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Briefcase size={18} className="text-gray-400" />
              </div>
              <Input
                id="businessType"
                name="businessType"
                placeholder={t('business_type_placeholder')}
                value={formData.businessType}
                onChange={handleInputChange}
                required
                className="input-field w-full pl-10"
              />
            </div>
          </div>
          {/* حقل آخر 6 أرقام من البطاقة الشخصية */}
          <div>
            <label htmlFor="id_last6" className="block text-black text-sm font-medium mb-1">{t('id_last_6_digits')}</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className="text-gray-400" />
              </div>
              <Input
                id="id_last6"
                name="id_last6"
                placeholder={t('id_last_6_digits_placeholder')}
                value={formData.id_last6}
                onChange={handleInputChange}
                required
                className="input-field w-full pl-10"
                maxLength={6}
                pattern="[0-9]*"
                inputMode="numeric"
                style={{ direction: 'ltr', textAlign: 'left' }}
              />
            </div>
          </div>
          <div>
            <label htmlFor="password" className="block text-black text-sm font-medium mb-1">{t('password_label')}</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className="text-gray-400" />
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder={t('password_placeholder')}
                value={formData.password}
                onChange={handleInputChange}
                onFocus={() => setPwdFocused(true)}
                onBlur={() => setPwdFocused(false)}
                required
                className="input-field w-full pl-10"
              />
              {pwdFocused && (
                <div className="mt-2 text-sm text-gray-700 bg-white/80 p-2 rounded shadow-sm w-full">
                  <ul className="space-y-1">
                    <li className={pwdChecks.minLength ? 'text-green-600' : 'text-gray-600'}>
                      {pwdChecks.minLength ? '✓' : '○'} {t('pwd_min_chars')}
                    </li>
                    <li className={pwdChecks.hasUpper ? 'text-green-600' : 'text-gray-600'}>
                      {pwdChecks.hasUpper ? '✓' : '○'} {t('pwd_upper')}
                    </li>
                    <li className={pwdChecks.hasLower ? 'text-green-600' : 'text-gray-600'}>
                      {pwdChecks.hasLower ? '✓' : '○'} {t('pwd_lower')}
                    </li>
                    <li className={pwdChecks.hasNumber ? 'text-green-600' : 'text-gray-600'}>
                      {pwdChecks.hasNumber ? '✓' : '○'} {t('pwd_number')}
                    </li>
                    <li className={pwdChecks.hasSpecial ? 'text-green-600' : 'text-gray-600'}>
                      {pwdChecks.hasSpecial ? '✓' : '○'} {t('pwd_special')}
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-black text-sm font-medium mb-1">{t('confirm_password_label')}</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className="text-gray-400" />
              </div>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder={t('confirm_password_placeholder')}
                value={formData.confirmPassword}
                onChange={handleInputChange}
                required
                className="input-field w-full pl-10"
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={loading || isEmailRegistered} // تعطيل الزر إذا كان البريد مسجلاً
            className={`w-full text-white text-lg font-large py-3 ${isEmailRegistered ? 'bg-gray-500 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'} ${loading ? 'opacity-70' : ''}`}
          >
            {isEmailRegistered ? t('already_registered_email') : (loading ? t('registering') : t('submit_button'))}
          </Button>
        </form>
      </Card>
    </div>
    </div>
  </PageContainer>
  );
}
