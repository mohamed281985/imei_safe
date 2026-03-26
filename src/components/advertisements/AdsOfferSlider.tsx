import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Gem, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';

interface adsoffar {
  id: number;
  imagesmall_url: string;
  mainimage_url?: string;
  all_users: string;
}

interface AdsOfferSliderProps {
  containerClassName?: string;
  onClose?: () => void;
  isUpgradePrompt?: boolean;
}

const AdsOfferSlider = ({ containerClassName = '', onClose, isUpgradePrompt }: AdsOfferSliderProps) => {
  const [ads, setAds] = useState<adsoffar[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();

  const filterAdsByUser = (adsList: adsoffar[], userRole: string | undefined) => {
    if (!userRole) return adsList;

    const filteredAds = adsList.filter(ad => {
      if (!ad.all_users) return false;

      const targetUsers = ad.all_users.toLowerCase()
        .split(',')
        .map(user => user.trim())
        .filter(user => user.length > 0);

      if (targetUsers.includes('all')) return true;
      if ((userRole === 'silver_business' || userRole === 'free_business' || userRole === 'gold_business') && targetUsers.some(u => u.includes('business'))) return true;
      if ((userRole === 'silver_user' || userRole === 'free_user' || userRole === 'gold_user') && targetUsers.some(u => u.includes('users') || u.includes('user'))) return true;

      return false;
    });

    return filteredAds;
  };

  const cleanImageUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);
      const uniqueParams: Record<string, string> = {};

      for (const [key, value] of params.entries()) {
        uniqueParams[key] = value;
      }

      const newParams = new URLSearchParams(uniqueParams);
      urlObj.search = newParams.toString();

      return urlObj.toString();
    } catch (err) {
      console.error('Error cleaning image URL:', err);
      return url;
    }
  };

  useEffect(() => {
    setLoading(true);

    const fetchAds = async () => {
      try {
        const { data, error } = await supabase
          .from('ads_offar')
          .select('id, imagesmall_url, mainimage_url, all_users')
          .order('id', { ascending: true });

        if (error) {
          console.error('خطأ في جلب الإعلانات:', error);
          return;
        }

        if (data && data.length > 0) {
          const freshFilteredAds = filterAdsByUser(data, user?.role);
          const cleanedAds = freshFilteredAds.map(ad => ({
            ...ad,
            imagesmall_url: cleanImageUrl(ad.imagesmall_url)
          }));

          setAds(cleanedAds);
        }
      } catch (err) {
        console.error('خطأ في جلب الإعلانات:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAds();
  }, [user?.role]);

  if (loading) {
    return (
      <div className={`w-full flex justify-center items-center px-4 ${containerClassName}`}>
        <div className="w-full max-w-6xl h-[200px] rounded-2xl bg-gray-100 flex justify-center items-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="text-gray-600 font-medium">{t('loading')}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!ads || ads.length === 0) {
    const message = user ? t('no_offers_available_for_user') : t('no_offers_available');
    const description = user ? t('check_user_category_offers') : t('contact_support_for_offers');
    return (
      <div className={`w-full flex justify-center items-center px-4 ${containerClassName}`}>
        <div className="w-full max-w-6xl h-[200px] rounded-2xl bg-red-50 border-2 border-red-200 flex flex-col justify-center items-center p-8">
          <div className="text-4xl mb-4">📢</div>
          <h2 className="text-red-700 text-xl font-bold mb-2">{message}</h2>
          <p className="text-red-600 text-base text-center">{description}</p>
        </div>
      </div>
    );
  }

  // إذا كان المكون يُستخدم كنافذة منبثقة للترقية
  if (isUpgradePrompt) {
    // ⭐ تم تعديل هذا الجزء ليعرض المحتوى مباشرة بدلاً من إنشاء نافذة منبثقة جديدة
    return (
      <div className="flex flex-col items-center justify-center h-full pt-35 pb-16">
        <div className="mb-12 animate-pulse">
          <Gem className="w-28 h-28 text-cyan-200 drop-shadow-[0_2px_5px_rgba(0,255,255,0.5)]" strokeWidth={1.6} />
        </div>
        <h2 className="text-4xl md:text-5xl font-extrabold text-center select-none mb-8
              text-white font-sans
              [text-shadow:_0_4px_6px_rgba(0,0,0,0.6)]
              transform -skew-y-6 tracking-wider">
          UPGRADE NOW
        </h2>
        <h2 className="text-4xl md:text-4xl font-extrabold text-center select-none mb-8
              text-white font-sans
              [text-shadow:_0_4px_6px_rgba(0,0,0,0.6)]
              transform -skew-y-5 tracking-wider">
          {t('upgrade_now')}
        </h2>

        <div className="w-full max-w-2xl px-4">
          <Swiper
            spaceBetween={20}
            slidesPerView={1}
            autoplay={{
              delay: 2500,
              disableOnInteraction: false,
            }}
            loop={true}
            allowTouchMove={false}
            modules={[Autoplay]}
            className="mySwiper shadow-2xl"
          >
            {ads.map((ad) => (
              <SwiperSlide key={ad.id}>
                <div
                  className="relative cursor-pointer rounded-xl overflow-hidden border-2 border-gray-300"
                  onClick={() => navigate(`/offersgallery?id=${ad.id}`)}
                >
                  <img
                    src={ad.imagesmall_url}
                    alt={`${t('offer')} ${ad.id}`}
                    className="w-full h-[150px] object-cover"
                    loading="eager"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent p-0 m-0" />
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
          </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center">
      {isUpgradePrompt ? (
        <>
          <div className="mb-12 animate-pulse">
            <Gem className="w-28 h-28 text-cyan-200 drop-shadow-[0_2px_5px_rgba(0,255,255,0.5)]" strokeWidth={1.6} />
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-center select-none mb-8
            text-white font-sans
            [text-shadow:_0_4px_6px_rgba(0,0,0,0.6)]
            transform -skew-y-6 tracking-wider">
            UPGRADE NOW
          </h2>
          <h2 className="text-3xl md:text-4xl font-extrabold text-center select-none mb-8
            text-white font-sans
            [text-shadow:_0_4px_6px_rgba(0,0,0,0.6)]
            transform -skew-y-5 tracking-wider">
            {t('upgrade_now')}
          </h2>
        </>
      ) : (
        <h2 className="text-2xl md:text-3xl font-bold text-black mb-4 text-center select-none">{t('discover_special_offers')}</h2>
      )}

      <div className="w-full max-w-6xl">
        <Swiper
          spaceBetween={20}
          slidesPerView={1}
          autoplay={{
            delay: 2500,
            disableOnInteraction: false,
            stopOnLastSlide: false,
            reverseDirection: false,
          }}
          loop={true}
          allowTouchMove={false}
          modules={[Autoplay]}
          className="mySwiper shadow-2xl"
          breakpoints={{
            640: {
              slidesPerView: 2,
            },
            768: {
              slidesPerView: 3,
            },
            1024: {
              slidesPerView: 4,
            },
          }}
        >
          {ads.map((ad) => (
            <SwiperSlide key={ad.id}>
              <div 
                className="relative cursor-pointer rounded-xl overflow-hidden shadow-lg border-2 border-gray-300"
                onClick={() => navigate(`/offersgallery?id=${ad.id}`)}
              >
                <img
                  src={ad.imagesmall_url}
                  alt={`${t('offer')} ${ad.id}`}
                  className="w-full h-[120px] object-cover"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </div>
  );
};

export default AdsOfferSlider;
