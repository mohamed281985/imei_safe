import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, PlusSquare, Search, Sparkles, LogOut, MessageSquare, Key, Globe, Fingerprint, Gift, Phone, Award, Crown, ChevronLeft, Shield, FileText } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Device } from '@capacitor/device';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useScrollToTop } from '../hooks/useScrollToTop';
import CountryCodeSelector from '@/components/CountryCodeSelector';
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
// Types for our component state
interface PackageInfo {
    planType: string;
    expiresAt: string;
    daysRemaining: number;
    publishAdsCount: number;
    publishedAdsCount: number;
    remainingAds: number;
}

interface RewardsInfo {
    count: number;
    totalValue: number;
    claimedCount: number;
}

interface PhoneInfo {
    name: string;
    capabilities: string[];
}

// Constants
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://imei-safe.me' : '');

// Main component
const ProfileMenuPage: React.FC = () => {
    useScrollToTop();
    const { t, language, changeLanguage } = useLanguage();

    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();

    // State variables
    const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
    const [forgotPasswordData, setForgotPasswordData] = useState({
        imei: '',
        newPassword: ''
    });
    const [isProcessing, setIsProcessing] = useState(false);
    const [showLanguageModal, setShowLanguageModal] = useState(false);
    const [showChangePhoneModal, setShowChangePhoneModal] = useState(false);
    const [newPhone, setNewPhone] = useState('');
    const [countryCode, setCountryCode] = useState('+');
    const [verificationLast6, setVerificationLast6] = useState('');
    const [verificationPassword, setVerificationPassword] = useState('');
    const [isUpdatingPhone, setIsUpdatingPhone] = useState(false);
    const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);

    // Refs
    const phoneNameRef = useRef(`phone_${Math.random().toString(36).slice(2, 9)}`);
    const last6NameRef = useRef(`last6_${Math.random().toString(36).slice(2, 9)}`);
    const pwdNameRef = useRef(`pwd_${Math.random().toString(36).slice(2, 9)}`);

    // Data state
    const [phoneInfo, setPhoneInfo] = useState<PhoneInfo | null>(null);
    const [supportNumber, setSupportNumber] = useState('');
    const [rewardsInfo, setRewardsInfo] = useState<RewardsInfo>({
        count: 0,
        totalValue: 0,
        claimedCount: 0
    });
    const [packageInfo, setPackageInfo] = useState<PackageInfo>({
        planType: '',
        expiresAt: '',
        daysRemaining: 0,
        publishAdsCount: 0,
        publishedAdsCount: 0,
        remainingAds: 0
    });
    

    // Display format for country code
    const displayedCountryCode = countryCode
        ? (String(countryCode).startsWith('+') ? String(countryCode) : `+${String(countryCode).replace(/^0+/, '')}`)
        : '+20';

    // Fetch device information
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
                console.error('Error getting device info:', error);
                setPhoneInfo({
                    name: 'جوال',
                    capabilities: ['جوال', 'إمكانية الاتصال اللاسلكي']
                });
            }
        };

        getDeviceInfo();
    }, [t]);

    // Fetch rewards information
    useEffect(() => {
        const fetchRewardsInfo = async () => {
            if (!user) return;

            try {
                const { data, error } = await supabase
                    .from('user_rewards')
                    .select('*')
                    .eq('user_id', user.id);

                if (error) {
                    console.error('Error fetching rewards:', error);
                    return;
                }

                if (data && data.length > 0) {
                    const totalRewards = data.length;
                    const claimedRewards = data.filter(reward => reward.claimed).length;
                    let totalValue = 0;

                    data.forEach(reward => {
                        if (!reward.claimed && reward.prizes) {
                            totalValue += parseInt(reward.prizes || '0');
                        }
                    });

                    setRewardsInfo({
                        count: totalRewards,
                        totalValue,
                        claimedCount: claimedRewards
                    });
                }
            } catch (err) {
                console.error('Error fetching rewards:', err);
            }
        };

        fetchRewardsInfo();
    }, [user]);

    // Fetch support information
    useEffect(() => {
        const fetchSupportInfo = async () => {
            try {
                const { data, error } = await supabase
                    .from('support')
                    .select('phone, cun');

                if (error) {
                    console.error('Error fetching support info:', error);
                    return;
                }

                if (data && data.length > 0) {
                    const firstRecord = data[0];
                    setSupportNumber(firstRecord.phone || '');
                    setCountryCode(firstRecord.cun || '');
                } else {
                    setSupportNumber('1234567890');
                    setCountryCode('20');
                }
            } catch (err) {
                console.error('Error fetching support info:', err);
            }
        };

        fetchSupportInfo();
    }, []);

    // Fetch package information from server
    useEffect(() => {
        const fetchPackageInfo = async () => {
            if (!user?.id) return;

            try {
                let token: string | undefined;
                try {
                    const sessionRes: any = await supabase.auth.getSession();
                    token = sessionRes?.data?.session?.access_token;
                } catch (e) {
                    try {
                        // @ts-ignore
                        const sess = await supabase.auth.session();
                        // @ts-ignore
                        token = sess?.access_token;
                    } catch (e2) {
                        token = undefined;
                    }
                }

                const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '';
                const api = (path: string) => (API_BASE ? `${API_BASE}${path}` : path);

                const resp = await fetch(api('/api/ads/package-remaining'), {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });

                if (!resp.ok) {
                    console.error('Error fetching package info from server:', resp.status);
                    return;
                }

                const json = await resp.json();
                if (json.ok && json.isPackageUser) {
                    setPackageInfo({
                        planType: json.planType || 'UNKNOWN',
                        expiresAt: '',
                        daysRemaining: json.daysRemaining || 0,
                        publishAdsCount: json.publishAdsCount || 0,
                        publishedAdsCount: json.actualPublishedAdsCount || 0,
                        remainingAds: json.remainingAds || 0
                    });
                } else {
                    // User is not a package user
                    setPackageInfo({
                        planType: 'NONE',
                        expiresAt: '',
                        daysRemaining: 0,
                        publishAdsCount: 0,
                        publishedAdsCount: 0,
                        remainingAds: 0
                    });
                }
            } catch (err) {
                console.error('Error fetching package info:', err);
            }
        };

        fetchPackageInfo();
        // Refresh every 30 seconds
        const interval = setInterval(fetchPackageInfo, 30000);
        return () => clearInterval(interval);
    }, [user?.id]);

    // Check biometric status on page load
    useEffect(() => {
        if (!(window as any).SecureStorage) {
            return;
        }

        const ss = new (window as any).SecureStorage(
            () => { },
            () => { },
            'my_app_storage'
        );

        ss.get(
            (token: string) => {
                if (token) {
                    setIsBiometricEnabled(true);
                }
            },
            () => {
                setIsBiometricEnabled(false);
            },
            'biometricAuthToken'
        );
    }, []);

    // Clear sensitive fields when change-phone modal opens
    useEffect(() => {
        if (showChangePhoneModal) {
            setNewPhone('');
            setVerificationLast6('');
            setVerificationPassword('');
        }
    }, [showChangePhoneModal]);

    // Handle logout
    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Handle support click
    const handleSupport = () => {
        if (!supportNumber) {
            toast({
                title: 'خطأ',
                description: 'رقم الدعم الفني غير متاح حالياً، يرجى المحاولة لاحقاً',
                variant: 'destructive'
            });
            return;
        }

        const fullNumber = countryCode ? `${countryCode}${supportNumber}` : supportNumber;
        const whatsappUrl = `https://wa.me/${fullNumber}`;
        window.open(whatsappUrl, '_blank');
    };

    // Handle language change
    const handleLanguageChange = (lang: 'ar' | 'en' | 'fr' | 'hi') => {
        changeLanguage(lang);
        setShowLanguageModal(false);
        toast({
            title: 'تم تغيير اللغة بنجاح!',
        });
    };

    // Toggle biometric authentication
    const toggleBiometric = async () => {
        if (!(window as any).SecureStorage) {
toast({ title: t('error'), description: t('biometric_not_supported'), variant: 'destructive' });
            return;
        }

        const ss = new (window as any).SecureStorage(
            () => { },
            (error: any) => {
toast({ title: t('error'), description: t('biometric_init_failed'), variant: 'destructive' });
            },
            'my_app_storage'
        );

        if (isBiometricEnabled) {
            // Disable Biometrics
            ss.remove(
                () => {
                    setIsBiometricEnabled(false);
toast({ title: t('success'), description: t('biometric_disabled_success') });
                },
                (error: any) => {
                    toast({ title: t('error'), description: t('biometric_disable_failed'), variant: 'destructive' });
                },
                'biometricAuthToken'
            );
        } else {
            // Enable Biometrics
            const { data: { session } } = await supabase.auth.getSession();
            const refreshToken = session?.refresh_token;

            if (!refreshToken) {
toast({ title: t('error'), description: t('biometric_login_required'), variant: 'destructive' });
                return;
            }

            ss.set(
                () => {
                    setIsBiometricEnabled(true);
toast({ title: t('success'), description: t('biometric_enabled_success') });
                },
                (error: any) => {
                   toast({
    title: t('error'),
    description: t('biometric_enable_failed'),
    variant: 'destructive',
    duration: 7000
});

                },
                'biometricAuthToken',
                refreshToken
            );
        }
    };

    // Handle forgot password
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
            // Get CSRF token before any protected POST request
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

            // Call server only (verification and encryption done on server)
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

            // Safe parsing: some responses may be empty or not JSON
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

    // Handle phone update
    const handleUpdatePhone = async () => {
        const phoneVal = newPhone?.trim();
        const last6 = verificationLast6?.trim();
        const pwd = verificationPassword;

        // Normalize phone to E.164 using countryCode state
        function normalizePhone(raw: string, ccRaw: string) {
            if (!raw) return '';
            const trimmed = String(raw).trim();
            // Keep digits only
            let digits = trimmed.replace(/\D/g, '');
            // If raw started with +, preserve full digits as E.164
            if (trimmed.startsWith('+')) return '+' + digits;
            // Normalize country code
            let cc = String(ccRaw || '').toString();
            cc = cc.replace(/\D/g, '').replace(/^0+/, '');
            if (!cc) cc = '20';
            // Keep leading zero in national number (important for countries like Egypt)
            // Only remove trunk zero if it's followed by another zero (e.g., 00 -> 0)
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
            toast({ title: t('error'), description: t('enter_last6') || 'Please enter last 6 digits', variant: 'destructive' });
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

            // Get CSRF token from server
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

            // Safe debug logging: don't log full password
            try {
                const maskedPwd = pwd ? '*'.repeat(Math.min(6, pwd.length)) : '';
                console.debug('[change-phone] tokenPresent=', !!token, 'csrfPresent=', !!csrfToken);
                console.debug('[change-phone] requestBody=', { newPhone: normalizedPhone, last6, password: maskedPwd });
            } catch (e) { }

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

            // Success: server should verify, encrypt, and update required tables
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

            <PageContainer  >
                <div className="px-3 sm:px-6 lg:px-8">

                    <AppNavbar />
                    <div>
                        {/* User Info Card */}
                        {user && (
                            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-6">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="w-16 h-16 rounded-full bg-[#289c8e]/20 flex items-center justify-center flex-shrink-0">
                                        <User className="w-8 h-8 text-[#289c8e]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-lg font-bold text-gray-900 truncate">
                                                {user.username || user.email}
                                            </h2>
                                            <Shield className="w-4 h-4 text-[#289c8e]" />
                                        </div>
                                        <p className="text-sm text-gray-500 truncate">{user.email}</p>
                                    </div>
                                </div>

                                {/* Package Info */}
                                {packageInfo.planType && (
                                    <div className="mt-4 p-3 rounded-xl  shadow-lg bg-[#289c8e]/10 border border-[#289c8e]/20">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${packageInfo.planType === 'GOLD'
                                                    ? 'bg-gradient-to-br from-yellow-400 to-amber-400'
                                                    : packageInfo.planType === 'SILVER'
                                                        ? 'bg-gradient-to-br from-slate-200 to-emerald-200'
                                                        : 'bg-gradient-to-br from-blue-400 to-blue-300'
                                                    }`}>
                                                    {packageInfo.planType === 'GOLD' ? (
                                                        <Crown className="w-4 h-4 text-white" />
                                                    ) : packageInfo.planType === 'SILVER' ? (
                                                        <Award className="w-4 h-4 text-white" />
                                                    ) : (
                                                        <Gift className="w-4 h-4 text-white" />
                                                    )}
                                                </div>
                                                <span className="font-bold text-gray-800">
                                                    {packageInfo.planType === 'GOLD' ? t('gold_vip') : packageInfo.planType === 'SILVER' ? t('silver') : t('free')}
                                                </span>
                                            </div>
                                            {packageInfo.expiresAt && (
                                            <span className="text-sm text-gray-600">
                                               {t('expires_at')} {new Date(packageInfo.expiresAt).toLocaleDateString(language === 'ar' ? 'ar-EG' : language === 'fr' ? 'fr-FR' : language === 'hi' ? 'hi-IN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                             </span>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="text-center bg-white/50 rounded-lg p-2">
                                                <div className="text-lg font-bold text-[#289c8e]">{packageInfo.remainingAds}</div>
                                                <div className="text-xs text-gray-500">{t('remaining_ads')}</div>
                                            </div>
                                            <div className="text-center bg-white/50 rounded-lg p-2">
                                                <div className="text-lg font-bold text-green-600">{packageInfo.daysRemaining}</div>
                                                <div className="text-xs text-gray-500">{t('days_remaining')}</div>
                                            </div>
                                            <div className="text-center bg-white/50 rounded-lg p-2">
                                                <div className="text-lg font-bold text-purple-600">{packageInfo.publishAdsCount}</div>
                                                <div className="text-xs text-gray-500">{t('total_ads')}</div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Rewards Section */}
                        <div className="mb-6">
                            <h3 className="text-lg font-bold text-blue-600 mb-3">{t('rewards')}</h3>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-4 text-center">
                                    <div className="w-10 h-10 rounded-full bg-[#289c8e]/20 flex items-center justify-center mx-auto mb-2">
                                        <Gift className="w-5 h-5 text-[#289c8e]" />
                                    </div>
                                    <div className="text-xl font-bold text-gray-800">{rewardsInfo.count - rewardsInfo.claimedCount}</div>
                                    <div className="text-xs text-gray-500">{t('available')}</div>
                                </div>
                                <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-4 text-center">
                                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
                                        <Sparkles className="w-5 h-5 text-green-600" />
                                    </div>
                                    <div className="text-xl font-bold text-gray-800">{rewardsInfo.claimedCount}</div>
                                    <div className="text-xs text-gray-500">{t('used')}</div>
                                </div>
                                <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-4 text-center">
                                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-2">
                                        <Award className="w-5 h-5 text-purple-600" />
                                    </div>
                                    <div className="text-xl font-bold text-gray-800">{rewardsInfo.count}</div>
                                    <div className="text-xs text-gray-500">{t('total')}</div>
                                </div>
                            </div>
                        </div>

                        {/* Settings Section */}
                        <div className="mb-6">
                            <h3 className="text-lg font-bold text-blue-600 mb-3">{t('settings')}</h3>
                            <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg overflow-hidden">
                                {/* Recovery Cards - Barcode My Phones */}
                                <button
                                    onClick={() => navigate('/recovery-cards')}
                                    className="w-full flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center">
                                            <Phone className="w-5 h-5 text-cyan-600" />
                                        </div>
                                        <div className="text-right">
                                            <div className="font-medium text-gray-800">{t('barcode_my_phones') || 'باركود هواتفي'}</div>
                                            <div className="text-xs text-gray-500">{t('manage_recovery_cards') || 'إدارة بطاقات الاسترداد'}</div>
                                        </div>
                                    </div>
                                    <ChevronLeft className="w-5 h-5 text-gray-400" />
                                </button>

                                {/* Language */}
                                <button
                                    onClick={() => setShowLanguageModal(true)}
                                    className="w-full flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                                            <Globe className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <div className="text-right">
                                            <div className="font-medium text-gray-800">{t('change_language')}</div>
                                            <div className="text-xs text-gray-500">{t('languages_list')}</div>
                                        </div>
                                    </div>
                                    <ChevronLeft className="w-5 h-5 text-gray-400" />
                                </button>

                                {/* Biometric */}
                                <button
                                    onClick={toggleBiometric}
                                    className="w-full flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isBiometricEnabled ? 'bg-green-100' : 'bg-gray-100'}`}>
                                            <Fingerprint className={`w-5 h-5 ${isBiometricEnabled ? 'text-green-600' : 'text-gray-600'}`} />
                                        </div>
                                   <div className="text-right">
    <div className="font-medium text-gray-800">
        {isBiometricEnabled ? t('disable_biometric') : t('enable_biometric')}
    </div>
    <div className="text-xs text-gray-500">
        {isBiometricEnabled ? t('biometric_enabled') : t('biometric_disabled')}
    </div>
</div>

                                    </div>
                                    <ChevronLeft className="w-5 h-5 text-gray-400" />
                                </button>

                                {/* Forgot Password */}
                                <button
                                    onClick={() => setShowForgotPasswordModal(true)}
                                    className="w-full flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                                            <Key className="w-5 h-5 text-purple-600" />
                                        </div>
                                        <div className="text-right">
                                            <div className="font-medium text-gray-800">{t('forgot_password')}</div>
                                            <div className="text-xs text-gray-500">{t('reset_device_password')}</div>
                                        </div>
                                    </div>
                                    <ChevronLeft className="w-5 h-5 text-gray-400" />
                                </button>

                                {/* Change Phone */}
                                <button
                                    onClick={() => {
                                        setNewPhone('');
                                        setVerificationLast6('');
                                        setVerificationPassword('');
                                        setShowChangePhoneModal(true);
                                    }}
                                    className="w-full flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center">
                                            <Phone className="w-5 h-5 text-cyan-600" />
                                        </div>
                                        <div className="text-right">
                                            <div className="font-medium text-gray-800">{t('change_phone_number')}</div>
                                            <div className="text-xs text-gray-500">{t('update_contact_number')}</div>
                                        </div>
                                    </div>
                                    <ChevronLeft className="w-5 h-5 text-gray-400" />
                                </button>

                                

                                {/* Support */}
                                <button
                                    onClick={handleSupport}
                                    className="w-full flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                                            <MessageSquare className="w-5 h-5 text-yellow-600" />
                                        </div>
                                        <div className="text-right">
                                            <div className="font-medium text-gray-800">{t('support')}</div>
                                            <div className="text-xs text-gray-500">{t('contact_us_whatsapp')}</div>
                                        </div>
                                    </div>
                                    <ChevronLeft className="w-5 h-5 text-gray-400" />
                                </button>

                                {/* Logout */}
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                                            <LogOut className="w-5 h-5 text-red-600" />
                                        </div>
                                        <div className="text-right">
                                            <div className="font-medium text-gray-800">{t('logout')}</div>
                                            <div className="text-xs text-gray-500">{t('logout_from_account')}</div>
                                        </div>
                                    </div>
                                    <ChevronLeft className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>
                        </div>

                        {/* Legal Information Section */}
                        <div className="mb-24">
                            <h3 className="text-lg font-bold text-blue-600 mb-3">{t('legal_info')}</h3>
                            <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg overflow-hidden ">
                                <Link
                                    to="/privacy-policy"
                                    className="w-full flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                                            <Shield className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <div className="text-right">
                                            <div className="font-medium text-gray-800">{t('privacy_policy')}</div>
                                            <div className="text-xs text-gray-500">{t('learn_how_we_protect')}</div>
                                        </div>
                                    </div>
                                    <ChevronLeft className="w-5 h-5 text-gray-400" />
                                </Link>
                                <Link
                                    to="/terms-of-use"
                                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                                            <FileText className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <div className="text-right">
                                            <div className="font-medium text-gray-800">{t('terms_of_use')}</div>
                                            <div className="text-xs text-gray-500">{t('rules_and_terms')}</div>
                                        </div>
                                    </div>
                                    <ChevronLeft className="w-5 h-5 text-gray-400" />
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Navigation */}
                    <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm shadow-lg border-t border-white/20">
                        <div className="flex justify-around py-3">
                            <Link to="/dashboard" className="flex flex-col items-center text-gray-500">
                                <PlusSquare className="w-6 h-6 mb-1" />
                                <span className="text-xs">{t('home')}</span>
                            </Link>
                            <Link to="/Search" className="flex flex-col items-center text-gray-500">
                                <Search className="w-6 h-6 mb-1" />
                                <span className="text-xs">{t('search')}</span>
                            </Link>
                            <Link to="/rewards" className="flex flex-col items-center text-gray-500">
                                <Gift className="w-6 h-6 mb-1" />
                                <span className="text-xs">{t('my_rewards')}</span>
                            </Link>
                            <Link to="/profile" className="flex flex-col items-center text-[#289c8e]">
                                <User className="w-6 h-6 mb-1" />
                                <span className="text-xs">{t('my_account')}</span>
                            </Link>
                        </div>
                    </div>

                    {/* Forgot Password Modal */}
                    <Dialog open={showForgotPasswordModal} onOpenChange={setShowForgotPasswordModal}>
                        <DialogContent className="bg-white rounded-2xl shadow-xl p-6 max-w-md mx-auto">
                            <DialogHeader className="text-center mb-4">
                                <DialogTitle className="text-xl font-bold text-gray-900">{t('reset_password')}</DialogTitle>
                                <DialogDescription className="text-gray-600 mt-2">
                                    {t('enter_imei_and_new_password')}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('imei_number')}</label>
                                    <Input
                                        type="text"
                                        value={forgotPasswordData.imei}
                                        onChange={(e) => setForgotPasswordData(prev => ({
                                            ...prev,
                                            imei: e.target.value.replace(/\D/g, '')
                                        }))}
                                        className="w-full rounded-lg border-gray-300 focus:border-[#289c8e] focus:ring-[#289c8e]"
                                        maxLength={15}
                                        placeholder={t('enter_imei')}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('new_password')}</label>
                                    <Input
                                        type="password"
                                        value={forgotPasswordData.newPassword}
                                        onChange={(e) => setForgotPasswordData(prev => ({
                                            ...prev,
                                            newPassword: e.target.value
                                        }))}
                                        className="w-full rounded-lg border-gray-300 focus:border-[#289c8e] focus:ring-[#289c8e]"
                                        placeholder={t('enter_new_password')}
                                    />
                                </div>
                            </div>

                            <DialogFooter className="gap-3 mt-6">
                                <Button onClick={() => setShowForgotPasswordModal(false)} variant="outline" className="flex-1 rounded-lg">
                                    {t('cancel')}
                                </Button>
                                <Button onClick={handleForgotPassword} disabled={isProcessing} className="flex-1 bg-[#289c8e] hover:bg-[#1a7468] rounded-lg">
                                    {isProcessing ? t('processing') : t('update_password')}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    {/* Change Phone Modal */}
                    <Dialog open={showChangePhoneModal} onOpenChange={setShowChangePhoneModal}>
                        <DialogContent className="bg-white rounded-2xl shadow-xl p-6 max-w-md mx-auto">
                            <DialogHeader className="text-center mb-4">
                                <DialogTitle className="text-xl font-bold text-gray-900">{t('change_phone_number')}</DialogTitle>
                                <DialogDescription className="text-gray-600 mt-2">
                                    {t('enter_new_phone_and_verification')}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('new_phone_number')}</label>
                                    <div className="flex gap-2">
                                        <CountryCodeSelector
                                            value={displayedCountryCode}
                                            onChange={(code) => setCountryCode(code)}
                                        />
                                        <Input
                                            type="tel"
                                            value={newPhone}
                                            onChange={(e) => setNewPhone(e.target.value)}
                                            className="flex-1 rounded-lg border-gray-300 focus:border-[#289c8e] focus:ring-[#289c8e]"
                                            placeholder={t('phone_placeholder')}
                                            name={phoneNameRef.current}
                                            autoComplete="tel"
                                            inputMode="tel"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('last6_from_card')}</label>
                                    <Input
                                        type="text"
                                        value={verificationLast6}
                                        onChange={(e) => setVerificationLast6(e.target.value.replace(/\D/g, ''))}
                                        className="w-full rounded-lg border-gray-300 focus:border-[#289c8e] focus:ring-[#289c8e]"
                                        placeholder={t('last6_placeholder')}
                                        maxLength={6}
                                        name={last6NameRef.current}
                                        autoComplete="off"
                                        inputMode="numeric"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('current_password')}</label>
                                    <Input
                                        type="password"
                                        value={verificationPassword}
                                        onChange={(e) => setVerificationPassword(e.target.value)}
                                        className="w-full rounded-lg border-gray-300 focus:border-[#289c8e] focus:ring-[#289c8e]"
                                        placeholder={t('enter_account_password') || t('enter_current_password')}
                                        name={pwdNameRef.current}
                                        autoComplete="new-password"
                                    />
                                </div>
                            </div>

                            <DialogFooter className="gap-3 mt-6">
                                <Button onClick={() => setShowChangePhoneModal(false)} variant="outline" className="flex-1 rounded-lg">
                                    {t('cancel')}
                                </Button>
                                <Button onClick={handleUpdatePhone} disabled={isUpdatingPhone} className="flex-1 bg-[#289c8e] hover:bg-[#1a7468] rounded-lg">
                                    {isUpdatingPhone ? t('processing') : t('update_phone')}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    {/* Language Modal */}
                    <Dialog open={showLanguageModal} onOpenChange={setShowLanguageModal}>
                        <DialogContent className="bg-white rounded-2xl shadow-xl p-6 max-w-md mx-auto">
                            <DialogHeader className="text-center mb-4">
                                <DialogTitle className="text-xl font-bold text-gray-900">{t('change_language')}</DialogTitle>
                            </DialogHeader>
                            <div className="flex flex-col gap-3">
                                <Button onClick={() => handleLanguageChange('ar')} className="w-full justify-start bg-[#289c8e]/10 hover:bg-[#289c8e]/20 text-[#289c8e] rounded-lg py-3">
                                    <span className="mr-3">🇸🇦</span> العربية
                                </Button>
                                <Button onClick={() => handleLanguageChange('en')} className="w-full justify-start bg-[#289c8e]/10 hover:bg-[#289c8e]/20 text-[#289c8e] rounded-lg py-3">
                                    <span className="mr-3">🇺🇸</span> English
                                </Button>
                                <Button onClick={() => handleLanguageChange('fr')} className="w-full justify-start bg-[#289c8e]/10 hover:bg-[#289c8e]/20 text-[#289c8e] rounded-lg py-3">
                                    <span className="mr-3">🇫🇷</span> Français
                                </Button>
                                <Button onClick={() => handleLanguageChange('hi')} className="w-full justify-start bg-[#289c8e]/10 hover:bg-[#289c8e]/20 text-[#289c8e] rounded-lg py-3">
                                    <span className="mr-3">🇮🇳</span> हिन्दी
                                </Button>
                            </div>
                            <DialogFooter className="mt-6">
                                <Button onClick={() => setShowLanguageModal(false)} variant="outline" className="w-full rounded-lg">
                                    {t('close')}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

            </PageContainer>

    );
};

export default ProfileMenuPage;
