import { useState, useRef } from 'react';
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
  // إضافة حالة رمز الدولة
  const [countryCode, setCountryCode] = useState('+20');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  
  // إضافة حالات للتحقق من البريد الإلكتروني
  const [emailExists, setEmailExists] = useState<boolean>(false);
  const [checkingEmail, setCheckingEmail] = useState<boolean>(false);
  const [lastCheckedEmail, setLastCheckedEmail] = useState<string>('');
  const [isEmailRegistered, setIsEmailRegistered] = useState<boolean>(false);

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

    // تعديل التحقق من البريد الإلكتروني
    if (name === 'email') {
      // إعادة تعيين الحالات
      setEmailExists(false);
      setCheckingEmail(false);

      // التحقق فقط إذا كان البريد الإلكتروني صالحاً
      if (value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setCheckingEmail(true);
        try {
          let emailExists = false;
          
          // 1. التحقق من جدول users
          const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('email')
            .eq('email', value);
            
          if (!usersError && usersData && usersData.length > 0) {
            emailExists = true;
          } else if (usersError) {
            console.error("Error checking users table:", usersError);
            
            // في حالة وجود خطأ في الصلاحيات، حاول استعلام بديل
            if (usersError.code === 'PGRST116' || usersError.code === 'PGRST202') {
              console.log("Permission error on users table, trying alternative");
              
              const { data: altData, error: altError } = await supabase
                .from('users')
                .select('id')
                .ilike('email', `%${value}%`)
                .limit(1);
                
              if (!altError && altData && altData.length > 0) {
                emailExists = true;
              }
            }
          }
          
          // 2. التحقق من جدول businesses إذا لم يتم العثور على البريد في users
          if (!emailExists) {
            const { data: businessesData, error: businessesError } = await supabase
              .from('businesses')
              .select('email')
              .eq('email', value);
              
            if (!businessesError && businessesData && businessesData.length > 0) {
              emailExists = true;
            } else if (businessesError) {
              console.error("Error checking businesses table:", businessesError);
              
              // في حالة وجود خطأ في الصلاحيات، حاول استعلام بديل
              if (businessesError.code === 'PGRST116' || businessesError.code === 'PGRST202') {
                console.log("Permission error on businesses table, trying alternative");
                
                const { data: altData, error: altError } = await supabase
                  .from('businesses')
                  .select('id')
                  .ilike('email', `%${value}%`)
                  .limit(1);
                  
                if (!altError && altData && altData.length > 0) {
                  emailExists = true;
                }
              }
            }
          }
          
          // تحديث الحالة بناءً على النتيجة النهائية
          setEmailExists(emailExists);
          setIsEmailRegistered(emailExists);
          
          if (emailExists) {
            toast({
              title: t('alert_title'),
              description: t('email_already_registered'),
              variant: "destructive",
            });
          }
          
          // تحديث آخر بريد تم فحصه
          setLastCheckedEmail(value);
        } catch (error: any) {
          setEmailExists(false);
          setIsEmailRegistered(false);
          console.error("Email verification error:", error);
          // تحديث آخر بريد تم فحصه حتى لو لم يتم العثور عليه
          setLastCheckedEmail(value);
        } finally {
          setCheckingEmail(false);
        }
      } else {
        // إذا كان البريد الإلكتروني فارغًا أو غير صالح، قم بتحديث آخر بريد تم فحصه
        setLastCheckedEmail('');
        setIsEmailRegistered(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // تحقق من كلمة المرور
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: t('verification_error'),
        description: t('passwords_dont_match_message'),
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }
    if (formData.password.length < 6) {
      toast({
        title: t('weak_password'),
        description: t('password_too_short_message'),
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    try {
      // 1. إرسال بيانات التسجيل إلى السيرفر (backend endpoint) ليقوم هو بعمل signup وإدراج السجلات
      const fullPhoneNumber = countryCode + formData.phone;
      const payload = {
        email: formData.email,
        password: formData.password,
        owner_name: formData.ownerName,
        store_name: formData.storeName,
        phone: fullPhoneNumber,
        address: formData.address,
        business_type: formData.businessType,
        id_last6: formData.id_last6
      };

      const resp = await fetch('/api/register-business', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody.error || 'Registration failed on server');
      }

      const respJson = await resp.json();
      console.log('Server register response:', respJson);

      toast({
        title: t('registration_success_title'),
        description: t('registration_success_message'),
        duration: 9000,
      });
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive'
      });
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
              {checkingEmail ? (
                <div className="text-sm text-orange-500 mt-1">{t('checking_email')}</div>
              ) : emailExists ? (
                <div className="text-sm text-red-500 mt-1">{t('email_already_registered')}</div>
              ) : null}
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
                required
                className="input-field w-full pl-10"
              />
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
