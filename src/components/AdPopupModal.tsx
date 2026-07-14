import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';
import { MapPin, MessageCircle } from 'lucide-react';
import './AdPopupModal.css';

interface AdPopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  userLocation: { latitude: number; longitude: number } | null;
  ads: any[];
}

Modal.setAppElement('#root');

export default function AdPopupModal({ isOpen, onClose, userLocation, ads }: AdPopupModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showClose, setShowClose] = useState(false);

  useEffect(() => {
    if (!isOpen || !ads || ads.length <= 1) {
      console.log('❌ AdPopupModal: لا يمكن بدء التبديل التلقائي - isOpen:', isOpen, 'ads.length:', ads?.length);
      setCurrentSlide(0);
      return;
    }

    console.log('✅ AdPopupModal: بدء التبديل التلقائي - عدد الإعلانات:', ads.length);

    const interval = window.setInterval(() => {
      setCurrentSlide((prev) => {
        const next = (prev + 1) % ads.length;
        console.log(`🔄 AdPopupModal: تبديل من الإعلان ${prev} إلى ${next}`);
        return next;
      });
    }, 3000);

    return () => {
      console.log('⏹️ AdPopupModal: إيقاف التبديل التلقائي');
      window.clearInterval(interval);
    };
  }, [isOpen, ads]);

  // عندما يكون هناك إعلان واحد فقط، أظهر زر الإغلاق بعد 4 ثوانٍ
  useEffect(() => {
    if (!isOpen) return;
    if (!ads || ads.length !== 1) {
      setShowClose(false);
      return;
    }

    setShowClose(false);
    const timer = window.setTimeout(() => setShowClose(true), 6000);
    return () => window.clearTimeout(timer);
  }, [isOpen, ads]);

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
      const cleanPhone = phone.replace(/\D/g, '');
      const whatsappDeepLink = `whatsapp://send?phone=${cleanPhone}`;
      const whatsappWebLink = `https://wa.me/${cleanPhone}`;

      const capacitor = (window as any)?.Capacitor;
      if (capacitor) {
        try {
          capacitor.Plugins.Browser.open({ url: whatsappDeepLink });
        } catch (e) {
          capacitor.Plugins.Browser.open({ url: whatsappWebLink });
        }
      } else {
        window.location.href = whatsappDeepLink;
        setTimeout(() => {
          window.open(whatsappWebLink, '_blank');
        }, 500);
      }
    } else {
      alert('عذراً، لا يوجد رقم هاتف متاح لهذا المحل');
    }
  };

  if (!isOpen || !ads || ads.length === 0) {
    return null;
  }

  const currentAd = ads[currentSlide];

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
          background: 'rgba(80,80,80,0.32)',
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
          backgroundColor: 'rgba(60,60,60,0.70)',
          zIndex: 10000,
        }
      }}
    >
      <div
        style={{
          width: '95vw',
          maxWidth: 400,
          height: '80vh',
          maxHeight: 650,
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
        {currentAd && (
          <img
            key={`${currentAd.id || 'ad'}-${currentSlide}`}
            src={currentAd.image_url}
            alt={`إعلان ${currentSlide + 1}`}
            style={{
              width: '100%',
              height: '100%',
              display: 'block'
            }} />
        )}

        <div style={{ position: 'absolute', top: 18, left: 18, zIndex: 1003, display: 'flex', alignItems: 'center', gap: '150px', width: 'calc(100% - 50px)' }}>
          {(ads && ads.length === 1 ? showClose : currentSlide !== 0) && (
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

          {typeof currentAd?.distance === 'number' && !isNaN(currentAd?.distance) && (
            <div style={{
              background: 'rgba(255, 215, 0, 0.93)',
              color: '#000',
              padding: '7px 15px',
              borderRadius: '30px',
              fontSize: '14px',
              fontWeight: 'bold',
              boxShadow: '0 2px 4px rgba(51, 50, 50, 0.2)'
            }}>
              {`المسافة: ${currentAd.distance.toFixed(1)} كم`}
            </div>
          )}
        </div>

        {ads.length > 1 && (
          <>
            <button
              onClick={() => setCurrentSlide((prev) => (prev === 0 ? ads.length - 1 : prev - 1))}
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
              onClick={() => setCurrentSlide((prev) => (prev + 1) % ads.length)}
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

        {ads.length > 1 && (
          <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, zIndex: 1004 }}>
            {ads.map((_, index) => (
              <span
                key={index}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: index === currentSlide ? '#fff' : 'rgba(255,255,255,0.45)',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.18)',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}