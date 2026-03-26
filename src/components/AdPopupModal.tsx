import React, { useState, useEffect, useRef } from 'react';
import Modal from 'react-modal';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { MapPin, MessageCircle } from 'lucide-react';
import './AdPopupModal.css';
import { supabase } from '../lib/supabase';

interface AdPopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  userLocation: { latitude: number; longitude: number } | null;
  ads: any[];
}

Modal.setAppElement('#root');

export default function AdPopupModal({ isOpen, onClose, userLocation, ads }: AdPopupModalProps) {
  const swiperRef = useRef<any>(null);
  // تشغيل تلقائي مخصص: استخدام مؤقت بدلاً من وحدة Autoplay لتجنب مشاكل الاستيراد
  useEffect(() => {
    if (!isOpen || !ads || ads.length <= 1) return;

    const interval = setInterval(() => {
      try {
        if (swiperRef.current && typeof swiperRef.current.slideNext === 'function') {
          swiperRef.current.slideNext();
        }
      } catch (err) {
        // تجاهل الأخطاء البسيطة أثناء التنقل
        console.warn('autoplay slideNext error', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isOpen, ads]);
  const [currentSlide, setCurrentSlide] = useState(0);

  // دالة لتحميل الصور مسبقاً
  const preloadImages = (imageUrls: string[]) => {
    imageUrls.forEach(url => {
      if (url) {
        const img = new Image();
        img.src = url;
      }
    });
  };

  // ⭐ تبسيط: تحميل الصور مسبقاً عند وصول الإعلانات
  useEffect(() => {
    if (ads && ads.length > 0) {
      const imageUrls = ads.map(ad => ad.image_url).filter(Boolean);
      preloadImages(imageUrls);
    }
  }, [ads]);

  // دالة لحساب المسافة بين نقطتين
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    try {
      const R = 6371; // نصف قطر الأرض بالكيلومتر
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;
      return distance;
    } catch (error) {
      console.error('Error calculating distance:', error);
      return Infinity;
    }
  };

  const getLastShownAdId = () => {
    return localStorage.getItem('lastShownAdId');
  };

  const updateLastShownAd = (adId) => {
    localStorage.setItem('lastShownAdId', adId);
  };

  // نستخدم Swiper بدلاً من react-slick، لذلك لم يعد هناك حاجة لإعدادات القديمة

  const openLocation = (latitude, longitude, adId) => {
    console.log(`Attempting to open location for ad ${adId}:`, latitude, longitude);
    if (latitude && longitude) {
      const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
      window.open(url, '_blank');
    } else {
      alert(`عذراً، الإعلان رقم ${adId} لا يحتوي على معلومات الموقع`);
    }
  };

  const openWhatsApp = (phone) => {
    if (phone && phone.trim()) {
      const formattedPhone = phone.replace(/\D/g, '');
      const url = `https://wa.me/${formattedPhone}`;
      window.open(url, '_blank');
    } else {
      alert('عذراً، لا يوجد رقم هاتف متاح لهذا المحل');
    }
  };

  // ⭐ تبسيط: إذا لم تكن النافذة مفتوحة أو لا توجد إعلانات، لا تعرض أي شيء.
  // القرار الآن يعتمد فقط على isOpen ووجود الإعلانات.
  if (!isOpen || !ads || ads.length === 0) {
    // لا نطبع أي شيء هنا لتجنب الرسائل المربكة في السجل
    return null;
  }
  console.log(`AdPopupModal: Rendering with ${ads.length} ads because isOpen is true.`);

  return (
    <Modal
      isOpen={true}
      onRequestClose={onClose}
      style={{
        content: {
          width: '100vw',
          height: '100vh',
          padding: 0,
          borderRadius: 0,
          background: 'rgba(80,80,80,0.32)', // <-- رمادي أغمق وشفاف
          overflow: 'hidden',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        overlay: {
          backgroundColor: 'rgba(60,60,60,0.70)', // <-- رمادي أغمق وشفاف
          zIndex: 10000,
        }
      }}
    >
      {/* صورة الإعلان الحالية فقط في نافذة منبثقة خاصة */}
      <div
        style={{
          width: '95vw',        // العرض: 95% من عرض الشاشة (viewport)
          maxWidth: 400,        // أقصى عرض: 400 بكسل
          height: '80vh',       // الارتفاع: 80% من ارتفاع الشاشة (viewport)
          maxHeight: 650,       // أقصى ارتفاع: 650 بكسل
          background: '#fff',
          borderRadius: 28,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Swiper
          onSwiper={(swiper) => { swiperRef.current = swiper; }}
          onSlideChange={(swiper) => {
            const idx = swiper.realIndex ?? swiper.activeIndex ?? 0;
            setCurrentSlide(idx);
            if (idx === ads.length - 1 && ads[idx]) updateLastShownAd(ads[idx].id);
          }}
          slidesPerView={1}
          loop={ads.length > 1}
          
          style={{ width: '100%', height: '100%', borderRadius: 28 }}
        >
          {ads.map((ad, index) => (
            <SwiperSlide key={ad.id || index}>
              <img
                src={ad.image_url}
                alt={`إعلان ${index + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 28, background: '#fff', display: 'block' }}
              />
            </SwiperSlide>
          ))}
        </Swiper>
        {/* حاوية للجزء العلوي الأيسر (زر الإغلاق وشارة المسافة) */}
        <div style={{ position: 'absolute', top: 18, left: 18, zIndex: 1003, display: 'flex', alignItems: 'center', gap: '150px', width: 'calc(100% - 50px)' }}>
          {/* زر الإغلاق إلى أقصى اليسار - مخفي على الشريحة الأولى */}
          {currentSlide !== 0 && (
            <button
              onClick={onClose}
              style={{
                background: '#e11d48',
                color: '#fff',
                borderRadius: '50%',
                padding: 0,
                border: 'none',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: '1',
              }}
              aria-label="إغلاق"
            >×</button>
          )}

          {/* شارة المسافة */}
          {typeof ads[currentSlide]?.distance === 'number' && !isNaN(ads[currentSlide]?.distance) && (
            <div style={{
              background: 'rgba(255, 215, 0, 0.93)',
              color: '#000',
              padding: '7px 15px',
              borderRadius: '30px',
              fontSize: '14px',
              fontWeight: 'bold',
              boxShadow: '0 2px 4px rgba(51, 50, 50, 0.2)'
            }}>
              {`المسافة: ${ads[currentSlide].distance.toFixed(1)} كم`}
            </div>
          )}
        </div>
        {/* أزرار التنقل بين الصور إذا كان هناك أكثر من إعلان */}
        {ads.length > 1 && (
          <>
            <button
              onClick={() => { if (swiperRef.current) swiperRef.current.slidePrev(); }}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(0,0,0,0.18)',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: 34,
                height: 34,
                fontSize: 20,
                cursor: 'pointer',
                zIndex: 1004,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              aria-label="السابق"
            >&#8592;</button>
            <button
              onClick={() => { if (swiperRef.current) swiperRef.current.slideNext(); }}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(0,0,0,0.18)',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: 34,
                height: 34,
                fontSize: 20,
                cursor: 'pointer',
                zIndex: 1004,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              aria-label="التالي"
            >&#8594;</button>
          </>
        )}
      </div>
    </Modal>
  );
}