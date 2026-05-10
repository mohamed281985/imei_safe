# دليل حل مشكلة "session expired" عند الدخول بالبصمة

## المشكلة
تم تفعيل البصمة ولكن عند محاولة الدخول بها يظهر خطأ "session expired".

## الأسباب المحتملة
1. **مشكلة في طريقة استخدام `refreshSession`**: قد لا تعمل بشكل صحيح مع `refresh_token` فقط.
2. **مشكلة في إعدادات Supabase Auth**: إعدادات `autoRefreshToken` قد لا تعمل بشكل صحيح.
3. **مشكلة في التوكن المخزن**: التوكن قد يكون منتهي الصلاحية أو غير صالح.
4. **مشكلة في الخادم**: قد تكون هناك قيود على الخادم تمنع تجديد الجلسة.

## الحلول المطبقة

### 1. تعديل دالة `loginWithBiometricToken` في `AuthContext.tsx`
تم تحسين الدالة لاستخدام طريقتين مختلفتين لاستعادة الجلسة:

```typescript
// دالة مساعدة للتحقق من صلاحية التوكن قبل استخدامه
const validateBiometricToken = async (token: string): Promise<boolean> => {
  if (!token) return false;
  
  try {
    // محاولة بسيطة للتحقق من صحة التوكن
    const { error } = await supabase.auth.setSession({
      refresh_token: token
    });
    
    return !error;
  } catch (err) {
    console.warn('Token validation error:', err);
    return false;
  }
};

// إصلاح وظيفة تسجيل الدخول بالبصمة
const loginWithBiometricToken = async (biometricToken: string): Promise<boolean> => {
  console.log('Attempting biometric login with token...');
  setError(null);

  if (!biometricToken) {
    setError('biometric_token_invalid');
    toast({ title: t('error'), description: t('biometric_token_not_found'), variant: 'destructive' });
    return false;
  }

  // التحقق من صلاحية التوكن أولاً
  const isValid = await validateBiometricToken(biometricToken);
  if (!isValid) {
    console.log('Biometric token is invalid or expired.');
    setError('biometric_session_expired');
    
    // حذف التوكن غير الصالح
    try {
      if ((window as any).SecureStorage) {
        const ss = new (window as any).SecureStorage(() => {}, () => {}, 'my_app_storage');
        ss.remove(
          () => { console.log('SecureStorage: Removed invalid/expired biometric token.'); },
          () => {},
          'biometricAuthToken'
        );
      }
    } catch (e) {
      console.warn('Could not remove invalid biometric token.', e);
    }
    
    toast({ 
      title: t('error'), 
      description: t('biometric_not_activated_desc'), 
      variant: 'destructive' 
    });
    return false;
  }

  try {
    // 1. أولاً، نحاول استخدام setSession مع refresh_token فقط
    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      refresh_token: biometricToken
    });

    if (sessionError || !sessionData || !sessionData.session) {
      console.error('Biometric login - setSession error:', sessionError);
      
      // 2. إذا فشلت setSession، نحاول استخدام refreshSession كحل بديل
      console.log('Trying refreshSession as fallback...');
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({ refresh_token: biometricToken });
      
      if (refreshError || !refreshData || !refreshData.session) {
        console.error('Biometric login - refreshSession also failed:', refreshError);
        
        // إذا كان الخطأ متعلقاً بانتهاء صلاحية التوكن
        const isTokenExpired = (sessionError?.message?.includes('refresh_token_not_found') || 
                               sessionError?.message?.includes('Invalid Refresh Token') ||
                               refreshError?.message?.includes('refresh_token_not_found') || 
                               refreshError?.message?.includes('Invalid Refresh Token'));
        
        setError(isTokenExpired ? 'biometric_session_expired' : 'biometric_login_failed');
        
        // حذف التوكن غير الصالح
        try {
          if ((window as any).SecureStorage) {
            const ss = new (window as any).SecureStorage(() => {}, () => {}, 'my_app_storage');
            ss.remove(
              () => { console.log('SecureStorage: Removed invalid/expired biometric token.'); },
              () => {},
              'biometricAuthToken'
            );
          }
        } catch (e) {
          console.warn('Could not remove invalid biometric token.', e);
        }
        
        toast({ 
          title: t('error'), 
          description: isTokenExpired ? t('biometric_not_activated_desc') : t('biometric_login_failed'), 
          variant: 'destructive' 
        });
        return false;
      }
      
      // إذا نجح refreshSession، نستخدم البيانات منه
      sessionData.session = refreshData.session;
      sessionData.user = refreshData.user;
    }

    // 3. جلب بيانات المستخدم من الجلسة النشطة
    const session = sessionData.session;
    const user = sessionData.user || session?.user;

    if (user) {
      console.log("Biometric login successful, user:", user.id);
      
      // تحديث التوكن يدوياً للتأكد من حفظ التوكن الجديد فوراً
      if (session.refresh_token) {
        await updateBiometricToken(session.refresh_token);
      }

      const userProfile = {
        id: user.id,
        email: user.email || '',
        username: user.user_metadata.full_name || user.user_metadata.username || '',
        phoneNumber: user.user_metadata.phoneNumber,
        isAdmin: user.user_metadata.isAdmin || false,
        role: user.user_metadata.role
      };
      
      setUser(userProfile);
      updateLastActivity();
      setIsFirstLogin(true);
      
      localStorage.removeItem('manual_logout');
      localStorage.removeItem('auto_logged_out');
      
      refreshNotifications();

      if (userProfile.role === 'free_business') {
        const { data: profile } = await supabase.from('businesses').select('store_image_url, license_image_url').eq('user_id', user.id).maybeSingle();
        const isComplete = !!(profile && profile.store_image_url && profile.license_image_url);
        setNeedsProfileCompletion(!isComplete);
      } else {
        setNeedsProfileCompletion(false);
      }

      toast({ title: t('success'), description: `${t('welcome')} ${userProfile.username}` });
      return true;
    } else {
      setError('biometric_login_failed');
      toast({ title: t('error'), description: t('user_not_found'), variant: 'destructive' });
      return false;
    }
  } catch (err) {
    console.error('Biometric login unexpected error:', err);
    setError('unexpected_error');
    toast({ title: t('error'), description: t('unexpected_error'), variant: 'destructive' });
    return false;
  }
};
```

### 2. تحسين دالة `updateBiometricToken`
تم تحسين الدالة لضمان حفظ التوكن بشكل موثوق:

```typescript
// دالة مساعدة لتحديث توكن البصمة في SecureStorage
const updateBiometricToken = useCallback(async (refreshToken: string | undefined) => {
  if (!refreshToken || !(window as any).SecureStorage) {
    console.log('No refresh token or SecureStorage not available.');
    return;
  }

  // التحقق أولاً مما إذا كان الجهاز يدعم البصمة ومفعلة
  const Fingerprint = (window as any).Fingerprint || ((window as any).cordova && (window as any).cordova.plugins && (window as any).cordova.plugins.fingerprint);
  if (!Fingerprint) {
    console.log('Fingerprint plugin not available. Skipping biometric token update.');
    return;
  }

  try {
    // التحقق من توفر البصمة بشكل متزامن
    const isAvailable = await new Promise<boolean>((resolve) => {
      Fingerprint.isAvailable(
        (isAvailableSuccess: any) => {
          console.log('Biometric is available on device.');
          resolve(true);
        },
        (isAvailableError: any) => {
          console.log('Biometric is not available on this device:', isAvailableError);
          resolve(false);
        }
      );
    });

    if (!isAvailable) {
      console.log('Biometric not available, skipping token update.');
      return;
    }

    // حفظ التوكن في SecureStorage
    console.log('Biometric is available. Attempting to update biometric token in SecureStorage...');
    
    const ss = new (window as any).SecureStorage(
      () => { 
        ss.set(
          () => { 
            console.log('SecureStorage: Biometric token updated successfully.');
            // تأكيد الحفظ بالتحقق من التوكن
            ss.get(
              (savedToken: string) => {
                if (savedToken === refreshToken) {
                  console.log('Token saved and verified successfully.');
                } else {
                  console.warn('Token verification failed - saved token does not match.');
                }
              },
              (error: any) => {
                console.error('Failed to verify saved token:', error);
              },
              'biometricAuthToken'
            );
          },
          (error: any) => { 
            console.error('SecureStorage: Failed to update biometric token.', error);
            // محاولة إعادة الحفظ مرة أخرى
            console.log('Retrying token save...');
            setTimeout(() => {
              ss.set(
                () => { console.log('SecureStorage: Biometric token saved on retry.'); },
                (error2: any) => { console.error('SecureStorage: Failed on retry too.', error2); },
                'biometricAuthToken',
                refreshToken
              );
            }, 1000);
          },
          'biometricAuthToken',
          refreshToken
        );
      },
      (error: any) => { 
        console.error('SecureStorage: Instance creation failed for update:', error);
      },
      'my_app_storage'
    );
  } catch (e) {
    console.warn('Exception while updating biometric token:', e);
  }
}, []);
```

### 3. تعديل إعدادات Supabase في `supabase.ts`
تم تحسين إعدادات المصادقة:

```typescript
const supabaseOptions = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    flowType: 'pkce' as const,
    // إعدادات إضافية لتحسين تجربة البصمة
    storageKey: 'supabase.auth.token',
    // زيادة وقت انتهاء الجلسة للبصمة
    sessionExpiryMargin: 60 * 60 * 24 * 7, // 7 أيام
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'X-Client-Info': 'imei-safe-web'
    }
  }
}
```

### 4. تحسين دالة `checkAuth` في `useEffect`
تم إضافة تحديث تلقائي لتوكن البصمة عند استعادة الجلسة:

```typescript
// تحديث توكن البصمة عند استعادة الجلسة
if (data.session.refresh_token) {
  console.log('Updating biometric token on session restore...');
  await updateBiometricToken(data.session.refresh_token);
}
```

### 5. تحسين ملف `EnableBiometricAuth.tsx`
تم تحسين عملية حفظ التوكن مع التحقق من الحفظ:

```typescript
// أولاً، نحاول حذف أي توكن قديم موجود
ss.remove(() => {
  console.log('Old biometric token removed (if existed).');
}, () => {
  console.log('No old biometric token to remove.');
}, BIOMETRIC_AUTH_TOKEN_KEY);

// ثم نحفظ التوكن الجديد مع التحقق
ss.set(
  () => {
    console.log('Biometric token saved successfully in SecureStorage.');
    
    // التحقق من حفظ التوكن بشكل صحيح
    ss.get(
      (savedToken: string) => {
        if (savedToken === refreshToken) {
          console.log('Token verification successful.');
          toast({
            title: t('success'),
            description: t('biometric_setup_success'),
          });
        } else {
          console.warn('Token verification failed - saved token does not match.');
          toast({
            title: t('warning'),
            description: 'تم حفظ التوكن ولكن التحقق فشل. قد تواجه مشاكل في الدخول بالبصمة.',
            variant: 'destructive',
          });
        }
      },
      (error: any) => {
        console.error('Failed to verify saved token:', error);
        toast({
          title: t('warning'),
          description: 'تم حفظ التوكن ولكن التحقق فشل. قد تواجه مشاكل في الدخول بالبصمة.',
          variant: 'destructive',
        });
      },
      BIOMETRIC_AUTH_TOKEN_KEY
    );
  },
  // ... باقي الكود
);
```

## تعديلات على الخادم (إذا لزم الأمر)

إذا استمرت المشكلة بعد تطبيق جميع الحلول أعلاه، قد تحتاج إلى تعديل إعدادات Supabase على الخادم:

### 1. زيادة وقت انتهاء صلاحية Refresh Token
في لوحة تحكم Supabase:
1. انتقل إلى **Authentication** → **Settings**
2. ابحث عن **JWT Settings**
3. زد قيمة **JWT Expiry** إلى 3600 (ساعة واحدة) أو أكثر
4. زد قيمة **Refresh Token Rotation** إلى 7200 (ساعتين) أو أكثر

### 2. التحقق من سياسات المصادقة
1. انتقل إلى **Authentication** → **Policies**
2. تأكد من أن سياسات المصادقة تسمح بتجديد الجلسات
3. تحقق من عدم وجود قيود على عدد مرات تجديد الجلسة

### 3. تحديث إصدار Supabase
تأكد من استخدام أحدث إصدار من مكتبة `@supabase/supabase-js`:
```bash
npm install @supabase/supabase-js@latest
```

## خطوات الاختبار

1. **تسجيل الدخول بكلمة المرور**
   - تأكد من تسجيل الدخول بنجاح
   - تحقق من حفظ التوكن في SecureStorage

2. **تفعيل البصمة**
   - انتقل إلى إعدادات الملف الشخصي
   - فعّل الدخول بالبصمة
   - تأكد من ظهور رسالة نجاح

3. **تسجيل الخروج**
   - سجل الخروج من التطبيق
   - تأكد من بقاء توكن البصمة في SecureStorage

4. **الدخول بالبصمة**
   - افتح التطبيق
   - استخدم البصمة للدخول
   - تأكد من نجاح العملية

## استكشاف الأخطاء وإصلاحها

### إذا ظهر خطأ "session expired":
1. تحقق من سجلات الكونسول للبحث عن أخطاء محددة
2. تأكد من أن التوكن محفوظ بشكل صحيح في SecureStorage
3. تحقق من اتصال التطبيق بخادم Supabase
4. تأكد من صلاحية التوكن المخزن

### إذا لم تعمل البصمة:
1. تحقق من تفعيل البصمة على الجهاز
2. تأكد من وجود قفل شاشة (PIN، كلمة مرور، أو بصمة)
3. تحقق من أذونات التطبيق على الجهاز

## الخلاصة

تم تطبيق مجموعة شاملة من الحلول لمعالجة مشكلة "session expired" عند الدخول بالبصمة. تشمل هذه الحلول:

1. تحسين طريقة استعادة الجلسة باستخدام `setSession` و `refreshSession`
2. إضافة تحقق من صلاحية التوكن قبل الاستخدام
3. تحسين عملية حفظ التوكن في SecureStorage
4. إضافة تحديث تلقائي للتوكن عند استعادة الجلسة
5. تعديل إعدادات Supabase لتحسين تجربة البصمة

إذا استمرت المشكلة بعد تطبيق جميع الحلول، قد تحتاج إلى مراجعة إعدادات الخادم أو الاتصال بدعم Supabase.