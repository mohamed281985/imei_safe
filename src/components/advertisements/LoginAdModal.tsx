import React from 'react';
import { X } from 'lucide-react';
import { getTransformedImageUrl } from '@/lib/imageUtils';
import { useLanguage } from '@/contexts/LanguageContext';
import useSpecialAdDisplay from '../../hooks/useSpecialAdDisplay';

interface Advertisement {
  id: string;
  image_url: string;
  website_url?: string;
  latitude?: number;
  longitude?: number;
  shop_location?: string;
  last_updated?: string;
  showClose?: boolean;
}

interface LoginAdModalProps {
  ad: Advertisement;
  onClose: () => void;
}

const LoginAdModal: React.FC<LoginAdModalProps> = ({ ad, onClose }) => {
  const { t } = useLanguage();
  // إضافة حالة لتتبع تحميل الصورة
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const [imageError, setImageError] = React.useState(false);

  // تحسين تحميل الصورة
  React.useEffect(() => {
    if (!ad.image_url) return;

    const img = new window.Image();
    img.src = ad.image_url;
    img.onload = () => {
      setImageLoaded(true);
      setImageError(false);
    };
    img.onerror = () => {
      setImageError(true);
      setImageLoaded(false);
    };
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [ad.image_url]);
  // دالة لفتح اللوكيشن في خرائط Google
  const handleLocationClick = () => {
    if (ad.latitude && ad.longitude) {
      const url = `https://www.google.com/maps/search/?api=1&query=${ad.latitude},${ad.longitude}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } else if (ad.shop_location) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ad.shop_location)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };
  const handleAdClick = () => {
    if (ad.website_url) {
      window.open(ad.website_url, '_blank', 'noopener,noreferrer');
    }
  };

  // تحديد ما إذا كان يجب عرض الإعلان المميز
  const shouldDisplayAd = useSpecialAdDisplay();

  // تحميل الصورة مباشرة من رابط الإعلان بدون أي كاش أو معالجة
  const imageUrl = ad.image_url || '';

  if (!shouldDisplayAd) {
    return null; // لا تعرض المكون إذا لم يكن من المفترض عرضه
  }

  return (
  <div className="fixed inset-0 flex items-center justify-center z-[100]">
    <div
      className="relative bg-transparent overflow-hidden flex flex-col items-center justify-center"
      style={{
        width: '85vw',
        height: '88vh',
        maxWidth: '97vw',
        maxHeight: '97vh',
        borderRadius: 5,
        background: 'transparent',
        boxShadow: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
      }}
    >
      {/* زر الإغلاق يظهر فقط إذا كانت showClose=true */}
      {ad.showClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 bg-red-500 text-white rounded-full p-2 hover:bg-red-600 transition-colors z-50 shadow-xl"
          aria-label={t('close_ad')}
        >
          <X size={24} strokeWidth={2.5} />
        </button>
      )}
      {/* إضافة preload link لتحميل الصورة مسبقاً */}
      <link rel="preload" href={imageUrl} as="image" />
      {/* زر موقع المحل فوق الصورة */}
      {(ad.latitude && ad.longitude) || ad.shop_location ? (
        <button
          onClick={handleLocationClick}
          className="mb-4 px-4 py-2 bg-imei-cyan text-white rounded-lg shadow hover:bg-imei-cyan/80 transition-all text-base font-semibold flex items-center gap-2 z-20"
          style={{direction: 'rtl'}}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 6.25 12.25 6.53 12.53.29.29.76.29 1.06 0C12.75 21.25 19 14.25 19 9c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>
          {ad.shop_location ? ad.shop_location : t('store_location_on_map')}
        </button>
      ) : null}
      <div style={{position: 'relative', width: '100%', height: '100%'}}>
        {/* Background blurred image */}
        <img
          src={imageUrl}
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(16px) brightness(0.7)',
            transform: 'scale(1.1)',
            zIndex: 1,
            borderRadius: 20,
          }}
        />
        {imageLoaded && (
          <img
            src={imageUrl}
            crossOrigin="anonymous"
            alt="Advertisement"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              borderRadius: 20,
              filter: 'none',
              background: 'transparent',
              position: 'relative',
              zIndex: 2,
            }}
            loading="eager"
            fetchPriority="high"
            decoding="sync"
          />
        )}
        {imageError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-white">{t('image_failed_to_load')}</p>
          </div>
        )}
      </div>
    </div>
  </div>
  );
};

export default LoginAdModal;