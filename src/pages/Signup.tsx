import React, { useState } from 'react';
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

    // email existence check (server-side)
    if (name === 'email') {
      setEmailExists(false);
      setCheckingEmail(false);
      setIsEmailRegistered(false);

      if (value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setCheckingEmail(true);
        setTimeout(async () => {
          try {
            const resp = await fetch('/api/check-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: value.trim().toLowerCase() })
            });

            // Safely parse response: some failures may return empty body or a plain boolean
            let exists = false;
            try {
              const text = await resp.text();
              if (text) {
                let parsed = null as any;
                try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
                if (typeof parsed === 'boolean') exists = parsed;
                else if (parsed && typeof parsed.exists === 'boolean') exists = parsed.exists;
                else exists = String(text).toLowerCase().includes('true');
              } else {
                exists = false;
              }
            } catch (parseErr) {
              if (process.env.NODE_ENV !== 'production') console.warn('check-email parse error', parseErr);
              exists = false;
            }

            setEmailExists(exists);
            setIsEmailRegistered(exists);
            if (exists) {
              toast({ title: t('alert_title'), description: t('email_registered_before'), variant: 'destructive' });
            }
            setLastCheckedEmail(value);
          } catch (err) {
            console.error('Email check error:', err);
            setEmailExists(false);
            setIsEmailRegistered(false);
            setLastCheckedEmail(value);
          } finally {
            setCheckingEmail(false);
          }
        }, 500);
      } else {
        setLastCheckedEmail('');
        setIsEmailRegistered(false);
      }
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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: username,
            phone: fullPhoneNumber,
            id_last6: idLast6,
            role: 'free_user',
          },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) {
        setSignupError(error.message.includes('User already registered') ? t('phone_registered_before') : error.message);
      } else if (data.user) {
        // Create application-level user record on the server (server will encrypt/store)
        try {
          const payload = {
            id: data.user.id,
            email,
            metadata: {
              full_name: username,
              phone: fullPhoneNumber,
              id_last6: idLast6,
              role: 'customer',
              status: 'active'
            }
          };
          fetch('/api/create-app-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(e => console.warn('create-app-user failed', e));

          toast({
            title: t('signup_successful'),
            description: t('verification_email_sent'),
          });
          navigate('/login');
        } catch (e) {
          console.warn('create-app-user error', e);
          toast({ title: t('signup_successful'), description: t('verification_email_sent') });
          navigate('/login');
        }
      } else {
        setSignupError(t('signup_error'));
      }
    } catch (error: any) {
      setSignupError(error.message || t('signup_error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <Card className="w-full shadow-lg border-t-4 border-t-orange-500 bg-white/80 backdrop-blur-sm mt-8">
        <CardHeader className="pb-0">
          <CardTitle className="text-2xl font-bold text-orange-600 text-center">
            <Logo size="lg" className="mb-6" />
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
              <div className="flex items-center gap-12 justify-between mb-8">
                <BackButton />
                <h1 className="text-2xl font-bold text-orange-600 flex-grow text-center">
                  {t('create_account')}
                </h1>
              </div>
              <div>
                <label htmlFor="email" className="block text-white text-sm font-medium mb-1">
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
                  {checkingEmail ? (
                    <div className="text-sm text-orange-500 mt-1">{t('checking_verification')}</div>
                  ) : emailExists ? (
                    <div className="text-sm text-red-500 mt-1">{t('email_registered_before')}</div>
                  ) : null}
                </div>
              </div>
              
              <div>
                <label htmlFor="username" className="block text-white text-sm font-medium mb-1">
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
                <label htmlFor="idLast6" className="block text-white text-sm font-medium mb-1">
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
                <label htmlFor="phoneNumber" className="block text-white text-sm font-medium mb-1">
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
                <label htmlFor="password" className="block text-white text-sm font-medium mb-1">
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
                    className="input-field pl-10 w-full focus:ring-2 focus:ring-orange-500 bg-imei-dark/50 backdrop-blur-sm"
                    placeholder="********"
                    required
                    minLength={6}
                  />
                </div>
              </div>
              
              <div>
                <label htmlFor="confirmPassword" className="block text-white text-sm font-medium mb-1">
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
                    minLength={6}
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
