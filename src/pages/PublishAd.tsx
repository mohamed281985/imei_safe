import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useGeolocated } from 'react-geolocated';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { generateRandomFilename, sanitizeFilename } from '@/lib/storageUtils';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Browser } from '@capacitor/browser';
import axiosInstance from '@/services/axiosInterceptor';

// طلب توقيع من الخادم. يجب أن يتم التوقيع الحقيقي على الخادم.
const requestSignature = async (payload: { merchantOrderId: string; amount: number; timestamp: number; offerId?: string; offerData?: { type: string; duration_days: number | null } }) => {
  try {
    const resp = await axiosInstance.post('https://imei-safe.me/paymob/sign', payload);
    return resp.data.signature as string;
  } catch (err: any) {
    throw new Error(err.response?.data?.error || 'Failed to obtain signature');
  }
};

// UI Components
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import BackButton from '../components/BackButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

// Icons
import { Upload, Store, Link as LinkIcon, CalendarDays, Send, MapPin, X, Phone, Gift } from 'lucide-react';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import AdImagePreviewModal from '../components/AdImagePreviewModal';

const PublishAd: React.FC = () => {
  useScrollToTop();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const [searchParams] = useSearchParams();
  const [adId, setAdId] = useState<string | null>(null);
  const [adImage, setAdImage] = useState<File | null>(null);
  const [adImagePreview, setAdImagePreview] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [whatsapp, setWhatsapp] = useState(false);
  const [duration, setDuration] = useState('7'); // Default duration
  const [adPrice, setAdPrice] = useState<number | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [availableDurations, setAvailableDurations] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  // استخدام useRef لتتبع وضع التحديث
  const isUpdateModeRef = useRef(false);
  const [isUpdateMode, setIsUpdateMode] = useState(false);
  const [bonusBalance, setBonusBalance] = useState(0);

  // دالة لجلب سعر الإعلان بناءً على المدة
  const fetchAdPrices = async () => {
    try {
      const { data, error } = await supabase
        .from('ads_price')
        .select('duration_days, amount') // جلب الأعمدة المطلوبة فقط
        .eq('type', 'publish'); // جلب أسعار إعلانات النشر العامة

      if (error) {
        console.error('Error fetching publish ad prices:', error);
        return null;
      }

      if (data) {
        const pricesMap = data.reduce((acc, price) => {
          acc[price.duration_days] = price.amount;
          return acc;
        }, {} as Record<string, number>);

        // استخراج المدد المتاحة وترتيبها
        const durations = data.map(item => item.duration_days.toString()).sort((a, b) => parseInt(a) - parseInt(b));
        setAvailableDurations(durations);

        setPrices(pricesMap);
        if (!isUpdateMode) {
          // التحقق من أن المدة الافتراضية (7) متوفرة، وإلا اختيار أول مدة متاحة
          const defaultDuration = durations.includes('7') ? '7' : durations[0] || '';
          setDuration(defaultDuration);
          setAdPrice(pricesMap[defaultDuration] || null);
        }
        return pricesMap;
      } else {
        setPrices({});
        setAvailableDurations([]);
        return null;
      }
    } catch (error) {
      console.error('Error in fetchAdPrices:', error);
      return null;
    }
  }

  // تحديث isUpdateModeRef عند تغيير adId
  useEffect(() => {
    const updateMode = !!adId;
    isUpdateModeRef.current = updateMode;
    setIsUpdateMode(updateMode);
  }, [adId]);

  // Effect لجلب سعر الإعلان عند تغيير المدة
  useEffect(() => {
    setAdPrice(prices[duration] || null);
  }, [duration, prices]);

  // متغير للعرض في واجهة المستخدم تم تعريفه أعلاه
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);


  // متغيرات الدفع داخل التطبيق
  const [showPayment, setShowPayment] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState('');

  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    width: 100,
    height: 56.25, // 9/16 of 100 for 16:9 ratio
    x: 0,
    y: 21.875 // Centered vertically: (100 - 56.25) / 2
  });
  const [completedCrop, setCompletedCrop] = useState<Crop | null>(null);

  const { coords, isGeolocationAvailable, isGeolocationEnabled } = useGeolocated({
    positionOptions: {
      enableHighAccuracy: true,
    },
    userDecisionTimeout: 5000,
  });

  // API base (can be empty to use same-origin). Use Vite env when available.
  const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '';
  const api = (path: string) => (API_BASE ? `${API_BASE}${path}` : path);

  // Replace hardcoded token usage
  const API_TOKEN = (import.meta as any).env?.VITE_API_TOKEN;

  // Effect to check for an ad ID in the URL for editing
  useEffect(() => {
    const id = searchParams.get('id');
    if (id) {
      setAdId(id);
      const fetchAdData = async () => {
        setIsLoading(true);

        try {
          // جلب الإعلان مباشرة من جدول publish_ad
          const { data: pubAd, error: pubErr } = await supabase
            .from('publish_ad')
            .select('*')
            .eq('id', id)
            .single();

          if (pubErr) {
            console.error('Error loading ad from publish_ad:', pubErr);
            toast({ title: t('error'), description: t('error_fetching_ad_details'), variant: 'destructive' });
            navigate('/myads');
            return;
          }

          if (!pubAd) {
            toast({ title: t('error'), description: t('ad_not_found'), variant: 'destructive' });
            navigate('/myads');
            return;
          }

          // Populate form with existing ad data
          setStoreName(pubAd.store_name || '');
          setWhatsapp(!!pubAd.whatsapp);
          setPhoneNumber(normalizePhoneNumber(pubAd.phone) || '');
          const durationDays = String(pubAd.duration_days || '7');
          setDuration(durationDays);
          setAdImagePreview(pubAd.image_url);

          const fetchedPrices = await fetchAdPrices();
          if (fetchedPrices && fetchedPrices[durationDays]) {
            setAdPrice(fetchedPrices[durationDays]);
          }
        } catch (err) {
          console.error('Error fetching ad from publish_ad:', err);
          toast({ title: t('error'), description: t('error_fetching_ad_details'), variant: 'destructive' });
          navigate('/myads');
        } finally {
          setIsLoading(false);
        }
      };
      fetchAdData();
    } else {
      // جلب الأسعار في وضع الإنشاء
      fetchAdPrices();
    }
  }, [adId, searchParams, navigate, t, toast]);


  // Effect to auto-fill store name and phone from business profile
  useEffect(() => {
    const loadBusinessData = async () => {
      // Only run if creating a new ad and user is logged in
      if (user && !adId) {
        try {
          // Try to get decrypted business info from server
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

          const resp = await fetch(api('/api/businesses/me'), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
          if (!resp.ok) {
            throw new Error('failed');
          }
          const json = await resp.json();
          const business = json?.business;

          if (business) {
            setStoreName(prev => prev || business.store_name || '');
            setPhoneNumber(prev => prev || normalizePhoneNumber(business.phone) || '');
            if (business.store_name || business.phone) {
              toast({ title: t('success'), description: t('business_data_auto_filled') });
            }
          }
        } catch (error) {
          console.error('Error loading business data:', error);
        }
      }
    };
    loadBusinessData();
  }, [user, adId, toast]);

  // Effect لجلب سعر الإعلان عند تغيير المدة
  useEffect(() => {
    fetchAdPrices();
  }, []);

  useEffect(() => {
    setAdPrice(prices[duration] || null);
  }, [duration, prices]);

  // ⭐ جلب وتحديث رصيد البونص
  useEffect(() => {
    if (!user?.id) return;

    // 1. جلب أحدث رصيد بونص بنفس شروط السيرفر (bonus_add + paid)
    const fetchBonus = async () => {
      console.log("جاري جلب بيانات البونص للمستخدم:", user.id);
      const { data: bonusRecords, error: allRecordsError } = await supabase
        .from('ads_payment')
        .select('bonus_offer, expires_at, payment_date, transaction, payment_status, is_paid')
        .eq('user_id', user.id)
        .eq('transaction', 'bonus_add')
        .eq('is_paid', true)
        .eq('payment_status', 'paid')
        .order('payment_date', { ascending: false });

      if (allRecordsError) {
        console.error("خطأ في جلب سجلات الدفع:", allRecordsError);
        setBonusBalance(0);
        return;
      }

      if (bonusRecords && bonusRecords.length > 0) {
        const recordWithBonus = bonusRecords.find(record => record.bonus_offer != null && record.bonus_offer > 0);

        if (recordWithBonus) {
          const now = new Date();
          const expiresAt = recordWithBonus.expires_at ? new Date(recordWithBonus.expires_at) : null;

          // التحقق من أن الباقة لم تنتهِ صلاحيتها
          if (expiresAt && expiresAt > now) {
            const bonusValue = parseFloat(recordWithBonus.bonus_offer) || 0;
            setBonusBalance(bonusValue);
          } else {
            // إذا انتهت الصلاحية، يتم تعيين الرصيد إلى صفر
            setBonusBalance(0);
          }
        } else {
          setBonusBalance(0);
        }
      } else {
        setBonusBalance(0);
      }
    };

    fetchBonus();

    // Listener for bonus updates
    const handleBonusUpdate = () => fetchBonus();
    window.addEventListener('bonusUpdated', handleBonusUpdate);

    return () => window.removeEventListener('bonusUpdated', handleBonusUpdate);
  }, [user]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: t('error'), description: t('file_too_large'), variant: 'destructive' });
        return;
      }
      const reader = new FileReader();
      const img = new window.Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        if (img.width <= img.height) {
          toast({
            title: t('error_in_image_dimensions'),
            description: t('please_upload_landscape_image'),
            variant: 'destructive',
          });
          return;
        }
        setAdImage(file);
        reader.addEventListener('load', () => {
          setAdImagePreview(reader.result as string);
          setShowPreviewModal(true);
        });
        reader.readAsDataURL(file);
      };
    }
  };


  const getCroppedImg = async (
    image: HTMLImageElement,
    crop: Crop
  ): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('No 2d context');
    }

    // The crop dimensions are in display pixels, we need to scale them
    // to the natural image size to preserve quality.
    const sourceX = crop.x * scaleX;
    const sourceY = crop.y * scaleY;
    const sourceWidth = crop.width * scaleX;
    const sourceHeight = crop.height * scaleY;

    // To avoid overly large images, we can cap the output resolution.
    // 1920px is a good balance between quality and file size for web.
    const MAX_WIDTH_OR_HEIGHT = 1920;
    let outputWidth = sourceWidth;
    let outputHeight = sourceHeight;

    if (outputWidth > MAX_WIDTH_OR_HEIGHT || outputHeight > MAX_WIDTH_OR_HEIGHT) {
      const ratio = outputWidth / outputHeight;
      if (ratio > 1) { // Landscape
        outputWidth = MAX_WIDTH_OR_HEIGHT;
        outputHeight = MAX_WIDTH_OR_HEIGHT / ratio;
      } else { // Portrait or square
        outputHeight = MAX_WIDTH_OR_HEIGHT;
        outputWidth = MAX_WIDTH_OR_HEIGHT * ratio;
      }
    }

    canvas.width = Math.round(outputWidth);
    canvas.height = Math.round(outputHeight);

    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas is empty'));
            return;
          }
          resolve(blob);
        },
        'image/webp',
        0.9
      );
    });
  };

  const handleCropComplete = async () => {
    if (!imgRef.current || !completedCrop) return;

    try {
      const croppedBlob = await getCroppedImg(imgRef.current, completedCrop);
      setAdImage(new File([croppedBlob], 'cropped.webp', { type: 'image/webp' }));
      setAdImagePreview(URL.createObjectURL(croppedBlob));
      setIsEditing(false);
      toast({
        title: t('success'),
        description: t('image_cropped_successfully'),
        variant: 'default'
      });
    } catch (e) {
      console.error('Error cropping image:', e);
      toast({
        title: t('error'),
        description: t('error_cropping_image'),
        variant: 'destructive'
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const goToMyAdsAfterDelay = () => setTimeout(() => navigate('/myads'), 5000);
    if (!storeName || !phoneNumber) {
      toast({ title: t('error'), description: t('required_fields'), variant: 'destructive' });
      setIsLoading(false);
      goToMyAdsAfterDelay();
      return;
    }
    let activeUser = user;
    if (!activeUser) {
      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data?.session?.user;
        if (sessionUser) {
          activeUser = {
            id: sessionUser.id,
            email: sessionUser.email || '',
            username: sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.username || ''
          };
        }
      } catch (sessionErr) {
        console.error('Failed to read current session in PublishAd:', sessionErr);
      }
    }
    if (!activeUser) {
      toast({ title: t('error'), description: t('must_be_logged_in'), variant: 'destructive' });
      goToMyAdsAfterDelay();
      return;
    }

    setIsLoading(true);
    try {
      // 1. رفع الصورة إذا كانت جديدة
      let imageUrl = adImagePreview;
      if (adImage) {
        const safeOriginal = sanitizeFilename(adImage.name || 'upload');
        const randomName = generateRandomFilename(safeOriginal);
        const filePath = `ads/${activeUser.id}/${randomName}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('advertisements')
          .upload(filePath, adImage);
        if (uploadError || !uploadData) {
          throw uploadError;
        }
        const { data: { publicUrl } } = supabase.storage
          .from('advertisements')
          .getPublicUrl(filePath);
        imageUrl = publicUrl;
      }

      const durationDays = parseInt(duration, 10);
      if (!Number.isFinite(durationDays) || durationDays <= 0) {
        throw new Error('مدة الإعلان غير صالحة');
      }

      // Build ad payload for bonus route.
      const adPayload = {
        store_name: storeName,
        image_url: imageUrl,
        whatsapp: whatsapp,
        duration_days: durationDays,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        phone: phoneNumber || null,
        amount: adPrice ?? 0,
        upload_date: new Date().toISOString(),
        expires_at: (() => { const d = new Date(); d.setDate(d.getDate() + durationDays); return d.toISOString(); })(),
        type: 'publish',
        is_active: true
      };

      // If user has enough bonus (displayed balance), call secure server endpoint to publish using bonus.
      if (!isUpdateMode && bonusBalance > 0 && adPrice !== null && bonusBalance >= adPrice) {
        try {
          const bonusResp = await axiosInstance.post('https://imei-safe.me/paymob/publish-from-bonus', {
            adData: adPayload
          });
          if (!bonusResp?.data?.ok) {
            throw new Error(bonusResp?.data?.error || 'فشل في نشر الإعلان باستخدام البونص');
          }

          window.dispatchEvent(new CustomEvent('bonusUpdated'));
          toast({
            title: t('ad_published_from_bonus'),
            description: bonusResp?.data?.message || t('ad_published_successfully') || '',
            variant: 'default'
          });
          goToMyAdsAfterDelay();
          return;
        } catch (err: any) {
          const serverError = err?.response?.data?.error || err?.response?.data?.message || '';
          console.error('Error publishing using bonus (client):', {
            message: err?.message,
            status: err?.response?.status,
            data: err?.response?.data,
            sentPayload: adPayload
          });
          const recoverableBonusError =
            typeof serverError === 'string' &&
            (
              serverError.includes('No valid bonus balance available') ||
              serverError.includes('Insufficient bonus balance') ||
              serverError.includes('Unable to determine expected amount')
            );

          if (recoverableBonusError) {
            // الرصيد الظاهر في الواجهة قد لا يطابق تحقق السيرفر؛ أكمل لمسار الدفع العادي
            setBonusBalance(0);
          } else {
            toast({
              title: t('error'),
              description: serverError || err.message || t('bonus_deduction_error_desc'),
              variant: 'destructive'
            });
            setIsLoading(false);
            goToMyAdsAfterDelay();
            return;
          }
        }
      }

      // 4. إذا لم يوجد بونص كافٍ، فتح بوابة الدفع بنفس منطق SpecialAd
      const amount = prices[duration] || 0;
      const fullAdData = {
        user_id: activeUser.id,
        store_name: storeName,
        image_url: imageUrl,
        whatsapp: whatsapp,
        duration_days: duration ? parseInt(duration, 10) : null,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        phone: phoneNumber,
        upload_date: new Date().toISOString(),
        expires_at: (() => { const d = new Date(); d.setDate(d.getDate() + parseInt(duration, 10)); return d.toISOString(); })(),
        is_paid: false,
        payment_status: 'pending',
        type: 'publish',
        amount: amount,
        is_active: true, // تعيين الإعلان كنشط
        Actual_payment_date: new Date().toISOString()
      };
      const paymentData = {
        amount: amount,
        email: activeUser.email,
        name: storeName,
        phone: phoneNumber,
        merchantOrderId: `AD-${Date.now()}`,
        isSpecialAd: false,
        adData: fullAdData,
        redirect_url_success: `https://imei-safe.me/paymob/redirect-success`,
        redirect_url_failed: `https://imei-safe.me/paymob/redirect-failed`
      };

      // أرفق طابع زمني واطلب توقيعًا من الخادم قبل إرسال بيانات الدفع
      const timestamp = Date.now();
      let signature = '';
      try {
        signature = await requestSignature({
          merchantOrderId: paymentData.merchantOrderId,
          amount: paymentData.amount,
          timestamp,
          offerId: `publish-${fullAdData.duration_days ?? 'default'}`,
          offerData: { type: fullAdData.type, duration_days: fullAdData.duration_days }
        });
      } catch (err) {
        throw new Error('فشل الحصول على توقيع الدفع من الخادم');
      }

      const paymentPayload = { ...paymentData, timestamp, signature };

      const response = await axiosInstance.post('https://imei-safe.me/paymob/create-payment', paymentPayload);
      if (response.status !== 200) {
        const errorData = response.data;
        throw new Error(errorData.error || 'فشل في إنشاء عملية الدفع');
      }
      const data = response.data;
      if (data.iframe_url) {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
          await window.Capacitor.Plugins.Browser.open({ url: data.iframe_url, toolbarColor: '#000000' });
        } else {
          window.open(data.iframe_url, '_blank', 'noopener,noreferrer');
        }
        toast({ title: t('redirecting_to_payment'), description: t('redirecting_to_payment_desc') });
        goToMyAdsAfterDelay();
      } else if (data.payment_url) {
        window.open(data.payment_url, '_blank', 'noopener,noreferrer');
        toast({ title: t('redirecting_to_payment'), description: t('redirecting_to_payment_desc') });
        goToMyAdsAfterDelay();
      } else {
        toast({ title: t('error'), description: t('payment_link_error'), variant: 'destructive' });
        goToMyAdsAfterDelay();
      }
    } catch (error: any) {
      toast({ title: t('error'), description: error.message || t('operation_error'), variant: 'destructive' });
      goToMyAdsAfterDelay();
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeLocation = () => {
    if (coords && coords.latitude && coords.longitude) {
      const url = `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
      if (window.Capacitor && (window as any).Capacitor.Plugins?.Browser) {
        // @ts-ignore
        window.Capacitor.Plugins.Browser.open({ url, toolbarColor: '#0A84FF' });
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } else {
      toast({ title: t('info'), description: t('please_enable_location'), variant: 'default' });
    }
  };

  const closePaymentModal = () => {
    setShowPayment(false);
    setPaymentUrl('');
  };

  const normalizePhoneNumber = (phone: string): string => {
    if (!phone) return '';
    try {
      const parsed = JSON.parse(phone);
      return typeof parsed === 'string' ? parsed : phone;
    } catch {
      return phone;
    }
  };

  return (
    <PageContainer>
      <div dir="rtl" className="min-h-screen flex justify-center items-start py-6 px-4" style={{ background: 'linear-gradient(180deg, #EAF6FF 0%, #FFFFFF 65%)' }}>
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-6 gap-4 mt-2">
            <div className="p-2 rounded-full bg-orange-400 text-white shadow-md">
              <BackButton />
            </div>
            <h1 className="text-2xl font-extrabold text-center flex-1 text-gray-900">نشر الإعلان</h1>
            <div className="rounded-xl py-1 px-3 flex items-center gap-2 shadow-md transform bg-gradient-to-r from-orange-500 to-orange-400">
              <Gift className="w-5 h-5 text-white" />
              <span className="text-white font-semibold text-sm">{bonusBalance > 0 ? `${Math.floor(bonusBalance).toLocaleString()} ${t('currency_short')}` : 'لا يوجد Bonus'}</span>
            </div>
          </div>

          {isLoading && (
            <div className="flex justify-center my-4">
              <div className="spinner border-4 border-imei-cyan border-t-transparent rounded-full w-10 h-10 animate-spin"></div>
              <span className="ml-2 text-imei-cyan">{t('processing_payment')}</span>
            </div>
          )}

          <div className="mx-auto">
              <form onSubmit={handleSubmit} className="space-y-6 pb-7">
                {/* Image Upload */}
                <div>
                  <Label className="text-gray-800">{t('ad_image')}</Label>
                  <div
                    className="mt-2 flex flex-col items-center justify-center px-4 pt-6 pb-6 border-2 border-dotted rounded-lg cursor-pointer bg-white/40 border-[#0A84FF]/30 shadow-sm"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ boxShadow: '0 6px 18px rgba(10,132,255,0.06)' }}
                  >
                    <div className="space-y-2 text-center w-full">
                      {adImagePreview ? (
                        <img src={adImagePreview} alt={t('ad_preview')} className="mx-auto h-44 w-auto rounded-lg shadow-inner" />
                      ) : (
                        <div className="mx-auto w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-sm">
                          <Upload className="h-8 w-8 text-[#0A84FF]" />
                        </div>
                      )}
                      <div className="flex justify-center text-sm text-gray-700">
                        <p className="pl-1">ارفع صورة</p>
                      </div>
                      <p className="text-xs text-gray-500">PNG, JPG حتى 5 ميجابايت</p>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/png, image/jpeg"
                    onChange={handleImageChange}
                  />

                  {/* Image Preview */}
                  {isEditing && adImagePreview ? (
                    <div className="mt-6">
                      <Label className="text-gray-700 mb-4 block">{t('crop_image')}</Label>
                      <ReactCrop
                        crop={crop}
                        onChange={(c) => setCrop(c)}
                        onComplete={(c) => setCompletedCrop(c)}
                        keepSelection={true}
                        circularCrop={false}
                        minHeight={100}
                        aspect={16 / 9}
                        className="max-w-full bg-gray-900 rounded-lg overflow-hidden"
                      >
                        <img
                          ref={imgRef}
                          src={adImagePreview}
                          alt={t('preview')}
                          className="max-w-full"
                        />
                      </ReactCrop>
                      <Button
                        onClick={handleCropComplete}
                        className="mt-4 bg-imei-cyan text-white hover:bg-imei-cyan/80"
                      >
                        {t('complete_crop')}
                      </Button>
                    </div>
                  ) : adImagePreview ? (
                    <div className="mt-6">
                      <Label className="text-gray-700 mb-4 block">{t('ad_preview')}</Label>

                      {/* Featured Ad Preview */}
                      <div className="mb-6">
                        <h3 className="text-imei-cyan text-sm mb-2">{t('featured_ad_preview')}</h3>
                        <div className="relative rounded-xl overflow-hidden border-2 border-imei-cyan/20 hover:border-imei-cyan/40 transition-all aspect-video">
                          <img src={adImagePreview} alt={t('ad_image')} className="w-full aspect-video object-cover" />
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                            <div className="flex items-center gap-2">
                              <Store className="h-4 w-4 text-imei-cyan" />
                              <span className="text-gray-900 text-sm font-medium">{storeName || t('your_store_name')}</span>
                            </div>
                            {whatsapp && (
                              <div className="flex items-center gap-2 mt-1">
                                <LinkIcon className="h-4 w-4 text-imei-cyan" />
                                <span className="text-gray-500 text-xs">WhatsApp</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Regular Ad Preview */}
                      <div>
                        <h3 className="text-imei-cyan text-sm mb-2">{t('regular_ad_preview')}</h3>
                        <div className="relative rounded-xl overflow-hidden border-2 border-imei-cyan/20 hover:border-imei-cyan/40 transition-all">
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                            <div className="flex items-center gap-2">
                              <Store className="h-4 w-4 text-imei-cyan" />
                              <span className="text-gray-900 text-sm font-medium">{storeName || t('your_store_name')}</span>
                            </div>
                            {whatsapp && (
                              <div className="flex items-center gap-2 mt-1">
                                <LinkIcon className="h-4 w-4 text-imei-cyan" />
                                <span className="text-gray-500 text-xs">WhatsApp</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Store Name */}
                <div>
                  <Label htmlFor="storeName" className="text-gray-700">{t('store_name')}</Label>
                  <div className="relative mt-2">
                    <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="storeName"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder={t('enter_store_name')}
                      required
                      readOnly
                      className="pl-10 bg-white text-black border-gray-300 focus:border-imei-cyan focus:ring-imei-cyan"
                    />
                  </div>
                </div>

                {/* Phone Number */}
                <div>
                  <Label htmlFor="phoneNumber" className="text-gray-700">{t('phone_label')}</Label>
                  <div className="relative mt-2">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="phoneNumber"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder={t('phone_placeholder')}
                      required
                      readOnly
                      className="pl-10 bg-white text-black border-gray-300 focus:border-imei-cyan focus:ring-imei-cyan"
                    />
                  </div>
                </div>

                {/* Ad Duration */}
                <div className={!isUpdateMode ? 'block' : 'hidden'}>
                  <Label className="text-gray-700">{t('ad_duration')}</Label>
                  <RadioGroup
                    defaultValue="7"
                    className="mt-2 grid grid-cols-3 gap-4"
                    value={duration}
                    onValueChange={setDuration}
                  >
                    {availableDurations.map((days) => (
                      <Label key={days} htmlFor={`d${days}`} className="relative flex flex-col items-center justify-between rounded-xl border-2 border-gray-200 bg-white p-3 shadow-sm transition-all duration-200 hover:shadow-md [&:has([data-state=checked])]:border-orange-500 [&:has([data-state=checked])]:bg-orange-50 [&:has([data-state=checked])]:shadow-lg">
                        <RadioGroupItem value={days} id={`d${days}`} className="sr-only" />
                        <div className="w-full text-center mb-1">
                          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#E6F7FF] text-[#0A84FF] mb-1">
                            <CalendarDays className="h-4 w-4" />
                          </div>
                          <h3 className="text-base font-bold text-gray-800">{days} {t('days')}</h3>
                        </div>
                      
                        <div className="w-full mt-auto pt-2 border-t border-gray-100">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-credit-card text-gray-400">
                              <rect width="20" height="14" x="2" y="5" rx="2"></rect>
                              <line x1="2" y1="10" x2="22" y2="10"></line>
                            </svg>
                            <span className="text-xs text-gray-600">{t('price')}</span>
                          </div>
                          <div className="text-lg font-bold text-gray-900 flex items-center justify-center gap-1 [&:has([data-state=checked])]:text-orange-500">
                            {prices[days] || 0} <span className="text-xs font-normal text-gray-500">{t('currency_short')}</span>
                          </div>
                        </div>
                      </Label>
                    ))}
                  </RadioGroup>

                  {/* Current Price Display */}
                  {adPrice !== null && (
                    <div className="mt-4 p-4 bg-gradient-to-r from-[#E6F7FF] to-white border border-white/30 rounded-xl text-center shadow-sm">
                      <p className="text-gray-800 font-medium">
                        الإجمالي: <span className="text-2xl font-extrabold text-gray-900">{adPrice} {t('currency_short')}</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Location Info */}
                <div className="p-3 bg-gradient-to-r from-[#E6F7FF] to-white rounded-xl border border-white/30 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[#E6F7FF]">
                      <MapPin className="h-5 w-5 text-[#0A84FF]" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">{coords ? 'تم تحديد الموقع بنجاح' : t('ad_location')}</div>
                      <div className="text-xs text-gray-500">{coords ? `${coords.latitude?.toFixed(3)}, ${coords.longitude?.toFixed(3)}` : t('location_not_set')}</div>
                    </div>
                  </div>
                  <div>
                    <button type="button" onClick={handleChangeLocation} className="bg-white border border-[#0A84FF] text-[#0A84FF] px-3 py-2 rounded-lg shadow-sm">تغيير الموقع</button>
                  </div>
                </div>

                {/* WhatsApp Checkbox */}
                <div className="p-4 bg-white/40 border border-[#0A84FF]/20 rounded-xl shadow-sm">
                  <div className="flex items-center space-x-3 space-x-reverse">
                    <input
                      id="whatsapp"
                      type="checkbox"
                      checked={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.checked)}
                      className="h-5 w-5 rounded border-gray-300 text-[#0A84FF] focus:ring-[#0A84FF]"
                    />
                    <Label htmlFor="whatsapp" className="text-gray-800 font-bold cursor-pointer flex-1">
                      السماح للعملاء بالتواصل عبر الواتساب
                    </Label>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 mr-8">
                    عند تفعيل هذا الخيار، سيظهر زر "تواصل الآن" في إعلانك لفتح محادثة واتساب مباشرة معك.
                  </p>
                </div>

                {/* Submit Button */}
                <div className="mt-3">
                  <Button type="submit" className="w-full text-white mb-6 py-4 text-lg rounded-xl shadow-xl" style={{ background: 'linear-gradient(90deg,#0A84FF 0%,#005BFF 100%)' }} disabled={isLoading}>
                    {isLoading ? (isUpdateMode ? t('updating') : t('publishing')) : (
                      <>
                        <Send className="mr-2 h-4 w-4 text-white" />
                        {isUpdateMode ? t('update_and_edit_ad') : 'نشر الإعلان'}
                      </>
                    )}
                  </Button>
                </div>
              </form>
          </div>
        </div>
      </div>

    </PageContainer>
  );
};

export default PublishAd;
