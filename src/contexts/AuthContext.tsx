import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { getUnreadNotificationCount } from '../lib/notificationService';
import { App } from '@capacitor/app'; // استيراد App من Capacitor

interface User {
  id: string;
  email: string;
  username: string;
  phoneNumber?: string;
  isAdmin?: boolean;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  needsProfileCompletion: boolean;
  unreadNotificationsCount: number;
  isFirstLogin: boolean; // ⭐ حالة جديدة لتتبع أول تسجيل دخول
  clearFirstLogin: () => void; // ⭐ دالة لإعادة تعيين الحالة
  login: (email: string, password: string, remember?: boolean) => Promise<{ success: boolean; needsProfileCompletion?: boolean; error?: string; }>;
  loginWithGoogle: () => Promise<boolean>;
  logout: () => void;
  signup: (email: string, password: string, username: string, phoneNumber: string, idLast6: string) => Promise<'success' | 'email_exists' | 'error'>;
  error: string | null;
  completeProfile: () => void; // دالة لتحديث حالة اكتمال الملف يدويًا
  loginWithBiometricToken?: (biometricToken: string) => Promise<boolean>; // إضافة الدالة هنا
  refreshNotifications: () => Promise<void>; // دالة لتحديث عدد الإشعارات
}

// Mock user data for demo purposes
const MOCK_USERS = [
  { id: '1', email: 'user@example.com', password: 'password', username: 'user', phoneNumber: '+1234567890', isAdmin: false },
  { id: '2', email: 'admin@example.com', password: 'admin123', username: 'admin', phoneNumber: '+9876543210', isAdmin: true },
  // أضف المستخدم الجديد للتمكن من تسجيل الدخول باستخدامه
  { id: '3', email: 'maly5424@gmail.com', password: 'password', username: 'maly', phoneNumber: '01127520059', isAdmin: false }
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [needsProfileCompletion, setNeedsProfileCompletion] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);
  const [isFirstLogin, setIsFirstLogin] = useState<boolean>(false); // ⭐ تعريف الحالة
  const { toast } = useToast();
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const { t } = useTranslation();

  // دالة مساعدة لتحديث توكن البصمة في SecureStorage
  const updateBiometricToken = useCallback(async (refreshToken: string | undefined) => {
    if (!refreshToken || !(window as any).SecureStorage) return;

    try {
      const ss = new (window as any).SecureStorage(
        () => { console.log('SecureStorage: Instance created for update.'); },
        (error: any) => { console.error('SecureStorage: Instance creation failed for update:', error); },
        'my_app_storage'
      );
      ss.set(
        () => { console.log('SecureStorage: Biometric token updated successfully.'); },
        (error: any) => { console.error('SecureStorage: Failed to update biometric token.', error); },
        'biometricAuthToken',
        refreshToken
      );
    } catch (e) {
      console.warn('Exception while updating biometric token:', e);
    }
  }, []);

  // إضافة مستمع لتغيرات حالة المصادقة للحفاظ على مزامنة توكن البصمة
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`Supabase Auth Event: ${event}`);
      
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.refresh_token) {
          await updateBiometricToken(session.refresh_token);
        }
      }
      
      if (event === 'SIGNED_OUT') {
        // لا نحذف التوكن عند الخروج للسماح بالدخول بالبصمة لاحقاً
        // إلا إذا كان المستخدم قد اختار صراحةً إلغاء تفعيل البصمة (يتم ذلك في ProfileMenuPage)
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [updateBiometricToken]);

  // دالة لتحديث عدد الإشعارات غير المقروؤة
  const refreshNotifications = useCallback(async () => {
    if (user) {
      try {
        const count = await getUnreadNotificationCount(user.email);
        setUnreadNotificationsCount(count);
      } catch (error) {
        console.error('Error refreshing notifications:', error);
      }
    }
  }, [user]);
  
  const completeProfile = () => {
    setNeedsProfileCompletion(false);
  };
  
  // ⭐ دالة لإعادة تعيين حالة أول تسجيل دخول بعد استخدامها
  const clearFirstLogin = () => {
    setIsFirstLogin(false);
  };

  // Check whether a biometric token is still present in secure storage.
  const isBiometricTokenStored = async (): Promise<boolean> => {
    if (!(window as any).SecureStorage) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      try {
        const ss = new (window as any).SecureStorage(() => {}, () => {}, 'my_app_storage');
        ss.get(
          (token: string) => {
            resolve(!!token);
          },
          () => {
            resolve(false);
          },
          'biometricAuthToken'
        );
      } catch (err) {
        console.warn('SecureStorage check failed:', err);
        resolve(false);
      }
    });
  };

  // تم تعريف دالة الخروج هنا وتغليفها بـ useCallback
  // لحل مشكلة "used before its declaration" في الـ useEffects.
  const logout = useCallback(async () => {
    // الخطوة 1: تسجيل علامة في التخزين المحلي للإشارة إلى أن الخروج تم بشكل يدوي.
    // هذا يمنع checkAuth من تسجيل الدخول تلقائيًا عند إعادة تشغيل التطبيق.
    localStorage.setItem('manual_logout', 'true');

    // الخطوة 2: مسح حالة المستخدم محليًا "لقفل" واجهة التطبيق.
    setUser(null);
    setNeedsProfileCompletion(false);
    setUnreadNotificationsCount(0);
    setIsFirstLogin(false); // ⭐ إعادة تعيين الحالة عند الخروج
    setLastActivity(Date.now());

    // إذا كان هناك توكن بصمة مفعل، نقوم بتسجيل الخروج محلياً فقط للحفاظ على صلاحية التوكن على السيرفر.
    const biometricStored = await isBiometricTokenStored();
    try {
      if (biometricStored) {
        // خروج محلي فقط: يمسح الجلسة من ذاكرة التطبيق ولكنه لا يبطل التوكن في السيرفر.
        await supabase.auth.signOut({ scope: 'local' });
        console.log('Biometric token present; performed local-only signOut.');
      } else {
        // خروج كامل: يبطل الجلسة في السيرفر ويمسحها محلياً.
        await supabase.auth.signOut();
        console.log('No biometric token; performed full global signOut.');
      }
    } catch (err) {
      console.error('Supabase signOut failed:', err);
    }
  }, []); // الاعتماديات فارغة لأن دوال الحالة (setters) مستقرة

  // Function to update last activity time
  const updateLastActivity = () => {
    setLastActivity(Date.now());
  };
  
  // Add event listeners for user activity
  useEffect(() => {
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove', 'click', 'keypress'];
    
    const handleActivity = () => {
      updateLastActivity();
    };
    
    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity);
    });
    
    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, []);
  
  // Check for inactivity and logout
  useEffect(() => {
    const checkInactivity = () => {
      const now = Date.now();
      const timeElapsed = now - lastActivity;
      const FIVE_MINUTES = 5 * 60 * 1000; // 5 minutes in milliseconds
      
      if (timeElapsed > FIVE_MINUTES && user) {
        logout();
        toast({
          title: t('session_expired'),
          description: t('logged_out_inactivity'),
        });
      }
    };
    
    const interval = setInterval(checkInactivity, 1000); // Check every second
    
    return () => clearInterval(interval);
  }, [lastActivity, user, t, toast, logout]);

  // التعامل مع تسجيل الخروج عند عدم النشاط في الخلفية
  useEffect(() => {
    // هذه الدالة ستعمل فقط على الأجهزة المحمولة حيث يتوفر Capacitor
    if (!(window as any).Capacitor || !(window as any).Capacitor.isNativePlatform()) {
      return;
    }

    const handleAppStateChange = async (state: { isActive: boolean }) => {
      const FIVE_MINUTES = 5 * 60 * 1000;

      if (!state.isActive) {
        // التطبيق ينتقل إلى الخلفية
        // نخزن الوقت الحالي إذا كان المستخدم مسجلاً دخوله
        if (user) {
          localStorage.setItem('background_timestamp', Date.now().toString());
        }
      } else {
        // التطبيق يعود إلى الواجهة
        const backgroundTimestamp = localStorage.getItem('background_timestamp');
        if (backgroundTimestamp) {
          const timeInBackground = Date.now() - parseInt(backgroundTimestamp, 10);
          if (timeInBackground > FIVE_MINUTES) {
            logout();
            toast({ title: t('session_expired'), description: t('logged_out_inactivity') });
          }
          // إزالة المؤقت دائماً بعد التحقق
          localStorage.removeItem('background_timestamp');
        }
      }
    };

    const listenerPromise = App.addListener('appStateChange', handleAppStateChange);
    
    return () => {
      // ننتظر حل الـ Promise ثم نستدعي .remove() على المقبض الفعلي
      listenerPromise.then(listener => listener.remove());
    };
  }, [user, logout, t, toast]);
  
  useEffect(() => {
    // التحقق من المصادقة والتعامل مع الجلسة
    const checkAuth = async () => {
      try {
        // التحقق مما إذا كان المستخدم قد سجل الخروج يدويًا
        const manualLogout = localStorage.getItem('manual_logout');
        if (manualLogout === 'true') {
          // لا تقم بتسجيل الدخول تلقائيًا، مما يجبر المستخدم على رؤية شاشة تسجيل الدخول.
          // هذا يعطي إحساسًا بانتهاء الجلسة مع الحفاظ على صلاحية التوكن للبصمة.
          setIsLoading(false);
          return;
        }

        // تم حذف أي منطق متعلق بـ localStorage
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          const { user } = data.session;
          // تحقق من تفعيل البريد الإلكتروني
          if (user.email_confirmed_at || user.confirmed_at) {
            const userProfile = {
              id: user.id,
              email: user.email || '',
              username: user.user_metadata.full_name || user.user_metadata.username || '',
              phoneNumber: user.user_metadata.phoneNumber,
              isAdmin: user.user_metadata.isAdmin || false,
              role: user.user_metadata.role
            };
            setUser(userProfile);
            
            // تحديث عدد الإشعارات غير المقروؤة عند استعادة الجلسة
            refreshNotifications();

            // التحقق من اكتمال بيانات الحساب التجاري عند استعادة الجلسة
            if (userProfile.role === 'business') {
              const { data: profile, error: profileError } = await supabase
                .from('businesses')
                .select('store_image_url, license_image_url')
                .eq('user_id', user.id)
                .maybeSingle();

              if (profileError) console.error("Error fetching business profile on session check:", profileError);

              const isComplete = !!(profile && profile.store_image_url && profile.license_image_url);
              setNeedsProfileCompletion(!isComplete);
            } else {
              setNeedsProfileCompletion(false);
            }
          } else {
            setUser(null);
            setNeedsProfileCompletion(false);
          }
        }
      } catch (err) {
        console.error('Auth check failed:', err);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);
  
  // Login function with improved error handling
  
  // تعديل وظيفة login
  const login = async (email: string, password: string, remember: boolean = false): Promise<{ success: boolean; needsProfileCompletion?: boolean; error?: string; }> => {
    setError(null);
    console.log("Login attempt:", email);
    
    try {
      // الخطوة 1: التحقق من وجود المستخدم وحالته قبل محاولة تسجيل الدخول
      const { data: userProfileData, error: profileError } = await supabase
        .from('users')
        .select('status')
        .eq('email', email)
        .single();

      // إذا كان الحساب محظوراً، أوقف العملية فوراً
      if (userProfileData && userProfileData.status === 'banned') {
        console.log('Login blocked for banned user:', email);
        return { success: false, error: 'user_banned' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) {
        console.error("Login error:", error.message);
        setError('login_error');
        return { success: false, error: error.message };
      }
      
      if (data.user) {
        const user = data.user;
        console.log("User found, login successful", user);
        const userProfile = {
          id: user.id,
          email: user.email || '',
          username: user.user_metadata.full_name || user.user_metadata.username || '',
          phoneNumber: user.user_metadata.phoneNumber,
          isAdmin: user.user_metadata.isAdmin || false,
          role: user.user_metadata.role
        };
        setUser(userProfile);
        setLastActivity(Date.now());
        setIsFirstLogin(true); // ⭐ تعيين حالة أول تسجيل دخول

        localStorage.removeItem('manual_logout');
        
        // تحديث عدد الإشعارات غير المقروؤة
        refreshNotifications();

        // التحقق من اكتمال بيانات الحساب التجاري
        if (userProfile.role === 'free_business') {
          const { data: profile, error: profileError } = await supabase
            .from('businesses')
            .select('store_image_url, license_image_url')
            .eq('user_id', user.id)
            .maybeSingle();

          if (profileError) console.error("Error fetching business profile:", profileError);

          if (!profile || !profile.store_image_url || !profile.license_image_url) {
            setNeedsProfileCompletion(true);
            return { success: true, needsProfileCompletion: true };
          }
        }
        setNeedsProfileCompletion(false);
        
        // تسجيل FCM token للمستخدم الجديد
        import('../lib/fcm-capacitor').then(module => {
          module.registerFCMToken();
        });

        // تم نقل منطق حفظ التوكن إلى مستمع onAuthStateChange لضمان التحديث المستمر
        
        toast({
          title: 'تم تسجيل الدخول بنجاح',
          description: `مرحبا ${userProfile.username}`,
        });
        
        return { success: true, needsProfileCompletion: false };
      } else {
        console.log("Invalid credentials");
        setError('login_error');
        return { success: false, error: 'Invalid credentials' };
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('unexpected_error');
      return { success: false, error: 'An unexpected error occurred.' };
    }
  };
  
  // تعديل وظيفة signup
  const signup = async (
    email: string,
    password: string,
    username: string,
    phoneNumber: string,
    idLast6: string
  ): Promise<'success' | 'email_exists' | 'error'> => {
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username, // This will be the full name
            phone: phoneNumber,
            id_last6: idLast6, // Save the last 6 digits of the ID
            role: 'customer'
          },
          emailRedirectTo: `${window.location.origin}/login`
        }
      });

      if (signUpError) {
        // Supabase returns a specific message for existing users
        if (signUpError.message.includes('User already registered')) {
          setError('هذا البريد مسجل من قبل');
          return 'email_exists';
        }
        throw signUpError;
      }

      if (data.user) {
        setError(null);
        return 'success';
      }

      setError('حدث خطأ أثناء إنشاء الحساب');
      return 'error';
    } catch (err: any) {
      console.error('Signup error:', err);
      setError(err.message || 'unexpected_error');
      return 'error';
    }
  };
  
  const loginWithGoogle = async (): Promise<boolean> => {
    setError(null);

    try {
      // In a real app, this would connect to Google OAuth
      // For this demo, we'll simulate a successful login
      toast({
        title: 'Google Login',
        description: 'This feature is not implemented in the demo',
        variant: 'destructive',
      });
      return false;
    } catch (err) {
      console.error('Google login error:', err);
      setError('unexpected_error');
      return false;
    }
  };

  // const resetPassword = async (email: string): Promise<boolean> => {
  //   setError(null);
  //   try {
  //     // إرسال رابط إعادة تعيين كلمة المرور مع توجيه المستخدم لصفحة reset-password بعد الضغط على الرابط
  //     const { error } = await supabase.auth.resetPasswordForEmail(email, {
  //       redirectTo: `${window.location.origin}/reset-password`
  //     });
  //     if (error) {
  //       setError(error.message);
  //       toast({
  //         title: t('error'),
  //         description: error.message,
  //         variant: 'destructive'
  //       });
  //       return false;
  //     }
  //     toast({
  //       title: t('password_reset'),
  //       description: t('password_reset_instructions_sent'),
  //     });
  //     return true;
  //   } catch (err: any) {
  //     setError('unexpected_error');
  //     toast({
  //       title: t('error'),
  //       description: err.message || t('unexpected_error'),
  //       variant: 'destructive'
  //     });
  //     return false;
  //   }
  // };
  
  // إصلاح وظيفة تسجيل الدخول بالبصمة
  const loginWithBiometricToken = async (biometricToken: string): Promise<boolean> => {
    console.log('Attempting biometric login with token...');
    setError(null);

    if (!biometricToken) {
      setError('biometric_token_invalid');
      toast({ title: 'خطأ', description: 'توكن البصمة غير موجود أو غير صالح', variant: 'destructive' });
      return false;
    }

    try {
      // 1. محاولة استعادة الجلسة من refresh_token المخزن
      const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession({ refresh_token: biometricToken });

      if (sessionError || !sessionData || !sessionData.session) {
        console.error('Biometric login - refreshSession error:', sessionError, sessionData);
        setError('biometric_login_failed'); // قد يكون التوكن منتهي الصلاحية
        // إذا فشل التحديث (مثلاً، التوكن غير صالح)، قم بحذفه لمنع المحاولات الفاشلة المتكررة
        try {
          if ((window as any).SecureStorage) {
            const ss = new (window as any).SecureStorage(() => {}, () => {}, 'my_app_storage');
            ss.remove(
              () => { console.log('SecureStorage: Removed invalid biometric token.'); },
              () => {},
              'biometricAuthToken'
            );
          }
        } catch (e) {
          console.warn('Could not remove invalid biometric token.', e);
        }
        toast({ title: 'خطأ', description: 'فشل تسجيل الدخول بالبصمة', variant: 'destructive' });
        return false;
      }

      if (sessionError || !sessionData || !sessionData.session) {
        console.error('Biometric login - refresh/setSession error:', sessionError, sessionData);
        setError('biometric_login_failed'); // قد يكون التوكن منتهي الصلاحية
        // إذا فشل التحديث (مثلاً، التوكن غير صالح)، قم بحذفه لمنع المحاولات الفاشلة المتكررة
        try {
          if ((window as any).SecureStorage) {
            const ss = new (window as any).SecureStorage(() => {}, () => {}, 'my_app_storage');
            ss.remove(
              () => { console.log('SecureStorage: Removed invalid biometric token.'); },
              () => {},
              'biometricAuthToken'
            );
          }
        } catch (e) {
          console.warn('Could not remove invalid biometric token.', e);
        }
        toast({ title: 'خطأ', description: 'فشل تسجيل الدخول بالبصمة', variant: 'destructive' });
        return false;
      }

      // 2. [مهم] تم نقل تحديث الـ refresh_token إلى مستمع onAuthStateChange
      // عند تحديث الجلسة، يصدر Supabase رمزًا جديدًا. يتم حفظه تلقائيًا الآن.

      // 3. جلب بيانات المستخدم من الجلسة النشطة الآن
      const session = sessionData.session;
      const user = sessionData.user || session?.user;

      if (!session) {
        console.error('Biometric login - refreshSession returned no session:', sessionData);
      }

      if (user) {
        console.log("Biometric login successful, user:", user);
        const userProfile = {
          id: user.id,
          email: user.email || '',
          username: user.user_metadata.full_name || user.user_metadata.username || '',
          phoneNumber: user.user_metadata.phoneNumber,
          isAdmin: user.user_metadata.isAdmin || false,
          role: user.user_metadata.role
        };
        setUser(userProfile);
        setLastActivity(Date.now());
        setIsFirstLogin(true); // ⭐ تفعيل حالة أول تسجيل دخول
        // إزالة علامة تسجيل الخروج اليدوي عند تسجيل الدخول بنجاح
        localStorage.removeItem('manual_logout');
        
        // تحديث عدد الإشعارات غير المقروؤة
        refreshNotifications();

        // 4. التحقق من اكتمال بيانات الحساب التجاري (نفس منطق تسجيل الدخول العادي)
        if (userProfile.role === 'free_business') {
          const { data: profile } = await supabase.from('businesses').select('store_image_url, license_image_url').eq('user_id', user.id).maybeSingle();
          const isComplete = !!(profile && profile.store_image_url && profile.license_image_url);
          setNeedsProfileCompletion(!isComplete);
        } else {
          setNeedsProfileCompletion(false);
        }

        toast({ title: 'تم تسجيل الدخول بنجاح', description: `مرحباً ${userProfile.username}` });
        return true;
      } else {
        setError('biometric_login_failed');
        toast({ title: 'خطأ', description: 'لم يتم العثور على المستخدم بعد التحقق من التوكن', variant: 'destructive' });
        return false;
      }
    } catch (err) {
      console.error('Biometric login error:', err);
      setError('unexpected_error');
      toast({ title: 'خطأ', description: 'حدث خطأ غير متوقع أثناء تسجيل الدخول بالبصمة', variant: 'destructive' });
      return false;
    }
  };
  
  const value = {
    user,
    isAuthenticated: !!user,
    isAdmin: user?.isAdmin || false,
    isLoading,
    isFirstLogin, // ⭐ تمرير الحالة
    clearFirstLogin, // ⭐ تمرير الدالة
    needsProfileCompletion,
    unreadNotificationsCount,
    login,
    loginWithGoogle,
    logout,
    signup,
    error,
    completeProfile,
    loginWithBiometricToken, // إضافة الدالة هنا
    refreshNotifications
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
