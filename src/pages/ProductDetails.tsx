import React, { useEffect, useRef, useState } from 'react';
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
import 'swiper/swiper.css';

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
    const mainSwiperRef = useRef<import('swiper').Swiper | null>(null);
    
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

      <div className="relative w-full max-w-none">
        {/* Top Header - Sticky */}
        <div className="absolute inset-x-0 top-0 z-40 flex items-center justify-between px-4 py-4 sm:px-6">
          <button 
            onClick={() => navigate(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow-lg transition-transform duration-200 hover:scale-105"
          >
            <ChevronRight className="h-6 w-6 text-gray-800" />
          </button>
          <h1 className="sr-only">تفاصيل المنتج</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleFavorite}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow-lg transition-transform duration-200 hover:scale-105"
              aria-label="المفضلة"
            >
              <Heart className={`h-5 w-5 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-800'}`} />
            </button>
            <button
              onClick={shareProduct}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow-lg transition-transform duration-200 hover:scale-105"
              aria-label="مشاركة"
            >
              <Share2 className="h-5 w-5 text-gray-800" />
            </button>
          </div>
        </div>

        {/* Hero Image Section */}
        <div className="mb-4 w-full px-0 sm:px-4">
          <div className="relative overflow-hidden bg-white shadow-[0_12px_30px_rgba(10,132,255,0.08)] sm:rounded-b-[28px] sm:rounded-t-[28px]">
            <Swiper
              modules={[Pagination, Navigation]}
              spaceBetween={0}
              slidesPerView={1}
              onSwiper={(swiper) => {
                mainSwiperRef.current = swiper;
              }}
              pagination={{ clickable: true, bulletActiveClass: 'swiper-pagination-bullet-active !bg-blue-600 !w-6' }}
              className="aspect-[4/3] w-full overflow-hidden sm:rounded-[24px]"
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
                   <div className="h-full w-full bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                      <Zap className="h-12 w-12 text-blue-300" />
                   </div>
                </SwiperSlide>
              )}
            </Swiper>
          </div>

          {sortedImages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1 sm:px-0" aria-label="معرض صور المنتج">
              {sortedImages.slice(0, 5).map((img, index) => (
                <button
                  key={`${img.image_path}-${index}`}
                  type="button"
                  onClick={() => mainSwiperRef.current?.slideTo(index)}
                  aria-label={`عرض صورة ${index + 1}`}
                  className="h-[68px] w-[68px] flex-shrink-0 overflow-hidden rounded-xl border-2 border-white bg-white shadow-sm transition-transform active:scale-95 sm:h-20 sm:w-20"
                >
                  <img src={img.image_path} alt={`${product.title} ${index + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
              {sortedImages.length > 5 && (
                <div className="flex h-[68px] w-[68px] flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg font-bold text-slate-600 sm:h-20 sm:w-20">
                  +{sortedImages.length - 5}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Product Info Section */}
        <div className="w-full space-y-4 px-4 py-2 sm:px-6 sm:py-4">
          <div className="rounded-[22px] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 text-right">
                <h2 className="text-2xl font-black leading-tight text-gray-900 sm:text-3xl">{product.title}</h2>
                {(product.phone_type || product.model) && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-base font-semibold text-gray-600 sm:text-lg">
                    {product.phone_type && product.model && <span className="text-gray-400">•</span>}
                    {product.model && product.model !== 'unknown_model' && <span>{product.model}</span>}
                    {product.phone_type && product.phone_type !== 'unknown_brand' && <span className="font-bold text-gray-800">{product.phone_type}</span>}
                  </div>
                )}
              </div>
              <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-[#12B76A]/10 px-3 py-1 text-xs font-bold text-[#12B76A]">
                <Star className="h-3.5 w-3.5 fill-[#12B76A]" />
                {product.condition === 'used' ? 'مستعمل' : 'جديد'}
              </span>
            </div>

            <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
              <span className="rounded-full bg-[#12B76A]/10 px-3 py-1 text-xs font-bold text-[#12B76A]">معروض للبيع</span>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-black leading-none text-[#0A84FF] sm:text-5xl">{product.price?.toLocaleString('en-US')}</span>
                <span className="mb-1 text-base font-bold text-gray-700 sm:text-xl">{userCurrencySymbol}</span>
              </div>
            </div>
            <p className="mt-2 text-left text-xs font-medium text-gray-500">السعر قابل للتفاوض</p>
          </div>

          {/* Specifications Card */}
          <div className="rounded-[20px] border border-blue-100 bg-white p-3 shadow-[0_6px_18px_rgba(15,23,42,0.04)] sm:p-4">
            <h3 className="mb-3 text-base font-bold text-gray-900">{t('specifications') || 'المواصفات'}</h3>
            <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
              <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl bg-blue-50/60 px-1.5 py-2 text-center">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <HardDrive className="h-4 w-4" />
                </div>
                <div>
                  <p className="mb-0.5 text-[11px] font-bold text-gray-500">التخزين</p>
                  <p className="text-xs font-black text-gray-800 sm:text-sm">{product.specs?.storage || '--'}</p>
                </div>
              </div>

              <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl bg-blue-50/60 px-1.5 py-2 text-center">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Cpu className="h-4 w-4" />
                </div>
                <div>
                  <p className="mb-0.5 text-[11px] font-bold text-gray-500">الرام</p>
                  <p className="text-xs font-black text-gray-800 sm:text-sm">{product.specs?.ram || '--'}</p>
                </div>
              </div>

              <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl bg-blue-50/60 px-1.5 py-2 text-center">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="mb-0.5 text-[11px] font-bold text-gray-500">الضمان</p>
                  <p className="text-xs font-black text-gray-800 sm:text-sm">{product.warranty_months && product.warranty_months > 0 ? `${product.warranty_months} شهر` : 'بدون ضمان'}</p>
                </div>
              </div>

              {product.is_verified && (
              <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl bg-green-50/70 px-1.5 py-2 text-center">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <p className="mb-0.5 text-[11px] font-bold text-gray-500">التوثيق</p>
                  <p className="text-xs font-black text-green-600 sm:text-sm">موثق ✓</p>
                </div>
              </div>
              )}
            </div>
          </div>

          {/* Seller and listing metadata */}
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500">البائع</p>
                  <p className="truncate text-base font-bold text-gray-900">{product.store_name || '--'}</p>
                  {product.city && <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500"><MapPin className="h-3.5 w-3.5" />{product.city}</p>}
                </div>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-2 text-xs font-bold text-blue-600">الملف الشخصي</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3 rounded-[18px] bg-white p-3 shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Calendar className="h-5 w-5" /></div>
                <div className="min-w-0"><p className="text-xs text-gray-500">تاريخ النشر</p><p className="truncate text-sm font-bold text-gray-800">{formatDate(product.created_at)}</p></div>
              </div>
              <div className="flex items-center gap-3 rounded-[18px] bg-white p-3 shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><MapPin className="h-5 w-5" /></div>
                <div className="min-w-0"><p className="text-xs text-gray-500">الموقع</p><p className="truncate text-sm font-bold text-gray-800">{product.city || '--'}</p></div>
              </div>
            </div>
          </div>

          {/* Additional Details */}
          <div className="space-y-4">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">التفاصيل الإضافية</h3>
            <div className="rounded-[24px] border-2 border-blue-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-4 sm:p-6 leading-relaxed text-gray-700 shadow-sm">
              {product.description || 'لا توجد تفاصيل إضافية'}
            </div>
          </div>

          {/* Map Section */}
          {product.latitude && product.longitude && (
            <div className="space-y-4">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900">📍 موقع المنتج</h3>
              <div className="overflow-hidden rounded-[24px] border-2 border-blue-200 bg-white shadow-md h-[250px] w-full z-0">
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
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center px-4 sm:px-6 py-6 bg-gradient-to-t from-[#F5F9FF] via-[#F5F9FF]/98 to-transparent backdrop-blur-md shadow-2xl">
        <div className="flex w-full max-w-[500px] gap-3">
          <button
            onClick={handleContactNow}
            disabled={loadingPhone}
            className="flex flex-[2.5] items-center justify-center gap-2 sm:gap-3 rounded-[18px] bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 py-3 sm:py-4 px-4 text-base sm:text-lg font-bold text-white shadow-lg hover:shadow-xl transition-all duration-300 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <FaWhatsapp className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0" />
            <span className="hidden sm:inline">{loadingPhone ? 'جاري التحميل...' : 'تواصل الآن'}</span>
            <span className="sm:hidden">{loadingPhone ? 'جاري...' : 'تواصل'}</span>
          </button>
          
          <button
            onClick={shareProduct}
            className="flex flex-1 items-center justify-center gap-2 rounded-[18px] border-2 border-blue-600 bg-white hover:bg-blue-50 py-3 sm:py-4 px-3 sm:px-4 text-base font-bold text-blue-600 shadow-md hover:shadow-lg transition-all duration-300 active:scale-95"
          >
            <Share2 className="h-5 w-5" />
            <span className="hidden sm:inline">مشاركة</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetails;
