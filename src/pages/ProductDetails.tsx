import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import './ProductDetails.css';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { useToast } from '@/hooks/use-toast';
import { 
  Heart, 
  Share2, 
  MessageCircle, 
  ShieldCheck, 
  MapPin, 
  Calendar, 
  Cpu, 
  HardDrive, 
  CheckCircle2, 
  ChevronRight,
  ChevronLeft,
  Lock,
  RotateCcw,
  Zap,
  Star
} from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Navigation } from 'swiper/modules';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

// Fix for Leaflet marker icons in React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

interface Product {
  id: string;
  title: string;
  phone_type?: string;
  model?: string;
  category?: string;
  compatibility?: string;
  type: 'phone' | 'accessory';
  price: number;
  condition: string;
  description: string;
  specs?: {
    storage?: string;
    ram?: string;
    color?: string;
  };
  store_name?: string;
  city?: string;
  is_verified?: boolean;
  contact_methods?: {
    phone?: string;
  };
  images: Array<{
    image_path: string;
    main_image: boolean;
    order?: number;
  }>;
  warranty_months?: number;
  created_at?: string;
  latitude?: number;
  longitude?: number;
}

const ProductDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t, language } = useLanguage();
    const { toast } = useToast();
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingPhone, setLoadingPhone] = useState(false);
    const [isFavorite, setIsFavorite] = useState(false);
    
    // حالة رمز العملة
    const [userCurrencySymbol, setUserCurrencySymbol] = useState(t('currency_short') || 'EGP');
    const [currencyLoading, setCurrencyLoading] = useState(true);

  // --- دالة جلب رمز العملة ---
  useEffect(() => {
    const fetchUserCurrency = async () => {
      setCurrencyLoading(true);
      
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.error('Error fetching auth user:', authError);
        setCurrencyLoading(false);
        return;
      }

      if (!authUser?.id) {
        console.warn('No authenticated user found');
        setCurrencyLoading(false);
        return;
      }

      console.log('Fetching currency for user ID:', authUser.id);

      try {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('countries')
          .eq('id', authUser.id)
          .single();

        if (userError) {
          console.error('Error fetching user data:', userError);
          setCurrencyLoading(false);
          return;
        }

        if (!userData?.countries) {
          console.warn('No country found for user:', authUser.id);
          setCurrencyLoading(false);
          return;
        }

        console.log('User country:', userData.countries);
        
        const userCountryName = userData.countries.trim();
        
        const { data: countryDataAr, error: countryErrorAr } = await supabase
          .from('countries')
          .select('currency_symbol')
          .ilike('name_ar', userCountryName)
          .maybeSingle();

        if (!countryErrorAr && countryDataAr?.currency_symbol) {
          console.log('Found currency in Arabic table:', countryDataAr.currency_symbol);
          setUserCurrencySymbol(countryDataAr.currency_symbol);
        } else {
          const { data: countryDataEn, error: countryErrorEn } = await supabase
            .from('countries')
            .select('currency_symbol')
            .ilike('name_en', userCountryName)
            .maybeSingle();

          if (!countryErrorEn && countryDataEn?.currency_symbol) {
            console.log('Found currency in English table:', countryDataEn.currency_symbol);
            setUserCurrencySymbol(countryDataEn.currency_symbol);
          } else {
            console.warn(`Currency symbol not found for country: ${userCountryName}`);
            console.log('Using default currency:', t('currency_short') || 'EGP');
            setUserCurrencySymbol(t('currency_short') || 'EGP');
          }
        }
      } catch (error) {
        console.error('Error fetching user currency:', error);
      } finally {
        setCurrencyLoading(false);
      }
    };

    fetchUserCurrency();
  }, [language]);

  const handleContactNow = async () => {
    if (!product) return;

    setLoadingPhone(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        alert(t('please_login'));
        setLoadingPhone(false);
        return;
      }

      const response = await fetch(`https://imei-safe.me/api/store-phone/${product.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success && data.phone) {
        let phone = data.phone;
        let cleanPhone = '';

        if (phone.includes('phone=')) {
          const match = phone.match(/phone=([0-9]+)/);
          if (match && match[1]) {
            cleanPhone = match[1];
          }
        }
        
        if (!cleanPhone) {
          cleanPhone = phone.replace(/\D/g, '');
        }
        
        const whatsappDeepLink = `whatsapp://send?phone=${cleanPhone}`;
        const whatsappWebLink = `https://wa.me/${cleanPhone}`;

        if (Capacitor.isNativePlatform()) {
          window.open(whatsappDeepLink, '_system');
        } else {
          window.location.href = whatsappDeepLink;
          setTimeout(() => {
            window.open(whatsappWebLink, '_blank');
          }, 500);
        }
      } else {
        alert(t('no_contact_info'));
      }
    } catch (error) {
      console.error('Error fetching phone number:', error);
      alert(t('error_fetching_contact'));
    } finally {
      setLoadingPhone(false);
    }
  };

  // Favorites stored as array of product ids in localStorage under 'favorites'
  useEffect(() => {
    try {
      const raw = localStorage.getItem('favorites');
      if (raw) {
        const arr: string[] = JSON.parse(raw);
        setIsFavorite(!!(id && arr.includes(id)));
      } else {
        setIsFavorite(false);
      }
    } catch (e) {
      setIsFavorite(false);
    }
  }, [id]);

  const toggleFavorite = () => {
    if (!id) return;
    try {
      const raw = localStorage.getItem('favorites');
      const arr: string[] = raw ? JSON.parse(raw) : [];
      const exists = arr.includes(id);
      let next: string[];
      if (exists) {
        next = arr.filter(x => x !== id);
      } else {
        next = [id, ...arr];
      }
      localStorage.setItem('favorites', JSON.stringify(next));
      setIsFavorite(!exists);
      toast({ title: exists ? 'أُزيل من المفضلة' : 'أُضيف للمفضلة' });
    } catch (e) {
      console.error('Favorite toggle failed', e);
    }
  };

  const shareProduct = async () => {
    if (!product) return;
    const url = window.location.href;
    
    try {
      // استخدام Capacitor Share API على الهواتف
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title: product.title,
          text: `${product.title}\n\n${product.description || ''}`,
          url: url,
          dialogTitle: 'مشاركة المنتج'
        });
        return;
      }

      // استخدام Web Share API على المتصفحات
      if (navigator.share) {
        await navigator.share({
          title: product.title,
          text: product.description || '',
          url: url
        });
        return;
      }

      // Fallback: نسخ الرابط إلى الحافظة
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        toast({ 
          title: 'تم النسخ', 
          description: 'تم نسخ رابط المنتج إلى الحافظة.' 
        });
        return;
      }

      // Last resort: فتح الرابط في نافذة جديدة
      window.open(url, '_blank');
    } catch (err) {
      console.error('Share failed:', err);
      
      // محاولة نسخ الرابط كحل بديل
      try {
        await navigator.clipboard.writeText(url);
        toast({ 
          title: 'تم النسخ', 
          description: 'تم نسخ رابط المنتج إلى الحافظة.' 
        });
      } catch (e) {
        toast({ 
          title: 'فشل المشاركة', 
          description: 'لم نتمكن من مشاركة المنتج. يرجى المحاولة مرة أخرى.',
          variant: 'destructive'
        });
      }
    }
  };

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);

      const { data: phoneData, error: phoneError } = await supabase
        .from('phones')
        .select('*, phone_images(image_path, main_image, order)')
        .eq('id', id)
        .single();

      if (phoneData) {
        setProduct({
          ...phoneData,
          images: phoneData.phone_images || [],
          type: 'phone'
        });
        setLoading(false);
        return;
      }

      if (phoneError && (phoneError.code === 'PGRST116' || phoneError.code === '22P02')) {
        const { data: accessoryData, error: accessoryError } = await supabase
          .from('accessories')
          .select('*, contact_methods, accessory_images(image_path, main_image, order)')
          .eq('id', id)
          .single();

        if (accessoryData) {
          setProduct({
            ...accessoryData,
            images: accessoryData.accessory_images || [],
            type: 'accessory'
          });
        } else {
          console.error('خطأ في جلب بيانات المنتج:', accessoryError);
          setProduct(null);
        }
      } else {
        console.error('خطأ في جلب بيانات الهاتف:', phoneError);
        setProduct(null);
      }

      setLoading(false);
    };

    if (id) {
      fetchProduct();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F5F9FF]">
        <div className="animate-pulse text-xl font-bold text-[#0A84FF]">{t('loading')}...</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#F5F9FF] p-6 text-center">
        <h2 className="mb-4 text-2xl font-bold text-gray-800">{t('phone_not_found')}</h2>
        <button 
          onClick={() => navigate(-1)}
          className="rounded-xl bg-[#0A84FF] px-6 py-2 text-white"
        >
          {t('back')}
        </button>
      </div>
    );
  }

  const sortedImages = [...(product.images || [])].sort((a, b) => {
    if (a.main_image) return -1;
    if (b.main_image) return 1;
    return (a.order || 99) - (b.order || 99);
  });

  const formatDate = (dateString?: string) => {
    if (!dateString) return '--';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div dir="rtl" className="min-h-screen w-full overflow-x-hidden bg-[#F5F9FF] pb-24 font-['Tajawal','Cairo',sans-serif]">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] h-[40%] w-[40%] rounded-full bg-[#0A84FF] opacity-5 blur-[120px]"></div>
        <div className="absolute top-[20%] -right-[5%] h-[30%] w-[30%] rounded-full bg-[#FF8C00] opacity-[0.03] blur-[100px]"></div>
        <div className="absolute bottom-[10%] left-[5%] h-[35%] w-[35%] rounded-full bg-[#12B76A] opacity-[0.04] blur-[110px]"></div>
      </div>

      <div className="relative mx-auto w-full max-w-[500px]">
        {/* Top Header */}
        <div className="flex items-center justify-between p-6">
          <button 
            onClick={() => navigate(-1)}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/60 bg-white/40 backdrop-blur-xl shadow-sm"
          >
            <ChevronRight className="h-6 w-6 text-gray-800" />
          </button>
          <h1 className="text-lg font-bold text-gray-800">تفاصيل المنتج</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/favorites')}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/60 bg-white/40 backdrop-blur-xl shadow-sm"
              aria-label="المفضلة"
            >
              <Heart className="h-6 w-6 text-gray-800" />
            </button>
          </div>
        </div>

        {/* Hero Image Section */}
        <div className="px-6 mb-8">
          <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-b from-white to-[#DFF4FF]/30 p-2 shadow-[0_20px_50px_rgba(10,132,255,0.08)]">
            {/* Floating Buttons inside Hero */}
            <div className="absolute top-6 left-6 z-10">
              <button 
                  onClick={toggleFavorite}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 backdrop-blur-md shadow-sm transition-transform active:scale-90"
                >
                  <Heart className={`h-6 w-6 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-[#0A84FF]'}`} />
                </button>
            </div>

            <div className="absolute top-6 right-6 z-10">
              <button 
                onClick={shareProduct}
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 backdrop-blur-md shadow-sm transition-transform active:scale-90"
                aria-label="مشاركة"
              >
                <Share2 className="h-5 w-5 text-gray-800" />
              </button>
            </div>
            
            <Swiper
              modules={[Pagination, Navigation]}
              spaceBetween={0}
              slidesPerView={1}
              pagination={{ clickable: true, bulletActiveClass: 'swiper-pagination-bullet-active !bg-[#0A84FF] !w-6' }}
              className="h-[320px] w-full"
            >
              {sortedImages.length > 0 ? (
                sortedImages.map((img, index) => (
                  <SwiperSlide key={index} className="flex items-center justify-center">
                    <img
                      src={img.image_path}
                      alt={product.title}
                      className="h-full w-full object-cover"
                    />
                  </SwiperSlide>
                ))
              ) : (
                <SwiperSlide className="flex items-center justify-center">
                   <div className="h-full w-full bg-gray-100/50 flex items-center justify-center">
                      <Zap className="h-12 w-12 text-gray-300" />
                   </div>
                </SwiperSlide>
              )}
            </Swiper>
            
            <div className="absolute bottom-4 left-1/2 h-4 w-4/5 -translate-x-1/2 rounded-[100%] bg-[#0A84FF]/10 blur-xl"></div>
          </div>
        </div>

        {/* Product Info Section */}
        <div className="px-6 space-y-6">
          <div className="space-y-3 text-right">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full bg-[#12B76A]/10 px-4 py-1 text-sm font-bold text-[#12B76A]">
                <Star className="ml-1 h-4 w-4 fill-[#12B76A]" />
                {product.condition === 'used' ? 'مستعمل - ممتاز' : 'جديد'}
              </span>
              <span className="inline-flex items-center rounded-full bg-[#FF8C00]/10 px-4 py-1 text-sm font-bold text-[#FF8C00]">
                قابل للتفاوض
              </span>
            </div>
            
            <h2 className="text-3xl font-black text-gray-900 leading-tight">{product.title}</h2>
            
            {(product.phone_type || product.model) && (
              <div className="flex items-center gap-2 text-2xl font-large text-black">
                {product.phone_type && product.model && (
                  <span className="text-black">•</span>
                )}
                {product.model && product.model !== 'unknown_model' && (
                  <span>{product.model}</span>
                )}
                {product.phone_type && product.phone_type !== 'unknown_brand' && (
                  <span className="text-black font-bold">{product.phone_type}</span>
                )}
              </div>
            )}

            <div className="flex items-end gap-2 pt-2">
              <span className="text-4xl font-black text-[#0A84FF]">
                {product.price?.toLocaleString('en-US')}
              </span>
              <span className="mb-1 text-2xl font-bold text-black">{userCurrencySymbol}</span>
            </div>
          </div>

          {/* Specifications Card */}
          <div className="rounded-[30px] border border-white bg-white/70 p-2 backdrop-blur-xl shadow-[0_15px_35px_rgba(0,0,0,0.03)]">
            <div className="grid grid-cols-2 gap-y-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0A84FF]/10 text-[#0A84FF]">
                  <HardDrive className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500">التخزين</p>
                  <p className="text-xl font-black text-gray-800">{product.specs?.storage || '--'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0A84FF]/10 text-[#0A84FF]">
                  <Cpu className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500">الرام</p>
                  <p className="text-xl font-black text-gray-800">{product.specs?.ram || '--'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0A84FF]/10 text-[#0A84FF]">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500">الضمان</p>
                  <p className="text-xl font-black text-gray-800">{product.warranty_months && product.warranty_months > 0 ? `${product.warranty_months} شهر` : 'بدون ضمان'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0A84FF]/10 text-[#0A84FF]">
                  <MapPin className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500">الموقع</p>
                  <p className="text-xl font-black text-gray-800">{product.city || '--'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0A84FF]/10 text-[#0A84FF]">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500">تاريخ النشر</p>
                  <p className="text-xl font-black text-gray-800">{formatDate(product.created_at)}</p>
                </div>
              </div>

              {product.is_verified && (
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#12B76A]/10 text-[#12B76A]">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500">التوثيق</p>
                  <p className="text-xl font-black text-gray-800">الهاتف موثق ✓</p>
                </div>
              </div>
              )}
            </div>
          </div>

          {/* Additional Details */}
          <div className="space-y-4">
            <h3 className="text-xl font-black text-gray-900">تفاصيل إضافية</h3>
            <div className="rounded-[24px] border border-[#0A84FF]/10 bg-[#0A84FF]/[0.02]  p-4  leading-relaxed text-gray-700 shadow-inner">
              {product.description || 'لا توجد تفاصيل إضافية'}
            </div>
          </div>

          {/* Map Section */}
          {product.latitude && product.longitude && (
            <div className="space-y-4">
              <h3 className="text-xl font-black text-gray-900">موقع المنتج</h3>
              <div className="overflow-hidden rounded-[24px] border border-white bg-white shadow-sm h-[200px] w-full z-0">
                <MapContainer
                  center={[product.latitude, product.longitude]}
                  zoom={13}
                  scrollWheelZoom={false}
                  className="h-full w-full"
                  attributionControl={false}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[product.latitude, product.longitude]} />
                </MapContainer>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center px-6 pb-8 pt-4 bg-gradient-to-t from-[#F5F9FF] via-[#F5F9FF]/95 to-transparent backdrop-blur-sm">
        <div className="flex w-full max-w-[450px] gap-4">
          <button
            onClick={handleContactNow}
            disabled={loadingPhone}
            className="flex flex-[2] items-center justify-center gap-3 rounded-[20px] bg-gradient-to-r from-[#0A84FF] to-[#005BFF] py-4 text-lg font-black text-white shadow-[0_10px_25px_rgba(10,132,255,0.3)] transition-transform active:scale-95 disabled:opacity-50"
          >
            <FaWhatsapp className="h-6 w-6" />
            {loadingPhone ? 'جاري التحميل...' : 'تواصل الآن'}
          </button>
          
          <button
            onClick={shareProduct}
            className="flex flex-1 items-center justify-center gap-2 rounded-[20px] border border-[#0A84FF]/20 bg-white py-4 text-sm font-black text-[#0A84FF] shadow-sm transition-transform active:scale-95"
          >
            <Share2 className="h-5 w-5" />
            مشاركة
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetails;
