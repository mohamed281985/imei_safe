import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, PlusSquare, Search, Sparkles, LogOut, MessageSquare, Key, Globe, Fingerprint, Gift, Phone } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Device } from '@capacitor/device';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import CountryCodeSelector from '@/components/CountryCodeSelector';

// إبقاء نفس عناصر القائمة الأصلية
const menuItems = [
    {
        to: '/dashboard',
        icon: <User className="w-7 h-7 text-imei-cyan" />,
        label: 'الرئيسية',
        color: 'bg-imei-cyan/10',
    },
    {
        to: '/report',
        icon: <PlusSquare className="w-7 h-7 text-orange-500" />,
        label: 'بلاغ هاتف مفقود',
        color: 'bg-orange-500/10',
    },
    {
        to: '/search',
        icon: <Search className="w-7 h-7 text-green-500" />,
        label: 'بحث برقم IMEI',
        color: 'bg-green-500/10',
    },
    {
        to: '/support',
        icon: <Sparkles className="w-7 h-7 text-yellow-500" />,
        label: 'الدعم الفني',
        color: 'bg-yellow-500/10',
    },
    {
        to: '/rewards',
        icon: <Gift className="w-7 h-7 text-purple-500" />,
        label: 'مكافآتي',
        color: 'bg-purple-500/10',
    },
    {
        to: '/logout',
        icon: <LogOut className="w-7 h-7 text-rose-500" />,
        label: 'تسجيل خروج',
        color: 'bg-rose-500/10',
    },
];

const ProfileMenuPage: React.FC = () => {
    useScrollToTop();
    const { t, changeLanguage } = useLanguage();
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
    const [forgotPasswordData, setForgotPasswordData] = useState({
        imei: '',
        newPassword: ''
    });
    const [isProcessing, setIsProcessing] = useState(false);
    const [showLanguageModal, setShowLanguageModal] = useState(false);
    const [showChangePhoneModal, setShowChangePhoneModal] = useState(false);
    const [newPhone, setNewPhone] = useState('');
    // countryCode stores digits only (e.g. '20')
    const [countryCode, setCountryCode] = useState('+');
    const [verificationLast6, setVerificationLast6] = useState('');
    const [verificationPassword, setVerificationPassword] = useState('');
    const [isUpdatingPhone, setIsUpdatingPhone] = useState(false);
    const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
    const phoneNameRef = useRef(`phone_${Math.random().toString(36).slice(2,9)}`);
    const last6NameRef = useRef(`last6_${Math.random().toString(36).slice(2,9)}`);
    const pwdNameRef = useRef(`pwd_${Math.random().toString(36).slice(2,9)}`);
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://imei-safe.me' : '');

    // derived display for country code input (show leading +)
    const displayedCountryCode = countryCode ? (String(countryCode).startsWith('+') ? String(countryCode) : `+${String(countryCode).replace(/^0+/, '')}`) : '+20';

    // إعلان المتغيرات الخاصة بالجهاز
    const [phoneInfo, setPhoneInfo] = useState<{ name: string, capabilities: string[] } | null>(null);
    const [supportNumber, setSupportNumber] = useState('');
    const [rewardsInfo, setRewardsInfo] = useState({ count: 0, totalValue: 0, claimedCount: 0 });

    // تحديد معلومات الجهاز باستخدام مكتبات خارجية
    useEffect(() => {
        const getDeviceInfo = async () => {
            try {
                const info = await Device.getInfo();
                const deviceName = `${info.manufacturer} ${info.model}`;
                const capabilities = [];
                if (info.platform !== 'web') {
                    capabilities.push(t('mobile_device'));
                } else {
                    capabilities.push(t('web_browser'));
                }
                capabilities.push(`${t('operating_system')}: ${info.operatingSystem} ${info.osVersion}`);
                if (info.isVirtual) {
                    capabilities.push(t('virtual_device'));
                }
                setPhoneInfo({
                    name: deviceName,
                    capabilities
                });
            } catch (error) {
                console.error('خطأ في تحليل معلومات الجهاز:', error);
                setPhoneInfo({
                    name: 'جوال',
                    capabilities: ['جوال', 'إمكانية الاتصال اللاسلكي']
                });
            }
        };

        getDeviceInfo();
    }, []);

    // جلب بيانات المكافآت من قاعدة البيانات
    useEffect(() => {
        const fetchRewardsInfo = async () => {
            if (!user) return;
            
            try {
                // جلب جميع المكافآت الخاصة بالمستخدم
                const { data, error } = await supabase
                    .from('user_rewards')
                    .select('*')
                    .eq('user_id', user.id);
                
                if (error) {
                    console.error('خطأ في جلب بيانات المكافآت:', error);
                    return;
                }
                
                if (data && data.length > 0) {
                    // حساب عدد المكافآت الإجمالي
                    const totalRewards = data.length;
                    
                    // حساب عدد المكافآت المستردة
                    const claimedRewards = data.filter(reward => reward.claimed).length;
                    
                    // حساب القيمة الإجمالية للمكافآت غير المستردة
                    let totalValue = 0;
                    data.forEach(reward => {
                        if (!reward.claimed && reward.prizes) {
                            totalValue += parseInt(reward.prizes || '0');
                        }
                    });
                    
                    setRewardsInfo({
                        count: totalRewards,
                        totalValue: totalValue,
                        claimedCount: claimedRewards
                    });
                }
            } catch (err) {
                console.error('خطأ في جلب بيانات المكافآت:', err);
            }
        };
        
        fetchRewardsInfo();
    }, [user]);

    // جلب معلومات الدعم الفني من قاعدة البيانات
    useEffect(() => {
        const fetchSupportInfo = async () => {
            try {
                console.log('جاري جلب بيانات الدعم الفني...');

                // جلب رقم الهاتف ورمز الدولة فقط
                const { data, error } = await supabase
                    .from('support')
                    .select('phone, cun');

                if (error) {
                    console.error('خطأ في جلب بيانات الدعم الفني:', error);
                    return;
                }

                // طباعة البيانات المسترجعة للتصحيح
                console.log('بيانات الدعم الفني المسترجعة:', data);

                // إذا كانت هناك بيانات، خذ السجل الأول
                if (data && data.length > 0) {
                    const firstRecord = data[0];
                    console.log('السجل الأول:', firstRecord);

                    setSupportNumber(firstRecord.phone || '');
                    setCountryCode(firstRecord.cun || '');

                    console.log('تم تحديث معلومات الدعم الفني:', {
                        phone: firstRecord.phone,
                        cun: firstRecord.cun
                    });
                } else {
                    console.log('لا توجد بيانات في جدول الدعم الفني');
                    // جرب استخدام قيم افتراضية للتصحيح
                    setSupportNumber('1234567890');
                    setCountryCode('20');
                }
            } catch (err) {
                console.error('خطأ في جلب بيانات الدعم الفني:', err);
            }
        };

        fetchSupportInfo();
    }, []);

    // التحقق من حالة البصمة عند تحميل الصفحة
    useEffect(() => {
        if (!(window as any).SecureStorage) {
            return;
        }

        const ss = new (window as any).SecureStorage(
            () => {},
            () => {},
            'my_app_storage'
        );

        ss.get(
            (token: string) => {
                // إذا وجدنا توكن، فهذا يعني أن البصمة مفعلة
                if (token) {
                    setIsBiometricEnabled(true);
                }
            },
            () => {
                // إذا لم نجد توكن، فالبصمة غير مفعلة
                setIsBiometricEnabled(false);
            },
            'biometricAuthToken'
        );
    }, []);
    // Clear sensitive fields whenever the change-phone modal opens
    useEffect(() => {
        if (showChangePhoneModal) {
            setNewPhone('');
            setVerificationLast6('');
            setVerificationPassword('');
        }
    }, [showChangePhoneModal]);
    // معالجة تسجيل الخروج
    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // معالجة فتح الدعم الفني
    const handleSupport = () => {
        if (!supportNumber) {
            toast({
                title: 'خطأ',
                description: 'رقم الدالفني غير متاح حالياً، يرجى المحاولة لاحقاً',
                variant: 'destructive'
            });
            return;
        }

        // فتح رابط واتساب مع رقم الدعم الفني مع رمز الدولة
        const fullNumber = countryCode ? `${countryCode}${supportNumber}` : supportNumber;
        const whatsappUrl = `https://wa.me/${fullNumber.replace(/\D/g, '')}`;
        window.open(whatsappUrl, '_blank');
    };

    const handleLanguageChange = (lang: 'ar' | 'en' | 'fr' | 'hi') => {
        changeLanguage(lang);
        setShowLanguageModal(false);
        toast({
            title: 'تم تغيير اللغة بنجاح!',
        });
    };

    const toggleBiometric = async () => {
        if (!(window as any).SecureStorage) {
            toast({ title: 'خطأ', description: 'هذه الميزة غير مدعومة على جهازك.', variant: 'destructive' });
            return;
        }

        const ss = new (window as any).SecureStorage(
            () => {},
            (error: any) => {
                toast({ title: 'خطأ فني', description: 'فشل تهيئة وحدة التخزين الآمنة.', variant: 'destructive' });
            },
            'my_app_storage'
        );

        if (isBiometricEnabled) {
            // Disable Biometrics
            ss.remove(
                () => {
                    setIsBiometricEnabled(false);
                    toast({ title: 'تم بنجاح', description: 'تم إلغاء تفعيل الدخول بالبصمة.' });
                },
                (error: any) => {
                    toast({ title: 'خطأ', description: 'فشل إلغاء تفعيل البصمة.', variant: 'destructive' });
                },
                'biometricAuthToken'
            );
        } else {
            // Enable Biometrics
            const { data: { session } } = await supabase.auth.getSession();
            const refreshToken = session?.refresh_token;

            if (!refreshToken) {
                toast({ title: 'خطأ', description: 'لا يمكن تفعيل البصمة. يرجى تسجيل الدخول مرة أخرى.', variant: 'destructive' });
                return;
            }

            ss.set(
                () => {
                    setIsBiometricEnabled(true);
                    toast({ title: 'تم بنجاح', description: 'تم تفعيل الدخول بالبصمة.' });
                },
                (error: any) => {
                    toast({
                        title: 'خطأ في تفعيل البصمة',
                        description: 'فشل حفظ بيانات الدخول بالبصمة. قد تحتاج إلى إعداد قفل شاشة على جهازك.',
                        variant: 'destructive',
                        duration: 7000
                    });
                },
                'biometricAuthToken',
                refreshToken
            );
        }
    };

    const handleForgotPassword = async () => {
        const imeiNormalized = String(forgotPasswordData.imei || '').replace(/\D/g, '');

        if (!imeiNormalized || !forgotPasswordData.newPassword) {
            toast({
                title: 'خطأ',
                description: 'يرجى ملء جميع الحقول',
                variant: 'destructive'
            });
            return;
        }

        setIsProcessing(true);

        try {
            // جلب CSRF token قبل أي طلب POST محمي
            const csrfResp = await fetch(`${API_BASE_URL}/api/csrf-token`, {
                method: 'GET',
                credentials: 'include'
            });
            const csrfRaw = await csrfResp.text();
            let csrfPayload: any = {};
            if (csrfRaw) {
                try {
                    csrfPayload = JSON.parse(csrfRaw);
                } catch {
                    csrfPayload = {};
                }
            }
            const csrfToken = csrfPayload?.csrfToken;
            if (!csrfResp.ok || !csrfToken) {
                throw new Error('فشل جلب CSRF token');
            }

            // استدعاء الخادم فقط (التحقق والتشفير يتمان في السيرفر)
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            const resp = await fetch(`${API_BASE_URL}/api/reset-registered-phone-password`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    imei: imeiNormalized,
                    newPassword: forgotPasswordData.newPassword
                })
            });

            // parsing آمن: بعض الردود قد تكون فارغة أو ليست JSON
            const raw = await resp.text();
            let payload: any = {};
            if (raw) {
                try {
                    payload = JSON.parse(raw);
                } catch {
                    payload = {};
                }
            }

            if (!resp.ok) {
                throw new Error(payload?.error || `فشل تحديث كلمة المرور (${resp.status})`);
            }

            toast({ title: 'نجح', description: 'تم تحديث كلمة المرور بنجاح' });
            setShowForgotPasswordModal(false);
            setForgotPasswordData({ imei: '', newPassword: '' });

        } catch (error) {
            console.error('Error updating password:', error);
            toast({
                title: 'خطأ',
                description: (error as Error)?.message || 'حدث خطأ أثناء تحديث كلمة المرور',
                variant: 'destructive'
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUpdatePhone = async () => {
        const phoneVal = newPhone?.trim();
        const last6 = verificationLast6?.trim();
        const pwd = verificationPassword;

            // normalize phone to E.164 using countryCode state (countryCode may be like '20' or '+20')
            function normalizePhone(raw: string, ccRaw: string) {
                if (!raw) return '';
                const trimmed = String(raw).trim();
                // keep digits
                let digits = trimmed.replace(/\D/g, '');
                // if raw started with +, preserve full digits as E.164
                if (trimmed.startsWith('+')) return '+' + digits;
                // normalize country code
                let cc = String(ccRaw || '').toString();
                cc = cc.replace(/\D/g, '').replace(/^0+/, '');
                if (!cc) cc = '20';
                // keep the leading zero in the national number (important for countries like Egypt)
                // only remove trunk zero if it's followed by another zero (e.g., 00 -> 0)
                if (digits.startsWith('00')) {
                    digits = digits.replace(/^0+/, '0');
                }
                return '+' + cc + digits;
            }
            const normalizedPhone = normalizePhone(phoneVal || '', countryCode || '20');

        if (!phoneVal || normalizedPhone.length < 7) {
            toast({ title: t('error'), description: t('invalid_phone_number') || 'Invalid phone number', variant: 'destructive' });
            return;
        }
        if (!last6 || last6.length !== 6) {
            toast({ title: t('error'), description: t('enter_last6') || 'Please enter the last 6 digits', variant: 'destructive' });
            return;
        }
        if (!pwd || pwd.length < 6) {
            toast({ title: t('error'), description: t('enter_current_password') || 'Please enter your current password', variant: 'destructive' });
            return;
        }

        setIsUpdatingPhone(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                throw new Error('غير مصرح. الرجاء تسجيل الدخول مرة أخرى');
            }

            // جلب CSRF token من الخادم
            const csrfResp = await fetch(`${API_BASE_URL}/api/csrf-token`, { method: 'GET', credentials: 'include' });
            const csrfRaw = await csrfResp.text();
            let csrfPayload: any = {};
            if (csrfRaw) {
                try { csrfPayload = JSON.parse(csrfRaw); } catch { csrfPayload = {}; }
            }
            const csrfToken = csrfPayload?.csrfToken;
            if (!csrfResp.ok || !csrfToken) {
                throw new Error(t('invalid_csrf') || 'Invalid or missing CSRF token');
            }

            const resp = await fetch(`${API_BASE_URL}/api/change-phone`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({
                        newPhone: normalizedPhone,
                        last6,
                        password: pwd
                    })
            });

            const raw = await resp.text();
            let payload: any = {};
            if (raw) {
                try { payload = JSON.parse(raw); } catch { payload = {}; }
            }

            if (!resp.ok) {
                throw new Error(payload?.error || payload?.message || `فشل تحديث رقم الهاتف (${resp.status})`);
            }

            // نجاح: الخادم يجب أن يتحقق ويشفّر ويحدّث الجداول المطلوبة
            toast({ title: t('success'), description: t('phone_updated_successfully') || 'تم تحديث رقم الهاتف' });
            setShowChangePhoneModal(false);
            setVerificationLast6('');
            setVerificationPassword('');
        } catch (err: any) {
            console.error('Failed to update phone via server:', err);
            toast({ title: t('error'), description: t('phone_update_failed') || 'فشل تحديث رقم الهاتف', variant: 'destructive' });
        } finally {
            setIsUpdatingPhone(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#289c8e] to-[#1a7468] px-3 pt-6 pb-[30px]">
            <div className="w-full max-w-md bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-[#289c8e]/30 p-6">
                <h2 className="text-2xl font-bold text-[#289c8e] mb-6 text-center">
                    {t('my_account')}
                </h2>

                {/* بيانات المستخدم */}
                {user && (
                    <div className="mb-6 flex flex-col items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-[#289c8e]/20 flex items-center justify-center mb-2">
                            <User className="w-10 h-10 text-[#289c8e]" />
                        </div>
                        <div className="text-gray-800 text-lg font-bold">
                            {user.username || user.email}
                        </div>
                        <div className="text-[#289c8e]/80 text-sm">
                            {user.email}
                        </div>

                        {/* معلومات الجهاز */}
                        {phoneInfo && (
                            <div className="mt-4 w-full bg-[#289c8e]/10 rounded-xl p-4 border border-[#289c8e]/20">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-bold text-gray-800">{t('device_type')}:</h3>
                                    <span className="text-gray-700">{phoneInfo.name}</span>
                                </div>

                                <div>
                                    <h3 className="font-bold text-gray-800 mb-1">{t('capabilities')}:</h3>
                                    <div className="flex flex-wrap gap-1">
                                        {phoneInfo.capabilities.map((capability, index) => (
                                            <span key={index} className="bg-[#289c8e]/20 text-[#289c8e] text-xs px-2 py-1 rounded-full">
                                                {t(capability)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* معلومات المكافآت */}
                        <div className="mt-4 w-full bg-purple-500/10 rounded-xl p-3 border border-purple-500/20">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                    <Gift className="w-5 h-5 text-purple-500" />
                                    {t('my_rewards')}
                                </h3>
                                <Link to="/rewards" className="text-purple-600 hover:text-purple-700 text-sm font-medium">
                                    {t('view_all')}
                                </Link>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-2 mt-3">
                                <div className="text-center bg-white/50 rounded-lg p-2">
                                    <div className="text-xl font-bold text-purple-600">{rewardsInfo.count}</div>
                                    <div className="text-xs text-gray-600">{t('total_rewards')}</div>
                                </div>
                                <div className="text-center bg-white/50 rounded-lg p-2">
                                    <div className="text-xl font-bold text-green-600">{rewardsInfo.claimedCount}</div>
                                    <div className="text-xs text-gray-600">{t('claimed_rewards')}</div>
                                </div>
                                <div className="text-center bg-white/50 rounded-lg p-2">
                                    <div className="text-xl font-bold text-orange-600">{rewardsInfo.count - rewardsInfo.claimedCount}</div>
                                    <div className="text-xs text-gray-600">{t('available_rewards')}</div>
                                </div>
                            </div>
                            
                            {rewardsInfo.totalValue > 0 && (
                                <div className="mt-3 p-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-lg text-center">
                                    <div className="text-sm text-gray-700">{t('total_rewards_value')}:</div>
                                    <div className="text-xl font-bold text-purple-700">{rewardsInfo.totalValue} {t('points')}</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* قائمة العناصر */}
                <div className="space-y-3">
                    {/* زر تغيير اللغة */}
                    <button
                        onClick={() => setShowLanguageModal(true)}
                        className="flex items-center gap-4 px-5 py-3 rounded-xl shadow-md bg-blue-500/10 hover:bg-[#289c8e]/20 hover:scale-[1.03] transition-transform duration-200 w-full"
                    >
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/10 shadow-inner">
                            <Globe className="w-7 h-7 text-blue-500" />
                        </div>
                        <span className="text-lg font-semibold text-gray-800">
                            {t('change_language')}
                        </span>
                    </button>

                    {/* زر تفعيل/إلغاء البصمة */}
                    <button
                        onClick={toggleBiometric}
                        className={`flex items-center gap-4 px-5 py-3 rounded-xl shadow-md hover:scale-[1.03] transition-all duration-200 w-full ${isBiometricEnabled ? 'bg-green-500/10 hover:bg-green-500/20' : 'bg-gray-500/10 hover:bg-gray-500/20'}`}
                    >
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/10 shadow-inner">
                            <Fingerprint className={`w-7 h-7 ${isBiometricEnabled ? 'text-green-500' : 'text-gray-500'}`} />
                        </div>
                        <div className="flex flex-col text-right">
                            <span className="text-lg font-semibold text-gray-800">
                                {isBiometricEnabled ? t('disable_biometric') : t('enable_biometric')}
                            </span>
                            <span className="text-xs text-gray-500">{isBiometricEnabled ? t('status_enabled') : t('status_disabled')}</span>
                        </div>
                    </button>

                    {/* زر نسيت كلمة المرور */}
                    <button
                        onClick={() => setShowForgotPasswordModal(true)}
                        className="flex items-center gap-4 px-5 py-3 rounded-xl shadow-md bg-purple-500/10 hover:bg-[#289c8e]/20 hover:scale-[1.03] transition-transform duration-200 w-full"
                    >
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/10 shadow-inner">
                            <Key className="w-7 h-7 text-purple-500" />
                        </div>
                        <span className="text-lg font-semibold text-gray-800">
                            {t('forgot_device_password')}
                        </span>
                    </button>

                    {/* زر الدعم الفني */}
                    <button
                        onClick={handleSupport}
                        className="flex items-center gap-4 px-5 py-3 rounded-xl shadow-md bg-yellow-500/10 hover:bg-[#289c8e]/20 hover:scale-[1.03] transition-transform duration-200 w-full"
                    >
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/10 shadow-inner">
                            <MessageSquare className="w-7 h-7 text-yellow-500" />
                        </div>
                        <span className="text-lg font-semibold text-gray-800">
                            {t('technical_support')}
                        </span>
                    </button>

                    {/* زر تغيير رقم الهاتف */}
                    <button
                        onClick={() => {
                                // Open modal with empty fields (do not prefill sensitive data)
                                setNewPhone('');
                                setVerificationLast6('');
                                setVerificationPassword('');
                                setShowChangePhoneModal(true);
                            }}
                        className="flex items-center gap-4 px-5 py-3 rounded-xl shadow-md bg-cyan-500/10 hover:bg-[#289c8e]/20 hover:scale-[1.03] transition-transform duration-200 w-full"
                    >
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/10 shadow-inner">
                            <Phone className="w-7 h-7 text-cyan-500" />
                        </div>
                        <span className="text-lg font-semibold text-gray-800">{t('change_phone_number')}</span>
                    </button>

                    {/* زر تسجيل الخروج */}
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-4 px-5 py-3 rounded-xl shadow-md bg-rose-500/10 hover:bg-[#289c8e]/20 hover:scale-[1.03] transition-transform duration-200 w-full"
                    >
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/10 shadow-inner">
                            <LogOut className="w-7 h-7 text-rose-500" />
                        </div>
                        <span className="text-lg font-semibold text-gray-800">
                            {t('logout')}
                        </span>
                    </button>
                </div>
            </div>

            {/* Modal لنسيت كلمة المرور */}
            {showForgotPasswordModal && (
                <Dialog open={showForgotPasswordModal} onOpenChange={setShowForgotPasswordModal}>
                    <DialogContent className="bg-imei-darker border-imei-cyan/30">
                        <DialogHeader className="text-center">
                            <DialogTitle className="text-white text-center">{t('reset_password')}</DialogTitle>
                            <DialogDescription className="text-gray-300 text-center">
                                {t('device_password_not_login')}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-white mb-2">IMEI</label>
                                <Input
                                    type="text"
                                    value={forgotPasswordData.imei}
                                    onChange={(e) => setForgotPasswordData(prev => ({
                                        ...prev,
                                        imei: e.target.value.replace(/\D/g, '')
                                    }))}
                                    className="input-field w-full"
                                    maxLength={15}
                                    placeholder={t('enter_imei')}
                                />
                            </div>

                            <div>
                                <label className="block text-white mb-2">{t('buyer_new_password')}</label>
                                <Input
                                    type="password"
                                    value={forgotPasswordData.newPassword}
                                    onChange={(e) => setForgotPasswordData(prev => ({
                                        ...prev,
                                        newPassword: e.target.value
                                    }))}
                                    className="input-field w-full"
                                    placeholder={t('enter_password')}
                                />
                            </div>
                        </div>

                        <DialogFooter className="gap-3">
                            <Button onClick={() => setShowForgotPasswordModal(false)} variant="outline" className="border-imei-cyan/30 text-white">
                                {t('cancel')}
                            </Button>
                            <Button onClick={handleForgotPassword} disabled={isProcessing} className="bg-orange-500 hover:bg-orange-600 text-white border-orange-500">
                                {isProcessing ? t('processing') : t('update_password')}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
            {/* Modal لتغيير رقم الهاتف */}
            <Dialog open={showChangePhoneModal} onOpenChange={setShowChangePhoneModal}>
                <DialogContent className="bg-white/90 backdrop-blur-lg text-gray-800 w-[90%] sm:max-w-md border-2 border-orange-400 shadow-2xl rounded-2xl">
                        <DialogHeader className="text-center">
                            <DialogTitle className="text-2xl font-bold text-gray-900 text-center">{t('change_phone_number')}</DialogTitle>
                            <DialogDescription className="text-gray-600 text-center">{t('enter_new_phone')}</DialogDescription>
                        </DialogHeader>

                    <div className="space-y-4 pt-4">
                        <div>
                            <label className="block text-gray-700 mb-2">{t('phone_number')}</label>
                            <div className="flex gap-2">
                                <CountryCodeSelector
                                    value={displayedCountryCode}
                                    onChange={(code) => setCountryCode(code)}
                                />
                                <Input
                                    type="tel"
                                    value={newPhone}
                                    onChange={(e) => setNewPhone(e.target.value)}
                                    className="input-field flex-1"
                                    placeholder={t('phone_placeholder') || '10 1234 5678'}
                                    name={phoneNameRef.current}
                                    autoComplete="tel"
                                    inputMode="tel"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-gray-700 mb-2">{t('id_last_6_from_card') || 'Last 6 Digits'}</label>
                            <Input
                                type="text"
                                value={verificationLast6}
                                onChange={(e) => setVerificationLast6(e.target.value.replace(/\D/g, ''))}
                                className="input-field w-full"
                                placeholder="123456"
                                maxLength={6}
                                name={last6NameRef.current}
                                autoComplete="off"
                                inputMode="numeric"
                            />
                        </div>
                        <div>
                            <label className="block text-gray-700 mb-2">{t('current_login_password') || 'Current login password'}</label>
                            <Input
                                type="password"
                                value={verificationPassword}
                                onChange={(e) => setVerificationPassword(e.target.value)}
                                className="input-field w-full"
                                placeholder={t('enter_password')}
                                name={pwdNameRef.current}
                                autoComplete="new-password"
                            />
                        </div>
                    </div>

                    <DialogFooter className="gap-3">
                        <Button onClick={() => setShowChangePhoneModal(false)} variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50 hover:border-orange-600">
                            {t('cancel')}
                        </Button>
                        <Button onClick={handleUpdatePhone} disabled={isUpdatingPhone} className="bg-imei-cyan hover:bg-imei-cyan-dark text-white">
                            {isUpdatingPhone ? t('processing') : t('update_phone')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal لتغيير اللغة */}
            <Dialog open={showLanguageModal} onOpenChange={setShowLanguageModal}>
                <DialogContent className="bg-imei-darker border-imei-cyan/30">
                    <DialogHeader className="text-center">
                        <DialogTitle className="text-white text-center">{t('change_language')}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-3 pt-4">
                        <Button onClick={() => handleLanguageChange('ar')} className="bg-imei-cyan hover:bg-imei-cyan-dark text-white">
                            {t('language_arabic')}
                        </Button>
                        <Button onClick={() => handleLanguageChange('en')} className="bg-imei-cyan hover:bg-imei-cyan-dark text-white">
                            {t('language_english')}
                        </Button>
                        <Button onClick={() => handleLanguageChange('fr')} className="bg-imei-cyan hover:bg-imei-cyan-dark text-white">
                            {t('language_french')}
                        </Button>
                        <Button onClick={() => handleLanguageChange('hi')} className="bg-imei-cyan hover:bg-imei-cyan-dark text-white">
                            {t('language_hindi')}
                        </Button>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setShowLanguageModal(false)} variant="outline" className="border-imei-cyan/30 text-white w-full">
                            {t('close')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ProfileMenuPage;
