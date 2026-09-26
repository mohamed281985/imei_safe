import { useCallback, useEffect, useState } from 'react';
import axiosInstance from '@/services/axiosInterceptor';
import { supabase } from '@/lib/supabase';
import type { RewardOffer } from '@/data/rewards';

type OfferRow = {
  id: string;
  category: string;
  product_name: string;
  business_name: string;
  rating?: number | null;
  distance_meters: number;
  original_price: number;
  offer_price: number;
  discount_percent: number;
  coins_required: number;
  expires_at: string;
  description: string;
  status: 'approved';
  is_active: boolean;
  business_offer_images?: Array<{ image_path: string; main_image: boolean; sort_order: number }>;
};

type CachedLocation = { latitude: number; longitude: number; savedAt: number };

const categoryMap: Record<string, string> = {
  screen_protectors: 'screen_protector',
  cases: 'phone_grips',
  chargers: 'chargers',
  cables: 'cables',
  headphones: 'headphones',
  smartwatches: 'smart_watches',
  phone_holders: 'car_holders',
  other: 'other_accessories',
};

const getLocation = (): Promise<{ latitude: number; longitude: number }> => new Promise((resolve, reject) => {
  if (!navigator.geolocation) {
    reject(new Error('هذا الجهاز لا يدعم تحديد الموقع.'));
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
    (error) => reject(new Error(error.code === error.PERMISSION_DENIED ? 'يرجى السماح بالوصول للموقع لعرض العروض القريبة.' : 'تعذر تحديد موقعك. تحقق من إعدادات الموقع وحاول مرة أخرى.')),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  );
});

const getCachedLocation = (): CachedLocation | null => {
  try {
    const cached = sessionStorage.getItem('imei-safe-rewards-location');
    if (!cached) return null;
    const parsed = JSON.parse(cached) as CachedLocation;
    return Date.now() - parsed.savedAt < 5 * 60 * 1000 ? parsed : null;
  } catch {
    return null;
  }
};

export const useNearbyRewardOffers = () => {
  const [offers, setOffers] = useState<RewardOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  const retry = useCallback(() => setRetryKey((key) => key + 1), []);

  useEffect(() => {
    let active = true;

    const loadOffers = async () => {
      setLoading(true);
      setError('');
      try {
        const cachedLocation = getCachedLocation();
        const location = cachedLocation || await getLocation();
        if (!cachedLocation) {
          try {
            sessionStorage.setItem('imei-safe-rewards-location', JSON.stringify({ ...location, savedAt: Date.now() }));
          } catch {
            // The location is still used for this request if session storage is unavailable.
          }
        }

        const { data } = await axiosInstance.get('/api/rewards/offers', {
          params: { latitude: location.latitude, longitude: location.longitude },
        });
        const mappedOffers: RewardOffer[] = ((data?.offers || []) as OfferRow[]).map((row) => {
          const images = [...(row.business_offer_images || [])].sort((a, b) => a.sort_order - b.sort_order);
          const imagePath = images.find((image) => image.main_image)?.image_path || images[0]?.image_path;
          const imageUrl = imagePath?.startsWith('http')
            ? imagePath
            : imagePath
              ? supabase.storage.from('business-offer-images').getPublicUrl(imagePath).data.publicUrl
              : null;
          return {
            id: row.id,
            categoryId: categoryMap[row.category] || 'other_accessories',
            productName: row.product_name,
            businessName: row.business_name,
            businessLogo: row.business_name?.slice(0, 2) || '',
            rating: Number(row.rating) || 0,
            distanceMeters: Math.round(Number(row.distance_meters)),
            originalPrice: Number(row.original_price),
            offerPrice: Number(row.offer_price),
            discountPercent: Number(row.discount_percent),
            coinsRequired: Number(row.coins_required),
            availableQuantity: 0,
            expiresAt: row.expires_at,
            imageUrl,
            description: row.description,
            branchNames: [],
            status: row.status,
            isActive: row.is_active,
          };
        });
        if (active) setOffers(mappedOffers);
      } catch (loadError: any) {
        if (active) {
          setOffers([]);
          setError(loadError?.response?.data?.error || loadError?.message || 'تعذر تحميل العروض القريبة.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadOffers();
    return () => { active = false; };
  }, [retryKey]);

  return { offers, loading, error, retry };
};
