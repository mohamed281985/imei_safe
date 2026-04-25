import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import axiosInstance from '@/services/axiosInterceptor';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, X, Loader2, Star, Zap, MapPin, Clock, Eye, Gift, CalendarDays } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

import { useGeolocated } from 'react-geolocated';
import { useToast } from '@/hooks/use-toast';
import AdsOfferSlider from '@/components/advertisements/AdsOfferSlider';
interface AccessoryFormData {
  title: string;
  category: string;
  brand: string;
  compatibility: string;
  description: string;
  price: string;
  condition: 'new' | 'used';
  warranty_months: string;
  city: string;
  contact_methods: {
    phone?: string;
  };
  store_name: string;
}

const AddAccessoriesForm: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
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
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const { coords } = useGeolocated({
    positionOptions: {
      enableHighAccuracy: true,
    },
    userDecisionTimeout: 5000,
  });

  // Fetch promotion prices
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
        console.debug('Error fetching promotion prices:', error);
      }
    };

    fetchPromotionPrices();
  }, []);

  // Update price when duration changes
    // Update price when duration changes
  useEffect(() => {
    setPromotionPrice(promotionPrices[selectedDuration] || null);
  }, [selectedDuration, promotionPrices]);

  // Fetch user's bonus balance
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
          console.debug("Error fetching bonus data:", fetchError);
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
        console.debug("Unexpected error fetching bonus:", err);
        setBonusBalance(0);
        setLastBonusId(null);
      }
    };

    fetchBonus();
  }, [user]);


  // جلب اسم المتجر ورقم الهاتف من جدول businesses عند تحميل المكون
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
            setFormData(prev => ({ ...prev, store_name: data.store_name || '', city: data.address || '', contact_methods: { ...prev.contact_methods, phone: data.phone || '' } }));
          }
        } catch (err) {
          console.debug('Error fetching business data:', err);
        }
      } else {
        // منطق المستخدم العادي
        try {
          const response = await axiosInstance.get('/api/decrypted-user');
          const data = response.data?.user;

          if (data) {
            setFormData(prev => ({ ...prev, store_name: data?.full_name || '', city: '', contact_methods: { ...prev.contact_methods, phone: data?.phone || '' } }));
          }
        } catch (err) {
          console.debug('Error fetching user data:', err);
        }
      }
    };

    fetchUserData();
  }, [user]);
  const [formData, setFormData] = useState<AccessoryFormData>({
    title: '',
    category: '',
    brand: '',
    compatibility: '',
    description: '',
    price: '',
    condition: 'new',
    warranty_months: '0',
    city: '',
    contact_methods: {},
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

    try {
      setLoading(true);
      setError('');

      // 1. إنشاء الإكسسوار في قاعدة البيانات
      const { data: accessoryData, error: accessoryError } = await supabase
        .from('accessories')
        .insert([
          {
            seller_id: user.id, // استخدام user.id مباشرة
            title: formData.title,
            category: formData.category,
            brand: formData.brand,
            compatibility: formData.compatibility,
            description: formData.description,
            price: parseFloat(formData.price) || 0,
            condition: formData.condition,
            warranty_months: parseInt(formData.warranty_months),
            city: formData.city,
            contact_methods: formData.contact_methods,
            store_name: formData.store_name, // إضافة اسم المتجر
            latitude: coords?.latitude,
            longitude: coords?.longitude,
            role: user?.role, // إضافة دور المستخدم
          }
        ])
        .select()
        .single();

      if (accessoryError) throw accessoryError;
      // 2. رفع الصور
      if (images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const file = images[i];
          const fileExt = file.name.split('.').pop();
          const filePath = `${user.id}/${accessoryData.id}/${Math.random()}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('accessory-images')
            .upload(filePath, file);

          if (uploadError) {
            await axiosInstance.post('/api/delete-accessory-if-failed', { accessoryId: accessoryData.id });
            throw uploadError;
          }

          // الحصول على URL العام للصورة
          const { data: { publicUrl } } = supabase.storage
            .from('accessory-images')
            .getPublicUrl(filePath);

          // إضافة مسار الصورة في جدول accessory_images
          try {
            const { error: imageError } = await supabase
              .from('accessory_images')
              .insert([
                {
                  accessory_id: accessoryData.id,
                  image_path: publicUrl, // تخزين الرابط العام الكامل
                  main_image: i === 0, // أول صورة هي الرئيسية
                  order: i
                }
              ]);

            if (imageError) {
              await axiosInstance.post('/api/delete-accessory-if-failed', { accessoryId: accessoryData.id });
              throw imageError;
            }
          } catch (imgErr) {
            await axiosInstance.post('/api/delete-accessory-if-failed', { accessoryId: accessoryData.id });
            throw imgErr;
          }
        }
      }

      // --- بداية منطق الدفع للإعلان العادي (منسوخ من AddPhoneForm) ---
      const { data: normalPriceData, error: normalPriceError } = await supabase
        .from('ads_price')
        .select('amount')
        .eq('type', 'normal')
        .eq('duration_days', 1)
        .single();

      if (normalPriceError && normalPriceError.code !== 'PGRST116') {
        throw normalPriceError;
      }

      const normalPrice = normalPriceData?.amount || 0;

      if (bonusBalance > 0 && normalPrice > 0) {
        const amountToDeduct = Math.min(bonusBalance, normalPrice);
        const newBonus = bonusBalance - amountToDeduct;

        if (lastBonusId) {
          await supabase.from('ads_payment').update({ bonus_offer: newBonus }).eq('id', lastBonusId);
        }

        await supabase.from('ads_payment').insert({
          user_id: user.id,
          accessory_id: accessoryData.id,
          phone_id: null,
          amount: amountToDeduct,
          duration_days: 1,
          is_paid: true,
          payment_status: 'paid_with_bonus',
          type: 'normal',
          transaction: 'ad_posting',
          payment_date: new Date().toISOString(),
          image_url: null,
        });

        setBonusBalance(newBonus);
        toast({ title: t('ad_published_successfully'), description: t('bonus_deducted', { amount: amountToDeduct.toString() }), variant: "default" });

      } else if (normalPrice > 0) {
        const { data: paymentData, error: paymentError } = await supabase.from('ads_payment').insert({
          user_id: user.id,
          accessory_id: accessoryData.id,
          phone_id: null,
          amount: normalPrice,
          duration_days: 1,
          is_paid: false,
          payment_status: 'pending',
          type: 'normal',
          transaction: 'ad_posting',
          payment_date: new Date().toISOString(),
          image_url: null,
        }).select().single();

        if (paymentError) throw paymentError;

        toast({ title: t('ad_created'), description: t('please_pay_fee', { price: normalPrice }), variant: "default" });
        navigate(`/payment/${paymentData.id}`);
        return; // توجيه للدفع مباشرة
      }
      // --- نهاية منطق الدفع للإعلان العادي ---

      navigate('/seller-dashboard');

    } catch (err) {
      console.debug('Error adding accessory:', err);
      setError(t('error_adding_accessory'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAndFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: t('error'), description: t('must_be_logged_in'), variant: "destructive" });
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Create the accessory record first
      const { data: accessoryData, error: accessoryError } = await supabase
        .from('accessories')
        .insert([
          {
            seller_id: user.id,
            title: formData.title,
            category: formData.category,
            brand: formData.brand,
            compatibility: formData.compatibility,
            description: formData.description,
            price: parseFloat(formData.price) || 0,
            condition: formData.condition,
            warranty_months: parseInt(formData.warranty_months),
            city: formData.city,
            contact_methods: formData.contact_methods,
            store_name: formData.store_name,
            status: 'pending',
            latitude: coords?.latitude,
            longitude: coords?.longitude,
            role: user?.role,
          }
        ])
        .select()
        .single();

      if (accessoryError) throw accessoryError;

      // 2. Upload images
      // 2. Upload images
      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        const fileExt = file.name.split('.').pop();
        const filePath = `${user.id}/${accessoryData.id}/${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('accessory-images').upload(filePath, file);
        if (uploadError) {
          await axiosInstance.post('/api/delete-accessory-if-failed', { accessoryId: accessoryData.id });
          throw uploadError;
        }
        const { data: { publicUrl } } = supabase.storage.from('accessory-images').getPublicUrl(filePath);
          try {
            await axiosInstance.post('/api/insert-accessory-image', { accessoryId: accessoryData.id, imageUrl: publicUrl, main_image: i === 0, order: i });
          } catch (imgErr) {
            await axiosInstance.post('/api/delete-accessory-if-failed', { accessoryId: accessoryData.id });
            throw imgErr;
          }
      }

      // 3. Now that the accessory is created, apply the feature promotion directly
      if (!user || !accessoryData.id || promotionPrice === null) {
        throw new Error(t('cannot_feature_ad_incomplete_data'));
      }

      if (bonusBalance < (promotionPrice || 0)) {
        // عند عدم وجود رصيد كافٍ، يتم فتح نافذة الترقية
        setShowUpgradePrompt(true);
        setIsFeatureModalOpen(false); // إغلاق نافذة التمييز
        setLoading(false); // إيقاف التحميل
        return; // إيقاف تنفيذ الدالة
      }

      // الحصول على URL للصورة الرئيسية
      let mainImageUrl = '';
      if (images.length > 0) {
        const fileExt = images[0].name.split('.').pop();
        const filePath = `${user.id}/${accessoryData.id}/${Math.random()}.${fileExt}`;
        const { data: { publicUrl } } = supabase.storage.from('accessory-images').getPublicUrl(filePath);
        mainImageUrl = publicUrl;
      }

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
        accessory_id: accessoryData.id,
        phone_id: null,
        amount: promotionPrice,
        duration_days: parseInt(selectedDuration, 10),
        is_paid: true,
        payment_status: 'paid_with_bonus',
        type: 'promotions',
        transaction: 'ad_promotion',
        expires_at: expires_at.toISOString(),
        payment_date: new Date().toISOString(),
        image_url: mainImageUrl,
      });
      if (insertPromotionError) throw insertPromotionError;

      // 3.3. Update the 'type' in the 'accessories' table to 'promotions'
      const { error: updateAccessoryError } = await supabase.from('accessories').update({ type: 'promotions' }).eq('id', accessoryData.id);
      if (updateAccessoryError) throw updateAccessoryError;

      // 3.4. Update UI and navigate
      setBonusBalance(newBonus);
      setIsFeatureModalOpen(false);
      toast({
        title: t('ad_published_and_featured_successfully'),
        description: t('bonus_deducted_for_feature', { amount: promotionPrice.toString() }),
        variant: "default"
      });
      navigate('/seller-dashboard');

    } catch (err: any) {
      console.debug('Error in handleSubmitAndFeature for accessory:', err);
      setError(err.message || t('error_publishing_and_featuring_ad'));
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = async (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    if (name.startsWith('contact_methods.')) {
      const methodName = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        contact_methods: {
          ...prev.contact_methods,
          [methodName]: value
        }
      }));
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
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{t('add_new_accessory')}</h1>
          <p className="mt-2 text-blue-100">{t('add_accessory_easily')}</p>
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
                    placeholder={t('fetched_automatically')}
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
                  {t('store_name_fetched_automatically')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('ad_title_required')}
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  value={formData.title}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 transition-all text-black font-semibold"
                  placeholder={t('ad_title_placeholder')}
                />
              </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t('category_required')}
              </label>
              <input
                type="text"
                name="category"
                required
                value={formData.category}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 transition-all text-black font-semibold"
                placeholder={t('category_placeholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t('brand_optional')}
              </label>
              <input
                type="text"
                name="brand"
                value={formData.brand}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 transition-all text-black font-semibold"
                placeholder={t('brand_placeholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t('price_egp_required')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">{t('currency_short')}</span>
                </div>
                <input
                  type="number"
                  name="price"
                  required
                  min="0"
                  value={formData.price}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 pl-12 transition-all text-black font-semibold"
                  placeholder={t('price_placeholder')}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t('condition_required')}
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
                placeholder={t('warranty_placeholder')}
              />
            </div>
          </div>

            <div className="mt-6 md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t('description_required')}
              </label>
              <textarea
                name="description"
                required
                rows={4}
                value={formData.description}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 transition-all text-black font-semibold"
                placeholder={t('description_placeholder_accessory')}
              />
            </div>
          
        </div>

        {/* التوافق */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <div className="h-8 w-1 bg-blue-600 rounded-full mr-3"></div>
            <h2 className="text-xl font-bold text-gray-900">{t('compatibility')}</h2>
          </div>
          <div className="bg-gray-50 rounded-xl p-6 shadow-sm">
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('compatible_devices_optional')}
                </label>
                <input
                  type="text"
                  name="compatibility"
                  value={formData.compatibility}
                  onChange={handleInputChange}
                  placeholder={t('compatibility_placeholder')}
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
                    placeholder={t('fetched_automatically')}
                    dir="ltr"
                    style={{ minHeight: "56px" }}
                  />

                </div>
                <p className="mt-2 text-xs text-gray-500 flex items-center justify-center">
                  <svg className="w-4 h-4 ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('phone_fetched_automatically')}
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
                    placeholder={t('fetched_automatically')}
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
                  {t('city_fetched_automatically')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* الصور */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <div className="h-8 w-1 bg-blue-600 rounded-full mr-3"></div>
            <h2 className="text-xl font-bold text-gray-900">{t('accessory_images')}</h2>
          </div>
          <div className="bg-gray-50 rounded-xl p-6 shadow-sm">
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">{t('add_high_quality_images_accessory')}</p>
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
                  {t('image_upload_info')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* زر الإرسال */}
        <div className="flex justify-center items-center mt-4 sm:mt-6 space-x-2 sm:space-x-4 space-x-reverse flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || images.length === 0}
            className="inline-flex items-center px-4 sm:px-6 py-2 sm:py-2.5 mb-4 border border-transparent text-sm sm:text-base font-semibold rounded-lg sm:rounded-xl shadow-lg text-white bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 transition-all transform hover:scale-105"
            onClick={() => setIsFeatureModalOpen(true)} //
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
                {t('publishing')}...
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
                onClick={() => setIsFeatureModalOpen(false)} //
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <h2 className="text-2xl font-bold text-gray-900 mb-2"> //
                ✨ {t('make_your_ad_top')}
              </h2>
              <p className="text-gray-600 mb-6">
                {t('boost_your_sales_with_featured_ad')}
              </p>

              <div className="text-right space-y-4 text-gray-700 mb-8 px-1">
                <p> //
                  {t('feature_ad_description')}
                </p>
                <h3 className="font-bold text-lg pt-2">{t('what_you_get_with_subscription')}</h3>
                <ul className="space-y-3">
                  <li className="flex items-start">
                    <Star className="w-5 h-5 text-yellow-500 ml-3 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold">{t('top_of_list_appearance')}:</span> {t('be_the_first_seen')}</span>
                  </li>
                  <li className="flex items-start">
                    <MapPin className="w-5 h-5 text-red-500 ml-3 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold">{t('precise_location_targeting')}:</span> {t('reach_nearby_buyers')}</span>
                  </li>
                  <li className="flex items-start">
                    <Eye className="w-5 h-5 text-green-500 ml-3 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold">{t('more_views_and_interest')}:</span> {t('attract_serious_buyers')}</span>
                  </li>
                  <li className="flex items-start">
                    <Zap className="w-5 h-5 text-purple-500 ml-3 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold">{t('significant_increase_in_sales_speed')}:</span> {t('dont_miss_your_chance')}</span>
                  </li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Gift className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-medium text-gray-700">{t('current_bonus_balance')}:</span>
                  <span className="text-lg font-bold text-blue-600">{Math.floor(bonusBalance).toLocaleString()} ج.م</span>
                </div>
              </div>

              <div className="text-right space-y-2 text-gray-700 mb-6">
                <h3 className="font-bold text-lg">{t('choose_feature_duration')}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {availableDurations.map((days) => (
                    <label key={days} htmlFor={`promo_${days}`} className={`relative flex flex-col items-center justify-center rounded-lg border-2 p-3 cursor-pointer transition-all ${selectedDuration === days ? 'border-yellow-500 bg-yellow-50 ring-2 ring-yellow-200' : 'border-gray-200 bg-white'}`}>
                      <input type="radio" id={`promo_${days}`} name="promotion_duration" value={days} checked={selectedDuration === days} onChange={(e) => setSelectedDuration(e.target.value)} className="sr-only" />
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-5 h-5 text-gray-600" /> //
                        <span className="text-base font-bold text-gray-800">{t('days_count', { count: days })}</span>
                      </div>
                      <span className="text-sm font-semibold text-yellow-600 mt-1">{promotionPrices[days] || 0} {t('currency_short')}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-4 p-3 bg-gray-100 border border-gray-200 rounded-lg text-center">
                <p className="text-gray-800 font-medium">
                  {t('total')}: <span className="text-xl font-bold text-gray-900">{promotionPrice || 0} {t('currency_short')}</span>
                </p>
              </div>

              <p className="text-gray-800 font-semibold mb-6">
              ✨ {t('feature_ad_cta')}
              </p>

              <button
                onClick={handleSubmitAndFeature}
                disabled={loading}
                className="w-full inline-flex items-center justify-center px-8 py-4 border border-transparent text-lg font-bold rounded-xl shadow-lg text-white bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 transition-all transform hover:scale-105"
              > //
                {loading ? <Loader2 className="animate-spin h-6 w-6" /> : t('feature_now_with_bonus')}
              </button>

            </div>
          </div>
        </div>
    )}
    </>
  );
};

export default AddAccessoriesForm;
