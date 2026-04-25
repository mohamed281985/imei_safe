import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Mail, Store, User, Phone, MapPin, Briefcase, Lock, Eye, EyeOff, ShieldCheck, UserPlus, ArrowLeft } from 'lucide-react';
import CountryCodeSelector from '../components/CountryCodeSelector';
import { useToast } from '@/hooks/use-toast';
import PageContainer from '../components/PageContainer';
import { useScrollToTop } from '../hooks/useScrollToTop';
import { useLanguage } from '../contexts/LanguageContext';

export default function BusinessSignup() {
  useScrollToTop();
  const navigate = useNavigate();
  const { t } = useLanguage();
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
    role: 'free_business',
    store_name: '',
    address: '',
    business_type: '',
    // sensitive fields (phone, id_last6) are not kept here to avoid sending them to Auth metadata
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
    hasLetter: false,
    hasNumber: false,
    hasSpecial: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
    try {
      setPwdChecks({
        minLength: pw.length >= 8,
        hasLetter: /\p{L}/u.test(pw),
        hasNumber: /\d/.test(pw),
        hasSpecial: /[^\p{L}\d]/u.test(pw),
      });
    } catch (e) {
      setPwdChecks({
        minLength: pw.length >= 8,
        hasLetter: /[A-Za-z]/.test(pw),
        hasNumber: /\d/.test(pw),
        hasSpecial: /[\W_]/.test(pw),
      });
    }
  }, [formData.password]);

  // keep metadata in sync with formData and countryCode so signup payload is complete
  useEffect(() => {
    const fullPhoneNumber = countryCode + formData.phone;
    // Do NOT store sensitive fields (phone, id_last6) in the Auth metadata state.
    setMetadata({
      full_name: formData.ownerName,
      role: 'free_business',
      store_name: formData.storeName,
      address: formData.address,
      business_type: formData.businessType,
    });
  }, [formData, countryCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // تحقق من الصحة الأساسية للحقول قبل الإرسال
    const pw = formData.password || '';
    if (pw !== formData.confirmPassword) {
      toast({ title: '❌ خطأ في التحقق', description: 'كلمات المرور غير متطابقة', variant: 'destructive' });
      setLoading(false);
      return;
    }

    // قوة كلمة المرور: 8+ أحرف، على الأقل حرف (أي لغة)، رقم، ورمز خاص
    let strongPwdOk = false;
    try {
      strongPwdOk = /^(?=.*\p{L})(?=.*\d)(?=.*[^\p{L}\d]).{8,}$/u.test(pw);
    } catch (e) {
      strongPwdOk = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(pw);
    }
    if (!strongPwdOk) {
      toast({ title: '⚠️ كلمة مرور ضعيفة', description: 'يجب أن تحتوي على 8+ أحرف مع أحرف وأرقام ورموز خاصة', variant: 'destructive' });
      setLoading(false);
      return;
    }

    // تحقق من اسم المتجر واسم المالك والعنوان
    if (!formData.storeName || formData.storeName.trim().length < 2) {
      toast({ title: '❌ خطأ', description: 'اسم المتجر قصير جداً', variant: 'destructive' });
      setLoading(false);
      return;
    }
    if (!formData.ownerName || formData.ownerName.trim().length < 2) {
      toast({ title: '❌ خطأ', description: 'اسم المالك قصير جداً', variant: 'destructive' });
      setLoading(false);
      return;
    }
    if (!formData.address || formData.address.trim().length < 5) {
      toast({ title: '❌ خطأ', description: 'العنوان قصير جداً', variant: 'destructive' });
      setLoading(false);
      return;
    }

    // تحقق من رقم الهاتف (أرقام فقط، بين 7 و15 رقم بدون رمز الدولة)
    const fullPhoneNumber = countryCode + formData.phone;
    const digitsOnly = fullPhoneNumber.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      toast({ title: '❌ خطأ', description: 'رقم الهاتف غير صحيح', variant: 'destructive' });
      setLoading(false);
      return;
    }

    try {
      // Use Supabase client-side signup so Supabase sends verification email.
      // ensure signup metadata does NOT include sensitive fields
      const signupMetadata = { ...metadata };
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
        title: '✅ تم إرسال بريد التحقق',
        description: 'يرجى التحقق من بريدك الإلكتروني لإكمال التسجيل',
        duration: 9000,
      });

      // Create application-level `users` row on the server (encrypted) and include sensitive fields only here
      try {
        const returnedId = data?.user?.id;
        if (returnedId) {
          const payload = {
            id: returnedId,
            email: formData.email,
            metadata: {
              full_name: metadata.full_name,
              phone: fullPhoneNumber,
              id_last6: formData.id_last6,
              role: metadata.role,
              store_name: metadata.store_name,
              address: metadata.address,
              business_type: metadata.business_type
            }
          };
          await fetch('/api/create-app-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
      } catch (e) {
        console.warn('create-app-user error', e);
      }

      // Optionally redirect to a page telling user to check email
      setTimeout(() => { window.location.href = '/login'; }, 1200);
    } catch (error: any) {
      toast({ title: '❌ حدث خطأ', description: error?.message || String(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer>
      {/* عناصر ديكورية للخلفية */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100/50 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-orange-50/50 rounded-full blur-3xl"></div>
      </div>

      <div className="flex flex-col items-center justify-center min-h-screen px-0 py-8">
        {/* رأس الصفحة */}
        <div className="w-full max-w-md">
          <div className="relative bg-white/30 backdrop-blur-xl border border-white/20 rounded-2xl shadow-md overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-orange-400" />
            <div className="p-3">
              <div className="w-full max-w-md mb-4 relative mt-8">
          {/* صف واحد مدمج: مربع نقطي - عنوان مركزي - زر رجوع */}
          <div className="flex items-center justify-between w-full gap-3 px-2">
            {/* مربع النقاط */}
            <div className="flex-none">
              <svg className="w-10 h-10 sm:w-16 sm:h-16 opacity-100" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <defs>
                  <linearGradient id="dots-grad" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
                    <stop offset="0%" stopColor="#E8F9FF" />
                    <stop offset="50%" stopColor="#A8E1FF" />
                    <stop offset="100%" stopColor="#1E7BFF" />
                  </linearGradient>
                  <pattern id="dots-pattern-compact" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1.6" fill="#2b78ebff" opacity="0.25" />
                  </pattern>
                </defs>
                <rect width="40" height="40" fill="url(#dots-pattern-compact)" rx="6" />
              </svg>
            </div>

            {/* العنوان مركزي */}
            <div className="flex-1 text-center px-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-orange-500 leading-tight">
                {t('business_signup_title')}
              </h1>
            </div>

            {/* زر الرجوع */}
            <div className="flex-none">
              <button 
                onClick={() => navigate(-1)}
                className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-400 text-white rounded-full flex items-center justify-center shadow-md hover:scale-[0.98] transition-transform"
                aria-label="رجوع"
              >
                <ArrowLeft className="text-white w-4 h-4" />
              </button>
            </div>
          </div>

          {/* وصف أسفل الصف */}
          <div className="mt-2 text-center">
            <p className="text-gray-500 text-sm font-medium">أنشئ حسابك بسهولة وابدأ رحلتك معنا</p>
          </div>
              </div>

              <div className="relative px-0">
            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* البريد الإلكتروني */}
              <div className="space-y-1.5">
                <label className="block text-gray-700 text-sm font-bold pr-1 flex items-center gap-2">
                  <Mail size={16} className="text-blue-500" />
                  {t('email_label')}
                </label>
                <div className="relative group">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="user@example.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    className="input-field w-full h-12 px-4 rounded-2xl bg-transparent border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
                  />
                </div>
              </div>

              {/* اسم المحل */}
              <div className="space-y-1.5">
                <label className="block text-gray-700 text-sm font-bold pr-1 flex items-center gap-2">
                  <Store size={16} className="text-blue-500" />
                  {t('store_name_label')}
                </label>
                <div className="relative group">
                  <Input
                    name="storeName"
                    placeholder={t('store_name_placeholder')}
                    value={formData.storeName}
                    onChange={handleInputChange}
                    required
                    className="input-field w-full h-12 px-4 rounded-2xl bg-transparent border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
                  />
                </div>
              </div>

              {/* اسم صاحب المحل */}
              <div className="space-y-1.5">
                <label className="block text-gray-700 text-sm font-bold pr-1 flex items-center gap-2">
                  <User size={16} className="text-blue-500" />
                  {t('owner_name_label')}
                </label>
                <div className="relative group">
                  <Input
                    name="ownerName"
                    placeholder={t('owner_name_placeholder')}
                    value={formData.ownerName}
                    onChange={handleInputChange}
                    required
                    className="input-field w-full h-12 px-4 rounded-2xl bg-transparent border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
                  />
                </div>
              </div>

              {/* رقم الهاتف */}
              <div className="space-y-1.5">
                <label className="block text-gray-700 text-sm font-bold pr-1 flex items-center gap-2">
                  <Phone size={16} className="text-blue-500" />
                  {t('phone_label')}
                </label>
                <div className="flex gap-2">
                  <div className="w-1/3">
                    <CountryCodeSelector
                      value={countryCode}
                      onChange={setCountryCode}
                      disabled={loading}
                    />
                  </div>
                  <div className="relative flex-1 group">
                    <Input
                      name="phone"
                      type="tel"
                      placeholder={t('phone_placeholder')}
                      value={formData.phone}
                      onChange={handleInputChange}
                      required
                      className="input-field w-full h-12 px-4 rounded-2xl bg-transparent border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {/* عنوان المحل */}
              <div className="space-y-1.5">
                <label className="block text-gray-700 text-sm font-bold pr-1 flex items-center gap-2">
                  <MapPin size={16} className="text-blue-500" />
                  {t('address_label')}
                </label>
                <div className="relative group">
                  <Input
                    name="address"
                    placeholder={t('address_placeholder')}
                    value={formData.address}
                    onChange={handleInputChange}
                    required
                    className="input-field w-full h-12 px-4 rounded-2xl bg-transparent border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
                  />
                </div>
              </div>

              {/* نوع النشاط */}
              <div className="space-y-1.5">
                <label className="block text-gray-700 text-sm font-bold pr-1 flex items-center gap-2">
                  <Briefcase size={16} className="text-blue-500" />
                  {t('business_type_label')}
                </label>
                <div className="relative group">
                  <Input
                    name="businessType"
                    placeholder={t('business_type_placeholder')}
                    value={formData.businessType}
                    onChange={handleInputChange}
                    required
                    className="input-field w-full h-12 px-4 rounded-2xl bg-transparent border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
                  />
                </div>
              </div>

              {/* آخر 6 أرقام من البطاقة */}
              <div className="space-y-1.5">
                <label className="block text-gray-700 text-sm font-bold pr-1 flex items-center gap-2">
                  <Lock size={16} className="text-blue-500" />
                  {t('id_last_6_digits')}
                </label>
                <div className="relative group">
                  <Input
                    name="id_last6"
                    placeholder="******"
                    value={formData.id_last6}
                    onChange={handleInputChange}
                    required
                    maxLength={6}
                    className="input-field w-full h-12 px-4 rounded-2xl bg-transparent border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
                  />
                </div>
              </div>

              {/* كلمة المرور */}
              <div className="space-y-1.5">
                <label className="block text-gray-700 text-sm font-bold pr-1 flex items-center gap-2">
                  <Lock size={16} className="text-blue-500" />
                  {t('password_label')}
                </label>
                <div className="relative group">
                  <Input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="********"
                    value={formData.password}
                    onChange={handleInputChange}
                    onFocus={() => setPwdFocused(true)}
                    onBlur={() => setPwdFocused(false)}
                    required
                    className="input-field w-full h-12 pr-4 pl-12 rounded-2xl bg-transparent border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 left-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                
                {pwdFocused && (
                  <div className="mt-3 p-4 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <p className="text-xs font-bold text-blue-600 mb-1">متطلبات كلمة المرور:</p>
                    <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
                      <li className={`text-[10px] flex items-center gap-1 font-bold ${pwdChecks.minLength ? 'text-green-600' : 'text-gray-400'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${pwdChecks.minLength ? 'bg-green-600' : 'bg-gray-300'}`} /> {t('pwd_min_chars')}
                      </li>
                      <li className={`text-[10px] flex items-center gap-1 font-bold ${pwdChecks.hasLetter ? 'text-green-600' : 'text-gray-400'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${pwdChecks.hasLetter ? 'bg-green-600' : 'bg-gray-300'}`} /> {t('pwd_letter')}
                      </li>
                      <li className={`text-[10px] flex items-center gap-1 font-bold ${pwdChecks.hasNumber ? 'text-green-600' : 'text-gray-400'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${pwdChecks.hasNumber ? 'bg-green-600' : 'bg-gray-300'}`} /> {t('pwd_number')}
                      </li>
                      <li className={`text-[10px] flex items-center gap-1 font-bold ${pwdChecks.hasSpecial ? 'text-green-600' : 'text-gray-400'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${pwdChecks.hasSpecial ? 'bg-green-600' : 'bg-gray-300'}`} /> {t('pwd_special')}
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              {/* تأكيد كلمة المرور */}
              <div className="space-y-1.5 pb-2">
                <label className="block text-gray-700 text-sm font-bold pr-1 flex items-center gap-2">
                  <Lock size={16} className="text-blue-500" />
                  {t('confirm_password_label')}
                </label>
                <div className="relative group">
                  <Input
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="********"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    required
                    className="input-field w-full h-12 pr-4 pl-12 rounded-2xl bg-transparent border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 left-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {/* زر التسجيل */}
              <Button
                type="submit"
                disabled={loading || isEmailRegistered}
                className={`w-full h-14 rounded-2xl text-white text-lg font-bold flex items-center justify-center gap-2 shadow-[0_10px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_15px_25px_rgba(249,115,22,0.4)] transition-all active:scale-[0.98] ${
                  isEmailRegistered ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-orange-500 to-orange-600'
                }`}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t('registering')}
                  </div>
                ) : (
                  <>
                    <UserPlus size={22} />
                    {t('submit_button')}
                  </>
                )}
              </Button>

              {/* التذييل الأمني */}
              <div className="flex items-center justify-center gap-2 pt-4 border-t border-gray-100">
                <ShieldCheck size={18} className="text-green-500" />
                <p className="text-[11px] font-bold text-gray-500">
                  بياناتك آمنة ومحفوظة بشكل سري
                </p>
              </div>
            </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
