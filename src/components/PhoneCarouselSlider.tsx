import React, { useState, useRef, useEffect } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Keyboard } from 'swiper/modules';
import 'swiper/swiper.css';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';

interface Phone {
  id: string;
  title: string;
  price: number;
  brand?: string;
  phone_type?: string;
  condition?: string;
  status?: string;
  role?: string;
  type?: 'promotions' | 'normal' | 'promotion' | 'special' | 'featured';
  phone_images?: Array<{
    image_path: string;
    main_image: boolean;
    order?: number;
  }>;
  distance?: number;
}

interface PhoneCarouselSliderProps {
  phones: Phone[];
  onPhoneClick?: (phoneId: string) => void;
  getTransformedImageUrl: (imagePath: string | null | undefined) => string;
  getPhoneMainImage: (phone: Phone) => string | null;
  getCardStyle?: (role: string | undefined, type: string | undefined) => any;
  userCurrencySymbol?: string;
  incrementPhoneViews?: (phoneId: string) => Promise<void>;
}

const PhoneCarouselSlider: React.FC<PhoneCarouselSliderProps> = ({
  phones,
  onPhoneClick,
  getTransformedImageUrl,
  getPhoneMainImage,
  getCardStyle,
  userCurrencySymbol = 'EGP',
  incrementPhoneViews,
}) => {
  const navigate = useNavigate();
  const swiperRef = useRef<any>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);

  // تتبع حجم النافذة
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // حساب عدد الكارتات المرئية حسب حجم الشاشة
  const getSlideConfig = () => {
    if (windowWidth < 480) {
      // هاتف صغير جداً: كارت واحد + نص من كل جانب
      return { slidesPerView: 1.2, spaceBetween: 8 };
    } else if (windowWidth < 640) {
      // هاتف صغير: كارت واحد + نص من كل جانب
      return { slidesPerView: 1.3, spaceBetween: 10 };
    } else if (windowWidth < 768) {
      // هاتف كبير: كارت واحد + نص من كل جانب
      return { slidesPerView: 1.4, spaceBetween: 12 };
    } else if (windowWidth < 1024) {
      // جهاز لوحي: كارت واحد + نص من كل جانب
      return { slidesPerView: 1.5, spaceBetween: 14 };
    } else {
      // شاشة سطح المكتب: كارت واحد + نص من كل جانب
      return { slidesPerView: 2, spaceBetween: 16 };
    }
  };

  const slideConfig = getSlideConfig();

  // دالة مساعدة افتراضية إذا لم تُمرر
  const defaultGetCardStyle = (role: string | undefined, type: string | undefined) => {
    let borderColor = 'border-gray-100 shadow-gray-50';
    let topBar = null;
    let badge = null;
    const isPromotion = type && ['promotions', 'promotion', 'special', 'featured'].includes(type.toLowerCase());

    if (role === 'gold_business') {
      borderColor = 'border-yellow-400 shadow-yellow-100';
      if (isPromotion) {
        topBar = <div className="h-1.5 bg-gradient-to-r from-yellow-400 to-amber-500"></div>;
        badge = (
          <div className="absolute top-2 right-2 bg-yellow-400/90 backdrop-blur-[2px] text-black text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm z-10 flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5 text-black" /><span>PRO</span>
          </div>
        );
      }
    } else if (role === 'silver_business') {
      borderColor = 'border-gray-400 shadow-gray-200';
      if (isPromotion) {
        topBar = <div className="h-1.5 bg-gradient-to-r from-gray-300 to-gray-500"></div>;
        badge = (
          <div className="absolute top-2 right-2 bg-gray-400/90 backdrop-blur-[2px] text-white text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm z-10 flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5 text-white" /><span>PRO</span>
          </div>
        );
      }
    } else if (isPromotion) {
      topBar = <div className="h-1.5 bg-gradient-to-r from-blue-500 to-blue-600"></div>;
      badge = (
        <div className="absolute top-2 right-2 bg-blue-600/90 backdrop-blur-[2px] text-white text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm z-10 flex items-center gap-0.5">
          <Star className="w-2.5 h-2.5 text-white" /><span>PRO</span>
        </div>
      );
    }

    return { borderColor, topBar, badge };
  };

  const cardStyle = getCardStyle || defaultGetCardStyle;

  const handlePhoneClick = async (phone: Phone) => {
    if (incrementPhoneViews) {
      try {
        await incrementPhoneViews(phone.id);
      } catch (error) {
        console.error('Error incrementing views:', error);
      }
    }
    if (onPhoneClick) {
      onPhoneClick(phone.id);
    } else {
      navigate(`/product/${phone.id}`);
    }
  };

  return (
    <div className="w-full">
      <style>{`
        .phone-carousel-slider {
          perspective: 1200px;
          --swiper-theme-color: transparent;
          margin: 0 -8px;
          width: calc(100% + 16px);
          overflow: visible !important;
        }

        .phone-carousel-slider .swiper-wrapper {
          padding: 16px 8px;
          transition-timing-function: cubic-bezier(0.23, 1, 0.320, 1);
          overflow: visible !important;
        }

        .phone-carousel-slider .swiper-container {
          overflow: visible !important;
        }

        .phone-carousel-slider .swiper-slide {
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.35;
          transform: scale(0.65) translateZ(-150px);
          transition: all 0.4s cubic-bezier(0.23, 1, 0.320, 1);
          filter: brightness(0.5) blur(1.5px);
          z-index: 0;
          height: auto;
          width: auto !important;
          max-width: calc(100% - 8px);
        }

        .phone-carousel-slider .swiper-slide-active {
          opacity: 1;
          transform: scale(1) translateZ(0);
          filter: brightness(1) blur(0);
          z-index: 10;
        }

        .phone-carousel-slider .swiper-slide-next {
          opacity: 0.45;
          transform: scale(0.7) translateZ(-100px);
          filter: brightness(0.65) blur(0.8px);
          z-index: 1;
        }

        .phone-carousel-slider .swiper-slide-prev {
          opacity: 0.45;
          transform: scale(0.7) translateZ(-100px);
          filter: brightness(0.65) blur(0.8px);
          z-index: 1;
        }

        .phone-carousel-slider .swiper-slide:nth-child(4) {
          opacity: 0.4;
          transform: scale(0.68) translateZ(-120px);
          filter: brightness(0.6) blur(1.2px);
        }

        .phone-carousel-slider .swiper-slide:nth-child(5) {
          opacity: 0.35;
          transform: scale(0.65) translateZ(-150px);
          filter: brightness(0.55) blur(1.5px);
        }

        .phone-card {
          height: 100%;
          width: 100%;
          transition: all 0.3s ease;
        }

        .phone-image-container {
          position: relative;
          width: 100%;
          height: clamp(120px, 25vw, 220px);
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          overflow: hidden;
        }

        .phone-image-container img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
          transition: transform 0.3s ease;
        }

        .swiper-slide-active .phone-image-container img {
          transform: scale(1.05);
        }

        /* تحسين الاستجابة على الأجهزة المختلفة */
        @media (max-width: 480px) {
          .phone-carousel-slider .swiper-wrapper {
            padding: 12px 0;
          }
          
          .phone-info-section {
            padding: 8px !important;
          }

          .phone-price {
            font-size: 14px !important;
          }

          .phone-title {
            font-size: 12px !important;
          }
        }

        @media (min-width: 480px) and (max-width: 768px) {
          .phone-carousel-slider .swiper-wrapper {
            padding: 14px 0;
          }

          .phone-info-section {
            padding: 10px !important;
          }

          .phone-price {
            font-size: 16px !important;
          }

          .phone-title {
            font-size: 14px !important;
          }
        }

        @media (min-width: 768px) {
          .phone-carousel-slider .swiper-wrapper {
            padding: 20px 0;
          }

          .phone-info-section {
            padding: 12px !important;
          }

          .phone-price {
            font-size: 18px !important;
          }

          .phone-title {
            font-size: 16px !important;
          }
        }

        /* إخفاء/إظهار أزرار التنقل حسب حجم الشاشة */
        @media (max-width: 640px) {
          .carousel-nav-buttons {
            display: none !important;
          }
        }

        @media (min-width: 641px) {
          .carousel-nav-buttons {
            display: flex !important;
          }
        }

        /* تحسين نقاط المؤشرات */
        .carousel-dots {
          display: flex;
          justify-content: center;
          gap: 6px;
          margin-top: clamp(12px, 3vw, 24px);
          flex-wrap: wrap;
          padding: 0 8px;
        }

        .carousel-dot {
          height: 8px;
          border-radius: 999px;
          cursor: pointer;
          transition: all 0.3s ease;
          background-color: #d1d5db;
        }

        .carousel-dot.active {
          background-color: #2563eb;
          min-width: 24px;
        }

        .carousel-dot:hover {
          background-color: #9ca3af;
        }

        .carousel-dot.active:hover {
          background-color: #1d4ed8;
        }
      `}
      </style>

      <div className="w-full relative px-0 sm:px-2" style={{ overflow: 'visible' }}>
        <Swiper
          ref={swiperRef}
          dir="rtl"
          modules={[Keyboard]}
          slidesPerView={slideConfig.slidesPerView}
          spaceBetween={slideConfig.spaceBetween}
          centeredSlides={true}
          loop={true}
          loopAdditionalSlides={2}
          loopPreventsSliding={true}
          grabCursor={true}
          keyboard={{ enabled: true }}
          className="phone-carousel-slider !static"
          onSlideChange={(swiper) => setActiveSlide(swiper.activeIndex)}
          touchEventsTarget="container"
        >
          {phones.map((phone) => {
            const style = cardStyle(phone.role, phone.type);
            const mainImagePath = getPhoneMainImage(phone);
            const imageUrl = mainImagePath ? getTransformedImageUrl(mainImagePath) : '/placeholder-phone.png';

            return (
              <SwiperSlide key={phone.id} className="!h-auto !w-auto">
                <Link
                  to={`/product/${phone.id}`}
                  onClick={() => handlePhoneClick(phone)}
                  className={`relative flex flex-col bg-white rounded-xl sm:rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer border-2 ${style.borderColor} phone-card w-full`}
                >
                  {/* الشريط العلوي للمميزة */}
                  {style.topBar}

                  {/* صورة الهاتف */}
                  <div className="phone-image-container">
                    {style.badge}
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt={phone.title || 'صورة الهاتف'}
                        loading="lazy"
                        className="w-full h-full object-contain opacity-0 transition-opacity duration-300"
                        onLoad={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.classList.remove('opacity-0');
                          target.classList.add('opacity-100');
                        }}
                        onError={(e) => {
                          console.error('Image failed to load:', e);
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    )}
                  </div>

                  {/* معلومات الهاتف */}
                  <div className="phone-info-section flex-1 p-2 sm:p-3 md:p-4 flex flex-col justify-between min-h-[80px] sm:min-h-[100px]">
                    {/* العنوان والماركة */}
                    <div className="min-w-0">
                      <h3 className="phone-title text-xs sm:text-sm md:text-base font-bold text-gray-900 line-clamp-1 mb-0.5 sm:mb-1 leading-tight">
                        {phone.title || phone.brand || 'هاتف'}
                      </h3>
                      {phone.condition && (
                        <p className="text-[10px] sm:text-xs text-gray-500 mb-1 sm:mb-2">
                          الحالة: {phone.condition === 'new' ? 'جديد' : 'مستعمل'}
                        </p>
                      )}
                    </div>

                    {/* السعر والمسافة */}
                    <div className="flex items-center justify-between pt-1 sm:pt-2 border-t border-gray-200 gap-1">
                      <span className="phone-price text-xs sm:text-sm md:text-lg font-bold text-blue-600 truncate">
                        {phone.price?.toLocaleString()} {userCurrencySymbol}
                      </span>
                      {phone.distance !== undefined && phone.distance !== Infinity && (
                        <span className="text-[9px] sm:text-xs text-gray-600 whitespace-nowrap">
                          {phone.distance.toFixed(1)} كم
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </SwiperSlide>
            );
          })}
        </Swiper>

        {/* أزرار التنقل - مخفية على الهواتف الصغيرة */}
        <div className="carousel-nav-buttons absolute -right-3 sm:-right-4 md:-right-5 top-1/3 -translate-y-1/2 z-20">
          <button
            onClick={() => swiperRef.current?.swiper.slidePrev()}
            className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 sm:p-2 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center hover:scale-110"
            aria-label="الشريحة السابقة"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
        <div className="carousel-nav-buttons absolute -left-3 sm:-left-4 md:-left-5 top-1/3 -translate-y-1/2 z-20">
          <button
            onClick={() => swiperRef.current?.swiper.slideNext()}
            className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 sm:p-2 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center hover:scale-110"
            aria-label="الشريحة التالية"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* مؤشرات التنقل (نقاط) */}
      <div className="carousel-dots">
        {phones.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              if (swiperRef.current?.swiper) {
                swiperRef.current.swiper.slideToLoop(index);
              }
            }}
            className={`carousel-dot transition-all duration-300 ${
              index === activeSlide % phones.length ? 'active' : ''
            }`}
            aria-label={`انتقل إلى الهاتف ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default PhoneCarouselSlider;