import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import axiosInstance from '@/services/axiosInterceptor';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, X, Loader2, Star, Zap, MapPin, Clock, Eye, Gift, CalendarDays, Store, Phone, MapPinned, Smartphone, Database, Palette, FileText, ImagePlus, ChevronRight, ChevronLeft, CheckCircle2, Wallet, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

import { useGeolocated } from 'react-geolocated';
import { useToast } from '@/hooks/use-toast';
import AdsOfferSlider from '@/components/advertisements/AdsOfferSlider';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for Leaflet marker icons in React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Component to update map view when coordinates change
const MapUpdater: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  React.useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
};
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
  countries: string;
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
  const [currentStep, setCurrentStep] = useState(0);
  const DRAFT_KEY = 'add-accessory-form-draft-v2';

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

  // عند مغادرة الصفحة: حذف المسودة من التخزين المحلي لتفادي استعادتها لاحقًا
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch (e) {
        /* ignore */
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch (e) {
        /* ignore */
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
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
            setFormData(prev => ({
              ...prev,
              store_name: data.store_name || '',
              city: data.address || '',
              contact_methods: { ...prev.contact_methods, phone: data.phone || '' },
              countries: data.countries || data.country || ''
            }));
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
            setFormData(prev => ({
              ...prev,
              store_name: data?.full_name || '',
              city: '',
              contact_methods: { ...prev.contact_methods, phone: data?.phone || '' },
              countries: data?.countries || data?.country || ''
            }));
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
    store_name: '',
    countries: ''
  });

  // استرجاع المسودة المحفوظة تلقائياً
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      const parsed = savedDraft ? JSON.parse(savedDraft) : null;

      // Always start from step 1 (index 0) when entering the accessory page
      setCurrentStep(0);

      // Preserve only basic info (step 1) if present; clear data for steps 2-4
      const preservedBasic = parsed?.formData
        ? {
            store_name: parsed.formData.store_name || '',
            city: parsed.formData.city || '',
            contact_methods: { ...(parsed.formData.contact_methods || {}) },
            countries: parsed.formData.countries || '',
          }
        : {};

      setFormData(prev => ({
        ...prev,
        ...preservedBasic,
        // Clear accessory info (step 2)
        category: '',
        brand: '',
        compatibility: '',
        price: '',
        condition: 'new',
        warranty_months: '0',
        // Clear description & title (step 3)
        title: '',
        description: '',
      }));

      // Clear images (step 4)
      setImages([]);
      setImagesPreviews([]);
    } catch (e) {
      console.warn('Could not restore accessory form draft', e);
    }
  }, []);

  // حفظ تلقائي للمسودة أثناء الإدخال
  useEffect(() => {
    const payload = {
      formData,
      currentStep,
      savedAt: Date.now(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  }, [formData, currentStep]);

  const clearDraft = () => localStorage.removeItem(DRAFT_KEY);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + images.length > 10) {
      setError(t('max_images_limit_10'));
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

      // Validate required fields and images before creating
      if (!formData.title || !formData.category || !formData.price || images.length === 0) {
        setError(t('complete_required_fields_and_upload_image'));
        setLoading(false);
        return;
      }

      // 1. إنشاء الإكسسوار عبر السيرفر (سيقوم السيرفر بتشفير الحقول الحساسة)
      const createPayload = {
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
        countries: formData.countries,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        role: user?.role,
        status: 'pending',
      };

      const createResp = await axiosInstance.post('/api/create-accessory', createPayload);
      if (!createResp?.data || !createResp.data.success) {
        throw createResp?.data?.error || new Error('create-accessory failed');
      }
      const accessoryData = createResp.data.accessory;
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

          // إضافة مسار الصورة عبر السيرفر (يتحقق من الملكية ويدرج السجل باستخدام service role)
          try {
            await axiosInstance.post('/api/insert-accessory-image', {
              accessoryId: accessoryData.id,
              imageUrl: publicUrl,
              main_image: i === 0,
              order: i,
            });
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
        .maybeSingle();

      if (normalPriceError && normalPriceError.code !== 'PGRST116') {
        throw normalPriceError;
      }

      const normalPrice = normalPriceData?.amount || 0;

      if (bonusBalance > 0 && normalPrice > 0) {
        const amountToDeduct = Math.min(bonusBalance, normalPrice);
        const bonusResp = await axiosInstance.post('https://imei-safe.me/paymob/publish-from-bonus', {
          adData: {
            accessory_id: accessoryData.id,
            duration_days: 1,
            type: 'normal',
            image_url: null
          }
        });
        if (!bonusResp?.data?.ok) throw new Error(bonusResp?.data?.error || t('bonus_deduction_failed'));

        const remainingBonus = typeof bonusResp?.data?.remainingBonus === 'number'
          ? bonusResp.data.remainingBonus
          : Math.max(0, bonusBalance - amountToDeduct);
        setBonusBalance(remainingBonus);
        window.dispatchEvent(new CustomEvent('bonusUpdated'));
        toast({ title: t('ad_published_successfully'), description: t('bonus_deducted', { amount: amountToDeduct.toString() }), variant: "default" });

        // Publish accessory after successful paid-with-bonus posting
        const { error: publishErr } = await supabase.from('accessories').update({ status: 'pending' }).eq('id', accessoryData.id);
        if (publishErr) console.warn('failed to publish accessory after bonus payment', publishErr);

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

      // If we reached here, no external payment redirect happened — publish the accessory
      const { error: publishErr2 } = await supabase.from('accessories').update({ status: 'pending' }).eq('id', accessoryData.id);
      if (publishErr2) console.warn('failed to set accessory pending', publishErr2);

      clearDraft();
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

    // Validate required fields and images before creating
    if (!formData.title || !formData.category || !formData.price || images.length === 0) {
      setError(t('complete_required_fields_and_upload_image'));
      setLoading(false);
      return;
    }

    try {
      // 1. Create the accessory record first
      const createPayload = {
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
        countries: formData.countries,
        status: 'pending',
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        role: user?.role,
      };

      const createResp = await axiosInstance.post('/api/create-accessory', createPayload);
      if (!createResp?.data || !createResp.data.success) {
        throw createResp?.data?.error || new Error('create-accessory failed');
      }
      const accessoryData = createResp.data.accessory;

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

      // 3.1 + 3.2 خصم البونص وإنشاء سجل الدفع عبر الخادم (بدل insert مباشر لتجنب RLS)
      const bonusResp = await axiosInstance.post('https://imei-safe.me/paymob/publish-from-bonus', {
        adData: {
          accessory_id: accessoryData.id,
          duration_days: parseInt(selectedDuration, 10),
          type: 'promotions',
          image_url: mainImageUrl
        }
      });
      if (!bonusResp?.data?.ok) {
        throw new Error(bonusResp?.data?.error || t('bonus_deduction_or_payment_record_failed'));
      }

      // 3.3. Update the 'type' in the 'accessories' table to 'promotions'
      const { error: updateAccessoryError } = await supabase.from('accessories').update({ type: 'promotions' }).eq('id', accessoryData.id);
      if (updateAccessoryError) throw updateAccessoryError;

      // Publish accessory after successful promotion
      const { error: publishErr } = await supabase.from('accessories').update({ status: 'pending' }).eq('id', accessoryData.id);
      if (publishErr) console.warn('failed to set accessory pending after promotion', publishErr);

      // 3.4. Update UI and navigate
      const remainingBonus = typeof bonusResp?.data?.remainingBonus === 'number'
        ? bonusResp.data.remainingBonus
        : Math.max(0, bonusBalance - promotionPrice);
      setBonusBalance(remainingBonus);
      window.dispatchEvent(new CustomEvent('bonusUpdated'));
      setIsFeatureModalOpen(false);
      toast({
        title: t('ad_published_and_featured_successfully'),
        description: t('bonus_deducted_for_feature', { amount: promotionPrice.toString() }),
        variant: "default"
      });
      clearDraft();
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

  const steps = [
    { title: t('accessory_step_basic'), icon: Store },
    { title: t('accessory_step_info'), icon: Smartphone },
    { title: t('accessory_step_description'), icon: FileText },
    { title: t('accessory_step_images_preview'), icon: ImagePlus },
  ];
  const totalSteps = steps.length;
  const atLastStep = currentStep === totalSteps - 1;
  const fieldClass =
    'w-full rounded-2xl border border-blue-300/50 bg-white px-4 py-3 text-sm text-slate-800 shadow-[0_2px_10px_rgba(37,99,235,0.08)] outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60 focus:shadow-[0_6px_18px_rgba(37,99,235,0.18)]';
  const cardClass =
    'rounded-3xl border border-white/70 bg-white/70 backdrop-blur-xl p-5 sm:p-6 shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition-all duration-500';

  const nextStep = () => {
    setCurrentStep(prev => Math.min(prev + 1, totalSteps - 1));
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  return (
    <>
      <div dir="rtl" className="min-h-screen bg-[#f4f8ff] px-4 py-5 sm:py-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-5 rounded-3xl border border-white/70 bg-blue-600 p-5 text-white shadow-[0_12px_30px_rgba(37,99,235,0.35)]">
            <h1 className="text-xl font-bold sm:text-2xl">{t('add_new_accessory')}</h1>
            <p className="mt-1 text-sm text-blue-100">{t('add_accessory_wizard_subtitle')}</p>
          </div>

          <div className="mb-5 rounded-3xl border border-white/70 bg-white/70 p-4 backdrop-blur-xl shadow-[0_8px_24px_rgba(15,23,42,0.07)]">
            <div className="mb-3 h-1.5 rounded-full bg-slate-200">
              <div className="h-1.5 rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${(currentStep / (totalSteps - 1)) * 100}%` }} />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const active = index === currentStep;
                const done = index < currentStep;
                return (
                  <button
                    key={step.title}
                    type="button"
                    onClick={() => setCurrentStep(index)}
                    className={`group rounded-2xl border px-2 py-3 text-center transition-all duration-300 ${
                      active
                        ? 'border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-200'
                        : done
                        ? 'border-orange-300 bg-orange-100 text-orange-800 shadow-sm'
                        : 'border-slate-300 bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-white/35">
                      {done ? <CheckCircle2 className="h-5 w-5 text-orange-500" /> : <Icon className={`h-5 w-5 ${active ? 'text-orange-200' : 'text-orange-500'}`} />}
                    </div>
                    <p className="text-[10px] font-semibold leading-tight sm:text-[11px]">{step.title}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="mb-4 flex items-start rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 shadow-sm">
              <X className="ml-2 mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className={`${cardClass} ${currentStep === 0 ? 'opacity-100 translate-y-0' : 'hidden opacity-0 -translate-y-1'}`}>
              <div className="mb-4 flex items-center gap-2 text-slate-800">
                <Store className="h-5 w-5 text-orange-500" />
                <h2 className="text-lg font-bold">{`1. ${t('accessory_step_basic')}`}</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <Store className="h-4 w-4 text-orange-500" />
                    {t('store_name')}
                  </label>
                  <input name="store_name" value={formData.store_name} readOnly className={fieldClass} placeholder={t('fetched_automatically')} />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <Phone className="h-4 w-4 text-orange-500" />
                    {t('phone_number')}
                  </label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-orange-500" />
                    <input name="contact_methods.phone" value={formData.contact_methods.phone || ''} readOnly dir="ltr" className={`${fieldClass} pl-10`} placeholder={t('fetched_automatically')} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <MapPin className="h-4 w-4 text-orange-500" />
                    {t('city')}
                  </label>
                  <input name="city" value={formData.city} readOnly className={fieldClass} placeholder={t('fetched_automatically')} />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <MapPinned className="h-4 w-4 text-orange-500" />
                    {t('store_location_on_map')}
                  </label>
                  <div className="overflow-hidden rounded-2xl border border-blue-300/50 bg-white shadow-[0_2px_10px_rgba(37,99,235,0.08)]">
                    {coords ? (
                      <div className="h-48 w-full">
                        <MapContainer
                          center={[coords.latitude, coords.longitude]}
                          zoom={13}
                          scrollWheelZoom={false}
                          className="h-full w-full"
                          attributionControl={false}
                        >
                          <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          />
                          <Marker position={[coords.latitude, coords.longitude]} />
                          <MapUpdater center={[coords.latitude, coords.longitude]} />
                        </MapContainer>
                      </div>
                    ) : (
                      <div className="flex h-48 items-center justify-center text-sm font-medium text-slate-500">{t('loading_map_location')}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className={`${cardClass} ${currentStep === 1 ? 'opacity-100 translate-y-0' : 'hidden opacity-0 -translate-y-1'}`}>
              <div className="mb-4 flex items-center gap-2 text-slate-800">
                <Smartphone className="h-5 w-5 text-orange-500" />
                <h2 className="text-lg font-bold">{`2. ${t('accessory_step_info')}`}</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <Database className="h-4 w-4 text-orange-500" />
                    {t('category_required')}
                  </label>
                  <input type="text" name="category" required value={formData.category} onChange={handleInputChange} className={fieldClass} placeholder={t('category_placeholder')} />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <Palette className="h-4 w-4 text-orange-500" />
                    {t('brand_optional')}
                  </label>
                  <input type="text" name="brand" value={formData.brand} onChange={handleInputChange} className={fieldClass} placeholder={t('brand_placeholder')} />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <ShieldCheck className="h-4 w-4 text-orange-500" />
                    {t('compatible_devices_optional')}
                  </label>
                  <input type="text" name="compatibility" value={formData.compatibility} onChange={handleInputChange} className={fieldClass} placeholder={t('compatibility_placeholder')} />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <Wallet className="h-4 w-4 text-orange-500" />
                    {t('price_egp_required')}
                  </label>
                  <input type="number" name="price" required min="0" value={formData.price} onChange={handleInputChange} className={fieldClass} placeholder={t('price_placeholder')} />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-orange-500" />
                    {t('condition_required')}
                  </label>
                  <select name="condition" required value={formData.condition} onChange={handleInputChange} className={fieldClass}>
                    <option value="new">{t('new')}</option>
                    <option value="used">{t('used')}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <CalendarDays className="h-4 w-4 text-orange-500" />
                    {t('warranty_months_label')}
                  </label>
                  <input type="number" name="warranty_months" min="0" value={formData.warranty_months} onChange={handleInputChange} className={fieldClass} placeholder={t('warranty_placeholder')} />
                </div>
              </div>
            </div>

            <div className={`${cardClass} ${currentStep === 2 ? 'opacity-100 translate-y-0' : 'hidden opacity-0 -translate-y-1'}`}>
              <div className="mb-4 flex items-center gap-2 text-slate-800">
                <FileText className="h-5 w-5 text-orange-500" />
                <h2 className="text-lg font-bold">{`3. ${t('accessory_step_description')}`}</h2>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <FileText className="h-4 w-4 text-orange-500" />
                    {t('ad_title_required')}
                  </label>
                  <input type="text" name="title" required value={formData.title} onChange={handleInputChange} className={fieldClass} placeholder={t('ad_title_placeholder')} />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <FileText className="h-4 w-4 text-orange-500" />
                    {t('description_required')}
                  </label>
                  <textarea name="description" required rows={4} value={formData.description} onChange={handleInputChange} className={fieldClass} placeholder={t('description_placeholder_accessory')} />
                </div>
              </div>
            </div>

            <div className={`${cardClass} ${currentStep === 3 ? 'opacity-100 translate-y-0' : 'hidden opacity-0 -translate-y-1'}`}>
              <div className="mb-4 flex items-center gap-2 text-slate-800">
                <ImagePlus className="h-5 w-5 text-orange-500" />
                <h2 className="text-lg font-bold">{`4. ${t('accessory_step_images_preview')}`}</h2>
              </div>

              <div className="mb-4 rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 p-4 text-center">
                <Upload className="mx-auto mb-2 h-6 w-6 text-orange-500" />
                <label htmlFor="images" className="cursor-pointer text-sm font-semibold text-blue-700">{t('choose_images')}</label>
                <input id="images" name="images" type="file" multiple accept="image/*" className="sr-only" onChange={handleImageChange} required={images.length === 0} />
                <p className="mt-1 text-xs text-slate-500">{t('image_upload_info')}</p>
              </div>

              {imagesPreviews.length > 0 && (
                <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {imagesPreviews.map((preview, index) => (
                    <div key={index} className="group relative overflow-hidden rounded-2xl border border-white/60 bg-white shadow-sm">
                      <img src={preview} alt={`Preview ${index + 1}`} className="h-28 w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      <button type="button" onClick={() => removeImage(index)} className="absolute left-2 top-2 rounded-full bg-black/60 p-1 text-white transition hover:bg-black">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold text-slate-800">{t('final_ad_preview')}</h3>
                <div className="space-y-1 text-sm text-slate-600">
                  <p><span className="font-semibold text-slate-800">{t('preview_title_label')}:</span> {formData.title || '—'}</p>
                  <p><span className="font-semibold text-slate-800">{t('preview_store_label')}:</span> {formData.store_name || '—'}</p>
                  <p><span className="font-semibold text-slate-800">{t('preview_category_label')}:</span> {formData.category || '—'}</p>
                  <p><span className="font-semibold text-slate-800">{t('preview_price_label')}:</span> {formData.price ? `${formData.price} ${t('currency_short')}` : '—'}</p>
                  <p><span className="font-semibold text-slate-800">{t('preview_location_label')}:</span> {formData.city || '—'}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/70 bg-white/70 p-3 backdrop-blur-xl shadow-sm">
              <button
                type="button"
                onClick={prevStep}
                disabled={currentStep === 0}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
                {t('previous')}
              </button>

              {!atLastStep ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-l from-blue-600 to-blue-500 px-5 py-2 text-sm font-bold text-white shadow-[0_10px_20px_rgba(37,99,235,0.35)] transition hover:from-blue-700 hover:to-blue-600"
                >
                  {t('next')}
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={loading || images.length === 0}
                    className="inline-flex items-center rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:bg-orange-600 disabled:opacity-50"
                    onClick={() => setIsFeatureModalOpen(true)}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('feature_ad')}
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('publish_ad_now')}
                  </button>
                </div>
              )}
            </div>
          </form>
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
                    <Star className="w-5 h-5 text-orange-500 ml-3 flex-shrink-0 mt-0.5" />
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
                    <Eye className="w-5 h-5 text-blue-500 ml-3 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold">{t('more_views_attention')}</span> {t('attract_serious_buyers')}</span>
                  </li>
                  <li className="flex items-start">
                    <Zap className="w-5 h-5 text-orange-500 ml-3 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold">{t('increase_selling_speed')}</span> {t('dont_miss_opportunity')}</span>
                  </li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Gift className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-medium text-gray-700">{t('current_bonus_balance')}</span>
                  <span className="text-lg font-bold text-blue-600">{Math.floor(bonusBalance).toLocaleString()} {t('currency_short')}</span>
                </div>
              </div>

              <div className="text-right space-y-2 text-gray-700 mb-6">
                <h3 className="font-bold text-lg">{t('select_feature_duration')}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {availableDurations.map((days) => (
                    <label key={days} htmlFor={`promo_${days}`} className={`relative flex flex-col items-center justify-center rounded-lg border-2 p-3 cursor-pointer transition-all ${selectedDuration === days ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200' : 'border-gray-200 bg-white'}`}>
                      <input type="radio" id={`promo_${days}`} name="promotion_duration" value={days} checked={selectedDuration === days} onChange={(e) => setSelectedDuration(e.target.value)} className="sr-only" />
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-5 h-5 text-gray-600" />
                        <span className="text-base font-bold text-gray-800">{days} {t('days')}</span>
                      </div>
                      <span className="text-sm font-semibold text-orange-600 mt-1">{promotionPrices[days] || 0} {t('currency_short')}</span>
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
                className="w-full inline-flex items-center justify-center px-8 py-4 border border-transparent text-lg font-bold rounded-xl shadow-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all transform hover:scale-105"
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

export default AddAccessoriesForm;
