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

import localAdImage from '@/assets/images/ads/default_ad.jpeg';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { Capacitor } from '@capacitor/core';

// ⭐ واجهة الإعلان المدمج (من publish_ad + ads_payment)
interface AdDisplay {
  id: string;
  image_url: string;
  latitude?: number | null;
  longitude?: number | null;
  expires_at?: string | null;
  distance?: number;
}

interface PageAdvertisementProps {
  pageName: string;
}

const PageAdvertisement = ({ pageName }: PageAdvertisementProps) => {
  const { t } = useLanguage();
  const [ads, setAds] = useState<AdDisplay[]>([]);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [showLocalAd, setShowLocalAd] = useState(true);

  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || 'https://imei-safe.me';

  useEffect(() => {
    const cacheKey = `page-ads-${pageName}`;
    // 1. محاولة تحميل الإعلانات من ذاكرة التخزين المؤقت أولاً
    const cachedAdsRaw = localStorage.getItem(cacheKey);
    if (cachedAdsRaw) {
      const cachedAds: AdDisplay[] = JSON.parse(cachedAdsRaw);
      const now = new Date();
      const validCachedAds = cachedAds.filter(ad => ad.expires_at && new Date(ad.expires_at) > now);
      if (validCachedAds.length > 0) {
        setAds(validCachedAds);
        setShowLocalAd(false);
      }
    }

    // جلب الموقع الجغرافي ثم الإعلانات
    if (!('geolocation' in navigator)) {
      fetchAds(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        fetchAds(coords);
      },
      () => {
        fetchAds(null);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, [pageName]);

  // ⭐ الاستعلام المزدوج: publish_ad (سريع) + ads_payment (للموقع وتاريخ الانتهاء)
  const fetchAds = async (coords: { latitude: number; longitude: number } | null) => {
    const cacheKey = `page-ads-${pageName}`;
    const now = new Date();

    // ===== الاستعلام الأول: جلب ad_id و image_url من publish_ad (سريع جداً) =====
    const { data: publishedAds, error: pubError } = await supabase
      .from('publish_ad')
      .select('ad_id, image_url')
      .order('created_at', { ascending: false });

    if (pubError || !publishedAds || publishedAds.length === 0) {
      setShowLocalAd(true);
      setAds([]);
      localStorage.setItem(cacheKey, JSON.stringify([]));
      return;
    }

    // ===== الاستعلام الثاني: جلب latitude, longitude, expires_at من ads_payment فقط =====
    const adIds = publishedAds.map((ad: any) => ad.ad_id).filter(Boolean);
    const { data: paymentAds, error: payError } = await supabase
      .from('ads_payment')
      .select('id, latitude, longitude, expires_at, is_active, is_paid, payment_status')
      .in('id', adIds);

    if (payError || !paymentAds || paymentAds.length === 0) {
      setShowLocalAd(true);
      setAds([]);
      localStorage.setItem(cacheKey, JSON.stringify([]));
      return;
    }

    // ===== دمج البيانات من الجدولين =====
    const paymentMap = new Map(paymentAds.map((ad: any) => [ad.id, ad]));

    const mergedAds: AdDisplay[] = publishedAds
      .map((pubAd: any) => {
        const payAd = paymentMap.get(pubAd.ad_id);
        if (!payAd) return null;

        // ⭐ فلترة: استبعاد الإعلانات غير النشطة أو غير المدفوعة أو المنتهية
        if (!payAd.is_active || !payAd.is_paid || payAd.payment_status !== 'paid') return null;
        if (payAd.expires_at && new Date(payAd.expires_at) <= now) return null;

        return {
          id: pubAd.ad_id,
          image_url: pubAd.image_url,
          latitude: payAd.latitude ?? null,
          longitude: payAd.longitude ?? null,
          expires_at: payAd.expires_at ?? null,
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
    const globalAds = mergedAds.filter(ad => ad.latitude == null && ad.longitude == null);
    let fetchedAds: AdDisplay[] = globalAds;

    if (coords) {
      const nearbyAds = mergedAds
        .filter(ad => ad.latitude && ad.longitude)
        .map(ad => ({
          ...ad,
          distance: getDistanceFromLatLonInKm(coords.latitude, coords.longitude, ad.latitude!, ad.longitude!)
        }))
        .sort((a, b) => a.distance - b.distance);

      // أولاً، حاول العثور على إعلانات في نطاق 3 كم
      const inRangeAds = nearbyAds.filter(ad => ad.distance <= 3);

      // إذا لم يتم العثور على إعلانات في نطاق 3 كم، حاول البحث حتى 30 كم
      let finalNearbyAds = inRangeAds;
      if (inRangeAds.length === 0 && nearbyAds.length > 0) {
        finalNearbyAds = nearbyAds.filter(ad => ad.distance <= 30);
      }

      const allAds = [...finalNearbyAds, ...globalAds];
      const uniqueAds = Array.from(new Map(allAds.map(ad => [ad.id, ad])).values());
      fetchedAds = uniqueAds;
    }

    if (fetchedAds && fetchedAds.length > 0) {
      setAds(fetchedAds);
      setShowLocalAd(false);
      localStorage.setItem(cacheKey, JSON.stringify(fetchedAds));
    }
  };

  // دالة لتحميل الصور مسبقاً
  const preloadImages = (imageUrls: string[]) => {
    imageUrls.forEach(url => {
      if (url) {
        const img = new Image();
        img.src = url;
      }
    });
  };

  useEffect(() => {
    if (!ads || ads.length <= 1) return;

    // تحميل جميع الصور مسبقاً عند تغيير الإعلانات
    const imageUrls = ads.map(ad => ad.image_url).filter(Boolean);
    preloadImages(imageUrls);

    const timer = setInterval(() => {
      setCurrentAdIndex((prevIndex) => {
        if (!ads || ads.length === 0) return 0;
        const nextIndex = (prevIndex + 1) % ads.length;

        // تحميل الصورة التالية مسبقاً
        if (ads[nextIndex]?.image_url) {
          const img = new Image();
          img.src = ads[nextIndex].image_url;
        }

        return nextIndex;
      });
    }, 2000);

    return () => clearInterval(timer);
  }, [ads.length, currentAdIndex, ads]);

  // ⭐ التفاعل: إرسال ad_id فقط للخادم والاعتماد عليه في فك التشفير والتوجيه
  const openAdRedirect = async (id: string) => {
    const baseUrl = API_BASE_URL.replace(/\/+$/, '');

    try {
      // استخدام نقطة /api/ad-redirect/:id - الخادم يتحقق ويفك التشفير ويوجه
      const apiUrl = `${baseUrl}/api/ad-redirect/${id}`;

      if (Capacitor.isNativePlatform()) {
        // في التطبيق الأصلي: فتح الرابط عبر المتصفح الخارجي
        window.open(apiUrl, '_system');
      } else {
        // في المتصفح العادي: توجيه مباشر
        window.location.href = apiUrl;
      }
    } catch (error) {
      console.error('Failed to open ad redirect URL:', error);
      // fallback: محاولة فتح الرابط مباشرة
      const apiUrl = `${baseUrl}/api/ad-redirect/${id}`;
      window.open(apiUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (showLocalAd) {
    return (
      <div className="sticky top-1 z-10">
        <div className="rounded-lg overflow-hidden shadow-2xl w-full aspect-video relative bg-black">
          <img src={localAdImage} alt={t('local_ad')} className="w-full h-full object-cover absolute inset-0" />
        </div>
      </div>
    );
  }
  if (!ads || ads.length === 0) return null;

  return (
    <div className="sticky top-1 z-10">
      {ads && ads.length > 0 && currentAdIndex < ads.length && (
        <>
          <div className="rounded-lg overflow-hidden shadow-[0_5px_8px_rgba(0,0,0,0.6)] w-full aspect-video relative bg-gray-100 mb-3 ring-1 ring-black/5">
            <div
              className="block w-full h-full relative cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                openAdRedirect(ads[currentAdIndex].id);
              }}
            >
              <img
                src={ads[currentAdIndex]?.image_url}
                alt={t('advertisement')}
                className="w-full h-full object-cover absolute inset-0 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  openAdRedirect(ads[currentAdIndex].id);
                }}
              />
              {/* زر الواتساب - يظهر دائماً لأن التفاعل يفتح الواتساب */}
              <div
                className="absolute bottom-2 left-2 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-xl z-20 flex items-center gap-1 border border-white"
                style={{ direction: 'rtl', pointerEvents: 'none' }}
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                {t('click_to_contact')}
              </div>
            </div>
            {/* زر الموقع الجغرافي */}
            {ads[currentAdIndex]?.latitude && ads[currentAdIndex]?.longitude && (
              <div className="absolute bottom-2 right-2 z-20 w-auto">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    const ad = ads[currentAdIndex];
                    const url = `https://www.google.com/maps/search/?api=1&query=${ad.latitude},${ad.longitude}`;
                    window.open(url, '_blank', 'noopener,noreferrer');
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
        </>
      )}
    </div>
  );
};

export default PageAdvertisement;
