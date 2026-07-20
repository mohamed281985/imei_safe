import localAdImage from '@/assets/images/ads/default_ad.jpeg';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { Capacitor } from '@capacitor/core';
import axiosInstance from '@/services/axiosInterceptor';

// دالة تحويل الدرجات إلى راديان
function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

// دالة حساب المسافة بين نقطتين (Haversine) بالكيلومتر
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // نصف قطر الأرض بالكيلومتر
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return d;
}

// ⭐ واجهة الإعلان المدمج (من publish_ad + ads_payment)
interface AdDisplay {
  id: string;
  image_url: string;
  latitude?: number | null;
  longitude?: number | null;
  expires_at?: string | null;
  distance?: number;
  whatsapp?: boolean | number | string;
  phone?: string;
  transaction?: string; // إضافة حقل transaction

}

interface PageAdvertisementProps {
  pageName: string;
}

const PageAdvertisement = ({ pageName }: PageAdvertisementProps) => {
  const { t } = useLanguage();
  const [ads, setAds] = useState<AdDisplay[]>([]);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [showLocalAd, setShowLocalAd] = useState(true);
  const [imagesReady, setImagesReady] = useState(false);
  const [lastShownIndex, setLastShownIndex] = useState<number | null>(null);

  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || 'https://imei-safe.me';

  // دالة لخلق ترتيب عشوائي مع عدم تكرار الصور المتتالية
  const getRandomAdIndex = (currentIndex: number, lastIndex: number | null) => {
    if (ads.length <= 1) return 0;

    const availableIndices = ads.map((_, index) => index);

    // إذا كان هناك آخر فهرس معروض، نستبعده من الاختيار
    if (lastIndex !== null) {
      availableIndices.splice(lastIndex, 1);
    }

    // اختيار فهرس عشوائي من الفهارس المتاحة
    const randomIndex = Math.floor(Math.random() * availableIndices.length);
    return availableIndices[randomIndex];
  };

  useEffect(() => {
    // ⭐ مفتاح إصدار الكاش - تغييره يبطل الكاش القديم
    const CACHE_VERSION = 'v3';
    const cacheKey = `page-ads-${pageName}-${CACHE_VERSION}`;

    // تنظيف الكاش القديم (الذي بدون إصدار أو بإصدار مختلف)
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(`page-ads-${pageName}`) && key !== cacheKey) {
        localStorage.removeItem(key);
      }
    });

    // جلب الموقع الجغرافي ثم الإعلانات
    if (!('geolocation' in navigator)) {
      fetchAds(null, cacheKey);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        fetchAds(coords, cacheKey);
      },
      () => {
        fetchAds(null, cacheKey);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, [pageName]);

  // ⭐ الاعتماد على publish_ad فقط - وجود السجل فيه يعني موافقة الأدمن
  const fetchAds = async (coords: { latitude: number; longitude: number } | null, cacheKey: string) => {
    const now = new Date();
    const nowISO = now.toISOString();
    // ===== جلب الإعلانات المعتمدة من publish_ad مع بيانات ads_payment =====
    const { data: publishedAds, error: pubError } = await supabase
      .from('publish_ad')
      .select(`
  ad_id,
  image_url,
  latitude,
  longitude,
  expires_at,
  whatsapp,
  phone,
  transaction
`).eq('is_active', true)
      .gt('expires_at', nowISO)
      .order('created_at', { ascending: false });

    if (pubError || !publishedAds || publishedAds.length === 0) {
      setShowLocalAd(true);
      setAds([]);
      localStorage.setItem(cacheKey, JSON.stringify([]));
      return;
    }

    // ===== تحويل البيانات من Join إلى AdDisplay =====
    const mergedAds: AdDisplay[] = publishedAds
      .map((ad: any) => {
        if (ad.expires_at && new Date(ad.expires_at) <= now) return null;

        return {
          id: ad.ad_id,
          image_url: ad.image_url,
          latitude: ad.latitude,
          longitude: ad.longitude,
          expires_at: ad.expires_at,
          whatsapp: ad.whatsapp,
          phone: ad.phone,
          transaction: ad.transaction,
        };
      })
      .filter(Boolean) as AdDisplay[];

    if (mergedAds.length === 0) {
      setShowLocalAd(true);
      setAds([]);
      localStorage.setItem(cacheKey, JSON.stringify([]));
      return;
    }

    // ===== الفلترة والترتيب حسب الموقع الجغرافي =====
    let nearbyAds: AdDisplay[] = [];
    let adminAds: AdDisplay[] = [];

    if (coords) {
      // البحث عن الإعلانات القريبة
      nearbyAds = mergedAds
        .filter(ad => ad.latitude && ad.longitude)
        .map(ad => ({
          ...ad,
          distance: getDistanceFromLatLonInKm(coords.latitude, coords.longitude, ad.latitude!, ad.longitude!)
        }))
        .sort((a, b) => a.distance - b.distance);

      // أولاً، حاول العثور على إعلانات في نطاق 3 كم
      nearbyAds = nearbyAds.filter(ad => ad.distance <= 3);

      // إذا لم يتم العثور على إعلانات في نطاق 3 كم، حاول البحث حتى 30 كم
      if (nearbyAds.length === 0) {
        nearbyAds = mergedAds
          .filter(ad => ad.latitude && ad.longitude)
          .map(ad => ({
            ...ad,
            distance: getDistanceFromLatLonInKm(coords.latitude, coords.longitude, ad.latitude!, ad.longitude!)
          }))
          .filter(ad => ad.distance <= 30)
          .sort((a, b) => a.distance - b.distance);
      }
    }

    // البحث عن إعلانات المسؤول
    // إعلانات الأدمن (تظهر دائماً)
    adminAds = mergedAds.filter(
      ad => ad.transaction === 'admin_publish'
    );

    // الإعلانات النهائية
    const map = new Map<string, AdDisplay>();

    // أولاً أضف الإعلانات القريبة
    nearbyAds.forEach(ad => map.set(ad.id, ad));

    // ثم أضف إعلانات الأدمن (ستظهر دائماً)
    adminAds.forEach(ad => map.set(ad.id, ad));

    const fetchedAds = Array.from(map.values());

    if (fetchedAds.length > 0) {
      setImagesReady(false);
      setAds(fetchedAds);
      setCurrentAdIndex(0);
      setLastShownIndex(null);
      setShowLocalAd(false);
      localStorage.setItem(cacheKey, JSON.stringify(fetchedAds));
    }
  };

  // دالة لتحميل الصور مسبقاً
  const preloadImages = async (imageUrls: string[]) => {
    const promises = imageUrls.map(url => {
      return new Promise<void>((resolve) => {
        if (!url) return resolve();

        const img = new Image();

        img.onload = () => resolve();
        img.onerror = () => resolve();

        img.src = url;
      });
    });

    await Promise.all(promises);

    setImagesReady(true);
  };

  // تأثير منفصل لتحميل الصور مسبقاً عند تغير قائمة الإعلانات فقط
  useEffect(() => {
    if (ads.length > 0) {
      preloadImages(
        ads.map(ad => ad.image_url).filter(Boolean)
      );
    }
  }, [ads]);

  // ⭐ Modified: التفاعل: الحصول على الرابط النهائي من الخادم وفتحه مباشرة
  const openAdRedirect = async (id: string) => {
    try {
      // جلب الرابط الحقيقي أولاً لتجنب فتح المتصفح لمجرد معالجة التوجيه
      const response = await axiosInstance.get(`/api/ad-website-decrypted-public/${id}`);
      const targetUrl = response.data?.website_url;

      if (targetUrl) {
        if (Capacitor.isNativePlatform()) {
          // ⭐ Modified: فتح الرابط في المتصفح الخارجي أو تطبيق النظام (مثل WhatsApp)
          // استخدام '_system' يضمن فتح الرابط خارج الـ WebView
          window.open(targetUrl, '_system');
        } else {
          // على الويب: استخدام window.open بدلاً من location.href لضمان الفتح في نافذة جديدة
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }
      }
    } catch (error) {
      console.error('Failed to resolve and open ad URL:', error);
      // fallback: استخدام رابط التوجيه التقليدي من الخادم
      const apiUrl = `${API_BASE_URL.replace(/\/+$/, '')}/api/ad-redirect/${id}`;
      if (Capacitor.isNativePlatform()) {
        // ⭐ Modified: نفس التعديل هنا لضمان الفتح الصحيح في حالة الخطأ
        window.open(apiUrl, '_system');
      } else {
        window.open(apiUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  // تأثير لتحديث الإعلان بشكل عشوائي
  useEffect(() => {
    if (!imagesReady) return;
    if (ads.length <= 1) return;

    const timer = setTimeout(() => {
      const next = getRandomAdIndex(currentAdIndex, currentAdIndex);

      setLastShownIndex(currentAdIndex);
      setCurrentAdIndex(next);
    }, 2000);

    return () => clearTimeout(timer);
  }, [currentAdIndex, ads, imagesReady]);

  // الحالة الحالية لإعلان معالج (تُستخدم للتمكين/التعطيل)
  const currentAd = ads[currentAdIndex];
  const isWhatsappEnabled = (() => {
    const w = currentAd?.whatsapp;
    if (w === true) return true;
    if (w === false || w == null) return false;
    if (typeof w === 'number') return w === 1;
    if (typeof w === 'string') {
      const lw = w.toLowerCase();
      return lw === 'true' || w === '1';
    }
    return false;
  })();
  const isClickable = isWhatsappEnabled; // الصورة قابلة للضغط فقط إذا كان الواتساب مفعل

  if (showLocalAd) {
      return (
      <div className="sticky top-1 z-10">
        <div className="rounded-2xl overflow-hidden shadow-2xl w-full h-[160px] relative bg-black" style={{ position: 'relative' }}>
          <img src={localAdImage} alt={t('local_ad')} style={{ width: '100%', height: '100%', display: 'block', position: 'relative' }} />
        </div>
      </div>
    );
  }
  if (!ads || ads.length === 0) return null;

  return (
    <div className="sticky top-1 z-10">
      {currentAdIndex < ads.length && (
        <div className="rounded-2xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.18)] w-full h-[160px] relative bg-gray-100 mb-3 ring-1 ring-black/5" style={{ position: 'relative' }}>
          <div
            className={`block w-full h-full relative ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            style={{ position: 'relative' }}
            onClick={(e) => {
              e.preventDefault();
              if (!isClickable) return;
              openAdRedirect(ads[currentAdIndex].id);
            }}
          >
            <img
              src={ads[currentAdIndex]?.image_url}
              alt={t('advertisement')}
              style={{ width: '100%', height: '100%', display: 'block', cursor: isClickable ? 'pointer' : 'not-allowed', opacity: isClickable ? 1 : 0.8 }}
              onClick={(e) => {
                e.stopPropagation();
                if (!isClickable) return;
                openAdRedirect(ads[currentAdIndex].id);
              }}
            />
            {/* زر الواتساب - يظهر فقط إذا كان مفعلًا في السجل */}
            {isWhatsappEnabled && (
              <div
                className="absolute bottom-2 left-2 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-xl z-20 flex items-center gap-1 border border-white cursor-pointer hover:scale-105 transition-transform"
                style={{ direction: 'rtl' }}
                onClick={(e) => {
                  e.stopPropagation(); // منع النقر المزدوج مع الصورة
                  openAdRedirect(ads[currentAdIndex].id);
                }}
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                {t('click_to_contact')}
              </div>
            )}
          </div>
          {/* زر الموقع الجغرافي */}
          {ads[currentAdIndex]?.latitude && ads[currentAdIndex]?.longitude && (
            <div className="absolute bottom-2 right-2 z-20 w-auto">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation(); // منع النقر على الصورة
                  const ad = ads[currentAdIndex];
                  const url = `https://www.google.com/maps/search/?api=1&query=${ad.latitude},${ad.longitude}`;

                  if (Capacitor.isNativePlatform()) {
                    window.open(url, '_system');
                  } else {
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }
                }}
                className="py-1 px-6 sm:px-12 md:px-20 bg-black/70 backdrop-blur-sm text-white rounded-full shadow-xl hover:bg-black/50 transition-all text-sm sm:text-base font-bold flex items-center justify-center gap-2"
                style={{ direction: 'rtl' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#EF4444" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 6.25 12.25 6.53 12.53.29.29.76.29 1.06 0C12.75 21.25 19 14.25 19 9c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" />
                </svg>
                {t('store_location_btn')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PageAdvertisement;
