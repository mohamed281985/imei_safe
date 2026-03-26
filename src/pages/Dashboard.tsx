import React, { useState, useEffect, useRef, Suspense } from 'react';
import LostPhoneCard from '../components/LostPhoneCard';
import { Capacitor } from '@capacitor/core';
// import { Browser } from '@capacitor/browser';

import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import PageContainer from '../components/PageContainer';
import Logo from '../components/Logo';
import AppNavbar from '@/components/AppNavbar';
import { Search, Plus, Smartphone, X, Crown, Eye, AlertTriangle, User, PlusCircle, MapPin, Users, Star } from 'lucide-react';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Link } from 'react-router-dom';
import { useGeolocated } from 'react-geolocated';
import { supabase } from '../lib/supabase';
import PageAdvertisement from '@/components/advertisements/PageAdvertisement';
import AdsOfferSlider from '@/components/advertisements/AdsOfferSlider';
import { useScrollToTop } from '../hooks/useScrollToTop';
import BottomNavbar from '@/pages/BottomNavbar';
import { useAds } from '@/contexts/AdContext'; // تأكد من استيراد useToast
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

const OwnershipConfirmationModal = React.lazy(() => import('../components/OwnershipConfirmationModal'));
const AdPopupModal = React.lazy(() => import('../components/AdPopupModal'));

interface ads_payment {
  id: string;
  image_url: string;
  latitude?: number;
  longitude?: number;
  website_url?: string;
  expires_at: string;
}
interface Accessory {
  id: string;
  title: string;
  price: number;
  condition: 'new' | 'used';
  store_name?: string;
  accessory_images: { image_path: string; main_image: boolean }[];
  role?: string;
  latitude?: number;
  longitude?: number;
  distance?: number;
  category?: string; // Added category property
  brand?: string; // Added brand property
  created_at?: string; // Added created_at property
  warranty_months?: number; // Added warranty_months property
  type?: 'promotions' | 'normal'; // Added type property
}

// دالة مساعدة للحصول على الصورة الرئيسية للهاتف
const getPhoneMainImage = (phone: any): string | null => {
  if (!phone?.phone_images?.length) {
    console.debug('No phone images found for phone');
    return null;
  }

  // البحث عن الصورة الرئيسية
  const mainImage = phone.phone_images.find((img: any) => img.main_image);
  if (mainImage?.image_path) {
    console.debug('Found main image for phone');
    return mainImage.image_path;
  }

  // إذا لم نجد صورة رئيسية، نستخدم أول صورة
  console.debug('Using first image for phone');
  return phone.phone_images[0].image_path;
};

// دالة مساعدة للحصول على الصورة الرئيسية للإكسسوار
const getAccessoryMainImage = (accessory: any): string | null => {
  if (!accessory?.accessory_images?.length) {
    return null;
  }
  const mainImage = accessory.accessory_images.find((img: any) => img.main_image);
  if (mainImage?.image_path) {
    return mainImage.image_path;
  }
  return accessory.accessory_images[0].image_path;
};

const getTransformedAccessoryImageUrl = (originalUrl: string | null | undefined): string => {
  return getTransformedImageUrl(originalUrl); // يمكن استخدام نفس الدالة
};

// دالة مساعدة لإنشاء رابط صورة محسن باستخدام Supabase Storage
const getTransformedImageUrl = (originalUrl: string | null | undefined): string => {
  if (!originalUrl) {
    return '/placeholder-phone.png';
  }
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('Supabase URL not found in environment variables');
      return '/placeholder-phone.png';
    }

    // إذا كان الرابط يبدأ بـ http، فهو رابط كامل بالفعل
    if (originalUrl.startsWith('http://') || originalUrl.startsWith('https://')) {
      return originalUrl;
    }

    // بناء الرابط الكامل للصورة
    const finalUrl = `${supabaseUrl}/storage/v1/object/public/phone-images/${originalUrl}`;
    console.debug('Final image URL resolved');
    return finalUrl;
  } catch (e) {
    console.error('Error processing image URL:', e?.message || e);
    return '/placeholder-phone.png';
  }
};

// دالة مساعدة لتحويل الدرجات إلى راديان
function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

// دالة حساب المسافة باستخدام صيغة Haversine
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // نصف قطر الأرض بالكيلومتر
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // المسافة بالكيلومتر
  return d;
}

const START_DATE = new Date('2025-01-01').getTime();



const Dashboard: React.FC = () => {
  useScrollToTop();
  const { t } = useLanguage();
  const { user, isFirstLogin, clearFirstLogin } = useAuth(); // ⭐ جلب الحالة والدالة من السياق
  const { toast } = useToast();
  const navigate = useNavigate();

  // حالة للهواتف المفقودة
  const [displayedPhones, setDisplayedPhones] = useState<any[]>([]);
  const [loadingPhones, setLoadingPhones] = useState(true);
  const [phoneIndex, setPhoneIndex] = useState(0); // للتحكم في التبديل بين البلاغات

  // حالة للهواتف المعروضة للبيع
  const [phoneListings, setPhoneListings] = useState<any[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);
  // حالات جديدة للإكسسوارات
  const [accessoryListings, setAccessoryListings] = useState<Accessory[]>([]);
  const [loadingAccessories, setLoadingAccessories] = useState(true);

  // ⭐ إضافة تبديل تلقائي للكروت
  useEffect(() => {
    if (loadingPhones || displayedPhones.length === 0) return;
    const interval = setInterval(() => {
      setPhoneIndex(prev => {
        // إذا وصلنا للنهاية، نعود للبداية
        if (prev >= displayedPhones.length - 1) {
          return 0;
        }
        return prev + 1;
      });
    }, 3000); // كل 3 ثواني
    return () => clearInterval(interval);
  }, [loadingPhones, displayedPhones.length]);
  const [popupAds, setPopupAds] = useState<ads_payment[]>([]);
  const [isAdModalOpen, setIsAdModalOpen] = useState(false);
  const [locationPermissionRequested, setLocationPermissionRequested] = useState(false);

  // حالات جديدة لنافذة تأكيد الملكية
  const [showOwnershipConfirmation, setShowOwnershipConfirmation] = useState(false);
  const [phonesForConfirmation, setPhonesForConfirmation] = useState<any[]>([]);
  
  // حالات للهواتف غير المطالب بها (التي تم العثور عليها بالبريد الإلكتروني)
  const [unclaimedPhones, setUnclaimedPhones] = useState<any[]>([]);
  const [showClaimModal, setShowClaimModal] = useState(false);

  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const [showLocationRequest, setShowLocationRequest] = useState(false);

  const { coords, positionError, isGeolocationAvailable, isGeolocationEnabled } = useGeolocated({
    positionOptions: { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 },
    userDecisionTimeout: 10000,
  });

  // ⭐ useRef لتخزين موضع التمرير الأخير
  const lastScrollY = useRef(0);

  // ⭐ useEffect للتحكم في ظهور وإخفاء الشريط السفلي عند التمرير
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const isAtBottom = window.innerHeight + currentScrollY >= document.documentElement.scrollHeight - 5; // نطاق صغير للتأكد من الوصول للأسفل

      // إخفاء الشريط عند التمرير لأسفل أو عند الوصول لنهاية الصفحة
      if (isAtBottom || (currentScrollY > lastScrollY.current && Math.abs(currentScrollY - lastScrollY.current) > 10)) {
        setIsNavbarVisible(false);
      }
      // إظهار الشريط عند التمرير لأعلى
      else if (currentScrollY < lastScrollY.current) {
        setIsNavbarVisible(true);
      }

      // تحديث موضع التمرير الأخير فقط إذا كان التغيير كبيراً بما يكفي لتجنب الحساسية المفرطة
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // دالة لطلب إذن المستخدم لتحديد الموقع
  const requestLocationPermission = () => {
    setLocationPermissionRequested(true);
    setShowLocationRequest(false);

    // طلب إذن الموقع مباشرة من المتصفح
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Suppress detailed location coordinates in logs
          console.debug('تم الحصول على الموقع بنجاح');
          // سيتم تحديث تلقائيًا لأن coords قد تتغير
        },
        (error) => {
          console.error('خطأ في الحصول على الموقع:', error?.message || error);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    } else {
      console.error('الموقع الجغرافي غير مدعوم في هذا المتصفح');
    }
  };

  // دالة لزيادة عدد المشاهدات
  const incrementPhoneViews = async (phoneId: string) => {
    try {
      await supabase.rpc('increment_views', { p_phone_id: phoneId });
    } catch (error) {
      console.error('Error incrementing views:', error?.message || error);
    }
  };

  // التأثير الخاص بالتحقق من ملكية الهواتف
  useEffect(() => {
    const checkPhoneOwnership = async () => {
      if (!user) return;

      try {
        // الحصول على التوكن
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (!token) return;

        // استخدام API لجلب الهواتف مع فك التشفير
        const response = await fetch('https://imei-safe.me/api/user-phones', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        const result = await response.json();

        if (!result.success) {
          console.error("Error fetching user phones:", result.error?.message || result.error);
          return;
        }

        const data = result.data;

        // تصفية الهواتف المعتمدة فقط
        const approvedPhones = data.filter((p: any) => p.status === 'approved');

        const phonesToConfirm = approvedPhones.filter((phone: any) => {
          // تحديد التاريخ الأساسي للتحقق:
          // إذا كان هناك تاريخ تأكيد سابق، نستخدمه. وإلا، نستخدم تاريخ التسجيل.
          const baseDate = phone.last_confirmed_at ? new Date(phone.last_confirmed_at) : new Date(phone.registration_date);

          // حساب المدة الزمنية التي يجب أن تمر (24 ساعة)
          const oneDayInMilliseconds = 24 * 60 * 60 * 1000;

          // التحقق مما إذا مر أكثر من يوم على التاريخ الأساسي
          return (new Date().getTime() - baseDate.getTime()) > oneDayInMilliseconds;
        });

        if (phonesToConfirm.length > 0) {
          setPhonesForConfirmation(phonesToConfirm);
          setShowOwnershipConfirmation(true);
        }

      } catch (err) {
        console.error("Unexpected error in checkPhoneOwnership:", err?.message || err);
      }
    };

    // تشغيل التحقق بعد فترة قصيرة من تحميل الصفحة لضمان استقرار الواجهة
    const timer = setTimeout(checkPhoneOwnership, 5000);

    return () => clearTimeout(timer);
  }, [user]);

  // التحقق من الهواتف غير المطالب بها عن طريق البريد الإلكتروني
  useEffect(() => {
    const checkUnclaimedPhones = async () => {
      if (!user || !user.email) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch('https://imei-safe.me/api/check-unclaimed-phones', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        console.debug('Check unclaimed phones response status');
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.phones && result.phones.length > 0) {
            setUnclaimedPhones(result.phones);
            setShowClaimModal(true);
          }
        }
      } catch (error) {
        console.error('Error checking unclaimed phones:', error?.message || error);
      }
    };

    // تأخير بسيط لضمان تحميل المستخدم
    const timer = setTimeout(() => {
      checkUnclaimedPhones();
    }, 2000);

    return () => clearTimeout(timer);
  }, [user]);

  const handleClaimPhone = async (imei: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('https://imei-safe.me/api/claim-phone-by-email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ imei })
      });
      const text = await response.text();
      let result: any = {};
      try { result = text ? JSON.parse(text) : {}; } catch (parseErr) { result = {}; }

      if (response.ok && result.success) {
        toast({ title: t('success'), description: 'تم تأكيد ملكية الهاتف وربطه بحسابك بنجاح' });
        setUnclaimedPhones(prev => prev.filter(p => p.imei !== imei));
        if (unclaimedPhones.length <= 1) setShowClaimModal(false);
      } else {
        throw new Error(result.error || 'Failed to claim phone');
      }
    } catch (error: any) {
      toast({ title: t('error'), description: error.message || 'حدث خطأ أثناء تأكيد الملكية', variant: 'destructive' });
    }
  };

  const handleConfirmOwnership = async (phoneIds: string[]) => {
    // اطلب من السيرفر تحديث الحالة و last_confirmed_at بأمان
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const resp = await fetch('/api/update-phone-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ids: phoneIds, status: 'approved' })
      });
      const text = await resp.text();
      let json: any = {};
      try { json = text ? JSON.parse(text) : {}; } catch (parseErr) { json = {}; }
      if (!resp.ok) throw new Error(json.error || text || 'Failed to update status');
      toast({ title: "شكراً لك", description: "تم تأكيد ملكيتك بنجاح." });
      setPhonesForConfirmation(prev => prev.filter(p => !phoneIds.includes(p.id)));
      setShowOwnershipConfirmation(false);
    } catch (e) {
      console.error('Failed to approve phones:', e?.message || e);
      toast({ title: "خطأ", description: "فشل تحديث حالة التأكيد.", variant: "destructive" });
    }
  };

  const handleDenyOwnership = async (phoneIds: string[]) => {
    console.warn('User denied ownership of phones');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const resp = await fetch('/api/update-phone-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ids: phoneIds, status: 'transferred' })
      });
      const text = await resp.text();
      let json: any = {};
      try { json = text ? JSON.parse(text) : {}; } catch (parseErr) { json = {}; }
      if (!resp.ok) throw new Error(json.error || text || 'Failed to update status');
      toast({ title: "تمت الإزالة", description: "تمت إزالة الهاتف من قائمة هواتفك المسجلة." });
    } catch (e) {
      console.error('Failed to transfer phones:', e?.message || e);
      toast({ title: "خطأ", description: "فشل تحديث حالة الهاتف.", variant: "destructive" });
    }
    setShowOwnershipConfirmation(false);
  };

  // جلب بيانات الهواتف من Supabase
  useEffect(() => {
    const fetchData = async () => {
      setLoadingPhones(true);
      setLoadingListings(true);
      setLoadingAccessories(true);
      try {
        // جلب الهواتف المفقودة عن طريق API خادم يُفك التشفير ويعيد فقط الحقول المطلوبة
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          const resp = await fetch('/api/lost-phones', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
          });

          if (resp.ok) {
            const json = await resp.json();
            // نتوقع مصفوفة من العناصر بالشكل: { imei: string, phone_type: string }
            if (Array.isArray(json)) {
              setDisplayedPhones(json);
            } else if (json && Array.isArray(json.data)) {
              setDisplayedPhones(json.data);
            } else {
              console.warn('Unexpected lost-phones response shape, falling back to Supabase');
              throw new Error('Unexpected response');
            }
          } else {
            console.warn('Server API /api/lost-phones returned non-ok, falling back to Supabase');
            throw new Error('API failed');
          }
        } catch (err) {
          console.warn('Falling back to Supabase for lost phones:', err?.message || err);
          // رجوع إلى Supabase إذا فشل استدعاء الـ API
          const { data: lostPhones, error: lostError } = await supabase
            .from('phone_reports') // جدول بلاغات الهواتف
            .select('*') // اختر كل الأعمدة
            .eq('status', 'active') // فقط البلاغات النشطة
            .order('report_date', { ascending: false }); // الأحدث أولاً

          if (lostError) {
            console.error('خطأ في جلب بيانات الهواتف المفقودة من Supabase:', lostError?.message || lostError);
            setDisplayedPhones([]);
          } else {
            setDisplayedPhones(lostPhones || []);
          }
        }

        // جلب الهواتف المعروضة للبيع مع بيانات الموقع
        const { data: listings, error: listingsError } = await supabase
          .from('phones')
          .select(`
            *,
            phone_images (
              image_path,
              main_image,
              order
            ),
            role,
            latitude,
            longitude
          `)
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (listingsError) {
          console.error('خطأ في جلب بيانات الهواتف المعروضة للبيع:', listingsError?.message || listingsError);
          setPhoneListings([]);
        } else {
          console.debug('تم جلب بيانات الهواتف المعروضة للبيع');
          let sortedListings = listings || [];

          // فرز حسب الموقع إذا كانت الإحداثيات متاحة
          if (coords?.latitude && coords?.longitude) {
            sortedListings.forEach(phone => {
              if (phone.latitude && phone.longitude) {
                phone.distance = getDistanceFromLatLonInKm(coords.latitude, coords.longitude, phone.latitude, phone.longitude);
              } else {
                phone.distance = Infinity; // ضع الهواتف بدون موقع في النهاية
              }
            });
          }

          // الترتيب النهائي: الإعلانات المميزة القريبة، ثم باقي المميزة، ثم حسب العضوية، ثم المسافة
          const roleOrder = { 'gold_business': 1, 'silver_business': 2, 'free_business': 3 };
          sortedListings.sort((a, b) => {
            const isAPromoted = a.type === 'promotions';
            const isBPromoted = b.type === 'promotions';
            const isANearby = (a.distance ?? Infinity) <= 10;
            const isBNearby = (b.distance ?? Infinity) <= 10;

            // 1. إعلان مميز وقريب في المقدمة
            if (isAPromoted && isANearby && !(isBPromoted && isBNearby)) return -1;
            if (isBPromoted && isBNearby && !(isAPromoted && isANearby)) return 1;

            // 2. باقي الإعلانات المميزة
            if (isAPromoted && !isBPromoted) return -1;
            if (isBPromoted && !isAPromoted) return 1;

            // 3. الترتيب حسب أولوية العضوية (الدور)
            const orderA = roleOrder[a.role as keyof typeof roleOrder] || 4;
            const orderB = roleOrder[b.role as keyof typeof roleOrder] || 4;
            if (orderA !== orderB) return orderA - orderB;

            // 4. إذا كانت العضوية متساوية، يتم الترتيب حسب المسافة (الأقرب أولاً)
            return (a.distance ?? Infinity) - (b.distance ?? Infinity);
          });

          setPhoneListings(sortedListings);
        }

        // جلب الإكسسوارات المعروضة للبيع
        const { data: accessories, error: accessoriesError } = await supabase
          .from('accessories')
          .select(`
            *,
            accessory_images (
              image_path,
              main_image
            ),
            role,
            latitude,
            longitude
          `)
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (accessoriesError) {
          console.error('خطأ في جلب بيانات الإكسسوارات:', accessoriesError?.message || accessoriesError);
          setAccessoryListings([]);
        } else {
          let sortedAccessories = accessories || [];
          if (coords?.latitude && coords?.longitude) {
            sortedAccessories.forEach(acc => {
              if (acc.latitude && acc.longitude) {
                acc.distance = getDistanceFromLatLonInKm(coords.latitude, coords.longitude, acc.latitude, acc.longitude);
              } else {
                acc.distance = Infinity;
              }
            });
          }
          // الترتيب النهائي: الإعلانات المميزة القريبة، ثم باقي المميزة، ثم حسب العضوية، ثم المسافة
          const roleOrder = { 'gold_business': 1, 'silver_business': 2, 'free_business': 3 };
          sortedAccessories.sort((a, b) => {
            const isAPromoted = a.type === 'promotions';
            const isBPromoted = b.type === 'promotions';
            const isANearby = (a.distance ?? Infinity) <= 10;
            const isBNearby = (b.distance ?? Infinity) <= 10;

            // 1. إعلان مميز وقريب في المقدمة
            if (isAPromoted && isANearby && !(isBPromoted && isBNearby)) return -1;
            if (isBPromoted && isBNearby && !(isAPromoted && isANearby)) return 1;

            // 2. باقي الإعلانات المميزة
            if (isAPromoted && !isBPromoted) return -1;
            if (isBPromoted && !isAPromoted) return 1;

            // 3. الترتيب حسب أولوية العضوية (الدور)
            const orderA = roleOrder[a.role as keyof typeof roleOrder] || 4;
            const orderB = roleOrder[b.role as keyof typeof roleOrder] || 4;
            if (orderA !== orderB) return orderA - orderB;

            // 4. إذا كانت العضوية متساوية، يتم الترتيب حسب المسافة (الأقرب أولاً)
            return (a.distance ?? Infinity) - (b.distance ?? Infinity);
          });
          setAccessoryListings(sortedAccessories);
        }
      } catch (err) {
        console.error('خطأ غير متوقع في جلب الهواتف:', err);
        setDisplayedPhones([]);
        setPhoneListings([]);
        setAccessoryListings([]);
      } finally {
        setLoadingPhones(false);
        setLoadingListings(false);
        setLoadingAccessories(false);
      }
    };
    fetchData();
  }, [coords]); // إعادة الجلب عند تغير إحداثيات المستخدم

  // تأثير لتحديث الموقع بشكل دوري
  useEffect(() => {
    if (!navigator.geolocation) {
      console.log('الموقع الجغرافي غير مدعوم في هذا المتصفح');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        console.log('تم تحديث الموقع بنجاح:', position.coords);
        // سيتم تحديث تلقائيًا لأن coords تتغير
      },
      (error) => {
        console.error('خطأ في تحديث الموقع:', error.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );

    return () => {
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  useEffect(() => {
    console.log('تم استدعاء useEffect في Dashboard لجلب الإعلانات');
    console.log('إحداثيات المستخدم الحالية:', coords);

    const fetchAndShowAds = async () => {
      try {
        console.log('محاولة جلب الإعلانات...');

        // ⭐ تعديل: جلب الإعلانات المميزة فقط من جدول ads_payment
        const { data: specialAds, error: specialError } = await supabase
          .from('ads_payment') // الإعلانات المميزة
          .select('id, image_url, latitude, longitude, website_url, is_paid, expires_at, phone, type')
          .eq('is_active', true)
          .eq('is_paid', true)
          .eq('type', 'special') // التأكد من أن النوع هو special
          .gt('expires_at', new Date().toISOString());


        if (specialError || !specialAds || specialAds.length === 0) {
          console.log('لا توجد إعلانات مميزة متاحة');
          return;
        }

        const allAds = specialAds || [];
        console.log(`تم جلب ${allAds.length} إعلان`);

        // التحقق من وجود إحداثيات للمستخدم
        if (!coords || !coords.latitude || !coords.longitude) {
          console.log('لم يتم تحديد موقع المستخدم، سيتم عرض إعلانات عشوائية');
          const randomAds = [...allAds]
            .sort(() => Math.random() - 0.5)
            .slice(0, Math.min(2, allAds.length));

          setPopupAds(randomAds);
          // ⭐ فتح النافذة فقط إذا كان أول تسجيل دخول
          if (isFirstLogin && randomAds.length > 0) {
            setIsAdModalOpen(randomAds.length > 0);
            clearFirstLogin(); // ⭐ إعادة تعيين الحالة بعد الاستخدام
          }
          return;
        }

        console.log(`إحداثيات المستخدم: ${coords.latitude}, ${coords.longitude}`);
        console.log('بدء فلترة الإعلانات...');
        let filteredAds = [];

        // حساب المسافة لكل إعلان وتصفية الإعلانات التي في نطاق 3 كم
        filteredAds = allAds
          .map(ad => {
            if (typeof ad.latitude === 'number' && typeof ad.longitude === 'number') {
              const dist = getDistanceFromLatLonInKm(coords.latitude, coords.longitude, ad.latitude, ad.longitude);
              console.log(`إعلان ${ad.id}: المسافة ${dist.toFixed(2)} كم`);
              return { ...ad, distance: dist };
            }
            console.log(`إعلان ${ad.id}: لا يحتوي على إحداثيات`);
            return null;
          })
          .filter(ad => ad !== null && typeof ad.distance === 'number' && ad.distance <= 3);

        console.log(`تم العثور على ${filteredAds.length} إعلان في نطاق 3 كم من موقع المستخدم`);

        // إذا لم يتم العثور على إعلانات قريبة، عرض إعلانات عشوائية من القائمة الكاملة
        if (filteredAds.length === 0) {
          console.log('لم يتم العثور على إعلانات في نطاق 3 كم، سيتم عرض إعلانات عشوائية');
          const randomAds = [...allAds]
            .sort(() => Math.random() - 0.5)
            .slice(0, Math.min(2, allAds.length));

          setPopupAds(randomAds);
          // ⭐ فتح النافذة فقط إذا كان أول تسجيل دخول
          if (isFirstLogin && randomAds.length > 0) {
            setIsAdModalOpen(randomAds.length > 0);
            clearFirstLogin(); // ⭐ إعادة تعيين الحالة بعد الاستخدام
          }
          return;
        }

        const lastAdIndices = JSON.parse(localStorage.getItem('lastAdIndices') || '[]');
        const lastShownTime = parseInt(localStorage.getItem('lastAdShownTime') || '0');
        const now = new Date().getTime();

        console.log(`آخر عرض لإعلانات: ${lastShownTime}`);
        console.log(`الوقت الحالي: ${now}`);

        // إعادة تعيين قائمة الإعلانات المعروضة إذا مر وقت طويل
        if (!lastShownTime || (now - lastShownTime) > 60 * 60 * 1000) {
          console.log('إزالة فهرس الإعلانات القديمة');
          localStorage.removeItem('lastAdIndices');
        }

        let adsToShow = [];
        let availableIndices = filteredAds.map((_, index) => index);

        console.log(`عدد الإعلانات المتاحة للاختيار: ${availableIndices.length}`);
        console.log(`فهرس الإعلانات المعروضة سابقًا: ${lastAdIndices}`);

        if (lastAdIndices.length > 0) {
          availableIndices = availableIndices.filter(index => !lastAdIndices.includes(index));
          console.log(`عدد الإعلانات بعد استبعاد المعروضة سابقًا: ${availableIndices.length}`);
        }

        if (availableIndices.length === 0) {
          console.log('استخدام جميع الإعلانات مرة أخرى بعد استهلاكها كلها');
          availableIndices = filteredAds.map((_, index) => index);
        }

        console.log(`اختيار ${Math.min(2, availableIndices.length)} إعلانات عشوائية من ${availableIndices.length} متاحة`);

        for (let i = 0; i < Math.min(2, availableIndices.length); i++) {
          const randomIndex = Math.floor(Math.random() * availableIndices.length);
          const adIndex = availableIndices[randomIndex];
          adsToShow.push(filteredAds[adIndex]);
          console.log(`تم اختيار إعلان ID: ${filteredAds[adIndex].id} (المسافة: ${filteredAds[adIndex].distance.toFixed(2)} كم)`);
          availableIndices.splice(randomIndex, 1);
        }

        const newLastAdIndices = [...lastAdIndices];
        adsToShow.forEach(ad => {
          const adIndex = filteredAds.findIndex(a => a.id === ad.id);
          if (adIndex !== -1) {
            newLastAdIndices.push(adIndex);
          }
        });
        if (newLastAdIndices.length > 10) {
          newLastAdIndices.splice(0, newLastAdIndices.length - 10);
        }
        localStorage.setItem('lastAdIndices', JSON.stringify(newLastAdIndices));
        localStorage.setItem('lastAdShownTime', String(now));

        if (adsToShow.length > 0) {
          console.log('الإعلانات المرسلة للنافذة المنبثقة:', adsToShow);
          console.log(`سيتم عرض ${adsToShow.length} إعلان في النافذة المنبثقة`);
          setPopupAds(adsToShow);
          // ⭐ فتح النافذة فقط إذا كان أول تسجيل دخول
          if (isFirstLogin) {
            setIsAdModalOpen(true);
            clearFirstLogin(); // ⭐ إعادة تعيين الحالة بعد الاستخدام
          }
          console.log(`تم تحديث popupAds بـ ${adsToShow.length} إعلان`);
        } else {
          console.log('لا توجد إعلانات لعرضها');
          setPopupAds([]);
          console.log('تم تعيين popupAds إلى مصفوفة فارغة');
          setIsAdModalOpen(false);
          console.log('تم تعيين isAdModalOpen إلى false');
        }
      } catch (err) {
        console.error("Error fetching or showing popup ad:", err);
      }
    };

    // ⭐ عرض الإعلانات فقط إذا كان أول تسجيل دخول
    if (isFirstLogin) {
      fetchAndShowAds();
    }
    // إضافة مستمع لعرض الإعلانات عند عودة التطبيق للواجهة
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user && !sessionStorage.getItem('hasSeenLoginAd')) {
        fetchAndShowAds();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [coords, user, isFirstLogin, clearFirstLogin]);

  // واجهة رسالة طلب إذن الموقع
  const LocationPermissionRequest = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowLocationRequest(false)}>
      <div className="bg-blue-100 rounded-full p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-gray-800 mb-4">طلب إذن تحديد الموقع</h3>
        <p className="text-gray-600 mb-6">لعرض الإعلانات القريبة منك، نحتاج إلى استخدام موقعك الجغرافي. هل تسمح للتطبيق بتحديد موقعك؟</p>
        <div className="flex justify-end gap-3">
          <button
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            onClick={() => setShowLocationRequest(false)}
          >
            لا شكرًا
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            onClick={requestLocationPermission}
          >
            السماح
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <PageContainer>

      {/* ⭐ إزالة أي مساحة سفلية زائدة أسفل الهواتف المفقودة والناف بار */}
      <AppNavbar />

      <PageAdvertisement pageName="dashboard" />
      <div
        className="relative min-h-screen pb-0 mb-0"
        style={{ 
          paddingBottom: 'env(safe-area-inset-bottom)', 
          marginBottom: 0,
          backgroundImage: "none",
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        {showLocationRequest && <LocationPermissionRequest />}

        <div className="w-full mx-auto px-4">
          <div className="mb-5">
            <h2 className="pt-5 pb-2 mb-2 text-xl font-bold text-black">
              {user?.username ? `👋 ${user.username}` : t('welcome')}
            </h2>

            <div className="grid grid-cols-4 gap-2 text-center">

              {/* Icon 1: Report Lost Phone */}
              <Link
                to="/report"
                className="flex flex-col items-center space-y-2 group w-20"
              >
                <div className="relative w-16 h-16 bg-blue-900 rounded-full shadow-lg border-2 border-cyan-400 flex items-center justify-center transition-transform duration-300 group-hover:scale-105 group-hover:shadow-xl p-2">
                  <Smartphone className="w-12 h-12 text-cyan-300 drop-shadow-lg" strokeWidth={1.5} />
                  <AlertTriangle className="absolute w-5 h-5 text-cyan-300" style={{ transform: 'translate(0, -2px)' }} />
                </div>
                <span className="text-black font-bold text-sm leading-tight px-1 whitespace-pre-line text-center w-full">{t('report_lost_phone')}</span>
              </Link>

              {/* Icon 2: Register New Phone */}
              <Link
                to="/register-phone"
                className="flex flex-col items-center space-y-2 group w-20"
              >
                <div className="relative w-16 h-16 bg-blue-900 rounded-full shadow-lg border-2 border-orange-400 flex items-center justify-center transition-transform duration-300 group-hover:scale-105 group-hover:shadow-xl p-2 bg-gradient-to-br from-blue-800 to-blue-900">
                  <Smartphone className="w-12 h-12 text-orange-400 drop-shadow-lg" strokeWidth={1.5} />
                  <PlusCircle className="absolute w-5 h-5 text-orange-300" style={{ transform: 'translate(0, -2px)' }} />
                </div>
                <span className="text-black font-bold text-sm leading-tight px-1 whitespace-pre-line text-center w-full">{t('register_new_phone')}</span>
              </Link>

              {/* Icon 3: Search Phone */}
              <Link
                to="/search"
                className="flex flex-col items-center space-y-2 group w-20"
              >
                <div className="relative w-16 h-16 bg-blue-900 rounded-full shadow-lg border-2 border-cyan-400 flex items-center justify-center transition-transform duration-300 group-hover:scale-105 group-hover:shadow-xl p-2">
                  <Smartphone className="w-12 h-12 text-cyan-300 drop-shadow-lg" strokeWidth={1.5} />
                  <Search className="absolute w-5 h-5 text-cyan-300" style={{ transform: 'translate(0, -2px)' }} />
                </div>
                <span className="text-black font-bold text-sm leading-tight px-1 whitespace-pre-line text-center w-full">{t('search_imei')}</span>
              </Link>

              {/* Icon 4: Ownership Transfer */}
              <div
                className="flex flex-col items-center space-y-2 group cursor-pointer w-20"
                onClick={() => {
                  if (user?.role && ['free_business', 'business', 'gold_business', 'silver_business'].includes(user.role)) {
                    navigate('/businesstransfer');
                  } else {
                    navigate('/ownership-transfer');
                  }
                }}
              >
                <div className="relative w-16 h-16 bg-blue-900 rounded-full shadow-lg border-2 border-orange-400 flex items-center justify-center transition-transform duration-300 group-hover:scale-105 group-hover:shadow-xl p-1 bg-gradient-to-br from-blue-800 to-blue-900">
                  <Smartphone className="w-12 h-12 text-orange-400 drop-shadow-lg" strokeWidth={1.5} />
                  <Users className="absolute w-5 h-5 text-orange-300" style={{ transform: 'translate(0, -2px)' }} />
                </div>
                <span className="text-black font-bold text-sm leading-tight px-1 whitespace-pre-line text-center w-full">{t('transfer_ownership')}</span>
              </div>

            </div>
          </div>


          {/* شريط صور إعلانات العروض */}
          <AdsOfferSlider containerClassName="mt-2 mb-2" />


          {/* قسم الهواتف المعروضة للبيع */}
          <div className="mb-5">
            <div className="flex justify-between items-center mb-3 pt-5">
              <h2 className="text-black text-xl font-bold">{t('Phones')}</h2>
              <Link to="/phones-for-sale" className="text-black hover:text-imei-cyan/80 text-sm font-medium leading-none">
                {t('view_all')}
              </Link>
            </div>
            <div className="relative">
              {loadingListings ? (
                // عرض 4 عناصر تحميل مؤقتة
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="bg-blue-100 rounded-2xl overflow-hidden shadow-lg animate-pulse">
                    <div className="relative w-full h-[100px]">
                      <div className="absolute inset-0 bg-gray-200">
                        <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer"></div>
                      </div>
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-3/4">
                        <div className="h-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer"></div>
                      </div>
                      <div className="h-3 bg-gray-200 rounded w-1/2">
                        <div className="h-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer"></div>
                      </div>
                      <div className="flex justify-between items-end mt-3">
                        <div className="h-5 bg-gray-200 rounded w-1/3">
                          <div className="h-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer"></div>
                        </div>
                        <div className="h-4 bg-gray-200 rounded w-1/4">
                          <div className="h-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : phoneListings.length > 0 ? (

                <Swiper
                  spaceBetween={12}
                  slidesPerView={2.1}
                  breakpoints={{
                    640: { slidesPerView: 3.2 },
                    768: { slidesPerView: 4.2 },
                    1024: { slidesPerView: 5.2 },
                  }}
                  navigation={false}
                  modules={[]}
                  className="!static"

                >
                  {phoneListings.map((phone) => {
                    return (
                      <SwiperSlide
                        key={phone.id}
                        onClick={() => navigate(`/product/${phone.id}`)}
                        className="cursor-pointer"
                      >
                        <Link
                          to={`/product/${phone.id}`}
                          onClick={() => incrementPhoneViews(phone.id)}
                          className={`relative bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 group flex flex-col h-[280px] sm:h-[300px] md:h-[320px] lg:h-[280px] ${phone.type === 'promotions' ? 'border-2 border-yellow-400 shadow-xl shadow-yellow-100' : 'border border-gray-100 shadow-lg'}`}
                        >
                          {/* الشريط العلوي للإعلانات المميزة */}
                          {phone.type === 'promotions' && <div className="h-1.5 bg-gradient-to-r from-yellow-400 to-amber-500"></div>}
                          
                          <div className="relative w-full h-[180px] sm:h-[200px] md:h-[220px] lg:h-[180px] bg-gray-50">
                            {phone.phone_images?.[0]?.image_path ? (
                              <>
                                
                                <div className="relative w-full h-full">
                                  {/* صورة الهاتف */}
                                  {(() => {
                                    const imagePath = getPhoneMainImage(phone);
                                    const imageUrl = getTransformedImageUrl(imagePath);
                                    if (!imagePath || !imageUrl) return null;

                                    return (
                                      <img
                                        src={imageUrl}
                                        alt={phone.title || 'صورة الهاتف'}
                                        className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300"
                                        loading="lazy"
                                       onLoad={(e) => {
                                          const target = e.target as HTMLImageElement;
                                          target.classList.remove('opacity-0');
                                          target.classList.add('opacity-100');
                                          const placeholder = target.parentElement?.querySelector('.phone-placeholder');
                                          if (placeholder) {
                                            placeholder.classList.add('opacity-0');
                                          }
                                        }}
                                        onError={(e) => {
                                          console.error('Image failed to load:', e);
                                          console.error('Image URL:', imageUrl);
                                          fetch(imageUrl)
                                            .then(response => {
                                              console.error('Response status:', response.status);
                                              console.error('Response headers:', response.headers);
                                              return response.text();
                                            })
                                            .then(text => {
                                              console.error('Response body:', text);
                                            })
                                            .catch(error => {
                                              console.error('Fetch error:', error);
                                            });
                                          const target = e.target as HTMLImageElement;
                                          target.style.display = 'none';
                                          const placeholder = target.parentElement?.querySelector('.phone-placeholder');
                                          if (placeholder) {
                                            placeholder.classList.remove('opacity-0');
                                          }
                                        }}
                                      />
                                    );
                                  })()}

                                  {/* Placeholder */}
                                  <div className="phone-placeholder absolute inset-0 flex items-center justify-center transition-opacity duration-300">
                                    <div className="p-4 rounded-full bg-gray-100">
                                      <Smartphone className="w-8 h-8 text-gray-400" />
                                    </div>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                <Smartphone className="w-12 h-12 text-gray-300" />
                              </div>
                            )}
                            {/* شارة "مميز" */}
                            {phone.type === 'promotions' && (
                              <div className="absolute top-2 left-1.5 bg-yellow-400/90 backdrop-blur-[2px] text-black text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm z-10 flex items-center gap-0.5">
                                <Star className="w-2.5 h-2.5 text-black" /><span>{t('featured')}</span>
                              </div>
                            )}
                            {/* شارة الضمان */}
                            {phone.warranty_months > 0 && (
                              <div className="absolute bottom-1 right-1 bg-blue-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                                {t('warranty_months').replace('{months}', phone.warranty_months.toString())}
                              </div>
                            )}
                            {/* شارة الحالة */}
                            {phone.condition && (
                              <div className={`absolute bottom-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm ${phone.condition === 'used' ? 'bg-orange-500/90 text-white' : 'bg-cyan-500/90 text-white'}`}>
                                {t(phone.condition)}
                              </div>
                            )}
                          </div>
                          
                          <div className="p-2 sm:p-2.5 flex flex-col gap-1.5 sm:gap-2">
                            {/* Title */}
                            <h3 className="text-base sm:text-lg font-bold text-gray-800 truncate leading-tight mb-0.5 px-2">
                              {phone.brand}
                            </h3>
                            <h4 className="text-sm sm:text-base font-medium text-gray-700 truncate leading-tight mb-1 px-2">
                              {phone.model}
                            </h4>

                            {/* Specs Line */}
                            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-500 truncate font-bold">
                              {phone.specs?.ram && <span>{phone.specs.ram}GB</span>}
                              {phone.specs?.storage && (
                                <>
                                  <span className="w-0.5 h-0.5 rounded-full bg-gray-400"></span>
                                  <span>{phone.specs.storage}GB</span>
                                </>
                              )}

                            </div>



                            {/* Price */}
                            <div className="mt-0.5 flex items-center justify-between">
                              <div className="text-purple-700 font-bold text-base sm:text-lg" dir="ltr">
                                {phone.price.toLocaleString('en-US')} <span className="text-xs font-normal text-gray-500">{t('currency_short')}</span>
                              </div>
                              {phone.is_verified && (
                                <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-100 font-medium">
                                  {t('verified')}
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>
                      </SwiperSlide>
                    );
                  })}
                </Swiper>
              ) : (
                <div className="col-span-2 lg:col-span-4 text-center py-8 text-white/70">
                  {t('no_phones_for_sale')}
                </div>
              )}
            </div>
          </div>

          {/* قسم الإكسسوارات المعروضة للبيع */}
          <div className="mb-5">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-black text-xl font-bold">{t('accessories')}</h2>
              <Link to="/accessories-for-sale" className="text-black hover:text-imei-cyan/80 text-sm font-medium leading-none">
                {t('view_all')}
              </Link>
            </div>
            <div className="relative">
              {loadingAccessories ? (
                <div className="text-center py-8 text-white/70">{t('loading_accessories')}</div>
              ) : accessoryListings.length > 0 ? (
                <Swiper
                  spaceBetween={12}
                  slidesPerView={2.1}
                  breakpoints={{
                    640: { slidesPerView: 3.2 },
                    768: { slidesPerView: 4.2 },
                    1024: { slidesPerView: 5.2 },
                  }}
                  className="!static"
                >
                  {accessoryListings.map((acc) => (
                    <SwiperSlide
                      key={acc.id}
                      onClick={() => navigate(`/product/${acc.id}`)}
                      className="cursor-pointer"
                    >
                      <div className={`relative bg-blue-100 rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition-all duration-300 group flex flex-col h-[280px] ring-1 ring-gray-300/50 ${acc.type === 'promotions' ? 'border-2 border-yellow-400 shadow-lg shadow-yellow-100' : 'border-2 border-gray-200'}`}>
                        <Link
                          to={`/product/${acc.id}`}
                          className="flex flex-col h-full"
                      >
                        {/* الشريط العلوي للإعلانات المميزة */}
                        {acc.type === 'promotions' && <div className="h-1.5 bg-gradient-to-r from-yellow-400 to-amber-500"></div>}
                        <div className="relative w-full h-[200px] bg-gray-50">
                          {acc.accessory_images?.[0]?.image_path ? (
                            <img
                              src={getTransformedAccessoryImageUrl(getAccessoryMainImage(acc))}
                              alt={acc.title || 'صورة الإكسسوار'}
                              className="absolute inset-0 w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100">
                              <Smartphone className="w-12 h-12 text-gray-300" />
                            </div>
                          )}
                          {/* شارة "مميز" */}
                          {acc.type === 'promotions' && (
                            <div className="absolute top-2 left-1.5 bg-yellow-400/90 backdrop-blur-[2px] text-black text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm z-10 flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5 text-black" />
                              <span>{t('featured')}</span>
                            </div>
                          )}

                          {/* شارة الضمان */}
                          {acc.warranty_months && acc.warranty_months > 0 && (
                            <div className="absolute bottom-1 right-1 bg-blue-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                              {t('warranty_months').replace('{months}', acc.warranty_months.toString())}
                            </div>
                          )}
                        </div>
                        
                        <div className="p-2.5 flex flex-col gap-2 bg-white">
                          {/* Title */}
                          <h3 className="text-lg font-bold text-gray-800 truncate leading-tight mb-0.5">
                            {acc.title}
                          </h3>

                          {/* Category and Brand */}
                          <div className="flex items-center gap-2 text-xs text-gray-500 truncate font-medium">
                            {acc.category && <span>{acc.category}</span>}
                            {acc.category && acc.brand && <span className="w-0.5 h-0.5 rounded-full bg-gray-400"></span>}
                            {acc.brand && <span>{acc.brand}</span>}
                          </div>

                          {/* Price */}
                          <div className="mt-0.5 flex items-center justify-between">
                            <div className="text-purple-700 font-bold text-lg" dir="ltr">
                              {acc.price.toLocaleString('en-US')} <span className="text-xs font-normal text-gray-500">{t('currency_short')}</span>
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${acc.condition === 'used' ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-cyan-50 text-cyan-700 border-cyan-100'}`}>
                              {t(acc.condition)}
                            </span>
                          </div>
                        </div>
                        </Link>
                      </div>
                    </SwiperSlide>
                  ))}
                </Swiper>
              ) : (
                <div className="col-span-2 lg:col-span-4 text-center py-8 text-white/70">
                  {t('no_accessories_for_sale')}
                </div>
              )}
            </div>
          </div>

          {/* قسم العب واكسب */}
          <div className="my-5">
            <h2 className="text-black text-xl font-bold mb-3">{t('play_and_win')}</h2>
            <Link to="/challenge-game">
              <div
                className="border border-imei-cyan/30 rounded-lg p-3 flex justify-between items-center cursor-pointer hover:border-imei-cyan/40 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-lg hover:shadow-imei-cyan/10"
                style={{ background: 'linear-gradient(to top, #053060 0%, #0a4d8c 100%)' }}
              >
                <div>
                  <h3 className="text-white font-bold text-xl mb-1">{t('time_challenge')}</h3>
                  <p className="text-imei-cyan/80 text-sm">{t('tap_and_win')}</p>
                </div>
                <div className="font-mono text-2xl text-orange-400 bg-black/30 px-4 py-2 rounded-full border border-orange-500/100 shadow-inner flex items-center gap-1">
                  <span>🎮</span>
                  <span>{t('go')}</span>
                </div>
              </div>
            </Link>
          </div>


          {/* قسم الهواتف المفقودة */}
          <div className="mb-5">
            <h2 className="text-black text-xl font-bold mb-3">{t('lost_phones')}</h2>
            {loadingPhones ? (
              <div className="text-center text-white/70 py-8">{t('loading_lost_phones')}</div>
            ) : (
              <>
                <div className="flex justify-center">
                  {displayedPhones.length > 0 && (() => {
                    const phone = displayedPhones[phoneIndex] || displayedPhones[0];
                    const safeKey = phone?.id ?? phone?.imei ?? phoneIndex;
                    return (
                      <div className="w-full max-w-md animate-fade-in-out" style={{ minHeight: '60px' }}>
                        <LostPhoneCard
                          key={safeKey}
                          imei={phone?.masked_imei || phone?.imei}
                          phoneType={phone?.phone_type || phone?.phoneType}
                        />
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <AdPopupModal
          isOpen={isAdModalOpen}
          onClose={() => setIsAdModalOpen(false)}
          ads={popupAds}
          userLocation={coords ? { latitude: coords.latitude, longitude: coords.longitude } : null}
        />
      </Suspense>

      <Suspense fallback={<div>Loading...</div>}>
        <OwnershipConfirmationModal
          isOpen={showOwnershipConfirmation}
          onClose={() => setShowOwnershipConfirmation(false)}
          phones={phonesForConfirmation}
          onConfirm={handleConfirmOwnership}
          onDeny={handleDenyOwnership}
        />
      </Suspense>
      
      {/* نافذة تأكيد ملكية الهواتف غير المطالب بها */}
      <Dialog open={showClaimModal} onOpenChange={setShowClaimModal}>
        <DialogContent className="bg-white/90 backdrop-blur-lg text-gray-800 w-[90%] sm:max-w-md border-2 border-orange-400 shadow-2xl rounded-2xl">
          <DialogHeader className="text-center">
            <div className="mx-auto bg-orange-100 p-3 rounded-full mb-4 border-2 border-orange-300">
              <Smartphone className="w-10 h-10 text-orange-500" />
            </div>
            <DialogTitle className="text-2xl font-bold text-gray-900">
              {t('found_unclaimed_phone') || 'تم العثور على هاتف مسجل ببريدك'}
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              {t('do_you_own_this_phone') || 'هل تملك هذا الهاتف؟'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-4">
            {unclaimedPhones.map((phone, index) => (
              <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col gap-2 hover:bg-orange-50 transition-colors">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">{t('phone_type')}:</span>
                  <span className="text-gray-800 font-bold">{phone.phone_type}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">IMEI:</span>
                  <span className="text-orange-600 font-mono">{phone.imei}</span>
                </div>
                <Button onClick={() => handleClaimPhone(phone.imei)} className="mt-2 w-full bg-orange-500 hover:bg-orange-600 text-white shadow-md">
                  {t('yes_i_own_it') || 'نعم، أملك هذا الهاتف'}
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* تم نقل زر إنشاء الإعلان إلى App.tsx لضمان ثباته */}

      <div
        className={`sticky bottom-0 z-40 transition-transform duration-300 ease-in-out ${isNavbarVisible ? 'translate-y-0' : 'translate-y-full'} bg-transparent`}
        style={{ willChange: 'transform' }}
      >
        <BottomNavbar />
      </div>

    </PageContainer>
  );
};

export default Dashboard;