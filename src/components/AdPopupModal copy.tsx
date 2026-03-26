import React, { useState, useEffect, useRef } from 'react';
import Modal from 'react-modal';
import Slider from 'react-slick';
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
  const sliderRef = useRef(null);
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

  // إعدادات السلايدر
  const settings = {
    dots: ads.length > 1,
    infinite: true, // التمرير اللانهائي
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: ads.length > 1,
    autoplaySpeed: 3000,
    arrows: false,
    beforeChange: (current, next) => {
      console.log(`Moving from slide ${current} to slide ${next}`);
      setCurrentSlide(next);

      // تحميل الصورة التالية مسبقاً
      if (ads[next]?.image_url) {
        const img = new Image();
        img.src = ads[next].image_url;
      }
    },
    afterChange: (current) => {
      console.log(`Current slide: ${current}`);
      setCurrentSlide(current);
      if (current === ads.length - 1 && ads[current]) {
        updateLastShownAd(ads[current].id);
      }
    },
  };

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
      isOpen={true} // ⭐ تبسيط: العرض يعتمد فقط على الشرط في الأعلى
      onRequestClose={onClose}
      style={{
        content: {
          width: '100%',
          height: '75%',
          margin: 'auto',
          padding: 0,
          borderRadius: 15,
          background: 'transparent',
          overflow: 'hidden',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          border: 'none',
          display: 'flex',
          flexDirection: 'column',
        },
        overlay: {
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          zIndex: 10000,
        }
      }}
    >
      {/* إظهار زر الإغلاق فقط إذا لم يكن الإعلان الأول هو المعروض */}
      {(ads.length === 1 || currentSlide > 0) && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 1003,
            background: '#e11d48',
            color: '#fff',
            borderRadius: '50%',
            padding: 8,
            border: 'none',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            cursor: 'pointer'
          }}
          aria-label="إغلاق"
        >X</button>
      )}

      <Slider ref={sliderRef} {...settings} className="slider-container" style={{
        flex: 1,
        height: '100%',
        margin: 0,
        position: 'relative'
      }}>
        {ads.map((ad, index) => (
          <div key={`${ad.id}-${index}`} style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000',
            padding: 0,
            margin: 0,
            backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.6))'
          }}>
            {/* Main image */}
            <img
              src={ad.image_url}
              alt={`إعلان ${index + 1}`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                position: 'relative',
                zIndex: 2,
                padding: '0 10px',
                margin: '0 auto',
                display: 'block'
              }}
            />

            {/* Distance badge */}
            <div style={{
              position: 'absolute',
              top: 16,
              left: 16,
              background: 'rgba(255, 215, 0, 0.9)',
              color: '#000',
              padding: '8px 16px',
              borderRadius: '30px',
              fontSize: '14px',
              fontWeight: 'bold',
              zIndex: 1002,
              boxShadow: '0 2px 4px rgba(51, 50, 50, 0.2)'
            }}>
              {typeof ad.distance === 'number' && !isNaN(ad.distance)
                ? `المسافة: ${ad.distance.toFixed(1)} كم`
                : 'إعلان قريب'}
            </div>
          </div>
        ))}
      </Slider>

      {/* Action Buttons Container */}
      <div style={{
        position: 'fixed',
        bottom: 30,
        width: '100%',
        left: '50%', transform: 'translateX(-50%)', maxWidth: '450px',
        height: '10%', // ⭐ تحديد ارتفاع ثابت للأزرار
        zIndex: 1002,
        display: 'flex',
        justifyContent: 'center',
        gap: '12px',
        backgroundColor: 'linear-gradient(to top, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.4))',
        padding: '18px',
        borderTopLeftRadius: '15px',
        borderTopRightRadius: '15px',
        borderBottomLeftRadius: '0',
        borderBottomRightRadius: '0',
        boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.3s ease'
      }}>
        {/* زر واتساب: يظهر فقط إذا كان هناك رقم هاتف */}
        {ads[currentSlide]?.phone && (
          <button
            onClick={() => openWhatsApp(ads[currentSlide]?.phone)}
            aria-label="تواصل عبر واتساب"
            title="تواصل عبر واتساب"
            style={{
              background: '#25D366',
              color: '#fff',
              borderRadius: '13px',
              padding: '10px 20px',
              border: 'none',
              minWidth: '120px',
              fontSize: '14px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              flex: 1
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
            }}
          >
            <MessageCircle size={18} />
            <span>واتساب</span>
          </button>
        )}

        {/* زر لوكيشن المحل: يظهر فقط إذا كانت هناك إحداثيات */}
        {ads[currentSlide]?.latitude && ads[currentSlide]?.longitude && (
          <button
            onClick={() => openLocation(
              ads[currentSlide]?.latitude,
              ads[currentSlide]?.longitude,
              ads[currentSlide]?.id
            )}
            aria-label="عرض الموقع على الخريطة"
            title="عرض الموقع على الخريطة"
            style={{
              background: '#f3af1d',
              color: '#fff',
              borderRadius: '13px',
              padding: '10px 20px',
              border: 'none',
              minWidth: '120px',
              fontSize: '14px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              flex: 1
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
            }}
          >
            <MapPin size={18} />
            <span>لوكيشن المحل</span>
          </button>
        )}
      </div>
    </Modal>
  );
}