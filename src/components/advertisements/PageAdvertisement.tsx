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

interface ads_payment {
  id: number;
  image_url: string;
  is_active: boolean;
  page: string;
  website_url?: string;
  latitude?: number;
  longitude?: number;
  shop_location?: string;
  expires_at?: string;
}

interface PageAdvertisementProps {
  pageName: string;
}

const PageAdvertisement = ({ pageName }: PageAdvertisementProps) => {
  const { t } = useLanguage();
  const [ads, setAds] = useState<ads_payment[]>([]);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [showLocalAd, setShowLocalAd] = useState(true);

  useEffect(() => {
    const cacheKey = `page-ads-${pageName}`;
    // 1. محاولة تحميل الإعلانات من ذاكرة التخزين المؤقت أولاً
    const cachedAdsRaw = localStorage.getItem(cacheKey);
    if (cachedAdsRaw) {
      const cachedAds: ads_payment[] = JSON.parse(cachedAdsRaw);
      const now = new Date();
      const validCachedAds = cachedAds.filter(ad => ad.expires_at && new Date(ad.expires_at) > now);
      if (validCachedAds.length > 0) {
        setAds(validCachedAds);
        setShowLocalAd(false);
      }
    }

    // جلب الموقع الجغرافي ثم الإعلانات
    if (!('geolocation' in navigator)) {
      // إذا لم يكن هناك إذن للموقع، جلب الإعلانات العالمية فقط
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

  const fetchAds = async (coords: { latitude: number; longitude: number } | null) => {
    const cacheKey = `page-ads-${pageName}`;
    const { data } = await supabase
      .from('ads_payment')
      .select('*')
      .gt('expires_at', new Date().toISOString()) // <-- إضافة شرط للتحقق من تاريخ الانتهاء
      .eq('is_active', true) // <-- إضافة شرط لجلب الإعلانات النشطة فقط
      .eq('is_paid', true)
      .eq('type', 'publish')
      .eq('payment_status', 'paid') // التأكد من أن الدفع مكتمل
      .order('upload_date', { ascending: false });

    // فلترة إضافية للتأكد من عدم عرض الإعلانات المنتهية
    const now = new Date();
    const activeAds = data ? data.filter(ad => ad.expires_at && new Date(ad.expires_at) > now) : [];

    if (!activeAds || activeAds.length === 0) {
      setShowLocalAd(true);
      setAds([]);
      localStorage.setItem(cacheKey, JSON.stringify([]));
      return;
    }

    const globalAds = activeAds.filter(ad => ad.latitude == null && ad.longitude == null);
    let fetchedAds = globalAds;

    if (coords) {
      const nearbyAds = activeAds
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
      fetchedAds = uniqueAds; // تحديث القائمة النهائية
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

  if (showLocalAd) {
    return (
      <div className="sticky top-10 z-10">
        <div className="rounded-lg overflow-hidden shadow-md w-full aspect-video relative bg-gray-100">
          <img src={localAdImage} alt={t('local_ad')} className="w-full h-full object-cover absolute inset-0" />
        </div>
      </div>
    );
  }
  if (!ads || ads.length === 0) return null;

  return (
    <div className="sticky top-10 z-10">
      {ads && ads.length > 0 && currentAdIndex < ads.length && (
        <>
          <div className="rounded-lg overflow-hidden shadow-md w-full aspect-video relative bg-gray-100">
            {ads[currentAdIndex]?.website_url ? (
              <a
                href={ads[currentAdIndex].website_url}
                target="_blank"
                rel="noopener noreferrer"
                title={t('click_to_visit_ad_link')}
                className="block w-full h-full relative"
              >
                <img
                  src={ads[currentAdIndex]?.image_url}
                  alt={t('advertisement')}
                  className="w-full h-full object-cover absolute inset-0 cursor-pointer"
                />
                <div
                  className="absolute bottom-2 left-2 bg-orange-500 text-black text-xs font-bold px-3 py-1 rounded shadow-lg z-20"
                  style={{ direction: 'rtl', pointerEvents: 'none' }}
                >
                  {t('click_to_contact')}
                </div>
              </a>
            ) : (
              <img
                src={ads[currentAdIndex]?.image_url}
                alt={t('advertisement')}
                className="w-full h-full object-cover absolute inset-0"
              />
            )}
            {/* ⭐ تم نقل الزر هنا ليكون فوق الصورة */}
            {ads[currentAdIndex]?.latitude && ads[currentAdIndex]?.longitude && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 w-auto">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    const ad = ads[currentAdIndex];
                    const url = `https://www.google.com/maps/search/?api=1&query=${ad.latitude},${ad.longitude}`;
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  className="py-2 px-6 sm:px-12 md:px-20 bg-black/70 backdrop-blur-sm text-white rounded-full shadow-lg hover:bg-black/50 transition-all text-sm sm:text-base font-bold flex items-center justify-center gap-2"
                  style={{ direction: 'rtl' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 6.25 12.25 6.53 12.53.29.29.76.29 1.06 0C12.75 21.25 19 14.25 19 9c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" />
                  </svg>
                  {t('store_location')}
                </button>
              </div>
            )}
            {/* نقاط التنقل */}
            {ads.length > 1 && (
              <div className="absolute bottom-2 right-2 z-20 flex space-x-2" style={{ direction: 'ltr' }}>
                {ads.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentAdIndex(index)}
                    className={`h-2 w-2 rounded-full transition-all duration-300 ${
                      currentAdIndex === index ? 'bg-white scale-125' : 'bg-white/50'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default PageAdvertisement;
