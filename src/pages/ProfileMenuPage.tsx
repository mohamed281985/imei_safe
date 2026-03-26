import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, PlusSquare, Search, Sparkles, LogOut, MessageSquare, Key, Globe, Fingerprint, Gift } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Device } from '@capacitor/device';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useScrollToTop } from '@/hooks/useScrollToTop';

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
    const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);

    // إعلان المتغيرات الخاصة بالجهاز
    const [phoneInfo, setPhoneInfo] = useState<{ name: string, capabilities: string[] } | null>(null);
    const [supportNumber, setSupportNumber] = useState('');
    const [countryCode, setCountryCode] = useState('+');
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
        const whatsappUrl = `https://wa.me/${fullNumber}`;
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
        if (!forgotPasswordData.imei || !forgotPasswordData.newPassword) {
            toast({
                title: 'خطأ',
                description: 'يرجى ملء جميع الحقول',
                variant: 'destructive'
            });
            return;
        }

        setIsProcessing(true);

        try {
            // استدعاء السيرفر لإعادة تعيين كلمة مرور الهاتف المسجّل (السيرفر يتحقق من الملكية)
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token;
                const resp = await fetch('/api/reset-registered-phone-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                    body: JSON.stringify({ imei: forgotPasswordData.imei, newPassword: forgotPasswordData.newPassword })
                });
                const json = await resp.json();
                if (!resp.ok) throw new Error(json.error || 'Failed to reset password');
                toast({ title: 'نجح', description: 'تم تحديث كلمة المرور بنجاح' });
                setShowForgotPasswordModal(false);
                setForgotPasswordData({ imei: '', newPassword: '' });
                return;
            } catch (err) {
                console.error('reset password error:', err);
            }

            // البحث في جدول البلاغات
            const { data: reportData, error: reportError } = await supabase
                .from('phone_reports')
                .select('*')
                .eq('imei', forgotPasswordData.imei)
                .eq('email', user?.email)
                .single();

            if (reportData) {
                // تحديث كلمة المرور في جدول البلاغات
                const { error: updateError } = await supabase
                    .from('phone_reports')
                    .update({ password: forgotPasswordData.newPassword })
                    .eq('imei', forgotPasswordData.imei)
                    .eq('email', user?.email);

                if (!updateError) {
                    toast({
                        title: 'نجح',
                        description: 'تم تحديث كلمة المرور بنجاح'
                    });
                    setShowForgotPasswordModal(false);
                    setForgotPasswordData({ imei: '', newPassword: '' });
                    return;
                }
            }

            // إذا لم يتم العثور على IMEI أو لا يملكه المستخدم الحالي
            toast({
                title: 'خطأ',
                description: ' هذاالهاتف غير مرتبط بهذا الحساب ',
                variant: 'destructive'
            });

        } catch (error) {
            console.error('Error updating password:', error);
            toast({
                title: 'خطأ',
                description: 'حدث خطأ أثناء تحديث كلمة المرور',
                variant: 'destructive'
            });
        } finally {
            setIsProcessing(false);
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
