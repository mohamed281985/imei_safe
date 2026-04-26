import React, { useEffect, useState } from 'react';
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

const OffersGallery = () => {
    useScrollToTop();
    const [imageUrl, setImageUrl] = useState<string | null>(null);
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
            const urlParams = new URLSearchParams(location.search);
            const currentAdId = urlParams.get('id');

            if (currentAdId) {
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
                    .single();
                    
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
                .single();
            if (offerError || !offerData) throw new Error(t('error_fetching_offer_data'));

            // جلب نوع الإعلان وسعره مباشرة من Supabase
            // 1. جلب نوع الإعلان من جدول ads_offar
            console.log(t('fetching_offer_data'), offerId);
            const { data: offerDataWithAmount, error: offerErrorWithAmount } = await supabase
                .from('ads_offar')
                .select('*')
                .eq('id', offerIdNum)
                .single();

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

            // 2. جلب السعر و duration_days و bonus_offer من جدول ads_price
            console.log(t('fetching_price_duration_bonus'));
            const { data: priceData, error: priceError } = await supabase
                .from('ads_price')
                .select('amount, duration_days, bonus_offer')
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

            // استخدام bonus_offer من ads_price إذا كان موجوداً، وإلا من 0
            const bonusOffer = (priceData && priceData.bonus_offer) ? priceData.bonus_offer : 0;

            console.log(t('final_price'), price);
            console.log(t('ad_duration_days'), durationDays);
            console.log(t('bonus_offer'), bonusOffer);

            // ⭐ جلب بيانات العمل التجاري للمستخدم الحالي
            const { data: businessData, error: businessError } = await supabase
                .from('businesses')
                .select('store_name, phone')
                .eq('user_id', user.id)
                .single();

            if (businessError && businessError.code !== 'PGRST116') { // PGRST116: no rows found
                throw new Error(t('error_fetching_business_data') + ': ' + businessError.message);
            }

            // تجهيز بيانات الدفع لإرسالها للسيرفر
            console.log(t('preparing_payment_data'));
            const paymobData = {
                amount: price,
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
                    bonus_offer: bonusOffer,
                    Actual_bonus: bonusOffer,
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
                                { merchantOrderId: paymobData.merchantOrderId, offerId: offerIdNum, offerData: paymobData.offerData, timestamp },
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
            const isCapacitorBrowserAvailable = (window as any).Capacitor && (window as any).Capacitor.Plugins && (window as any).Capacitor.Plugins.Browser;
            if (!isCapacitorBrowserAvailable) {
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
            
            // تحديث الحقول الجديدة مباشرة في قاعدة البيانات
            if (paymentData.payment_id) {
                try {
                    const { error: updateError } = await supabase
                        .from('ads_payment')
                        .update({
                            Actual_bonus: bonusOffer,
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

            // دالة لتحديث transaction إلى bonus_add عند نجاح الدفع
            const updateTransactionToBonusAdd = async (paymentIdFromServer?: string) => {
                try {
                    if (paymentIdFromServer) {
                        // التحقق من قيمة transaction و payment_status قبل التحديث
                        const { data: paymentData } = await supabase
                            .from('ads_payment')
                            .select('transaction, payment_status')
                            .eq('id', paymentIdFromServer)
                            .single();

                        console.log('بيانات السجل:', paymentData);

                        // تحديث فقط إذا كان payment_status=paid و transaction null أو ليس bonus_add
                        if (paymentData?.payment_status === 'paid' && (!paymentData.transaction || paymentData.transaction !== 'bonus_add')) {
                            const { error } = await supabase
                                .from('ads_payment')
                                .update({ transaction: 'bonus_add' })
                                .eq('id', paymentIdFromServer);

                            if (!error) {
                                console.log('تم تحديث transaction للسجل رقم', paymentIdFromServer, 'إلى bonus_add (من payment_id)');
                            } else {
                                console.log('فشل تحديث transaction باستخدام payment_id:', error.message);
                            }
                        } else {
                            console.log('لم يتم تحديث transaction: السجل payment_status ليس paid أو transaction بالفئة bonus_add');
                        }
                        return;
                    }

                    // fallback: البحث عن آخر سجل مدفوع
                    const { data: lastPayment } = await supabase
                        .from('ads_payment')
                        .select('id, transaction, payment_status')
                        .eq('user_id', user.id)
                        .eq('payment_status', 'paid')
                        .order('payment_date', { ascending: false })
                        .limit(1)
                        .single();

                    console.log('آخر سجل مدفوع:', lastPayment);

                    // تحديث فقط إذا كان transaction null أو ليس bonus_add
                    if (lastPayment?.id && (!lastPayment.transaction || lastPayment.transaction !== 'bonus_add')) {
                        const { error } = await supabase
                            .from('ads_payment')
                            .update({ transaction: 'bonus_add' })
                            .eq('id', lastPayment.id);

                        if (!error) {
                            console.log('تم تحديث transaction للسجل رقم', lastPayment.id, 'إلى bonus_add (fallback)');
                        } else {
                            console.log('فشل تحديث transaction للسجل:', error.message);
                        }
                    } else {
                        console.log('لم يتم تحديث transaction: السجل غير موجود أو transaction بالفعل bonus_add');
                    }
                } catch (error) {
                    console.error('خطأ في تحديث transaction:', error);
                }
            };

            // دالة لمراقبة حالة الدفع وتحديث transaction عند نجاح الدفع
            const monitorPaymentStatus = async (paymentId: string) => {
                const checkInterval = setInterval(async () => {
                    try {
                        const { data: paymentRecord } = await supabase
                            .from('ads_payment')
                            .select('payment_status, transaction')
                            .eq('id', paymentId)
                            .single();

                        console.log('فحص حالة الدفع:', paymentRecord);

                        // إذا تم تحديث payment_status إلى paid
                        if (paymentRecord?.payment_status === 'paid') {
                            clearInterval(checkInterval);

                            // تحديث transaction إلى bonus_add إذا لزم الأمر
                            if (!paymentRecord.transaction || paymentRecord.transaction !== 'bonus_add') {
                                const { error } = await supabase
                                    .from('ads_payment')
                                    .update({ transaction: 'bonus_add' })
                                    .eq('id', paymentId);

                                if (!error) {
                                    console.log('تم تحديث transaction إلى bonus_add تلقائيًا بعد نجاح الدفع');
                                    // تحديث البونص في AppNavbar
                                    const event = new CustomEvent('bonusUpdated', {
                                        detail: {
                                            hasBonus: true,
                                            bonusAmount: 0 // سيتم تحديثه من الخادم
                                        }
                                    });
                                    window.dispatchEvent(event);
                                } else {
                                    console.log('فشل تحديث transaction بعد نجاح الدفع:', error.message);
                                }
                            }
                        }
                    } catch (error) {
                        console.error('خطأ في مراقبة حالة الدفع:', error);
                    }
                }, 3000); // فحص كل 3 ثوانٍ
            };
            if (paymentData.iframe_url) {
                if (isCapacitorBrowserAvailable) {
                    await (window as any).Capacitor.Plugins.Browser.open({ url: paymentData.iframe_url, toolbarColor: '#000000' });
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

                // الاستماع لنجاح الدفع عبر رسالة من صفحة الدفع (في حال تم دمج ذلك في صفحة الدفع)
                window.addEventListener('message', async (event) => {
                    if (event.data === 'payment_success') {
                        await updateTransactionToBonusAdd(paymentData.payment_id);
                    }
                });
            } else if (paymentData.ok) {
                // الخادم أنشأ سجل دفع لكن لم يعِد رابط بوابة الدفع
                const pid = paymentData.payment_id ? `#${paymentData.payment_id}` : '';
                // أغلق أي نافذة منبثقة مفتوحة لتجنب about:blank
                try {
                    if (popup && !popup.closed) popup.close();
                } catch (e) { /* ignore */ }
                setPayError(t('payment_created_but_no_gateway') || `تم إنشاء الدفع ${pid} لكن لم يتم إنشاء بوابة الدفع. الرجاء المحاولة لاحقًا أو التواصل مع الدعم.`);
                // ابدأ مراقبة حالة الدفع إن وُجد payment_id لكي يتم تحديث transaction تلقائيًا عند الدفع
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
                                    if (isCapacitorBrowserAvailable) {
                                        await (window as any).Capacitor.Plugins.Browser.open({ url: linkJson.iframe_url, toolbarColor: '#000000' });
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
        <div className="fixed inset-0 w-full h-full bg-black flex flex-col items-center justify-center z-50" style={{ padding: 0, margin: 0 }}>
            <div className="absolute bottom-16 left-0 w-full flex flex-col items-center z-20 px-4">
                <button className="bg-red-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg" onClick={handleOfferPayment} disabled={isPaying}>اشترك في العرض</button>
                {payError && <div className="text-red-500 mt-4 text-xl text-center max-w-[80%]">{payError}</div>}
            </div>
            <img
                src={imageUrl}
                alt={t('offer_image')}
                className="w-full h-full object-cover"
                style={{ 
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    zIndex: 0,
                    overflow: 'hidden'
                }}
            />

        </div>
    );
};

export default OffersGallery;
