import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import imageCompression from 'browser-image-compression';
import { useLanguage } from '../contexts/LanguageContext';
import { useGeolocated } from 'react-geolocated';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useAds } from '../contexts/AdContext';
import { supabase } from '@/lib/supabase';
import axiosInstance from '@/services/axiosInterceptor';
import { generateRandomFilename, sanitizeFilename } from '@/lib/storageUtils';

// UI Components
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import BackButton from '../components/BackButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

// Icons
import { Upload, Store, Link as LinkIcon, CalendarDays, Send, MapPin } from 'lucide-react';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import AdImagePreviewModal from '../components/AdImagePreviewModal';

// دالة تحقق من صحة رابط URL (تمنع بروتوكولات غير آمنة كـ javascript:)
const validateUrl = (url: string) => {
  try {
    const urlObj = new URL(url);
    // قائمة النطاقات المسموح بها
    const allowedDomains = ['wa.me', 'api.whatsapp.com', 'facebook.com'];
    return ['http:', 'https:'].includes(urlObj.protocol) &&
           allowedDomains.some(domain => urlObj.hostname.includes(domain));
  } catch {
    return false;
  }
};

// طلب توقيع من الخادم. يجب أن يتم التوقيع الحقيقي على الخادم.
const requestSignature = async (payload: { merchantOrderId: string; amount: number; timestamp: number }) => {
  try {
    const resp = await fetch('https://imei-safe.me/paymob/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || 'Failed to obtain signature');
    }
    const data = await resp.json();
    return data.signature as string;
  } catch (err) {
    console.error('requestSignature error:', err);
    throw err;
  }
};

// ملاحظة: وظائف التوليد والتطهير محفوظة في src/lib/storageUtils.ts

const SpecialAd = () => {
  useScrollToTop();
  // حالة خطأ أبعاد الصورة
  const [imageDimensionError, setImageDimensionError] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { updateAd, refreshAds } = useAds();

  // الحصول معرف الإعلان من URL
  const [searchParams] = useSearchParams();
  const adId = searchParams.get('id');
  const [isEditing, setIsEditing] = useState(false);
  const [existingAdId, setExistingAdId] = useState<string | null>(null);

  // طباعة معرف الإعلان للتصحيح
  console.log('Ad ID from URL:', adId);

  // زر التحديث بدلاً من النشر عند التعديل
  const isUpdateMode = Boolean(adId);

  // تأكد من تحميل الصفحة بشكل صحيح
  useEffect(() => {
    console.log('SpecialAd component mounted');
    console.log('User:', user);
    console.log('Ad ID:', adId);
    console.log('Update mode:', isUpdateMode);
  }, [user, adId, isUpdateMode]);

  const [adImage, setAdImage] = useState<File | null>(null);
  const [adImagePreview, setAdImagePreview] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [websiteUrlError, setWebsiteUrlError] = useState<string | null>(null);
  const [duration, setDuration] = useState('7'); // Default duration
  const [adPrice, setAdPrice] = useState<number | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [availableDurations, setAvailableDurations] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [showPayment, setShowPayment] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { coords, isGeolocationAvailable, isGeolocationEnabled } = useGeolocated({
    positionOptions: {
      enableHighAccuracy: true,
    },
    userDecisionTimeout: 5000,
  });

  // دالة لجلب سعر الإعلان بناءً على المدة
  const fetchAdPrices = async () => {
    try {
      const { data, error } = await supabase
        .from('ads_price') // اسم الجدول الصحيح
        .select('duration_days, amount') // جلب الأعمدة المطلوبة فقط
        .eq('type', 'special'); // جلب أسعار الإعلانات المميزة

      if (error) {
        console.error('Error fetching special ad prices:', error);
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
          if (pricesMap[duration]) {
            setAdPrice(pricesMap[duration]);
          } else if (durations.length > 0) {
            setDuration(durations[0]);
            setAdPrice(pricesMap[durations[0]]);
          }
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
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // زيادة الحد الأقصى للملف الأصلي إلى 10 ميجا
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: t('error'), description: t('file_too_large_10mb'), variant: 'destructive' });
        return;
      }

      // تحقق من أبعاد الصورة قبل أي معالجة
      const img = new window.Image();
      img.src = URL.createObjectURL(file);

      // استخدام Promise للتعامل مع تحميل الصورة
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          try {
            // الشرط الجديد: التحقق من الحد الأدنى للأبعاد
            if (img.width < 450 || img.height < 600) {
              setImageDimensionError('يجب أن يكون مقاس الصورة على الأقل 450 × 600 بكسل');
              setAdImage(null);
              setAdImagePreview(null);
              resolve();
              return;
            }

            // التحقق من الأبعاد المفضلة (1080x1920)
            if (img.width !== 1920 || img.height !== 1080) {
              // إذا كانت الصورة طوليه (الارتفاع أكبر من العرض) يتم السماح بها مع تحذير
              if (img.height > img.width) {
                setImageDimensionError('تم قبول الصورة لأنها طوليه, لكن يفضل أن يكون المقاس 1920 × 1080 بكسل');
                // السماح بالرفع والمعاينة
              } else {
                setImageDimensionError('يجب أن تكون الصورة طوليه, ويفضل أن يكون المقاس 1920 × 1080 بكسل');
                setAdImage(null);
                setAdImagePreview(null);
                resolve();
                return;
              }
            } else {
              setImageDimensionError(null);
            }
            resolve();
          } catch (error) {
            reject(error);
          }
        };

        img.onerror = () => {
          setImageDimensionError('تعذر قراءة أبعاد الصورة، يرجى رفع صورة صحيحة بمقاس 1080 × 1920 بكسل');
          setAdImage(null);
          setAdImagePreview(null);
          reject(new Error('Failed to load image'));
        };
      });

      // عرض الصورة الأصلية للمعاينة فوراً
      const originalPreviewUrl = URL.createObjectURL(file);
      setAdImagePreview(originalPreviewUrl);

      // Show the preview modal
      setShowPreviewModal(true);

      // إعدادات ضغط الصورة
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/webp',
      };

      try {
        toast({ description: t('compressing_image') });
        const compressedFile = await imageCompression(file, options);
        setAdImage(compressedFile);
        const compressedPreviewUrl = URL.createObjectURL(compressedFile);
        setAdImagePreview(compressedPreviewUrl);
        toast({ title: t('success'), description: t('image_compressed_successfully') });
      } catch (error) {
        console.error('Image compression error:', error);
        toast({ title: t('error'), description: t('image_compression_failed'), variant: 'destructive' });
        setAdImage(file);
        // لا تغير معاينة الصورة لأنها معروفة بالفعل
      }
    } catch (error) {
      console.error('Image processing error:', error);
      toast({ title: t('error'), description: 'حدث خطأ في معالجة الصورة', variant: 'destructive' });
    }
  };

  useEffect(() => {
    fetchAdPrices(); // جلب الأسعار عند تحميل المكون
  }, []); // مصفوفة اعتماديات فارغة للتشغيل مرة واحدة فقط

  useEffect(() => {
    setAdPrice(prices[duration] || null);
  }, [duration, prices]);

  const handleSubmit = async (e: React.FormEvent) => {

    e.preventDefault();
    if (!user) {
      toast({ title: t('error'), description: t('must_be_logged_in'), variant: 'destructive' });
      return;
    }
    if (!coords) {
      toast({ title: t('error'), description: t('location_not_available'), variant: 'destructive' });
      return;
    }
    // --- ⭐ التحقق من وجود الصورة قبل المتابعة ---
    // عند إنشاء إعلان جديد، يجب أن تكون الصورة موجودة.
    if (!isUpdateMode && !adImage && !adImagePreview) {
      toast({ title: 'خطأ', description: 'يرجى رفع صورة للإعلان أولاً', variant: 'destructive' });
      return;
    }

    // البحث عن أحدث بونص متاح للمستخدم الحالي
    // تحقق صارم من رابط الموقع لتجنب بروتوكولات ضارة
    if (websiteUrl && !validateUrl(websiteUrl.trim())) {
      toast({ title: t('error'), description: 'رابط الموقع غير صالح', variant: 'destructive' });
      return;
    }
    let bonusAmount = 0;
    let lastBonusId: string | null = null;
    let adData: any = null;
    if (!isUpdateMode) {
      try {
        const { data: lastBonus, error: bonusError } = await supabase
          .from('ads_payment')
          .select('id, bonus_offer,  payment_status, payment_date')
          .eq('user_id', user.id)
          .eq('transaction', 'bonus_add')
          .order('payment_date', { ascending: false })
          .limit(1)
          .single();

        if (bonusError && bonusError.code !== 'PGRST116') {
          console.error('Error fetching last bonus:', bonusError);
        }

        if (lastBonus && typeof lastBonus.bonus_offer === 'number' && lastBonus.payment_status === 'paid') {
          bonusAmount = lastBonus.bonus_offer;
          lastBonusId = lastBonus.id;
        }
      } catch (error) {
        console.error('Error checking user bonus:', error);
      }
    }

    // إذا كان لدى المستخدم بونص كافٍ، يتم الخصم مباشرة من أحدث بونص وتحديث نفس السجل
    if (!isUpdateMode && lastBonusId && bonusAmount >= (adPrice || 0)) {
      setIsLoading(true);
      try {
        // تحديث سجل البونص نفسه بقيمة البونص الجديدة بعد الخصم
        const newBonus = bonusAmount - (adPrice || 0);
        const { error: updateBonusError } = await supabase
          .from('ads_payment')
          .update({
            bonus_offer: newBonus,
            payment_date: new Date().toISOString(),
            is_paid: true,
            payment_status: 'paid',
            transaction: 'bonus_add',
            Actual_bonus: bonusAmount
          })
          .eq('id', lastBonusId);
        if (updateBonusError) {
          throw updateBonusError;
        }

        // إضافة سجل إعلان جديد مع حالة مدفوعة مباشرة
        let imageUrl = adImagePreview;
        if (adImage) {
          const safeOriginal = sanitizeFilename(adImage.name || 'upload');
          const randomName = generateRandomFilename(safeOriginal);
          const filePath = `ads_payment/${user.id}/${randomName}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('advertisements')
            .upload(filePath, adImage);
          if (uploadError || !uploadData) {
            throw new Error('فشل رفع الصورة إلى التخزين.');
          }
          const { data: publicUrlData } = supabase.storage
            .from('advertisements')
            .getPublicUrl(filePath);
          imageUrl = publicUrlData.publicUrl;
        }

        adData = {
          user_id: user.id,
          store_name: storeName,
          image_url: imageUrl,
          website_url: websiteUrl,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          phone: phoneNumber,
          upload_date: new Date().toISOString(),
          expires_at: (() => { const d = new Date(); d.setDate(d.getDate() + parseInt(duration, 10)); return d.toISOString(); })(),
          is_paid: true,
          payment_status: 'paid',
          transaction: 'ad_payment',
          type: 'special', // ⭐ تأكد من أن type هو special
          amount: adPrice || 0,
          duration_days: parseInt(duration, 10)
        };
        const { error: insertAdError } = await supabase
          .from('ads_payment')
          .insert([adData]);
        if (insertAdError) {
          throw insertAdError;
        }

        // إرسال حدث لتحديث البونص في AppNavbar
        window.dispatchEvent(new CustomEvent('bonusUpdated'));

        toast({
          title: 'تم النشر من البونص',
          description: `تم خصم ${adPrice} ج.م من أحدث بونص (${bonusAmount} ← ${bonusAmount - (adPrice || 0)}) ونشر الإعلان بنجاح!`,
          variant: 'default'
        });
        await refreshAds();
        setTimeout(() => navigate('/myads'), 2000);
        return;
      } catch (error: any) {
        console.error('خطأ في خصم البونص:', error);
        toast({
          title: 'خطأ في البونص',
          description: error.message || 'حدث خطأ أثناء خصم البونص أو نشر الإعلان',
          variant: 'destructive'
        });
        setIsLoading(false);
        return;
      }
    }

    // إذا كان هناك بونص لكنه أقل من قيمة الإعلان أو لا يوجد بونص، يتم فتح بوابة الدفع بقيمة الإعلان كاملة
    if (!isUpdateMode && ((lastBonusId && bonusAmount < (adPrice || 0)) || !lastBonusId)) {
      setIsLoading(true);
      try {
        let imageUrl = adImagePreview;
        if (adImage) {
            const safeOriginal = sanitizeFilename(adImage.name || 'upload');
            const randomName = generateRandomFilename(safeOriginal);
            const filePath = `ads_payment/${user.id}/${randomName}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('advertisements')
              .upload(filePath, adImage);
          if (uploadError || !uploadData) {
            throw new Error('فشل رفع الصورة إلى التخزين.');
          }
          const { data: publicUrlData } = supabase.storage
            .from('advertisements')
            .getPublicUrl(filePath);
          imageUrl = publicUrlData.publicUrl;
        }

        adData = {
          user_id: user.id,
          store_name: storeName,
          image_url: imageUrl,
          website_url: websiteUrl,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          phone: phoneNumber,
          upload_date: new Date().toISOString(),
          expires_at: (() => { const d = new Date(); d.setDate(d.getDate() + parseInt(duration, 10)); return d.toISOString(); })(),
          is_paid: false,
          payment_status: 'pending',
          type: 'special',
          amount: adPrice || 0,
          duration_days: parseInt(duration, 10),
          Actual_payment_date: new Date().toISOString()
        };

        // إرسال بيانات الدفع إلى بايموب
        const paymentData = {
          amount: adPrice || 0,
          email: user.email,
          name: storeName,
          phone: phoneNumber,
          merchantOrderId: `ads_payment-${user.id}-${Date.now()}`,
          isSpecialAd: true,
          adData: adData,
          redirect_url_success: `https://imei-safe.me/paymob/redirect-success`,
          redirect_url_failed: `https://imei-safe.me/paymob/redirect-failed`
        };
        // أرفق طابع زمني واطلب توقيعًا من الخادم قبل إرسال بيانات الدفع
        const timestamp = Date.now();
        let signature = '';
        try {
          signature = await requestSignature({ merchantOrderId: paymentData.merchantOrderId, amount: paymentData.amount, timestamp });
        } catch (err) {
          throw new Error('فشل الحصول على توقيع الدفع من الخادم');
        }

        const paymentPayload = { ...paymentData, timestamp, signature };

        const response = await fetch('https://imei-safe.me/paymob/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentPayload)
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'فشل في إنشاء رابط الدفع');
        }
        const data = await response.json();
        // فتح بوابة الدفع بنفس منطق PublishAd
        if (data.iframe_url) {
          if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
            await window.Capacitor.Plugins.Browser.open({ url: data.iframe_url, toolbarColor: '#000000' });
          } else {
            window.open(data.iframe_url, '_blank', 'noopener,noreferrer');
          }
          toast({ title: 'جاري التوجيه للدفع...', description: 'سيتم نقلك لصفحة الدفع الآن.' });
        } else if (data.payment_url) {
          window.open(data.payment_url, '_blank', 'noopener,noreferrer');
          toast({ title: 'جاري التوجيه للدفع...', description: 'سيتم نقلك لصفحة الدفع الآن.' });
        } else {
          toast({ title: 'خطأ', description: 'تعذر إنشاء رابط الدفع', variant: 'destructive' });
        }
      } catch (error: any) {
        console.error('خطأ في فتح بوابة الدفع:', error);
        toast({
          title: 'خطأ في الدفع',
          description: error.message || 'حدث خطأ أثناء فتح بوابة الدفع',
          variant: 'destructive'
        });
        setIsLoading(false);
      }
      return;
    }

    // عند إنشاء إعلان جديد، نملأ اسم المحل ورقم الهاتف تلقائيًا من بيانات الأعمال
    if (!isUpdateMode && user) {
      // ملء اسم المحل تلقائيًا عند إنشاء إعلان جديد
      if (!storeName) {
        try {
          const { data: business } = await supabase
            .from('businesses')
            .select('store_name')
            .eq('user_id', user.id)
            .single();

          const businessName = business?.store_name || 'محل غير محدد';
          setStoreName(businessName);
          toast({ title: 'ملاحظة', description: 'تم ملء اسم المحل تلقائيًا', variant: 'default' });
        } catch (error) {
          console.error('Error loading business name:', error);
        }
      }

      // ملء رقم الهاتف تلقائيًا عند إنشاء إعلان جديد
      if (!phoneNumber) {
        try {
          const response = await axiosInstance.get('/api/decrypted-user');
          const businessPhone = response.data?.business?.phone || response.data?.user?.phone || '';
          if (businessPhone) {
            setPhoneNumber(businessPhone);
            toast({ title: 'ملاحظة', description: 'تم ملء رقم الهاتف تلقائيًا', variant: 'default' });
          }
        } catch (error) {
          console.error('Error loading business phone:', error);
        }
      }
    }

    // عند التعديل، نملأ اسم المحل ورقم الهاتف تلقائيًا إذا لم تكن مملوءة
    if (isUpdateMode && !storeName) {
      toast({ title: 'ملاحظة', description: 'سيتم ملء اسم المحل تلقائيًا', variant: 'default' });
      try {
        const { data: business } = await supabase
          .from('businesses')
          .select('store_name')
          .eq('user_id', user.id)
          .single();

        const businessName = business?.store_name || 'محل غير محدد';
        setStoreName(businessName);
      } catch (error) {
        console.error('Error loading business name:', error);
      }
    }

    if (isUpdateMode && !phoneNumber) {
      toast({ title: 'ملاحظة', description: 'سيتم ملء رقم الهاتف تلقائيًا', variant: 'default' });
      try {
        const response = await axiosInstance.get('/api/decrypted-user');
        const businessPhone = response.data?.business?.phone || response.data?.user?.phone || '';
        if (businessPhone) {
          setPhoneNumber(businessPhone);
        }
      } catch (error) {
        console.error('Error loading business phone:', error);
      }
    }
    // عند التعديل، لا نتحقق من وجود صورة أو اسم محل

    // إذا كان هذا تعديلاً، نتحقق من وجود الإعلان المميز
    if (isUpdateMode) {
      console.log('Checking existing ad for update mode. Ad ID:', adId);
      if (!adId) {
        toast({ title: 'خطأ', description: 'لم يتم العثور على معرّف الإعلان', variant: 'destructive' });
        return;
      }
      try {
        const { data: existingAd, error: fetchError } = await supabase
          .from('ads_payment')
          .select('*')
          .eq('id', adId)
          .single();
        if (fetchError || !existingAd) {
          toast({ title: 'خطأ', description: 'لم يتم العثور على الإعلان المميز للتحديث', variant: 'destructive' });
          return;
        }
        if (existingAd.user_id !== user.id) {
          toast({ title: 'خطأ', description: 'ليس لديك الصلاحية لتعديل هذا الإعلان', variant: 'destructive' });
          return;
        }
        setExistingAdId(existingAd.id);
        console.log('Set existing ad ID:', existingAd.id);
      } catch (error: any) {
        console.error('خطأ في التحقق من الإعلان:', error);
        toast({ title: 'خطأ', description: error.message || 'فشل في التحقق من الإعلان', variant: 'destructive' });
        return;
      }
    }

    setIsLoading(true);
    try {
      let imageUrl = adImagePreview;

      // ⭐ الحل: ارفع الصورة دائمًا إذا كانت هناك صورة جديدة (adImage)
      // سواء كان إنشاءً جديدًا أو تحديثًا.
      if (adImage) {
        // 1. رفع الصورة الجديدة إلى Supabase Storage
        const safeOriginal = sanitizeFilename(adImage.name || 'upload');
        const randomName = generateRandomFilename(safeOriginal);
        const filePath = `ads_payment/${user.id}/${randomName}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('advertisements')
          .upload(filePath, adImage);

        if (uploadError || !uploadData) {
          throw new Error('فشل رفع الصورة إلى التخزين.');
        }

        // 2. الحصول على الرابط العام والدائم للصورة
        const { data: publicUrlData } = supabase.storage
          .from('advertisements')
          .getPublicUrl(filePath); // تم تصحيح اسم الدالة

        imageUrl = publicUrlData.publicUrl;
      }

      // --- منطق تحديث إعلان موجود ---
      // تجهيز بيانات الإعلان للتحديث
      adData = {
        user_id: user.id,
        store_name: storeName,
        image_url: imageUrl,
        website_url: websiteUrl,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        phone: phoneNumber,
        upload_date: new Date().toISOString(),
        expires_at: (() => { const d = new Date(); d.setDate(d.getDate() + parseInt(duration, 10)); return d.toISOString(); })(),
        is_paid: false,
        payment_status: 'pending',
        type: 'special_update',
        amount: adPrice || 0,
      };
    
      // أرسل المبلغ الصحيح إذا كان هناك دفع جديد
      const paymentDataUpdate = {
        amount: adPrice || 0,
        email: user.email,
        name: storeName,
        phone: phoneNumber,
        merchantOrderId: `ads_payment-UPDATE-${adId}-${Date.now()}`,
        isSpecialAd: true,
        adData: adData,
        adId: adId,
        redirect_url_success: `https://imei-safe.me/paymob/redirect-success`,
        redirect_url_failed: `https://imei-safe.me/paymob/redirect-failed`
      };
      // أرفق طابع زمني واطلب توقيعًا من الخادم قبل إرسال بيانات الدفع للتحديث
      const timestampUpdate = Date.now();
      let signatureUpdate = '';
      try {
        signatureUpdate = await requestSignature({ merchantOrderId: paymentDataUpdate.merchantOrderId, amount: paymentDataUpdate.amount, timestamp: timestampUpdate });
      } catch (err) {
        throw new Error('فشل الحصول على توقيع الدفع من الخادم');
      }

      const paymentPayloadUpdate = { ...paymentDataUpdate, timestamp: timestampUpdate, signature: signatureUpdate };

      const responseUpdate = await fetch('https://imei-safe.me/paymob/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentPayloadUpdate)
      });
      if (!responseUpdate.ok) {
        const errorData = await responseUpdate.json();
        throw new Error(errorData.error || 'فشل في تحديث الإعلان');
      }
      const data = await responseUpdate.json();
      // بعد نجاح إنشاء رابط الدفع، انتظر حتى يتم إغلاق نافذة الدفع
      // ⭐ الحل: نحتاج إلى معرف الإعلان من الخادم للتحقق من حالة الدفع
      const newAdId = data.adId; // افترض أن الخادم يعيد adId

      // بدء التحقق من حالة الدفع مع حد أقصى لعدد المحاولات
      let retryCount = 0;
      const MAX_RETRIES = 20; // يمكنك تعديل هذا الرقم حسب الحاجة
      const checkPaymentStatus = setInterval(async () => {
        if (retryCount >= MAX_RETRIES) {
          clearInterval(checkPaymentStatus);
          toast({ title: 'خطأ', description: 'انتهت مدة الانتظار للتحقق من الدفع', variant: 'destructive' });
          return;
        }
        retryCount++;
        try {
          // التحقق من حالة الدفع في جدول ads_payment
          const { data: ad, error } = await supabase
            .from('ads_payment')
            .select('payment_status, type, amount, id, store_name')
            .eq('id', newAdId)
            .single();

          if (error) {
            console.error('Error checking payment status:', error);
            return;
          }

          // إذا تم الدفع بنجاح
          if (ad && ad.payment_status === 'paid') {
            clearInterval(checkPaymentStatus);

            // تحديث حالة الإعلان في الواجهة
            toast({
              title: 'تم الدفع بنجاح!',
              description: `تم نشر إعلانك المميز "${ad.store_name}" بنجاح (النوع: ${ad.type}, المبلغ: EGP ${ad.amount})`,
              variant: 'default'
            });

            // تحديث قائمة الإعلانات بعد نجاح الدفع
            await refreshAds();

            // الانتقال إلى صفحة الإعلانات بعد نجاح الدفع
            setTimeout(() => navigate('/myads'), 2000);
          }
        } catch (error) {
          console.error('Error in payment status check:', error);
        }
      }, 3000); // التحقق كل 3 ثوانٍ
    } catch (error: any) {
      console.error("Detailed error in handleSubmit:", error);
      toast({
        title: 'خطأ فادح',
        description: error.message || 'حدث خطأ غير متوقع أثناء العملية.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // تحميل بيانات الإعلان عند التعديل
  useEffect(() => {
    console.log('Component mounted, adId:', adId);

    const loadAdData = async () => {
      console.log('Loading ad data for ID:', adId);
      if (adId) {
        setIsLoading(true);
        try {
          const { data: ad, error } = await supabase
            .from('ads_payment')
            .select('*')
            .eq('id', adId)
            .single();

          // التأكد من أن الإعلان من نوع special
          if (ad && ad.type !== 'special' && ad.type !== 'special_update') {
            toast({
              title: 'خطأ',
              description: 'الإعلان المحدد ليس من نوع الإعلانات المميزة',
              variant: 'destructive'
            });
            return;
          }

          if (error) {
            console.error('Error loading ad:', error);
            throw error;
          }

          console.log('Ad data loaded:', ad);

          if (ad) {
            setIsEditing(true);
            setExistingAdId(adId);
            setStoreName(ad.store_name || '');
            setPhoneNumber(ad.phone || '');
            setWebsiteUrl(ad.website_url || '');
            setDuration(ad.duration_days?.toString() || '7');

            // تحميل صورة الإعلان
            if (ad.image_url) {
              setAdImagePreview(ad.image_url);
              console.log('Set ad image preview:', ad.image_url);
            }

            // جلب الأسعار ثم تعيين السعر الصحيح للإعلان المحمل
            const adPrices = await fetchAdPrices();
            if (adPrices && adPrices[ad.duration_days]) {
              setAdPrice(adPrices[ad.duration_days]);
            }
          }
        } catch (error: any) {
          console.error('Error loading ad data:', error);
          toast({
            title: 'خطأ',
            description: error.message || 'فشل في تحميل بيانات الإعلان',
            variant: 'destructive',
          });
        } finally {
          setIsLoading(false);
        }
      }
    };

    if (adId) {
      loadAdData();
    } else {
      fetchAdPrices(); // جلب الأسعار في وضع الإنشاء
    }

    // تحميل بيانات العملة إذا لم يكن هناك adId (وضع الإنشاء)
    if (!adId) {
      console.log('In create mode, loading business data');
      const loadBusinessData = async () => {
        if (user) {
          try {
            const { data: business } = await supabase
              .from('businesses')
              .select('*')
              .eq('user_id', user.id)
              .single();

            if (business) {
              setStoreName(business.store_name || 'محل غير محدد');
              setPhoneNumber(business.phone || '');
            }
          } catch (error) {
            console.error('Error loading business data:', error);
          }
        }
      };

      loadBusinessData();
    }
  }, [adId, user, toast]);

  // تم إزالة هذا useEffect لأننا قمنا بإضافة نفس الوظيفة في useEffect الأول

  const closePaymentModal = () => { // تم تصحيح اسم الدالة
    setShowPayment(false); // تم تصحيح اسم الدالة
    setPaymentUrl(''); // تم تصحيح اسم الدالة
  };

  // معالجة نجاح الدفع (مستخدم فقط عند الدخول يدويًا لرابط النجاح)
  useEffect(() => { // تم تصحيح اسم الدالة
    const handlePaymentSuccess = async () => {
      // التحقق من وجود معرف الإعلان في URL
      const urlParams = new URLSearchParams(window.location.search);
      const adId = urlParams.get('adId');

      if (adId) {
        try {
          // التحقق مما إذا كان الإعلان تم تحديثه بالفعل
          const { data: ad } = await supabase
            .from('ads_payment')
            .select('payment_status')
            .eq('id', adId)
            .single();

          // فقط قم بالتحديث إذا لم يتم تحديثه بالفعل
          if (ad && ad.payment_status !== 'paid') {
            const { error: updateError } = await supabase
              .from('ads_payment')
              .update({
                is_paid: true,
                payment_status: 'paid',
                payment_date: new Date().toISOString()
              })
              .eq('id', adId);

            if (updateError) {
              throw updateError;
            }
          }

          toast({
            title: 'تم الدفع بنجاح',
            description: 'تم نشر إعلانك المميز بنجاح',
            variant: 'default'
          });

          // الانتقال إلى لوحة التحكم بعد نجاح الدفع
          setTimeout(() => navigate('/dashboard'), 2000); // تم تصحيح اسم الدالة
        } catch (error) {
          console.error('Error updating payment status:', error);
          toast({
            title: 'خطأ',
            description: 'تم الدفع بنجاح ولكن فشل في تحديث حالة الإعلان',
            variant: 'destructive'
          });
        }
      }
    };

    // التحقق مما إذا كان المستخدم قد عاد من صفحة الدفع بنجاح
    if (window.location.pathname === '/payment-success' || window.location.href.includes('payment-success')) {
      handlePaymentSuccess();
    }
  }, [navigate, toast]); // تم تصحيح الاعتماديات

  return (
    <PageContainer>
      <AppNavbar />
      {showPayment && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col" style={{margin:0,padding:0}}>
          <div className="flex justify-end p-2">
            <button
              onClick={closePaymentModal}
              className="bg-red-500 text-white px-4 py-2 rounded-lg"
              style={{zIndex:100}}
            >
              {t('close') || 'إغلاق'}
            </button>
          </div>
          <iframe
            src={paymentUrl}
            style={{
              flex: 1,
              width: '100vw',
              height: '100vh',
              border: 'none',
              margin: 0,
              padding: 0,
              background: '#fff',
              overflow: 'hidden',
              display: 'block',
            }}
            title="Payment Gateway"
            sandbox="allow-same-origin allow-scripts allow-forms allow-top-navigation"
          />
        </div>
      )}
      <div className="max-w-8xl mx-[5px] py-8">
        <div className="flex items-center mb-6">
          <BackButton />
          <h1 className="text-2xl font-bold text-center flex-1 pr-10">{t('publish_ads_payment')}</h1>
          
        </div>

        {isLoading && (
          <div className="flex justify-center my-4">
            <div className="spinner border-4 border-imei-cyan border-t-transparent rounded-full w-10 h-10 animate-spin"></div>
            <span className="ml-2 text-imei-cyan">جاري معالجة الدفع...</span>
          </div>
        )}

        <Card className="max-w-4xl mx-auto border-[#289c8e]/20" style={{ backgroundColor: '#289c8e' }}>
          <CardHeader>
            <CardTitle className="text-[#289c8e]">{t('ad_details')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Image Upload */}
              {/* Permanent warning about required dimensions */}
              <div className="mb-2 text-center">
                <span className="text-sm text-yellow-700 bg-yellow-100 px-2 py-1 rounded">
                  يفضل رفع صورة طولية بمقاس <b>1920 × 1080</b> بكسل.
                </span>
              </div>
              <div>
                <Label className="text-gray-800">{t('ad_image')}</Label>
                <div
                  className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md cursor-pointer relative"
                  style={{ borderColor: '#8de5d8' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {/* Centered error message if image dimensions are wrong */}
                  {imageDimensionError && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                      <span className="text-red-600 bg-red-100 px-3 py-2 rounded shadow text-lg font-bold">
                        {imageDimensionError}
                      </span>
                    </div>
                  )}
                  <div className={`space-y-1 text-center w-full ${imageDimensionError ? 'opacity-40' : ''}`}>
                    {adImagePreview ? (
                      <img src={adImagePreview} alt="Ad preview" className="mx-auto h-48 w-auto rounded-md" />
                    ) : (
                      <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    )}
                    <div className="flex text-sm text-gray-400">
                      <p className="pl-1">{t('upload_an_image')}</p>
                    </div>
                    <p className="text-xs text-gray-500">{t('png_jpg_up_to_10mb')}</p>
                    <p className="text-xs text-yellow-500 pt-1" dir="rtl">
                      (يفضل أن تكون الصورة بنسبة طول إلى عرض 9:16)
                    </p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/png, image/jpeg"
                  onChange={handleImageChange}
                />
                {adImagePreview && ( // تم تصحيح اسم المتغير
                  <div className="mt-6 flex flex-col items-center">
                    <Label className="text-white mb-4 block text-lg font-bold">{t('ads_payment_preview')}</Label>
                    {/* تأكد من ظهور المحتوى بشكل صحيح */}
                    <div className="w-full max-w-sm bg-gray-900 rounded-lg overflow-hidden shadow-xl">
                      <div className="relative w-full max-w-sm aspect-video rounded-[24px] border-2 border-gray-300 bg-black overflow-hidden shadow-lg" style={{ boxShadow: '0 2px 12px #0002' }}>
                        {/* شاشة التطبيق */}
                        <img
                          src={adImagePreview}
                          alt="Special Ad Preview"
                          className="absolute top-0 left-0 w-full h-full object-contain cursor-pointer"
                          onClick={() => {
                            if (websiteUrl) window.open(websiteUrl, '_blank');
                          }}
                        />
                        {/* طبقة تدرج واقعية */}
                        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/70 pointer-events-none"></div>
                        {/* شارة إعلان مميز */}
                        <div className="absolute top-2 right-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white px-2 py-1 rounded-full text-xs font-bold shadow-md">
                          {t('ads_payment')}
                        </div>
                        {/* مستطيل معلومات المحل واللوكيشن */}
                        <div
                          className="absolute left-1/2 -translate-x-1/2 bottom-1 w-[85%] bg-white/95 rounded-sm shadow-sm flex items-center justify-between px-2 py-2 cursor-pointer border border-imei-cyan h-12 min-h-0"
                          onClick={() => {
                            if (coords) {
                              const lat = coords.latitude;
                              const lng = coords.longitude;
                              window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
                            }
                          }}
                        >
                          <div className="flex flex-col items-start gap-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Store className="h-5 w-5 text-imei-cyan" />
                              <span
                                className="font-bold text-imei-cyan text-[11px] block min-w-0 max-w-[90px] overflow-hidden text-ellipsis whitespace-normal break-words"
                                title={storeName || t('your_store_name')}
                              >
                                {storeName || t('your_store_name')}
                              </span>
                            </div>
                            {coords && (
                              <div className="flex items-center gap-2 mt-1">
                                <MapPin className="h-5 w-5 text-red-500" />
                                <span className="text-gray-700 text-[10px]">{t('location_based_ad')}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {/* معلومات إضافية */}
                        <div className="absolute left-0 right-0 bottom-0 bg-imei-darker/80 p-2 border-t border-imei-cyan/20 flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2 text-imei-cyan">
                            <CalendarDays className="h-4 w-4" />
                            <span>{duration} {t('days')}</span>
                          </div>
                          <div className="bg-green-500/10 text-green-500 px-2 py-1 rounded-full">
                            {t('active')}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div> // End of preview container
                )}
              </div>
              <div>
                <Label htmlFor="storeName" className="text-gray-800">{t('store_name')}</Label>
                <div className="relative mt-2">
                  <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="storeName"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)} // تم تصحيح اسم الدالة
                    placeholder={t('enter_store_name')}
                    required
                    className="pl-10 border-[#289c8e] focus-visible:ring-[#289c8e]"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="phoneNumber" className="text-gray-800">{t('phone_number')}</Label>
                <div className="relative mt-2">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <Input
                    id="phoneNumber"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)} // تم تصحيح اسم الدالة
                    placeholder={t('enter_phone_number')}
                    required
                    className="pl-10 border-[#289c8e] focus-visible:ring-[#289c8e]"
                  />
                </div>
              </div>

              {/* Ad Duration */}
              <div className={!isUpdateMode ? 'block' : 'hidden'}>
                <Label className="text-gray-800">{t('ad_duration')}</Label>
                <RadioGroup
                  value={duration}
                  onValueChange={setDuration} // تم تصحيح اسم الدالة
                  className="mt-2 grid grid-cols-3 gap-4"
                >
                  {availableDurations.map((days) => (
                    <Label key={days} htmlFor={`d${days}`} className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary">
                      <RadioGroupItem value={days} id={`d${days}`} className="sr-only" />
                      <CalendarDays className="mb-3 h-6 w-6" />
                      <div>
                        <span>{days} {t('days')}</span>
                        {prices[days] && (
                          <div className="mt-1 text-sm font-semibold text-imei-cyan">
                            {prices[days]} ج.م
                          </div>
                        )}
                      </div>
                    </Label>
                  ))}
                </RadioGroup>
                {/* عرض السعر الحالي أسفل الخيارات */}
                {adPrice !== null && (
                  <div className="mt-4 p-3 bg-imei-cyan/10 border border-imei-cyan/30 rounded-lg text-center">
                    <p className="text-imei-cyan font-medium">
                      {t('total_price') || 'الإجمالي'}: <span className="text-xl font-bold text-white">{adPrice} ج.م</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Location Info */}
              <div className="p-3 bg-gray-800 rounded-md border border-gray-700">
                <div className="flex items-center gap-2 text-gray-400">
                  <MapPin className="h-5 w-5 text-imei-cyan" />
                  <span className="font-medium">{t('ad_location')}</span>
                </div>
                {!isGeolocationAvailable ? (
                  <p className="text-sm text-red-400 mt-2">{t('geolocation_not_supported')}</p>
                ) : !isGeolocationEnabled ? (
                  <p className="text-sm text-yellow-400 mt-2">{t('geolocation_not_enabled')}</p> // تم تصحيح اسم المتغير
                ) : coords ? (
                  <p className="text-sm text-green-400 mt-2">{t('location_captured_successfully')}</p>
                ) : (
                  <p className="text-sm text-gray-400 mt-2">{t('getting_location')}</p>
                )}
              </div>

              {/* WhatsApp Link */}
              <div>
                <Label htmlFor="websiteUrl" className="text-gray-800">{t('whatsapp_link')} ({t('optional')})</Label>
                <div className="relative mt-2">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="websiteUrl"
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => { setWebsiteUrl(e.target.value); if (websiteUrlError) setWebsiteUrlError(null); }}
                    onBlur={() => {
                      const v = websiteUrl.trim();
                      if (v && !validateUrl(v)) setWebsiteUrlError('رابط الموقع غير صالح');
                      else setWebsiteUrlError(null);
                    }}
                    placeholder="https://wa.me/..."
                    className="pl-10 border-[#289c8e] focus-visible:ring-[#289c8e]"
                  />
                  {websiteUrlError && <p className="text-sm text-red-400 mt-1">{websiteUrlError}</p>}
                </div>
              </div>

              {/* Submit Button */}
              <Button type="submit" className="w-full glowing-button" disabled={isLoading}>
                {isLoading
                  ? (isUpdateMode ? t('updating') : t('publishing'))
                  : (
                    <>
                      <Send className="mr-2 h-4 w-4 text-white" />
                      {isUpdateMode ? <span className="text-white">تحديث وتعديل الإعلان</span> : <span className="text-white">نشر الإعلان</span>}
                    </>
                  )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Image Preview Modal */}
      <AdImagePreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        imageUrl={adImagePreview || ''}
        storeName={storeName || 'اسم المتجر'}
        hasLocation={true}
      />
    </PageContainer>
  );
};

export default SpecialAd;
