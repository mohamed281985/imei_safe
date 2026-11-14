import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getSecureItem, setSecureItem } from '@/utils/secureStorage';
import { sanitizeError } from '@/utils/sanitizeError';
import secureFetch from '@/utils/secureFetch';
import { validateSession } from '@/utils/session';
import { validateId } from '@/utils/validateId';
import axiosInstance from '@/services/axiosInterceptor';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { X } from 'lucide-react';

interface PromoCodeDetails {
    code: string;
    discount_percentage: number;
    duration_months: number;
    expires_at: string;
    original_price: number;
    discounted_price: number;
    currency: string;
}

interface OriginalOfferPricing {
    amount: number;
    durationDays: number;
}

const OffersGallery = () => {
    useScrollToTop();
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [originalOfferPricing, setOriginalOfferPricing] = useState<OriginalOfferPricing>({ amount: 0, durationDays: 0 });
    const [promoDetails, setPromoDetails] = useState<PromoCodeDetails | null>(null);
    const [promoInput, setPromoInput] = useState('');
    const [promoStatus, setPromoStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [promoError, setPromoError] = useState<string | null>(null);
    const [showCheckoutPanel, setShowCheckoutPanel] = useState(false);
    const [loading, setLoading] = useState(true);
    const [imageError, setImageError] = useState(false);
    const [isPaying, setIsPaying] = useState(false);
    const [payError, setPayError] = useState<string | null>(null);
    const { user } = useAuth();
    const location = useLocation();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const paymentMonitorRef = useRef<number | null>(null);

    // cleanup payment monitor interval on unmount
    useEffect(() => {
        return () => {
            if (paymentMonitorRef.current) {
                clearInterval(paymentMonitorRef.current);
                paymentMonitorRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const fetchImage = async () => {
            setLoading(true);
            setOriginalOfferPricing({ amount: 0, durationDays: 0 });
            setPromoDetails(null);
            setPromoInput('');
            setPromoStatus('idle');
            setPromoError(null);
            const urlParams = new URLSearchParams(location.search);
            const currentAdId = urlParams.get('id');

            if (currentAdId) {
                void fetchOfferPricing(currentAdId);
                const cacheKey = `offer-image-cache-${currentAdId}`;

                // 1. محاولة تحميل الصورة من ذاكرة التخزين المؤقت (مشفّرة في sessionStorage)
                const cachedImageUrl = await getSecureItem(cacheKey);
                if (cachedImageUrl) {
                    // التحقق من أن الصورة لا تزال صالحة (موجودة وقابلة للاستخدام)
                    const img = new Image();
                    img.src = cachedImageUrl;

                    img.onload = () => {
                        setImageUrl(cachedImageUrl);
                        setLoading(false);
                    };

                    img.onerror = () => {
                        console.log(t('cached_image_corrupted'));
                        fetchFromDatabase(currentAdId, cacheKey);
                    };

                    return; // الخروج إذا تم العثور على الصورة الصالحة
                }

                // 2. إذا لم تكن مخزنة أو كانت معطوبة، يتم جلبها من قاعدة البيانات
                fetchFromDatabase(currentAdId, cacheKey);
            } else {
                setImageError(true);
                setLoading(false);
            }
        };

        const fetchOfferPricing = async (adId: string) => {
            const idNum = validateId(adId);
            if (idNum === null) return;

            try {
                const { data: offer, error: offerError } = await supabase
                    .from('ads_offar')
                    .select('*')
                    .eq('id', idNum)
                    .maybeSingle();
                if (offerError || !offer) return;

                let amount = Number(offer.amount ?? offer.price);
                let durationDays = Number(offer.duration_days) || 0;

                if (offer.type) {
                    const { data: priceData, error: priceError } = await supabase
                        .from('ads_price')
                        .select('amount, duration_days')
                        .eq('type', offer.type)
                        .maybeSingle();

                    if (!priceError && priceData) {
                        if (priceData.amount) amount = Number(priceData.amount);
                        if (priceData.duration_days) durationDays = Number(priceData.duration_days);
                    }
                }

                setOriginalOfferPricing({
                    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
                    durationDays: Number.isFinite(durationDays) && durationDays > 0 ? durationDays : 0
                });
            } catch (error) {
                console.error('Error fetching original offer pricing:', error);
            }
        };

        const fetchFromDatabase = async (adId: string, cacheKey: string) => {
            const idNum = validateId(adId);
            if (idNum === null) {
                console.warn('Invalid ad id provided to fetchFromDatabase:', adId);
                setImageError(true);
                setLoading(false);
                return;
            }
            try {
                const { data, error } = await supabase
                    .from('ads_offar')
                    .select('mainimage_url')
                    .eq('id', idNum)
                    .maybeSingle();

                if (!error && data && data.mainimage_url) {
                    setImageUrl(data.mainimage_url);
                    // 3. تخزين الصورة الجديدة في ذاكرة التخزين المؤقت (مشفّرة في sessionStorage)
                    await setSecureItem(cacheKey, data.mainimage_url);

                    // تحميل الصورة مسبقًا لضمان استعدادها للاستخدام المستقبلي
                    preloadImage(data.mainimage_url);
                } else {
                    setImageError(true);
                }
            } catch (error) {
                console.error(t('error_fetching_image'), error);
                setImageError(true);
            } finally {
                setLoading(false);
            }
        };

        const preloadImage = (url: string) => {
            const img = new Image();
            img.src = url;
        };

        fetchImage();
    }, [location.search, t]);

    if (loading) {
        return <div className="flex items-center justify-center min-h-screen bg-black text-white">{t('loading')}</div>;
    }

    if (imageError || !imageUrl) {
        return <div className="flex items-center justify-center min-h-screen bg-black text-white">{t('image_not_found')}</div>;
    }

    const handleActivatePromoCode = async () => {
        const code = promoInput.trim();
        if (!code) {
            setPromoDetails(null);
            setPromoStatus('error');
            setPromoError('اكتب البروموكود أولاً');
            return;
        }

        setPromoStatus('loading');
        setPromoError(null);
        setPromoDetails(null);

        try {
            const offerId = validateId(new URLSearchParams(location.search).get('id') || '');
            if (offerId === null) throw new Error('العرض المحدد غير صالح');

            const response = await axiosInstance.post('/api/promo-codes/validate', { code, offerId });
            setPromoDetails(response.data.promo);
            setPromoStatus('success');
        } catch (error: any) {
            setPromoStatus('error');
            setPromoError(error.response?.data?.error || error.message || 'تعذر تفعيل البروموكود، تحقق من الرمز وحاول مرة أخرى');
        }
    };

    const handleOfferPayment = async () => {
        setIsPaying(true);
        setPayError(null);
        // بعد الضغط على الزر، انتظر 4 ثوانٍ ثم انتقل إلى Dashboard
        setTimeout(() => {
            navigate('/dashboard');
        }, 4000);
        try {
            // ⭐ التحقق من تسجيل دخول المستخدم
            if (!user) {
                throw new Error(t('must_login_for_offer'));
            }

            const urlParams = new URLSearchParams(location.search);
            const offerId = urlParams.get('id');
            if (!offerId) throw new Error(t('offer_id_not_found'));
            const offerIdNum = validateId(offerId);
            if (offerIdNum === null) throw new Error(t('offer_id_not_found'));

            // جلب بيانات العرض من قاعدة البيانات
            const { data: offerData, error: offerError } = await supabase
                .from('ads_offar')
                .select('*')
                .eq('id', offerIdNum)
                .maybeSingle();
            if (offerError || !offerData) throw new Error(t('error_fetching_offer_data'));

            // جلب نوع الإعلان وسعره مباشرة من Supabase
            // 1. جلب نوع الإعلان من جدول ads_offar
            console.log(t('fetching_offer_data'), offerId);
            const { data: offerDataWithAmount, error: offerErrorWithAmount } = await supabase
                .from('ads_offar')
                .select('*')
                .eq('id', offerIdNum)
                .maybeSingle();

            console.log(t('offer_data_retrieved'));
            if (import.meta.env.MODE !== 'production') console.debug(offerDataWithAmount);
            console.log(t('offer_fetch_error'));

            if (offerErrorWithAmount || !offerDataWithAmount) {
                console.error('Error fetching offer data:', sanitizeError(offerErrorWithAmount));
                throw new Error(t('error_fetching_offer_data'));
            }

            const adType = offerDataWithAmount.type;
            let price = offerDataWithAmount.amount;
            console.log(t('ad_type'), adType);
            console.log(t('price_from_ads_offar'), price);

            // 2. جلب السعر و duration_days من جدول ads_price (تم إزالة bonus_offer)
            console.log(t('fetching_price_duration'));
            const { data: priceData, error: priceError } = await supabase
                .from('ads_price')
                .select('amount, duration_days')
                .eq('type', adType)
                .maybeSingle();

            console.log(t('price_data_from_ads_price'), priceData);
            console.log(t('price_fetch_error'), priceError);

            if (priceError) {
                console.error('Error fetching offer price:', sanitizeError(priceError));
                throw new Error(t('error_fetching_offer_data'));
            }

            // إذا لم يوجد صف في ads_price: لا نرمي استثناء، نستخدم القيم من ads_offar كـ fallback
            if (!priceData) {
                console.log(t('no_price_row_fallback'));
            }

            // استخدام السعر من ads_price إذا كان موجوداً، وإلا من ads_offar
            price = (priceData && priceData.amount) ? priceData.amount : price;

            // استخدام duration_days من ads_price إذا كان موجوداً، وإلا من ads_offar
            const durationDays = (priceData && priceData.duration_days) ? priceData.duration_days : (offerData.duration_days || 1);

            console.log(t('final_price'), price);
            console.log(t('ad_duration_days'), durationDays);

            // ⭐ جلب بيانات العمل التجاري للمستخدم الحالي
            const { data: businessData, error: businessError } = await supabase
                .from('businesses')
                .select('store_name, phone')
                .eq('user_id', user.id)
                .maybeSingle();

            if (businessError) {
                throw new Error(t('error_fetching_business_data') + ': ' + businessError.message);
            }

            // تجهيز بيانات الدفع لإرسالها للسيرفر
            console.log(t('preparing_payment_data'));
            const activePromoCode = promoDetails && promoInput.trim().toLocaleUpperCase() === promoDetails.code.toLocaleUpperCase()
                ? promoDetails.code
                : null;
            const paymentAmount = activePromoCode ? promoDetails.discounted_price : price;
            const paymobData = {
                amount: paymentAmount,
                promoCode: activePromoCode,
                // ⭐ استخدام بيانات المستخدم الحالي
                email: user.email || '',
                name: businessData?.store_name || user.username || '',
                phone: businessData?.phone || user.phoneNumber || '',
                merchantOrderId: `ads_payment-${Date.now()}`,
                signature: null,
                timestamp: null,
                offerData: {
                    // ⭐ استخدام بيانات المستخدم الحالي
                    user_id: user.id,
                    store_name: businessData?.store_name || t('undefined_store'),
                    phone: businessData?.phone || user.phoneNumber || '',
                    duration_days: durationDays,
                    type: adType,
                    amount: price,
                    offer_id: offerIdNum,
                    Actual_payment_date: new Date().toISOString()
                },
                redirect_url_success: `https://imei-safe.me/paymob/redirect-success`,
                redirect_url_failed: `https://imei-safe.me/paymob/redirect-failed`
            };

            // إرسال الطلب للسيرفر البعيد
            console.log(t('sending_payment_request'));
            // لا نُسجل بيانات الدفع الحساسة في الكونسول (amount, user, email)
            console.log(t('sending_offer_request'), { offerId: offerIdNum, merchantOrderId: paymobData.merchantOrderId });

            // تحقق سريع من صحة بيانات الدفع على العميل قبل الطلب للخادم
            const validatePaymentData = (data: any) => {
                if (!data) throw new Error('Invalid payment data');
                if (!data.amount || isNaN(Number(data.amount)) || Number(data.amount) <= 0) throw new Error(t('invalid_amount'));
                if (!data.merchantOrderId || typeof data.merchantOrderId !== 'string') throw new Error(t('missing_order_id'));
                if (!data.offerData || !data.offerData.offer_id) throw new Error(t('invalid_offer'));
                // basic contact validation
                if (!data.email || !data.name) throw new Error(t('invalid_user_data'));
                return true;
            };
            try {
                validatePaymentData(paymobData);
            } catch (validationErr) {
                throw new Error(validationErr.message || t('invalid_payment_data'));
            }

            // ⭐️ الحصول على توقيع صالح من الخادم قبل إرسال طلب الدفع
            const timestamp = Date.now();
            let signature = null;
            try {
                // احصل على التوكن من جلسة صالحة
                const sessionObj = await validateSession();
                const token = sessionObj?.access_token;
                if (!token) throw new Error(t('must_login_for_offer'));

                // محاولة جلب التوقيع مع إعادة بسيطة عند انتهاء المهلة أو فشل الشبكة
                const fetchSignatureWithRetry = async (attempts = 2, delayMs = 1000) => {
                    let lastErr: any = null;
                    for (let i = 0; i < attempts; i++) {
                        try {
                            const resp = await axiosInstance.post(
                                'https://imei-safe.me/paymob/sign',
                                { merchantOrderId: paymobData.merchantOrderId, offerId: offerIdNum, offerData: paymobData.offerData, promoCode: paymobData.promoCode, timestamp },
                                { timeout: 15000, headers: { Authorization: `Bearer ${token}` } }
                            );
                            return resp.data;
                        } catch (err) {
                            lastErr = err;
                            // إذا لم يعد هناك محاولات، أعد الخطأ
                            if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
                        }
                    }
                    throw lastErr;
                };

                const signJson = await fetchSignatureWithRetry(2, 1000);
                signature = signJson.signature || null;
            } catch (e: any) {
                console.error('Failed to obtain signature for payment:', e);
                // عالج حالات انتهاء المهلة بشكل أوضح
                if (e && e.name === 'AbortError') {
                    throw new Error(t('error_fetching_signature_timeout') || 'انتهت مهلة طلب التوقيع، حاول مرة أخرى.');
                }
                throw new Error(e.message || t('error_fetching_signature'));
            }

            // أرفق التوقيع والطابع الزمني في الطلب النهائي
            paymobData.signature = signature;
            paymobData.timestamp = timestamp;

            // افتح نافذة فارغة فورًا لتجنّب حظر النوافذ المنبثقة في المتصفّحات
            let popup: Window | null = null;
            if (!Capacitor.isNativePlatform()) {
                try {
                    // افتح نافذة فارغة بدون flags التي قد تمنع التحكم بها لاحقاً
                    popup = window.open('about:blank', '_blank');
                } catch (e) {
                    popup = null;
                }
            }

            // Get latest validated session token for authenticated requests
            const sessionForPayment = await validateSession();
            const tokenForPayment = sessionForPayment?.access_token;
            const paymentResponse = await axiosInstance.post(
                'https://imei-safe.me/paymob/create-offer-payment',
                paymobData,
                { timeout: 10000, headers: tokenForPayment ? { Authorization: `Bearer ${tokenForPayment}` } : {} }
            );

            const paymentData = paymentResponse.data;

            // تحديث الحقول الجديدة مباشرة في قاعدة البيانات (تم إزالة Actual_bonus)
            if (paymentData.payment_id) {
                try {
                    const { error: updateError } = await supabase
                        .from('ads_payment')
                        .update({
                            Actual_payment_date: new Date().toISOString()
                        })
                        .eq('id', paymentData.payment_id);

                    if (updateError) {
                        console.error(t('error_updating_fields'), updateError);
                    } else {
                        console.log(t('fields_updated_successfully'));
                    }
                } catch (error) {
                    console.error(t('error_updating_fields'), error);
                }
            }

            // دالة لتحديث دور المستخدم وتاريخ انتهاء الصلاحية
            const updateUserRoleAndExpiry = async (paymentId: string) => {
                try {
                    // جلب بيانات الدفع للحصول على نوع الإعلان ومدة الصلاحية
                    const { data: paymentData, error: paymentError } = await supabase
                        .from('ads_payment')
                        .select('type, duration_days')
                        .eq('id', paymentId)
                        .maybeSingle();

                    if (paymentError || !paymentData) {
                        console.error('Error fetching payment data:', paymentError);
                        return;
                    }

                    // حساب تاريخ انتهاء الصلاحية بناءً على مدة الاشتراك
                    const currentDate = new Date();
                    const expiryDate = new Date(currentDate.getTime() + (paymentData.duration_days || 1) * 24 * 60 * 60 * 1000);

                    // تحديث دور المستخدم وتاريخ انتهاء الصلاحية
                    const { error: updateError } = await supabase
                        .from('users')
                        .update({
                            role: paymentData.type,
                            expires_at: expiryDate.toISOString()
                        })
                        .eq('id', user.id);

                    if (updateError) {
                        console.error('Error updating user role and expiry:', updateError);
                    } else {
                        console.log('User role and expiry updated successfully');
                        console.log('Role:', paymentData.type);
                        console.log('Expires at:', expiryDate.toISOString());
                    }
                } catch (error) {
                    console.error('Error in updateUserRoleAndExpiry:', error);
                }
            };

            // دالة لمراقبة حالة الدفع (تم إزالة تحديث transaction إلى bonus_add)
            // دالة لمراقبة حالة الدفع (الآن يتم تحديث الدور وتاريخ الانتهاء من السيرفر للأمان)
            const monitorPaymentStatus = async (paymentId: string) => {
                const id = window.setInterval(async () => {
                    if (!paymentMonitorRef.current) paymentMonitorRef.current = id;
                    try {
                        const { data: paymentRecord, error: fetchError } = await supabase
                            .from('ads_payment')
                            .select('payment_status, transaction, user_id')
                            .select('payment_status')
                            .eq('id', paymentId)
                            .maybeSingle();

                        if (fetchError) {
                            console.error('Error fetching payment record:', fetchError);
                            // إذا كان الخطأ 406، فهذا يعني غالباً أن السجل غير موجود أو RLS تمنع الوصول
                            return;
                        }
                        if (paymentRecord?.payment_status === 'paid' && paymentMonitorRef.current) {
                            clearInterval(paymentMonitorRef.current);
                            paymentMonitorRef.current = null;
                            console.log('Payment success detected');
                        }

                        console.log('فحص حالة الدفع:', paymentRecord);

                        // إذا تم تحديث payment_status إلى paid
                        if (paymentRecord?.payment_status === 'paid') {
                            if (paymentMonitorRef.current) {
                                clearInterval(paymentMonitorRef.current);
                                paymentMonitorRef.current = null;
                            }

                            // تحديث دور المستخدم وتاريخ انتهاء الصلاحية
                            await updateUserRoleAndExpiry(paymentId);

                            console.log('تم الدفع بنجاح');
                        }
                    } catch (error) {
                        console.error('خطأ في مراقبة حالة الدفع:', error);
                    }
                }, 3000); // فحص كل 3 ثوانٍ
            };
            if (paymentData.iframe_url) {
                if (Capacitor.isNativePlatform()) {
                    await Browser.open({ url: paymentData.iframe_url, toolbarColor: '#000000' });
                } else if (popup) {
                    try {
                        popup.location.href = paymentData.iframe_url;
                    } catch (e) {
                        // fallback: navigate current window if popup cannot be controlled
                        try { window.location.href = paymentData.iframe_url; } catch (e2) { window.open(paymentData.iframe_url, '_blank'); }
                    }
                } else {
                    window.open(paymentData.iframe_url, '_blank', 'noopener,noreferrer');
                }

                // بدء مراقبة حالة الدفع
                if (paymentData.payment_id) {
                    monitorPaymentStatus(paymentData.payment_id);
                }

                // تم إزالة الاستماع لرسالة payment_success وتحديث البونص
            } else if (paymentData.ok) {
                // الخادم أنشأ سجل دفع لكن لم يعِد رابط بوابة الدفع
                const pid = paymentData.payment_id ? `#${paymentData.payment_id}` : '';
                // أغلق أي نافذة منبثقة مفتوحة لتجنب about:blank
                try {
                    if (popup && !popup.closed) popup.close();
                } catch (e) { /* ignore */ }
                setPayError(t('payment_created_but_no_gateway') || `تم إنشاء الدفع ${pid} لكن لم يتم إنشاء بوابة الدفع. الرجاء المحاولة لاحقًا أو التواصل مع الدعم.`);
                // ابدأ مراقبة حالة الدفع إن وُجد payment_id
                if (paymentData.payment_id) {
                    monitorPaymentStatus(paymentData.payment_id);
                    // جرب استعلامًا ثانويًا للحصول على iframe_url المخزّن على الخادم
                    (async () => {
                        try {
                            const sessionObj = await validateSession();
                            const token = sessionObj?.access_token;
                            const headers = Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {});
                            const resp = await secureFetch(`https://imei-safe.me/paymob/payment-link?payment_id=${paymentData.payment_id}`, { method: 'GET', headers }, 7000);
                            if (resp.ok) {
                                const linkJson = await resp.json();
                                if (linkJson.iframe_url) {
                                    // افتح البوابة الآن
                                    if (Capacitor.isNativePlatform()) {
                                        await Browser.open({ url: linkJson.iframe_url, toolbarColor: '#000000' });
                                    } else {
                                        window.open(linkJson.iframe_url, '_blank', 'noopener,noreferrer');
                                    }
                                    // امسح رسالة الخطأ
                                    setPayError(null);
                                }
                            } else {
                                console.warn('Payment link fetch returned non-ok:', resp.status, await resp.text().catch(() => ''));
                            }
                        } catch (e) {
                            // تجاهل أخطاء الطلب الثانوي
                            console.warn('Failed to fetch payment link from server:', e);
                        }
                    })();
                }
            } else {
                throw new Error(t('error_creating_payment_link'));
            }
        } catch (err: any) {
            setPayError(err.message || t('error_during_payment'));
        } finally {
            setIsPaying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950" style={{ padding: 0, margin: 0 }}>
            {showCheckoutPanel ? (
                <div
                    className="absolute inset-0 z-20 flex items-end justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:items-center sm:p-6"
                    onClick={() => setShowCheckoutPanel(false)}
                >
                    <div className="my-auto w-full max-w-xl" onClick={(event) => event.stopPropagation()}>
                        <section role="dialog" aria-modal="true" aria-labelledby="offer-checkout-title" className="max-h-[calc(100dvh-24px)] overflow-y-auto rounded-2xl border border-blue-200 bg-white p-3 text-slate-900 shadow-[0_20px_60px_rgba(15,23,42,0.38)] sm:p-5">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <h2 id="offer-checkout-title" className="text-base font-extrabold text-blue-950">تفاصيل الاشتراك</h2>
                            <div className="flex items-center gap-2">
                                {promoDetails && <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-extrabold text-orange-800">تم التفعيل</span>}
                                <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-100" onClick={() => setShowCheckoutPanel(false)} aria-label="إغلاق تفاصيل الاشتراك">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <label htmlFor="offer-promo-code" className="mb-2 block text-sm font-bold text-blue-950">كود الخصم</label>
                        <div className="flex gap-2">
                            <input
                                id="offer-promo-code"
                                autoComplete="off"
                                className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-center font-bold text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                                dir="ltr"
                                value={promoInput}
                                onChange={(event) => {
                                    setPromoInput(event.target.value);
                                    setPromoDetails(null);
                                    setPromoStatus('idle');
                                    setPromoError(null);
                                }}
                                placeholder="اكتب البروموكود"
                            />
                            <button
                                type="button"
                                className="h-11 min-w-20 rounded-lg bg-blue-800 px-4 font-extrabold text-white shadow-sm transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={handleActivatePromoCode}
                                disabled={promoStatus === 'loading'}
                            >
                                {promoStatus === 'loading' ? 'جارٍ التحقق...' : 'تفعيل'}
                            </button>
                        </div>
                        <div className="h-5 pt-1 text-xs font-semibold text-red-600" role="status" aria-live="polite">
                            {promoStatus === 'error' ? promoError : ''}
                        </div>

                        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50 px-3">
                            <div className="flex min-h-8 items-center justify-between gap-3">
                                <span className="text-sm font-semibold text-slate-600">السعر قبل الخصم</span>
                                <strong className={`text-sm font-extrabold ${promoDetails ? 'text-slate-500 line-through' : 'text-slate-900'}`} dir="ltr">
                                    {new Intl.NumberFormat('ar-EG', { style: 'currency', currency: promoDetails?.currency || 'EGP' }).format(Number(promoDetails?.original_price ?? originalOfferPricing.amount) || 0)}
                                </strong>
                            </div>
                            <div className="flex min-h-9 items-center justify-between gap-3">
                                <span className="text-sm font-bold text-slate-700">السعر النهائي</span>
                                <strong className="text-lg font-black text-orange-700" dir="ltr">
                                    {new Intl.NumberFormat('ar-EG', { style: 'currency', currency: promoDetails?.currency || 'EGP' }).format(Number(promoDetails?.discounted_price ?? originalOfferPricing.amount) || 0)}
                                </strong>
                            </div>
                            <div className="flex min-h-8 items-center justify-between gap-3">
                                <span className="text-sm font-semibold text-slate-600">المدة</span>
                                <strong className="text-sm font-extrabold text-slate-900">
                                    {promoDetails ? `${Number(promoDetails.duration_months) || 0} شهر` : `${Number(originalOfferPricing.durationDays) || 0} يوم`}
                                </strong>
                            </div>
                            <div className="flex min-h-8 items-center justify-between gap-3">
                                <span className="text-sm font-semibold text-slate-600">نسبة الخصم</span>
                                <strong className="text-sm font-black text-orange-700">{Number(promoDetails?.discount_percentage) || 0}%</strong>
                            </div>
                            <div className="flex min-h-8 items-center justify-between gap-3">
                                <span className="text-sm font-semibold text-slate-600">صالح حتى</span>
                                <strong className="text-xs font-bold text-slate-800" dir="auto">
                                    {promoDetails && Number.isFinite(new Date(promoDetails.expires_at).getTime())
                                        ? new Date(promoDetails.expires_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })
                                        : '0'}
                                </strong>
                            </div>
                        </div>

                        <button className="mt-3 h-12 w-full rounded-lg bg-orange-500 px-6 font-extrabold text-white shadow-md transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60" onClick={handleOfferPayment} disabled={isPaying}>
                            {isPaying ? 'جارٍ تجهيز الاشتراك...' : 'متابعة للدفع'}
                        </button>
                    </section>
                </div>
                </div>
            ) : (
                <button
                    type="button"
                    className="absolute bottom-6 left-1/2 z-10 h-14 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 rounded-xl bg-orange-500 px-6 text-lg font-extrabold text-white shadow-[0_10px_28px_rgba(15,23,42,0.35)] transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
                    onClick={() => setShowCheckoutPanel(true)}
                >
                    اشترك في العرض
                </button>
            )}
            {payError && <div className="absolute bottom-24 left-1/2 z-10 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 rounded-lg bg-white/95 p-3 text-center text-sm font-bold text-red-700 shadow-lg" role="alert">{payError}</div>}
            <div
                className="absolute inset-0 z-0"
            >
                <img
                    src={imageUrl}
                    alt={t('offer_image')}
                    className="h-full w-full object-contain"
                    onLoad={(e) => {
                        console.log(
                            e.currentTarget.naturalWidth,
                            e.currentTarget.naturalHeight
                        );
                    }}
                />
            </div>
        </div>
    );
};

export default OffersGallery;
