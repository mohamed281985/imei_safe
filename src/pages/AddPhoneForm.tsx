import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import axiosInstance from '@/services/axiosInterceptor';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Upload, X, Loader2, Star, Zap, MapPin, Clock, Eye, Gift, CalendarDays } from 'lucide-react';

import { useGeolocated } from 'react-geolocated';
import { useToast } from '@/hooks/use-toast';
import AdsOfferSlider from '@/components/advertisements/AdsOfferSlider';
interface PhoneFormData {
  title: string;
  brand: string;
  model: string;
  description: string;
  price: string;
  condition: 'new' | 'used' | 'refurbished';
  warranty_months: string;
  specs: {
    ram?: string;
    storage?: string;
    color?: string;
    [key: string]: string | undefined;
  };
  city: string;
  contact_methods: {
    phone?: string;
    whatsapp?: string;
  };
  imei: string;
  store_name: string;
  is_verified?: boolean;
}

const AddPhoneForm: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth(); // Make sure useAuth is imported from the correct path
  const { toast } = useToast();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [imagesPreviews, setImagesPreviews] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [isFeatureModalOpen, setIsFeatureModalOpen] = useState(false);
  const [promotionPrices, setPromotionPrices] = useState<Record<string, number>>({});
  const [availableDurations, setAvailableDurations] = useState<string[]>([]);
  const [selectedDuration, setSelectedDuration] = useState('7');
  const [promotionPrice, setPromotionPrice] = useState<number | null>(null);
  const [bonusBalance, setBonusBalance] = useState(0);
  const [lastBonusId, setLastBonusId] = useState<string | null>(null);
  const [phoneIdToFeature, setPhoneIdToFeature] = useState<string | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  const { coords } = useGeolocated({
    positionOptions: {
      enableHighAccuracy: true,
    },
    userDecisionTimeout: 5000,
  });
  const [imeiStatus, setImeiStatus] = useState<'' | 'verified' | 'reported'>('');

  // Fetch promotion prices
  useEffect(() => {
    const fetchPromotionPrices = async () => {
      try {
        const { data, error } = await supabase
          .from('ads_price')
          .select('duration_days, amount')
          .eq('type', 'promotions');

        if (error) throw error;

        if (data) {
          const pricesMap = data.reduce((acc, price) => {
            acc[price.duration_days] = price.amount;
            return acc;
          }, {} as Record<string, number>);

          const durations = data.map(item => item.duration_days.toString()).sort((a, b) => parseInt(a) - parseInt(b));
          setAvailableDurations(durations);
          setPromotionPrices(pricesMap);

          const defaultDuration = durations.includes('7') ? '7' : durations[0] || '';
          setSelectedDuration(defaultDuration);
          setPromotionPrice(pricesMap[defaultDuration] || null);
        }
      } catch (error) {
        console.error('Error fetching promotion prices:', error);
      }
    };

    fetchPromotionPrices();
  }, []);

  // Update price when duration changes
  useEffect(() => {
    setPromotionPrice(promotionPrices[selectedDuration] || null);
  }, [selectedDuration, promotionPrices]);

  // Fetch user's bonus balance
  useEffect(() => {
    if (!user?.id) return;

    const fetchBonus = async () => {
      try {
        // Fetch all paid records for the user to find a valid bonus
        const { data: allPaidRecords, error: fetchError } = await supabase
          .from('ads_payment')
          .select('id, bonus_offer, expires_at')
          .eq('user_id', user.id)
          .eq('is_paid', true)
          .order('payment_date', { ascending: false });

        if (fetchError) {
          console.error("Error fetching bonus data:", fetchError);
          setBonusBalance(0);
          setLastBonusId(null);
          return;
        }

        if (allPaidRecords && allPaidRecords.length > 0) {
          // Find the first record that has a valid, unexpired bonus
          const recordWithBonus = allPaidRecords.find(record => {
            const expiresAt = record.expires_at ? new Date(record.expires_at) : null;
            const now = new Date();
            return expiresAt && expiresAt > now && record.bonus_offer > 0;
          });

          if (recordWithBonus) {
            setBonusBalance(recordWithBonus.bonus_offer);
            setLastBonusId(recordWithBonus.id);
          } else {
            // No valid bonus found
            setBonusBalance(0);
            setLastBonusId(null);
          }
        } else {
          // No paid records found
          setBonusBalance(0);
          setLastBonusId(null);
        }
      } catch (err) {
        console.error("Unexpected error fetching bonus:", err);
        setBonusBalance(0);
        setLastBonusId(null);
      }
    };

    fetchBonus();
  }, [user]);

  const [imeiChecking, setImeiChecking] = useState(false);

  // جلب اسم المتجر ورقم الهاتف من جدول businesses عند تحميل المكون
  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) return;

      const isBusiness = user.role && ['business', 'free_business', 'gold_business', 'silver_business'].includes(user.role);

      if (isBusiness) {
        // منطق المستخدم التجاري - استخدام server endpoint لفك التشفير
        try {
          const response = await axiosInstance.get('/api/decrypted-user');
          const data = response.data?.business;

          if (data) {
            setFormData(prev => ({
              ...prev,
              store_name: data.store_name || '',
              city: data.address || '',
              contact_methods: { ...prev.contact_methods, phone: data.phone || '' }
            }));
          }
        } catch (err) {
          console.error('Error fetching business data:', err);
        }
      } else {
        // منطق المستخدم العادي الجديد
        try {
          const response = await axiosInstance.get('/api/decrypted-user');
          const data = response.data?.user;

          if (data) {
            setFormData(prev => ({
              ...prev,
              store_name: data?.full_name || '',
              city: '',
              contact_methods: { ...prev.contact_methods, phone: data?.phone || '' }
            }));
          }
        } catch (err) {
          console.error('Error fetching user data:', err);
        }
      }
    };

    fetchUserData();
  }, [user]);
  const [formData, setFormData] = useState<PhoneFormData>({
    title: '',
    brand: '',
    model: '',
    description: '',
    price: '',
    condition: 'new',
    warranty_months: '0',
    specs: {},
    city: '',
    contact_methods: {},
    imei: '',
    store_name: ''
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + images.length > 10) {
      setError('يمكنك رفع 10 صور كحد أقصى');
      return;
    }

    setImages(prev => [...prev, ...files]);
    
    // إنشاء previews للصور
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagesPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setImagesPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // التحقق من حالة IMEI قبل الإرسال
    if (imeiStatus === 'reported') {
      setError('لا يمكن نشر إعلان لهاتف مبلغ عنه بأنه مفقود أو مسروق');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // 1. Create phone record via server API so sensitive fields (IMEI, phone) are encrypted server-side
      let phoneData: any = null;
      try {
        const payload = {
          seller_id: user.id,
          title: formData.title,
          brand: formData.brand,
          model: formData.model,
          description: formData.description,
          price: parseFloat(formData.price) || 0,
          condition: formData.condition,
          warranty_months: parseInt(formData.warranty_months) || 0,
          specs: formData.specs,
          city: formData.city,
          contact_methods: formData.contact_methods,
          imei: formData.imei, // send raw IMEI to server for encryption/storage
          store_name: formData.store_name,
          status: 'pending',
          is_verified: imeiStatus === 'verified',
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          role: user?.role,
        };

        const res = await axiosInstance.post('/api/create-phone', payload);
        phoneData = res?.data?.phone;
        if (!phoneData || !phoneData.id) throw new Error('Server did not return created phone id');
      } catch (err) {
        throw err;
      }

      // 2. رفع الصور
      if (images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const file = images[i];
          const fileExt = file.name.split('.').pop();
          const filePath = `${user.id}/${phoneData.id}/${Math.random()}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('phone-images')
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          // الحصول على URL العام للصورة
          const { data: { publicUrl } } = supabase.storage
            .from('phone-images')
            .getPublicUrl(filePath);

          // إضافة مسار الصورة في جدول phone_images
          const { error: imageError } = await supabase
            .from('phone_images')
            .insert([
              {
                phone_id: phoneData.id,
                image_path: publicUrl, // تخزين الرابط العام الكامل
                main_image: i === 0, // أول صورة هي الرئيسية
                order: i
              }
            ]);

          if (imageError) throw imageError;
        }
      }

      // 3. تطبيق خصم البونux إذا كان متاحاً
      // الحصول على تكلفة النشر العادية
      const { data: normalPriceData, error: normalPriceError } = await supabase
        .from('ads_price')
        .select('amount')
        .eq('type', 'normal')
        .eq('duration_days', 1) // تكلفة يوم واحد كتكلفة نشر عادي
        .single();

      if (normalPriceError && normalPriceError.code !== 'PGRST116') {
        throw normalPriceError;
      }

      const normalPrice = normalPriceData?.amount || 0;

      // التحقق من وجود رصيد بونux كافٍ للخصم
      if (bonusBalance > 0 && normalPrice > 0) {
        // حساب المبلغ الذي سيتم خصمه
        const amountToDeduct = Math.min(bonusBalance, normalPrice);
        
        // تحديث رصيد البونux
        const newBonus = bonusBalance - amountToDeduct;
        if (lastBonusId) {
          const { error: updateBonusError } = await supabase
            .from('ads_payment')
            .update({
              bonus_offer: newBonus,
              payment_date: new Date().toISOString(),
              is_paid: true,
              payment_status: 'paid',
              transaction: 'bonus_add',
              Actual_bonus: bonusBalance
            })
            .eq('id', lastBonusId);
          
          if (updateBonusError) throw updateBonusError;
        }

        // تسجيل الدفعة باستخدام البونux
        const { error: insertPaymentError } = await supabase
          .from('ads_payment')
          .insert({
            user_id: user.id,
            phone_id: phoneData.id,
            amount: amountToDeduct,
            duration_days: 1,
            is_paid: true,
            payment_status: 'paid_with_bonus',
            type: 'normal',
            transaction: 'ad_posting',
            payment_date: new Date().toISOString(),
          });

        if (insertPaymentError) throw insertPaymentError;

        // تحديث رصيد البونux في الواجهة
        setBonusBalance(newBonus);

        // عرض رسالة نجاح للمستخدم
        toast({
          title: "تم نشر الإعلان بنجاح!",
          description: `تم خصم ${amountToDeduct} ج.م من رصيد البونux الخاص بك.`,
          variant: "default"
        });
      } else if (normalPrice > 0) {
        // إذا لم يكن هناك رصيد بونux كافٍ، سجل الدفعة كدفع عادي
        const { error: insertPaymentError } = await supabase
          .from('ads_payment')
          .insert({
            user_id: user.id,
            phone_id: phoneData.id,
            amount: normalPrice,
            duration_days: 1,
            is_paid: false,
            payment_status: 'pending',
            type: 'normal',
            transaction: 'ad_posting',
            payment_date: new Date().toISOString(),
          });

        if (insertPaymentError) throw insertPaymentError;

        // عرض رسالة للمستخدم بوجوب سداد الرسوم
        toast({
          title: "تم نشر الإعلان بنجاح!",
          description: `يرجى سداد رسوم النشر البالغة ${normalPrice} ج.م لإكمال عملية النشر.`,
          variant: "default"
        });
      }

      // تم بنجاح
      setPhoneIdToFeature(phoneData.id); // Save the new phone ID to feature it later
      navigate('/seller-dashboard');

    } catch (err) {
      console.error('Error adding phone:', err);
      setError('حدث خطأ أثناء إضافة الهاتف. الرجاء المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmFeature = async (createdPhoneId: string) => {
    if (!user || !createdPhoneId || promotionPrice === null) {
      toast({ title: "خطأ", description: "لا يمكن {t('feature_ad')}. البيانات غير مكتملة.", variant: "destructive" });
      return;
    }

    if (bonusBalance < (promotionPrice || 0)) {
      toast({ title: "رصيد غير كافٍ", description: "رصيد البونص لديك غير كافٍ لإتمام هذه العملية.", variant: "destructive" });
      // Here you would typically redirect to a payment page
      return;
    }

    setLoading(true);
    try {
      // Fetch the main image for the phone to be featured
      const { data: imageData, error: imageError } = await supabase
        .from('phone_images')
        .select('image_path')
        .eq('phone_id', createdPhoneId)
        .eq('main_image', true)
        .single();

      if (imageError || !imageData) {
        throw new Error("لم يتم العثور على الصورة الرئيسية للإعلان.");
      }

      const mainImageUrl = imageData.image_path;

      // 1. Deduct from bonus
      const newBonus = bonusBalance - promotionPrice;
      if (lastBonusId) {
        const { error: updateBonusError } = await supabase
          .from('ads_payment')
          .update({ bonus_offer: newBonus })
          .eq('id', lastBonusId);
        if (updateBonusError) throw updateBonusError;
      }

      // 2. Create a new record for the promotion in ads_payment
      const expires_at = new Date();
      expires_at.setDate(expires_at.getDate() + parseInt(selectedDuration, 10));

      const { error: insertPromotionError } = await supabase
        .from('ads_payment')
        .insert({
          user_id: user.id,
          phone_id: createdPhoneId,
          amount: promotionPrice,
          duration_days: parseInt(selectedDuration, 10),
          is_paid: true,
          payment_status: 'paid_with_bonus',
          type: 'promotions',
          transaction: 'ad_promotion',
          expires_at: expires_at.toISOString(),
          payment_date: new Date().toISOString(),
          image_url: mainImageUrl, // Add the image URL here
        });

      if (insertPromotionError) throw insertPromotionError;

      // 3. Update UI
      setBonusBalance(newBonus);
      setIsFeatureModalOpen(false);
      toast({
        title: "تم {t('feature_ad')} بنجاح!",
        description: `تم خصم ${promotionPrice} ج.م من رصيد البونص.`,
        variant: "default"
      });

      // Optionally, navigate away or refresh data
      navigate('/seller-dashboard');

    } catch (error: any) {
      console.error("Error featuring ad with bonus:", error);
      toast({ title: "خطأ", description: error.message || "فشل {t('feature_ad')}.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAndFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "خطأ", description: "يجب تسجيل الدخول أولاً.", variant: "destructive" });
      return;
    }
    if (imeiStatus === 'reported') {
      setError('لا يمكن نشر إعلان لهاتف مبلغ عنه بأنه مفقود أو مسروق');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Create the phone record via server API so sensitive fields are encrypted on server
      let phoneData: any = null;
      try {
        const payload = {
          seller_id: user.id,
          title: formData.title,
          brand: formData.brand,
          model: formData.model,
          description: formData.description,
          price: parseFloat(formData.price) || 0,
          condition: formData.condition,
          warranty_months: parseInt(formData.warranty_months) || 0,
          specs: formData.specs,
          city: formData.city,
          contact_methods: formData.contact_methods,
          imei: formData.imei,
          store_name: formData.store_name,
          status: 'pending',
          is_verified: imeiStatus === 'verified',
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          role: user?.role,
        };

        const res = await axiosInstance.post('/api/create-phone', payload);
        phoneData = res?.data?.phone;
        if (!phoneData || !phoneData.id) throw new Error('Server did not return created phone id');
      } catch (err) {
        throw err;
      }

      // 2. Upload images for the newly created phone
      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        const fileExt = file.name.split('.').pop();
        const filePath = `${user.id}/${phoneData.id}/${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('phone-images').upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('phone-images').getPublicUrl(filePath);
        await supabase.from('phone_images').insert([{ phone_id: phoneData.id, image_path: publicUrl, main_image: i === 0, order: i }]);
      }

      // 3. Now that the phone is created, apply the feature promotion directly
      if (!user || !phoneData.id || promotionPrice === null) {
        throw new Error("لا يمكن {t('feature_ad')}. البيانات غير مكتملة.");
      }
  
      if (bonusBalance < (promotionPrice || 0)) {
        // عند عدم وجود رصيد كافٍ، يتم فتح نافذة الترقية
        setShowUpgradePrompt(true);
        setIsFeatureModalOpen(false); // إغلاق نافذة التمييز
        setLoading(false); // إيقاف التحميل
        return; // إيقاف تنفيذ الدالة
      }
  
      const mainImageUrl = (await supabase.storage.from('phone-images').getPublicUrl(`${user.id}/${phoneData.id}/` + images[0].name.split('.').pop())).data.publicUrl;
  
      // 3.1. Deduct from bonus
      const newBonus = bonusBalance - promotionPrice;
      if (lastBonusId) {
        const { error: updateBonusError } = await supabase
          .from('ads_payment')
          .update({ bonus_offer: newBonus })
          .eq('id', lastBonusId);
        if (updateBonusError) throw updateBonusError;
      }
  
      // 3.2. Create a new record for the promotion in ads_payment
      const expires_at = new Date();
      expires_at.setDate(expires_at.getDate() + parseInt(selectedDuration, 10));
  
      const { error: insertPromotionError } = await supabase.from('ads_payment').insert({
        user_id: user.id,
        phone_id: phoneData.id,
        amount: promotionPrice,
        duration_days: parseInt(selectedDuration, 10),
        is_paid: true,
        payment_status: 'paid_with_bonus',
        type: 'promotions', // This is for the ads_payment table
        transaction: 'ad_promotion',
        expires_at: expires_at.toISOString(),
        payment_date: new Date().toISOString(),
        image_url: mainImageUrl,
      });
      if (insertPromotionError) throw insertPromotionError;
  
      // 3.3. Update the 'type' in the 'phones' table to 'promotions'
      const { error: updatePhoneError } = await supabase.from('phones').update({ type: 'promotions' }).eq('id', phoneData.id);
      if (updatePhoneError) throw updatePhoneError;
  
      // 3.4. Update UI and navigate
      setBonusBalance(newBonus);
      setIsFeatureModalOpen(false);
      toast({
        title: `تم نشر و${t('feature_ad')} بنجاح!`,
        description: `تم خصم ${promotionPrice} ج.م من رصيد البونص.`,
        variant: "default"
      });
      navigate('/seller-dashboard');

    } catch (err: any) {
      console.error('Error in handleSubmitAndFeature:', err);
      setError(err.message || `حدث خطأ أثناء نشر و${t('feature_ad')}.`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = async (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    
    if (name.startsWith('specs.')) {
      const specName = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        specs: {
          ...prev.specs,
          [specName]: value
        }
      }));
    } else if (name.startsWith('contact_methods.')) {
      const methodName = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        contact_methods: {
          ...prev.contact_methods,
          [methodName]: value
        }
      }));
    } else if (name === 'imei') {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));

      // When IMEI reaches 15 digits, ask the server to check/decrypt reports and registrations
      if (value.length === 15) {
        setImeiChecking(true);
        setImeiStatus('');
        setError('');

        try {
          const resp = await axiosInstance.post('/api/imei-masked-info', { imei: value });
          const info = resp?.data || {};

          // server returns { found, isRegistered, masked, isOwner, ... }
          if (info.found) {
            // If found but not registered -> active report only
            if (info.isRegistered === false) {
              setImeiStatus('reported');
              setError('هذا الهاتف مسجل في النظام بأنه مفقود أو مسروق ولا يمكن بيعه');
            } else {
              // Registered (could be masked). If user is owner or server indicates not masked, treat as verified
              const ownerVisible = info.isOwner === true || info.masked === false;
              if (ownerVisible) {
                setImeiStatus('verified');
                setFormData(prev => ({ ...prev, is_verified: true }));
                setError('');
              } else {
                // Registered but masked (belongs to other user) — still consider it 'verified' for safety check
                setImeiStatus('verified');
                setError('');
              }
            }
          } else {
            // Not found anywhere
            setImeiStatus('');
            setError('');
          }
        } catch (e) {
          console.error('Error fetching IMEI info:', e);
          setImeiStatus('');
          setError('حدث خطأ أثناء التحقق من رقم IMEI، حاول مرة أخرى');
        } finally {
          setImeiChecking(false);
        }
      } else {
        // Reset state while typing
        setImeiStatus('');
        setError('');
      }
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  return (
    <>
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{t('add_new_phone')}</h1>
          <p className="mt-2 text-blue-100">{t('add_phone_description')}</p>
        </div>
        <div className="p-6 sm:p-8">

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6 flex items-start shadow-sm">
          <X className="h-5 w-5 text-red-500 ml-2 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{t('error_occurred')}</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* معلومات أساسية */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <div className="h-8 w-1 bg-blue-600 rounded-full mr-3"></div>
            <h2 className="text-xl font-bold text-gray-900">{t('basic_information')}</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="relative">
                <label className="flex items-center text-sm font-semibold text-gray-700 mb-2">
                  <svg className="w-5 h-5 ml-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  {t('store_name')}
                </label>
                <div className="mt-1 relative rounded-lg shadow-sm overflow-hidden">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-600 opacity-10"></div>
                  <input
                    type="text"
                    name="store_name"
                    value={formData.store_name}
                    readOnly
                    className="block w-full pl-10 pr-3 py-4 border-2 border-blue-200 bg-white text-black rounded-lg font-bold text-center text-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-base transition-all"
                    placeholder={t('will_be_auto_fetched')}
                    style={{ minHeight: "56px" }}
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-md">
                      <svg className="-ml-0.5 mr-1.5 h-2 w-2 text-white" fill="currentColor" viewBox="0 0 8 8">
                        <circle cx={4} cy={4} r={3} />
                      </svg>
                      {t('automatic')}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500 flex items-center justify-center">
                  <svg className="w-4 h-4 ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('store_name_auto_fetched')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('ad_title')}*
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  value={formData.title}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 transition-all text-black font-semibold"
                  placeholder={t('write_attractive_ad_title')}
                />
              </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t('brand')}*
              </label>
              <input
                type="text"
                name="brand"
                required
                value={formData.brand}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 transition-all text-black font-semibold"
                placeholder={t('brand_example')}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t('model')}*
              </label>
              <input
                type="text"
                name="model"
                required
                value={formData.model}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 transition-all text-black font-semibold"
                placeholder={t('model_example')}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t('price_currency')}*
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">{t('currency')}</span>
                </div>
                <input
                  type="number"
                  name="price"
                  required
                  min="0"
                  value={formData.price}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 pl-12 transition-all text-black font-semibold"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t('condition')}*
              </label>
              <select
                name="condition"
                required
                value={formData.condition}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 transition-all text-black font-semibold"
              >
                <option value="new">{t('new')}</option>
                <option value="used">{t('used')}</option>
                <option value="refurbished">{t('refurbished')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t('warranty_months_label')}
              </label>
              <input
                type="number"
                name="warranty_months"
                min="0"
                value={formData.warranty_months}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 transition-all text-black font-semibold"
                placeholder="0"
              />
            </div>
          </div>

            <div className="mt-6 md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t('description')}*
              </label>
              <textarea
                name="description"
                required
                rows={4}
                value={formData.description}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 transition-all text-black font-semibold"
                placeholder={t('detailed_phone_description')}
              />
            </div>
          
        </div>

        {/* المواصفات */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <div className="h-8 w-1 bg-blue-600 rounded-full mr-3"></div>
            <h2 className="text-xl font-bold text-gray-900">{t('specifications')}</h2>
          </div>
          <div className="bg-gray-50 rounded-xl p-6 shadow-sm">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('memory_ram')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 sm:text-sm">{t('gb')}</span>
                  </div>
                  <input
                    type="text"
                    name="specs.ram"
                    value={formData.specs.ram || ''}
                    onChange={handleInputChange}
                    placeholder={t('ram_example')}
                    className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 pr-10 transition-all text-black font-semibold"
                  />
                </div>
              </div>

              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('storage')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 sm:text-sm">{t('gb')}</span>
                  </div>
                  <input
                    type="text"
                    name="specs.storage"
                    value={formData.specs.storage || ''}
                    onChange={handleInputChange}
                    placeholder={t('storage_example')}
                    className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 pr-10 transition-all text-black font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('color')}
                </label>
                <input
                  type="text"
                  name="specs.color"
                  value={formData.specs.color || ''}
                  onChange={handleInputChange}
                  placeholder={t('color_example')}
                  className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 transition-all text-black font-semibold"
                />
              </div>
            </div>
          </div>
        </div>

        {/* معلومات الاتصال والموقع */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <div className="h-8 w-1 bg-blue-600 rounded-full mr-3"></div>
            <h2 className="text-xl font-bold text-gray-900">{t('contact_and_location_info')}</h2>
          </div>
          <div className="bg-gray-50 rounded-xl p-6 shadow-sm">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('phone_number')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 sm:text-sm">{t('country_code')}</span>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-600 opacity-10"></div>
                  <input
                    type="tel"
                    name="contact_methods.phone"
                    value={formData.contact_methods.phone || ''}
                    readOnly
                    className="mt-1 block w-full rounded-lg border-2 border-blue-200 bg-white text-black font-bold text-center text-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-base transition-all p-3 pr-12"
                    placeholder={t('will_be_auto_fetched')}
                    dir="ltr"
                    style={{ minHeight: "56px" }}
                  />

                </div>
                <p className="mt-2 text-xs text-gray-500 flex items-center justify-center">
                  <svg className="w-4 h-4 ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('phone_number_auto_fetched')}
                </p>
              </div>



              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('city')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-600 opacity-10"></div>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    readOnly
                    className="mt-1 block w-full rounded-lg border-2 border-blue-200 bg-white text-black font-bold text-center text-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-base transition-all p-3 pl-10"
                    placeholder={t('will_be_auto_fetched')}
                    style={{ minHeight: "56px" }}
                  />
                   <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-md">
                      <svg className="-ml-0.5 mr-1.5 h-2 w-2 text-white" fill="currentColor" viewBox="0 0 8 8">
                        <circle cx={4} cy={4} r={3} />
                      </svg>
                      {t('automatic')}
                    </span>
                  </div>
                </div>
                 <p className="mt-2 text-xs text-gray-500 flex items-center justify-center">
                  <svg className="w-4 h-4 ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {t('city_auto_fetched')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('imei')}*
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="imei"
                    required
                    value={formData.imei}
                    onChange={handleInputChange}
                    pattern="[0-9]{15}"
                    title="الرجاء إدخال رقم IMEI مكون من 15 رقم"
                    className={`mt-1 block w-full rounded-lg shadow-sm text-base p-3 transition-all text-black font-semibold ${
                      imeiStatus === 'verified' ? 'border-green-500 focus:border-green-500 focus:ring-green-500' : 
                      imeiStatus === 'reported' ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 
                      'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                    placeholder={t('imei_example')}
                    dir="ltr"
                  />
                  {imeiChecking && (
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                    </div>
                  )}
                  {imeiStatus === 'verified' && (
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  )}
                  {imeiStatus === 'reported' && (
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  )}
                  <div className="mt-1 text-xs text-gray-500">{t('imei_location_hint')}</div>
                  {imeiStatus === 'verified' && (
                    <div className="mt-2 text-xs text-green-600 flex items-center">
                      <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {t('verified_phone_safe_to_sell')}
                    </div>
                  )}
                  {imeiStatus === 'reported' && (
                    <div className="mt-2 text-xs text-red-600 flex items-center">
                      <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {t('reported_phone_cannot_sell')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* الصور */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <div className="h-8 w-1 bg-blue-600 rounded-full mr-3"></div>
            <h2 className="text-xl font-bold text-gray-900">{t('phone_images')}</h2>
          </div>
          <div className="bg-gray-50 rounded-xl p-6 shadow-sm">
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">{t('add_high_quality_images')}</p>
            </div>
            
            {imagesPreviews.length > 0 && (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-6">
                {imagesPreviews.map((preview, index) => (
                  <div key={index} className="relative group overflow-hidden rounded-lg shadow-md transition-all hover:shadow-lg">
                    <div className="aspect-square relative">
                      <img
                        src={preview}
                        alt={`Preview ${index + 1}`}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 transition-all opacity-0 group-hover:opacity-100 shadow-lg"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      {index === 0 && (
                        <span className="absolute bottom-2 right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full shadow-md">
                          {t('main_image')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 hover:border-blue-400 transition-colors bg-white">
              <div className="text-center">
                <div className="mx-auto h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                  <Upload className="h-8 w-8 text-blue-600" />
                </div>
                <div className="flex text-sm text-gray-600 justify-center mb-2">
                  <label
                    htmlFor="images"
                    className="relative cursor-pointer font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none"
                  >
                    <span>{t('choose_images')}</span>
                    <input
                      id="images"
                      name="images"
                      type="file"
                      multiple
                      accept="image/*"
                      className="sr-only"
                      onChange={handleImageChange}
                      required={images.length === 0}
                    />
                  </label>
                  <span className="mr-1">{t('or_drag_here')}</span>
                </div>
                <p className="text-xs text-gray-500">
                  {t('image_upload_specs')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* زر الإرسال */}
        <div className="flex justify-center items-center mt-4 sm:mt-6 space-x-2 sm:space-x-4 space-x-reverse flex-wrap gap-2">
          <button
            type="button" // Or change to submit if it has a separate logic
            disabled={loading}
            className="inline-flex items-center px-4 sm:px-6 py-2 sm:py-2.5 mb-4 border border-transparent text-sm sm:text-base font-semibold rounded-lg sm:rounded-xl shadow-lg text-white bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 transition-all transform hover:scale-105"
            onClick={() => setIsFeatureModalOpen(true)}
          >
            {loading ? (
              <Loader2 className="animate-spin h-5 w-5 ml-2" />
            ) : (
              t('feature_ad')
            )}
          </button>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center px-4 sm:px-6 py-2 sm:py-2.5 mb-4 border border-transparent text-sm sm:text-base font-semibold rounded-lg sm:rounded-xl shadow-lg text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all transform hover:scale-105"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin h-5 w-5 ml-2" />
                {t('publishing')}
              </>
            ) : (
              t('publish_ad_now')
            )}
          </button>
        </div>
      </form>
        </div>
      </div>
    </div>

    {/* نافذة الترقية عند عدم وجود رصيد بونص كافٍ */}
    {showUpgradePrompt && (
      <div className="fixed inset-0 bg-gray-600/60 backdrop-blur-lg z-[100] flex flex-col items-center justify-center p-4">
        <button
          onClick={() => setShowUpgradePrompt(false)}
          className="absolute top-5 right-5 text-white bg-black/50 rounded-full p-2 z-10"
        >
          <X size={24} />
        </button>
        <AdsOfferSlider isUpgradePrompt={true} onClose={() => setShowUpgradePrompt(false)} />
      </div>
    )}


      {isFeatureModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={() => setIsFeatureModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg transform transition-all" onClick={(e) => e.stopPropagation()}>
            <div className="relative p-6 sm:p-8 text-center max-h-[80vh] overflow-y-auto">
              <button 
                onClick={() => setIsFeatureModalOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                ✨ {t('make_ad_top')}
              </h2>
              <p className="text-gray-600 mb-6">
                {t('featured_ad_service_description')}
              </p>

              <div className="text-right space-y-4 text-gray-700 mb-8 px-1">
                <p>
                  {t('featured_ad_benefits')}
                </p>
                <h3 className="font-bold text-lg pt-2">{t('what_you_get')}</h3>
                <ul className="space-y-3">
                  <li className="flex items-start">
                    <Star className="w-5 h-5 text-yellow-500 ml-3 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold">{t('ad_at_top')}</span> {t('first_seen_by_buyer')}</span>
                  </li>
                  <li className="flex items-start">
                    <MapPin className="w-5 h-5 text-red-500 ml-3 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold">{t('precise_location_targeting')}</span> {t('reach_nearby_buyers')}</span>
                  </li>
                  <li className="flex items-start">
                    <Clock className="w-5 h-5 text-blue-500 ml-3 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold">{t('seven_days_validity')}</span> {t('full_week_featured')}</span>
                  </li>
                  <li className="flex items-start">
                    <Eye className="w-5 h-5 text-green-500 ml-3 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold">{t('more_views_attention')}</span> {t('attract_serious_buyers')}</span>
                  </li>
                  <li className="flex items-start">
                    <Zap className="w-5 h-5 text-purple-500 ml-3 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold">{t('increase_selling_speed')}</span> {t('dont_miss_opportunity')}</span>
                  </li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Gift className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-medium text-gray-700">{t('current_bonus_balance')}</span>
                  <span className="text-lg font-bold text-blue-600">{Math.floor(bonusBalance).toLocaleString()} ج.م</span>
                </div>
              </div>

              <div className="text-right space-y-2 text-gray-700 mb-6">
                <h3 className="font-bold text-lg">{t('select_feature_duration')}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {availableDurations.map((days) => (
                    <label key={days} htmlFor={`promo_${days}`} className={`relative flex flex-col items-center justify-center rounded-lg border-2 p-3 cursor-pointer transition-all ${selectedDuration === days ? 'border-yellow-500 bg-yellow-50 ring-2 ring-yellow-200' : 'border-gray-200 bg-white'}`}>
                      <input type="radio" id={`promo_${days}`} name="promotion_duration" value={days} checked={selectedDuration === days} onChange={(e) => setSelectedDuration(e.target.value)} className="sr-only" />
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-5 h-5 text-gray-600" />
                        <span className="text-base font-bold text-gray-800">{days} {t('days')}</span>
                      </div>
                      <span className="text-sm font-semibold text-yellow-600 mt-1">{promotionPrices[days] || 0} ج.م</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-4 p-3 bg-gray-100 border border-gray-200 rounded-lg text-center">
                <p className="text-gray-800 font-medium">
                  {t('total')}: <span className="text-xl font-bold text-gray-900">{promotionPrice || 0} {t('currency')}</span>
                </p>
              </div>

              <p className="text-gray-800 font-semibold mb-6">
              ✨ {t('dont_let_ad_get_lost')}
              </p>

              <button
                onClick={handleSubmitAndFeature}
                disabled={loading}
                className="w-full inline-flex items-center justify-center px-8 py-4 border border-transparent text-lg font-bold rounded-xl shadow-lg text-white bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 transition-all transform hover:scale-105"
              >
                {loading ? <Loader2 className="animate-spin h-6 w-6" /> : t('feature_now_with_bonus')}
              </button>

            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AddPhoneForm;