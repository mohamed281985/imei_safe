import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../components/PageContainer';
import logoGif from '../assets/images/logo1.gif'; // تم تغيير اسم الصورة

const SplashScreen: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // طلب إذن الموقع الجغرافي
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => {},
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    const timer = setTimeout(() => {
      navigate('/language', { replace: true });
    }, 5000);

    // منع الخروج عند الضغط على زر الرجوع في أندرويد
    const handlePopState = (e: PopStateEvent) => {
      navigate('/language', { replace: true });
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigate]);

  return (
    <div className="fixed inset-0 w-full h-full flex items-center justify-center z-50 bg-white">
      <img
        src={logoGif}
        className="w-full h-full object-cover"
        alt="Splash Screen"
      />
    </div>
  );
};

export default SplashScreen;