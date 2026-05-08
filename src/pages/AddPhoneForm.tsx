import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import axiosInstance from '@/services/axiosInterceptor';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Upload, X, Loader2, Star, Zap, MapPin, Clock, Eye, Gift, CalendarDays, Store, Phone, MapPinned, ShieldCheck, Smartphone, Database, Palette, FileText, ImagePlus, ChevronRight, ChevronLeft, CheckCircle2, Wallet, Hash } from 'lucide-react';

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
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
};
interface PhoneFormData {
  title: string;
  phone_type: string;
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
  const { t, language } = useLanguage();
  const isRtl = language === 'ar';
  const iconSidePos = isRtl ? 'right-3' : 'left-3';
  const iconSidePad = isRtl ? 'pr-12' : 'pl-12';
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
  const [currentStep, setCurrentStep] = useState(0);
  const DRAFT_KEY = 'add-phone-form-draft-v2';

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
  const isReported = imeiStatus === 'reported';

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
    phone_type: '',
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

  // استرجاع المسودة المحفوظة تلقائياً
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (!savedDraft) return;
      const parsed = JSON.parse(savedDraft);

      if (parsed?.formData) {
        setFormData(prev => ({
          ...prev,
          ...parsed.formData,
          specs: { ...prev.specs, ...(parsed.formData.specs || {}) },
          contact_methods: {
            ...prev.contact_methods,
            ...(parsed.formData.contact_methods || {}),
          },
        }));
      }

      if (typeof parsed?.currentStep === 'number') {
        setCurrentStep(Math.min(Math.max(parsed.currentStep, 0), 3));
      }
    } catch (e) {
      console.warn('Could not restore form draft', e);
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
    
    // التحقق من حالة IMEI قبل الإرسال
    if (imeiStatus === 'reported') {
      setError(t('cannot_publish_reported_phone'));
      return;
    }

    let phoneData: any = null;
    try {
      setLoading(true);
      setError('');
      // Validate required fields and images before creating
      if (!formData.title || !formData.phone_type || !formData.price || !formData.imei || images.length === 0) {
        setError(t('complete_required_fields_and_upload_image'));
        setLoading(false);
        return;
      }
      try {
        const payload = {
          seller_id: user.id,
          title: formData.title,
          phone_type: formData.phone_type,
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
        .maybeSingle();

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
          title: t('ad_published_successfully'),
          description: t('bonus_deducted', { amount: String(amountToDeduct) }),
          variant: 'default'
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
          title: t('ad_published_successfully'),
          description: t('please_pay_fee', { price: String(normalPrice) }),
          variant: 'default'
        });
      }

      // تم بنجاح
      setPhoneIdToFeature(phoneData.id); // Save the new phone ID to feature it later
      clearDraft();
      navigate('/seller-dashboard');

    } catch (err) {
      console.error('Error adding phone:', err);
      // Cleanup: if phone was created but subsequent steps failed, request server to delete it
      try {
        if (phoneData && phoneData.id) {
          await axiosInstance.post('/api/delete-phone-if-failed', { phoneId: phoneData.id });
        }
      } catch (cleanupErr) {
        console.warn('Cleanup failed for phone after create failure', cleanupErr);
      }

      setError(t('error_adding_phone_try_again'));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmFeature = async (createdPhoneId: string) => {
    if (!user || !createdPhoneId || promotionPrice === null) {
      toast({ title: t('error'), description: t('cannot_feature_ad_incomplete_data'), variant: 'destructive' });
      return;
    }

    if (bonusBalance < (promotionPrice || 0)) {
      toast({ title: t('access_denied'), description: t('not_enough_bonus_to_proceed'), variant: 'destructive' });
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
        throw new Error(t('main_image_not_found'));
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
        title: t('ad_published_from_bonus'),
        description: t('bonus_deducted', { amount: String(promotionPrice) }),
        variant: 'default'
      });

      // Optionally, navigate away or refresh data
      clearDraft();
      navigate('/seller-dashboard');

    } catch (error: any) {
      console.error("Error featuring ad with bonus:", error);
      toast({ title: t('error'), description: error.message || t('error_occurred'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAndFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: t('error'), description: t('must_be_logged_in'), variant: 'destructive' });
      return;
    }
    if (imeiStatus === 'reported') {
      setError(t('cannot_publish_reported_phone'));
      return;
    }

    let phoneData: any = null;
    try {
      // Validate required fields and images before creating
      if (!formData.title || !formData.phone_type || !formData.price || !formData.imei || images.length === 0) {
        setError(t('complete_required_fields_and_upload_image'));
        setLoading(false);
        return;
      }
      // 1. Create the phone record via server API so sensitive fields are encrypted on server
      try {
        const payload = {
          seller_id: user.id,
          title: formData.title,
          phone_type: formData.phone_type,
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
        throw new Error(t('cannot_feature_ad_incomplete_data'));
      }
  
      if (bonusBalance < (promotionPrice || 0)) {
        // عند عدم وجود رصيد كافٍ، يتم فتح نافذة الترقية
        setShowUpgradePrompt(true);
        setIsFeatureModalOpen(false); // إغلاق نافذة التمييز
        setLoading(false); // إيقاف التحميل
        return; // إيقاف تنفيذ الدالة
      }
  
      const mainImageUrl = (await supabase.storage.from('phone-images').getPublicUrl(`${user.id}/${phoneData.id}/` + images[0].name.split('.').pop())).data.publicUrl;
  
      // 3.1 + 3.2 خصم البونص وإنشاء سجل ads_payment عبر الخادم (لتجاوز RLS بأمان)
      const bonusResp = await axiosInstance.post('https://imei-safe.me/paymob/publish-from-bonus', {
        adData: {
          phone_id: phoneData.id,
          duration_days: parseInt(selectedDuration, 10),
          type: 'promotions',
          image_url: mainImageUrl
        }
      });
      if (!bonusResp?.data?.ok) {
        throw new Error(bonusResp?.data?.error || t('bonus_deduction_failed'));
      }
  
      // 3.3. Update the 'type' in the 'phones' table to 'promotions'
      const { error: updatePhoneError } = await supabase.from('phones').update({ type: 'promotions' }).eq('id', phoneData.id);
      if (updatePhoneError) throw updatePhoneError;
  
      // 3.4. Update UI and navigate
      const remainingBonus = typeof bonusResp?.data?.remainingBonus === 'number'
        ? bonusResp.data.remainingBonus
        : Math.max(0, bonusBalance - promotionPrice);
      setBonusBalance(remainingBonus);
      window.dispatchEvent(new CustomEvent('bonusUpdated'));
      setIsFeatureModalOpen(false);
      toast({
        title: t('ad_published_and_featured_successfully'),
        description: t('bonus_deducted', { amount: String(promotionPrice) }),
        variant: 'default'
      });
      clearDraft();
      navigate('/seller-dashboard');

    } catch (err: any) {
      console.error('Error in handleSubmitAndFeature:', err);
      // Cleanup if phone was created
      try {
        if (phoneData && phoneData.id) {
          await axiosInstance.post('/api/delete-phone-if-failed', { phoneId: phoneData.id });
        }
      } catch (cleanupErr) {
        console.warn('Cleanup failed for phone after feature flow failure', cleanupErr);
      }

      setError(err.message || t('error_publishing_and_featuring_ad'));
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
      // sanitize input: keep digits only, max 15
      const raw = (e.target as HTMLInputElement).value || '';
      const sanitized = raw.replace(/\D/g, '').slice(0, 15);

      setFormData(prev => ({
        ...prev,
        imei: sanitized
      }));

      // When IMEI reaches 15 digits, ask the server to check/decrypt reports and registrations
      if (sanitized.length === 15) {
        await verifyImei(sanitized);
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

  // Helper: verify IMEI with server (extracted to reuse for paste events)
  const verifyImei = async (imeiValue: string) => {
    try {
      setImeiChecking(true);
      setImeiStatus('');
      setError('');

      const resp = await axiosInstance.post('/api/imei-masked-info', { imei: imeiValue });
      const info = resp?.data || {};

      if (info.found) {
        if (info.hasActiveReport === true) {
          setImeiStatus('reported');
          setError(t('reported_phone_cannot_sell_detail'));
        } else if (info.isRegistered === false) {
          setImeiStatus('reported');
          setError(t('reported_phone_cannot_sell_detail'));
        } else {
          const ownerVisible = info.isOwner === true || info.masked === false;
          if (ownerVisible) {
            setImeiStatus('verified');
            setFormData(prev => ({ ...prev, is_verified: true }));
            setError('');
          } else {
            setImeiStatus('verified');
            setError('');
          }
        }
      } else {
        setImeiStatus('');
        setError('');
      }

      // Auto-fill phone_type if server provided it and the field is empty
      try {
        if (info && info.phone_type) {
          setFormData(prev => ({ ...prev, phone_type: prev.phone_type || info.phone_type }));
        }
      } catch (e) {
        console.warn('Could not auto-fill phone_type from IMEI response', e);
      }
    } catch (e) {
      console.error('Error fetching IMEI info:', e);
      setImeiStatus('');
      setError(t('error_checking_imei_try_again'));
    } finally {
      setImeiChecking(false);
    }
  };

  // Prevent non-digit keys
  const handleImeiKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowed = ['Backspace', 'ArrowLeft', 'ArrowRight', 'Delete', 'Tab', 'Home', 'End'];
    if (allowed.includes(e.key) || e.ctrlKey || e.metaKey) return;
    if (!/^[0-9]$/.test(e.key)) e.preventDefault();
  };

  // Handle paste: sanitize pasted content to digits only
  const handleImeiPaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('Text') || '';
    const digits = text.replace(/\D/g, '').slice(0, 15);
    setFormData(prev => ({ ...prev, imei: digits }));
    if (digits.length === 15) await verifyImei(digits);
  };

  const steps = [
    { title: t('add_phone_step_basic_info'), icon: Store },
    { title: t('add_phone_step_phone_info'), icon: Smartphone },
    { title: t('add_phone_step_specs'), icon: Database },
    { title: t('add_phone_step_images_preview'), icon: ImagePlus },
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
      <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen bg-[#f4f8ff] px-4 py-5 sm:py-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-5 rounded-3xl border border-white/70 bg-blue-600 p-5 text-white shadow-[0_12px_30px_rgba(37,99,235,0.35)]">
            <h1 className="text-xl font-bold sm:text-2xl">{t('add_new_phone')}</h1>
            <p className="mt-1 text-sm text-blue-100">{t('add_phone_subtitle')}</p>
          </div>

          <div className="mb-5 rounded-3xl border border-white/70 bg-white/70 p-4 backdrop-blur-xl shadow-[0_8px_24px_rgba(15,23,42,0.07)]">
            <div className="mb-3 h-1.5 rounded-full bg-slate-200">
              <div
                className="h-1.5 rounded-full bg-blue-600 transition-all duration-500"
                style={{ width: `${(currentStep / (totalSteps - 1)) * 100}%` }}
              />
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
                <h2 className="text-lg font-bold">{t('add_phone_section_basic_info')}</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <Store className="h-4 w-4 text-orange-500" />
                    {t('store_name')}
                  </label>
                  <div className="relative">
                    <Store className={`pointer-events-none absolute ${iconSidePos} top-3.5 h-4 w-4 text-orange-500`} />
                    <input name="store_name" value={formData.store_name} readOnly className={`${fieldClass} ${iconSidePad}`} placeholder={t('auto_filled')} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <Phone className="h-4 w-4 text-orange-500" />
                    {t('phone_number')}
                  </label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-orange-500" />
                    <input name="contact_methods.phone" value={formData.contact_methods.phone || ''} readOnly dir="ltr" className={`${fieldClass} pl-12`} placeholder={t('auto_filled')} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <MapPin className="h-4 w-4 text-orange-500" />
                    {t('city')}
                  </label>
                  <div className="relative">
                    <MapPin className={`pointer-events-none absolute ${iconSidePos} top-3.5 h-4 w-4 text-orange-500`} />
                    <input name="city" value={formData.city} readOnly className={`${fieldClass} ${iconSidePad}`} placeholder={t('auto_filled')} />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <MapPinned className="h-4 w-4 text-orange-500" />
                    {t('map_location')}
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
                      <div className="flex h-48 items-center justify-center text-sm font-medium text-slate-500">
                        {t('loading_map_location')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className={`${cardClass} ${currentStep === 1 ? 'opacity-100 translate-y-0' : 'hidden opacity-0 -translate-y-1'}`}>
              <div className="mb-4 flex items-center gap-2 text-slate-800">
                <Smartphone className="h-5 w-5 text-orange-500" />
                <h2 className="text-lg font-bold">{t('add_phone_section_phone_info')}</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <Hash className="h-4 w-4 text-orange-500" />
                    {t('imei')}*
                  </label>
                  <div className="relative">
                    <Hash className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-orange-500" />
                    <input
                      type="text"
                      name="imei"
                      required
                      value={formData.imei}
                      onChange={handleInputChange}
                      inputMode="numeric"
                      maxLength={15}
                      onPaste={handleImeiPaste}
                      onKeyDown={handleImeiKeyDown}
                      pattern="[0-9]{15}"
                      title={t('imei_15_digits_title')}
                      className={`${fieldClass} pl-10 ${imeiStatus === 'verified' ? 'border-orange-300 ring-1 ring-orange-200' : imeiStatus === 'reported' ? 'border-red-300 ring-1 ring-red-200' : ''}`}
                      placeholder={t('imei_example')}
                      dir="ltr"
                    />
                    {imeiChecking && <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-orange-500" />}
                  </div>
                  {imeiStatus === 'verified' && <p className="mt-1 text-xs text-orange-600">{t('verified_phone_safe_to_sell')}</p>}
                  {imeiStatus === 'reported' && <p className="mt-1 text-xs text-red-600">{t('reported_phone_cannot_sell')}</p>}
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <Smartphone className="h-4 w-4 text-orange-500" />
                    {t('phone_type') || t('brand')}*
                  </label>
                  <div className="relative">
                    <Smartphone className={`pointer-events-none absolute ${iconSidePos} top-3.5 h-4 w-4 text-orange-500`} />
                    <input type="text" name="phone_type" required value={formData.phone_type} onChange={handleInputChange} readOnly={isReported} className={`${fieldClass} ${iconSidePad}`} placeholder={t('brand_example')} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <Database className="h-4 w-4 text-orange-500" />
                    {t('model')}*
                  </label>
                  <div className="relative">
                    <Database className={`pointer-events-none absolute ${iconSidePos} top-3.5 h-4 w-4 text-orange-500`} />
                    <input type="text" name="model" required value={formData.model} onChange={handleInputChange} readOnly={isReported} className={`${fieldClass} ${iconSidePad}`} placeholder={t('model_example')} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <Wallet className="h-4 w-4 text-orange-500" />
                    {t('price_currency')}*
                  </label>
                  <div className="relative">
                    <Wallet className={`pointer-events-none absolute ${iconSidePos} top-3.5 h-4 w-4 text-orange-500`} />
                    <input type="number" name="price" required min="0" value={formData.price} onChange={handleInputChange} readOnly={isReported} className={`${fieldClass} ${iconSidePad}`} placeholder="0" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-orange-500" />
                    {t('condition')}*
                  </label>
                  <select name="condition" required value={formData.condition} onChange={handleInputChange} disabled={isReported} className={fieldClass}>
                    <option value="new">{t('new')}</option>
                    <option value="used">{t('used')}</option>
                    <option value="refurbished">{t('refurbished')}</option>
                  </select>
                </div>
              </div>
            </div>

            <div className={`${cardClass} ${currentStep === 2 ? 'opacity-100 translate-y-0' : 'hidden opacity-0 -translate-y-1'}`}>
              <div className="mb-4 flex items-center gap-2 text-slate-800">
                <Palette className="h-5 w-5 text-orange-500" />
                <h2 className="text-lg font-bold">{t('add_phone_section_specs')}</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <Database className="h-4 w-4 text-orange-500" />
                    {t('memory_ram')}
                  </label>
                  <div className="relative">
                    <Database className={`pointer-events-none absolute ${iconSidePos} top-3.5 h-4 w-4 text-orange-500`} />
                    <input type="text" name="specs.ram" value={formData.specs.ram || ''} onChange={handleInputChange} readOnly={isReported} className={`${fieldClass} ${iconSidePad}`} placeholder={t('ram_example')} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <Database className="h-4 w-4 text-orange-500" />
                    {t('storage')}
                  </label>
                  <div className="relative">
                    <Database className={`pointer-events-none absolute ${iconSidePos} top-3.5 h-4 w-4 text-orange-500`} />
                    <input type="text" name="specs.storage" value={formData.specs.storage || ''} onChange={handleInputChange} readOnly={isReported} className={`${fieldClass} ${iconSidePad}`} placeholder={t('storage_example')} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <Palette className="h-4 w-4 text-orange-500" />
                    {t('color')}
                  </label>
                  <div className="relative">
                    <Palette className={`pointer-events-none absolute ${iconSidePos} top-3.5 h-4 w-4 text-orange-500`} />
                    <input type="text" name="specs.color" value={formData.specs.color || ''} onChange={handleInputChange} readOnly={isReported} className={`${fieldClass} ${iconSidePad}`} placeholder={t('color_example')} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <CalendarDays className="h-4 w-4 text-orange-500" />
                    {t('warranty_months_label')}
                  </label>
                  <div className="relative">
                    <CalendarDays className={`pointer-events-none absolute ${iconSidePos} top-3.5 h-4 w-4 text-orange-500`} />
                    <input type="number" name="warranty_months" min="0" value={formData.warranty_months} onChange={handleInputChange} readOnly={isReported} className={`${fieldClass} ${iconSidePad}`} placeholder="0" />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <FileText className="h-4 w-4 text-orange-500" />
                    {t('ad_title')}*
                  </label>
                  <div className="relative">
                    <FileText className={`pointer-events-none absolute ${iconSidePos} top-3.5 h-4 w-4 text-orange-500`} />
                    <input
                      type="text"
                      name="title"
                      required
                      value={formData.title}
                      onChange={handleInputChange}
                      readOnly={isReported}
                      className={`${fieldClass} ${iconSidePad}`}
                      placeholder={t('write_attractive_ad_title')}
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                    <FileText className="h-4 w-4 text-orange-500" />
                    {t('description')}*
                  </label>
                  <div className="relative">
                    <FileText className={`pointer-events-none absolute ${iconSidePos} top-3.5 h-4 w-4 text-orange-500`} />
                    <textarea name="description" required rows={4} value={formData.description} onChange={handleInputChange} readOnly={isReported} className={`${fieldClass} ${iconSidePad}`} placeholder={t('detailed_phone_description')} />
                  </div>
                </div>
              </div>
            </div>

            <div className={`${cardClass} ${currentStep === 3 ? 'opacity-100 translate-y-0' : 'hidden opacity-0 -translate-y-1'}`}>
              <div className="mb-4 flex items-center gap-2 text-slate-800">
                <ImagePlus className="h-5 w-5 text-orange-500" />
                <h2 className="text-lg font-bold">{t('add_phone_section_images_preview')}</h2>
              </div>

              <div className="mb-4 rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 p-4 text-center">
                <Upload className="mx-auto mb-2 h-6 w-6 text-orange-500" />
                <label htmlFor="images" className="cursor-pointer text-sm font-semibold text-blue-700">{t('upload_images')}</label>
                <input
                  id="images"
                  name="images"
                  type="file"
                  multiple
                  accept="image/*"
                  className="sr-only"
                  onChange={handleImageChange}
                  required={!isReported && images.length === 0}
                  disabled={isReported}
                />
                <p className="mt-1 text-xs text-slate-500">{t('add_phone_images_hint')}</p>
              </div>

              {imagesPreviews.length > 0 && (
                <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {imagesPreviews.map((preview, index) => (
                    <div key={index} className="group relative overflow-hidden rounded-2xl border border-white/60 bg-white shadow-sm">
                      <img src={preview} alt={`Preview ${index + 1}`} className="h-28 w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        disabled={isReported}
                        className="absolute left-2 top-2 rounded-full bg-black/60 p-1 text-white transition hover:bg-black"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold text-slate-800">{t('final_ad_preview')}</h3>
                <div className="space-y-1 text-sm text-slate-600">
                  <p><span className="font-semibold text-slate-800">{t('preview_title_label')}:</span> {formData.title || t('not_available')}</p>
                  <p><span className="font-semibold text-slate-800">{t('preview_store_label')}:</span> {formData.store_name || t('not_available')}</p>
                  <p><span className="font-semibold text-slate-800">{t('preview_phone_label')}:</span> {[formData.phone_type, formData.model].filter(Boolean).join(' ') || t('not_available')}</p>
                  <p><span className="font-semibold text-slate-800">{t('preview_price_label')}:</span> {formData.price ? `${formData.price} ${t('currency')}` : t('not_available')}</p>
                  <p><span className="font-semibold text-slate-800">{t('preview_location_label')}:</span> {formData.city || t('not_available')}</p>
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
                    disabled={loading || isReported}
                    className="inline-flex items-center rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:bg-orange-600 disabled:opacity-50"
                    onClick={() => setIsFeatureModalOpen(true)}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('feature_ad')}
                  </button>
                  <button
                    type="submit"
                    disabled={loading || isReported}
                    className="inline-flex items-center rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('publish_ad')}
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
                  <span className="text-lg font-bold text-blue-600">{Math.floor(bonusBalance).toLocaleString()} {t('currency')}</span>
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
                      <span className="text-sm font-semibold text-orange-600 mt-1">{promotionPrices[days] || 0} {t('currency')}</span>
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
                disabled={loading || isReported}
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

export default AddPhoneForm;
