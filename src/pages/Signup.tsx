import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// Contexts
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { useScrollToTop } from '../hooks/useScrollToTop';

// UI Components
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Icons
import { Eye, EyeOff, Mail, Lock, User, Phone, CreditCard } from 'lucide-react';
import CountryCodeSelector from '../components/CountryCodeSelector';

// Custom Components
import PageContainer from '../components/PageContainer';
import Logo from '../components/Logo';
import BackButton from '../components/BackButton';
import { supabase } from '@/lib/supabase';

interface SignupFormData {
  email: string;
  username: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
  idLast6: string;
}

const Signup: React.FC = () => {
  useScrollToTop();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState<SignupFormData>({
    email: '',
    username: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
    idLast6: ''
  });
  
  const [emailExists, setEmailExists] = useState<boolean>(false);
  const [checkingEmail, setCheckingEmail] = useState<boolean>(false);
  const [lastCheckedEmail, setLastCheckedEmail] = useState<string>('');
  const [isEmailRegistered, setIsEmailRegistered] = useState<boolean>(false);
  // إضافة حالة رمز الدولة
  const [countryCode, setCountryCode] = useState('+20'); // الافتراضي مصر
  
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [pwdFocused, setPwdFocused] = useState<boolean>(false);
  const [pwdChecks, setPwdChecks] = useState({
    minLength: false,
    hasLetter: false,
    hasNumber: false,
    hasSpecial: false,
  });
  
  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let processedValue = value;
    
    if (name === 'phoneNumber' || name === 'idLast6') {
      processedValue = value.replace(/\D/g, '');
    }

    if (name === 'phoneNumber' && processedValue.startsWith('0')) {
      processedValue = processedValue.replace(/^0+/, '');
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
      // simple format validation stays; server will validate on submit
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSignupError(null);
    const { email, password, confirmPassword, username, phoneNumber, idLast6 } = formData;
    const fullPhoneNumber = countryCode + phoneNumber;

    if (password !== confirmPassword) {
      setSignupError(t('passwords_dont_match'));
      setIsSubmitting(false);
      return;
    }

    if (idLast6.length !== 6) {
      setSignupError(t('enter_id_last_6_correctly'));
      setIsSubmitting(false);
      return;
    }

    try {
      const isPasswordStrong = (p: string) => {
        if (!p) return false;
        // at least 8 chars, at least one letter (Unicode), one digit, and one special/non-alphanumeric
        try {
          return /^(?=.*\p{L})(?=.*\d)(?=.*[^\p{L}\d]).{8,}$/u.test(p);
        } catch (e) {
          // fallback for environments without Unicode property support
          return /^(?=.*[A-Za-z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(p);
        }
      };

      if (!isPasswordStrong(password)) {
        const msg = t ? (t('password_requirements') || 'Password must be at least 8 characters and include letters, number and special character.') : 'Password must be at least 8 characters and include letters, number and special character.';
        setSignupError(msg);
        setIsSubmitting(false);
        return;
      }
      // Use client-side signUp so Supabase sends the verification email (same as BusinessSignup)
      // Do NOT include sensitive fields (phone, id_last6) in the Auth metadata.
      const metadata = {
        full_name: username,
        role: 'customer'
      };

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: metadata
        }
      } as any);

      if (error) {
        setSignupError(error.message || t('signup_error'));
      } else {
        toast({ title: t('signup_successful'), description: t('verification_email_sent') });

        // If Supabase returned a user id immediately, send sensitive data ONLY to our backend
        // so it can encrypt and store them safely. Do not store phone/id_last6 in Supabase Auth metadata.
        try {
          const returnedId = data?.user?.id;
          if (returnedId) {
            const payload = {
              id: returnedId,
              email,
              metadata: {
                full_name: username,
                phone: fullPhoneNumber,
                id_last6: idLast6,
                role: 'customer'
              }
            };
            try {
              await fetch('/api/create-app-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            } catch (e) {
              if (import.meta.env.MODE !== 'production') console.warn('create-app-user call failed', e);
            }
          }
        } catch (e) { /* ignore */ }

        navigate('/login');
      }
    } catch (error: any) {
      setSignupError(error?.message || t('signup_error'));
    } finally {
      setIsSubmitting(false);
    }
  };

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

  return (
      <PageContainer>
        <Card className="w-full shadow-lg border-t-4 border-t-orange-500 bg-transparent mt-8">
        <CardHeader className="pb-0">
          <CardTitle className="text-2xl font-bold text-orange-600 text-center">
            <div className="flex justify-center mb-6">
              <Logo size="lg" />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
            {signupError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>
                  <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{signupError}</span>
                </AlertDescription>
              </Alert>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="w-full max-w-full mb-6">
                <div className="flex items-center justify-between w-full gap-3">
                  {/* dotted square */}
                  <div className="flex-none">
                    <svg className="w-10 h-10 sm:w-14 sm:h-14" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                      <defs>
                        <linearGradient id="signup-dots-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                          <stop offset="0%" stopColor="#D8F6FF" />
                          <stop offset="50%" stopColor="#66C8FF" />
                          <stop offset="100%" stopColor="#0F62FF" />
                        </linearGradient>
                        <pattern id="signup-dots-pattern" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
                          <circle cx="1.5" cy="1.5" r="1.6" fill="url(#signup-dots-grad)" fillOpacity="0.95" />
                        </pattern>
                      </defs>
                      <rect width="40" height="40" fill="url(#signup-dots-pattern)" rx="6" />
                    </svg>
                  </div>

                  {/* title centered */}
                  <div className="flex-1 text-center px-2">
                    <h1 className="text-2xl font-bold text-orange-600 leading-tight">
                      {t('create_account')}
                    </h1>
                  </div>

                  {/* back button on right */}
                  <div className="flex-none">
                    <BackButton />
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="email" className="block text-black text-sm font-medium mb-1">
                  {t('email')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail size={18} className="text-gray-400" />
                  </div>
                  <Input
                    id="email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className={`input-field pl-10 w-full focus:ring-2 focus:ring-orange-500 bg-imei-dark/50 backdrop-blur-sm ${emailExists ? 'border-red-500' : ''}`}
                    placeholder="user@example.com"
                    required
                  />
                  {/* no live email existence indicator to prevent user enumeration */}
                </div>
              </div>
              
              <div>
                <label htmlFor="username" className="block text-black text-sm font-medium mb-1">
                  {t('username')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User size={18} className="text-gray-400" />
                  </div>
                  <Input
                    id="username"
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    className="input-field pl-10 w-full focus:ring-2 focus:ring-orange-500 bg-imei-dark/50 backdrop-blur-sm"
                    placeholder={t('username')}
                    required
                  />
                </div>
              </div>
              
              <div>
                <label htmlFor="idLast6" className="block text-black text-sm font-medium mb-1">
                  {t('id_last_6_from_card')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <CreditCard size={18} className="text-gray-400" />
                  </div>
                  <Input
                    id="idLast6"
                    type="text"
                    name="idLast6"
                    value={formData.idLast6}
                    onChange={handleInputChange}
                    className="input-field pl-10 w-full focus:ring-2 focus:ring-orange-500 bg-imei-dark/50 backdrop-blur-sm"
                    placeholder={t('id_last_6_from_card')}
                    required
                    maxLength={6}
                  />
                </div>
              </div>
              

              <div>
                <label htmlFor="phoneNumber" className="block text-black text-sm font-medium mb-1">
                  {t('phone_number')}
                </label>
                <div className="flex gap-2 items-center">
                  <CountryCodeSelector
                    value={countryCode}
                    onChange={setCountryCode}
                    disabled={isSubmitting}
                  />
                  <div className="relative w-full">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone size={18} className="text-gray-400" />
                    </div>
                    <Input
                      id="phoneNumber"
                      type="tel"
                      name="phoneNumber"
                      value={formData.phoneNumber}
                      onChange={handleInputChange}
                      className="input-field pl-10 w-full focus:ring-2 focus:ring-orange-500 bg-imei-dark/50 backdrop-blur-sm"
                      placeholder={t('phone_number')}
                      required
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <label htmlFor="password" className="block text-black text-sm font-medium mb-1">
                  {t('password')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock size={18} className="text-gray-400" />
                  </div>
                  <Input
                    id="password"
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    onFocus={() => setPwdFocused(true)}
                    onBlur={() => setPwdFocused(false)}
                    className="input-field pl-10 w-full focus:ring-2 focus:ring-orange-500 bg-imei-dark/50 backdrop-blur-sm"
                    placeholder="********"
                    required
                    minLength={8}
                  />
                  {pwdFocused && (
                    <div className="mt-2 text-sm text-black bg-white p-2 rounded shadow-sm w-full">
                      <ul className="space-y-1">
                        <li className={pwdChecks.minLength ? 'text-green-600' : 'text-gray-700'}>
                          {pwdChecks.minLength ? '✓' : '○'} {t('pwd_min_chars') || 'At least 8 characters'}
                        </li>
                        <li className={pwdChecks.hasLetter ? 'text-green-600' : 'text-gray-700'}>
                          {pwdChecks.hasLetter ? '✓' : '○'} {t('pwd_letter') || 'At least one letter'}
                        </li>
                        <li className={pwdChecks.hasNumber ? 'text-green-600' : 'text-gray-700'}>
                          {pwdChecks.hasNumber ? '✓' : '○'} {t('pwd_number') || 'Number'}
                        </li>
                        <li className={pwdChecks.hasSpecial ? 'text-green-600' : 'text-gray-700'}>
                          {pwdChecks.hasSpecial ? '✓' : '○'} {t('pwd_special') || 'Special character'}
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <label htmlFor="confirmPassword" className="block text-black text-sm font-medium mb-1">
                  {t('confirm_password')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock size={18} className="text-gray-400" />
                  </div>
                  <Input
                    id="confirmPassword"
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className="input-field pl-10 w-full focus:ring-2 focus:ring-orange-500 bg-imei-dark/50 backdrop-blur-sm"
                    placeholder="********"
                    required
                    minLength={8}
                  />
                </div>
              </div>
              
              <div>
                <Button
                  type="submit"
                  className={`w-full text-white transition-colors ${isEmailRegistered ? 'bg-gray-500 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'} ${isSubmitting ? 'opacity-70' : ''}`}
                  disabled={isSubmitting || isEmailRegistered}
                >
                  {isEmailRegistered ? t('phone_registered_before') : (isSubmitting ? t('loading') : t('signup'))}
                </Button>
              </div>
              
              <div className="text-center text-sm text-gray-300 mt-4">
                {t('already_have_account')}{' '}
                <Link to="/login" className="text-orange-500 hover:underline">
                  {t('login')}
                </Link>
              </div>
            </form>
        </CardContent>
      </Card>
    </PageContainer>
  );
};

export default Signup;
