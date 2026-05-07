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

interface publish_ad {
  id: number;
  image_url: string;
  is_active?: boolean;
  page?: string;
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
  const [ads, setAds] = useState<publish_ad[]>([]);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [showLocalAd, setShowLocalAd] = useState(true);

  // cache of already preloaded image URLs to avoid duplicate requests
  const preloadedImageUrls = new Set<string>();

  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || 'https://imei-safe.me';

  useEffect(() => {
    const cacheKey = `page-ads-${pageName}`;
    // 1. محاولة تحميل الإعلانات من ذاكرة التخزين المؤقت أولاً
    const cachedAdsRaw = localStorage.getItem(cacheKey);
    if (cachedAdsRaw) {
      const cachedAds: publish_ad[] = JSON.parse(cachedAdsRaw);
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
      .from('publish_ad')
      .select('id,image_url,website_url,latitude,longitude,expires_at')
      .gt('expires_at', new Date().toISOString()) // <-- إضافة شرط للتحقق من تاريخ الانتهاء
      .eq('is_active', true) // <-- إضافة شرط لجلب الإعلانات النشطة فقط
      .eq('is_paid', true)
      .eq('payment_status', 'paid') // التأكد من أن الدفع مكتمل
      .order('upload_date', { ascending: false });

    // فك تشفير website_url لكل إعلان
    const decryptedAds = data ? await Promise.all(
      data.map(async (ad) => {
        let decryptedWebsiteUrl = ad.website_url;

        // إذا كان website_url مشفر، حاول فك تشفيره
        if (ad.website_url && typeof ad.website_url === 'string' && 
            (ad.website_url.includes('{') || ad.website_url.includes('encryptedData'))) {
          try {
            const response = await fetch(`${API_BASE_URL}/api/ad-website-decrypted/${ad.id}`);
            const result = await response.json();
            if (result.success && result.website_url) {
              decryptedWebsiteUrl = result.website_url;
            }
          } catch (error) {
            console.error('Error decrypting website_url:', error);
          }
        }

        return {
          ...ad,
          website_url: decryptedWebsiteUrl
        };
      })
    ) : [];

    // فلترة إضافية للتأكد من عدم عرض الإعلانات المنتهية
    const now = new Date();
    const activeAds = decryptedAds ? decryptedAds.filter(ad => ad.expires_at && new Date(ad.expires_at) > now) : [];

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
        .filter(ad => ad.latitude != null && ad.longitude != null)
        .map(ad => ({
          ...ad,
          distance: getDistanceFromLatLonInKm(coords.latitude, coords.longitude, Number(ad.latitude), Number(ad.longitude))
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
      // normalize fields: trim image_url and parse lat/lon to numbers
      const normalized = fetchedAds.map(ad => ({
        id: ad.id,
        image_url: (ad.image_url || '').toString().trim(),
        website_url: ad.website_url || undefined,
        latitude: ad.latitude != null ? Number(ad.latitude) : undefined,
        longitude: ad.longitude != null ? Number(ad.longitude) : undefined,
        expires_at: ad.expires_at || undefined
      }));

      setAds(normalized as publish_ad[]);
      setShowLocalAd(false);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(normalized));
      } catch (e) {
        console.warn('Failed to write ads cache', e);
      }
    }
  };

  // دالة لتحميل الصور مسبقاً مع تجنّب الازدواجية
  const preloadImages = (imageUrls: string[]) => {
    imageUrls.forEach(url => {
      if (!url) return;
      const u = url.toString().trim();
      if (!u || preloadedImageUrls.has(u)) return;
      const img = new Image();
      img.onload = () => preloadedImageUrls.add(u);
      img.onerror = () => preloadedImageUrls.add(u);
      img.src = u;
    });
  };

  // preload images when the ads list changes (once)
  useEffect(() => {
    if (!ads || ads.length === 0) return;
    const imageUrls = ads.map(ad => ad.image_url).filter(Boolean);
    preloadImages(imageUrls);
  }, [ads]);

  // carousel timer: depend only on ads.length to avoid recreating the timer every tick
  useEffect(() => {
    if (!ads || ads.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentAdIndex(prevIndex => (prevIndex + 1) % ads.length);
    }, 2000);
    return () => clearInterval(timer);
  }, [ads.length]);

  const openAdRedirect = async (ad: publish_ad) => {
    // استخدام website_url مباشرة إذا كان موجوداً
    if (ad.website_url) {
      window.open(ad.website_url, '_blank', 'noopener,noreferrer');
      return;
    }

    // إذا لم يكن website_url موجوداً، استخدام API redirect
    const baseUrl = API_BASE_URL.replace(/\/+$/, '');
    const apiUrl = `${baseUrl}/api/ad-redirect/${ad.id}`;

    // فتح الرابط مباشرة دون استخدام fetch لتجنب مشاكل CORS
    window.open(apiUrl, '_blank', 'noopener,noreferrer');
  };

  if (showLocalAd) {
    return (
      <div className="sticky top-1 z-10">
        <div className="rounded-lg overflow-hidden shadow-md w-full aspect-video relative bg-gray-100">
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
          <div className="rounded-lg overflow-hidden shadow-md w-full aspect-video relative bg-gray-100 mb-3">
            {ads[currentAdIndex]?.website_url ? (
              <>
                <img
                  src={ads[currentAdIndex]?.image_url}
                  alt={t('advertisement')}
                  className="w-full h-full object-cover absolute inset-0 cursor-pointer"
                  onClick={() => openAdRedirect(ads[currentAdIndex])}
                />
                <div
                  className="absolute bottom-2 left-2 bg-orange-500 text-black text-xs font-bold px-3 py-1 rounded shadow-lg z-20"
                  style={{ direction: 'rtl', pointerEvents: 'none' }}
                >
                  {t('click_to_contact')}
                </div>
              </>
            ) : (
              <img
                src={ads[currentAdIndex]?.image_url}
                alt={t('advertisement')}
                className="w-full h-full object-cover absolute inset-0"
              />
            )}
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
          </div>
        </>
      )}
    </div>
  );
};

export default PageAdvertisement;
