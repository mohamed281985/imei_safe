import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../components/PageContainer';
import logoGif from '../assets/images/logo1.png'; // تم تغيير اسم الصورة

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
    <div className="fixed inset-0 w-full h-full flex items-center justify-center z-50">
      {/* Fullscreen background image */}
      <img src={logoGif} className="absolute inset-0 w-full h-full object-cover" alt="Background" />

      {/* Overlay content on top of the background */}
      <div className="relative z-50 min-h-screen">
        {/* Position the loading bars lower (about 65% from top) so they appear under the background logo */}
        <div
          className="absolute left-1/2 transform -translate-x-1/2 flex items-end gap-2"
          style={{ top: '65%' }}
        >
          {['#4CC8FF', '#FF9300', '#1287F8', '#FF5E00'].map((c, i) => (
            <span
              key={i}
              style={{
                background: c,
                width: i === 1 || i === 2 ? 10 : 8,
                height: 14,
                borderRadius: 4,
                display: 'inline-block',
                animation: `loaderWave 900ms ${i * 120}ms infinite ease-in-out`
              }}
            />
          ))}
        </div>

        <style>{`
          @keyframes loaderWave {
            0%, 100% { transform: translateY(0); opacity: 0.7 }
            50% { transform: translateY(-12px); opacity: 1 }
          }
        `}</style>
      </div>
    </div>
  );
};

export default SplashScreen;