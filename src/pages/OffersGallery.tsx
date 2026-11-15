import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getSecureItem, setSecureItem } from '@/utils/secureStorage';
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
        let popup: Window | null = null;
        if (!Capacitor.isNativePlatform()) {
            popup = window.open('about:blank', '_blank');
        }
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

            // ⭐ جلب بيانات العمل التجاري للمستخدم الحالي
            const { data: businessData, error: businessError } = await supabase
                .from('businesses')
                .select('store_name, phone')
                .eq('user_id', user.id)
                .maybeSingle();

            if (businessError) {
                throw new Error(t('error_fetching_business_data') + ': ' + businessError.message);
            }

            const activePromoCode = promoDetails && promoInput.trim().toLocaleUpperCase() === promoDetails.code.toLocaleUpperCase()
                ? promoDetails.code
                : null;

            // Unified Checkout calculates the authoritative amount on the server.
            const sessionForPayment = await validateSession();
            const tokenForPayment = sessionForPayment?.access_token;
            if (!tokenForPayment) throw new Error(t('must_login_for_offer'));

            const paymentResponse = await axiosInstance.post(
                'https://imei-safe.me/api/paymob/unified/create-intention',
                {
                    flow: 'offer',
                    offerId: offerIdNum,
                    promoCode: activePromoCode,
                    email: user.email || '',
                    name: businessData?.store_name || user.username || '',
                    phone: businessData?.phone || user.phoneNumber || '',
                    offerData: {
                        offer_id: offerIdNum,
                        store_name: businessData?.store_name || t('undefined_store'),
                    },
                },
                { timeout: 25000, headers: { Authorization: `Bearer ${tokenForPayment}` } }
            );

            const paymentData = paymentResponse.data;
            if (!paymentData?.checkout_url) {
                throw new Error(paymentData?.error || 'لم يُرجع الخادم رابط الدفع الموحد.');
            }

            if (Capacitor.isNativePlatform()) {
                await Browser.open({ url: paymentData.checkout_url, toolbarColor: '#000000' });
            } else if (popup && !popup.closed) {
                popup.location.replace(paymentData.checkout_url);
            } else {
                window.location.assign(paymentData.checkout_url);
            }
            setShowCheckoutPanel(false);
            return;
        } catch (err: any) {
            if (popup && !popup.closed) popup.close();
            setPayError(err.response?.data?.error || err.response?.data?.message || err.message || t('error_during_payment'));
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
