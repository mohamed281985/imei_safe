import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useScrollToTop } from '@/hooks/useScrollToTop';

interface Advertisement {
  id: string;
  image_url: string;
  website_url?: string;
  title?: string;
  description?: string;
}

const SpecialAdPage: React.FC = () => {
  useScrollToTop();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [ad, setAd] = useState<Advertisement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adId, setAdId] = useState<string | null>(null);

  // استخراج ID الإعلان من URL
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const id = searchParams.get('id');
    if (id) {
      setAdId(id);
      fetchAd(id);
    } else {
      setError('لم يتم العثور على معرّف الإعلان');
      setLoading(false);
    }
  }, [location]);

  const fetchAd = async (id: string) => {
    try {
      setLoading(true);

      // جلب الإعلان من جدول special_ad
      const { data, error } = await supabase
        .from('special_ad')
        .select('id, image_url, website_url, title, description')
        .eq('id', id)
        .single();

      if (error) {
        setError('فشل في جلب بيانات الإعلان');
        console.error('Error fetching special ad:', error);
        return;
      }

      if (data) {
        setAd(data);
      }
    } catch (err) {
      setError('حدث خطأ غير متوقع');
      console.error('Error in fetchAd:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    navigate(-1); // العودة للصفحة السابقة
  };

  const handleAdClick = () => {
    if (ad?.website_url) {
      // فتح الرابط في WebView
      navigate(`/webview?url=${encodeURIComponent(ad.website_url)}`);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-white">جاري التحميل...</div>
        </div>
      </PageContainer>
    );
  }

  if (error || !ad) {
    return (
      <PageContainer>
        <AppNavbar />
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <div className="text-red-500 text-xl mb-4">{error || 'الإعلان غير متاح'}</div>
          <button 
            onClick={handleClose}
            className="bg-imei-cyan text-imei-dark px-4 py-2 rounded-lg"
          >
            العودة
          </button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <AppNavbar />
      <div className="relative min-h-screen">
        {/* زر الإغلاق */}
        <button 
          onClick={handleClose}
          className="absolute top-4 right-4 z-50 bg-black/30 backdrop-blur-sm rounded-full p-2 text-white hover:bg-black/50 transition-all"
          aria-label="إغلاق"
        >
          <X className="w-6 h-6" />
        </button>

        {/* محتوى الإعلان */}
        <div className="w-full h-screen">
          {ad.image_url ? (
            <img 
              src={ad.image_url} 
              alt={ad.title || 'إعلان مميز'} 
              className="w-full h-full object-contain"
              onClick={handleAdClick}
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-100">
              <div className="text-center text-gray-500">
                <p>لا توجد صورة متاحة للإعلان</p>
              </div>
            </div>
          )}
        </div>

        {/* معلومات الإعلان (تظهر عند التمرير) */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 text-white">
          <h2 className="text-xl font-bold mb-2">{ad.title || 'إعلان مميز'}</h2>
          {ad.description && (
            <p className="text-sm mb-4 opacity-90">{ad.description}</p>
          )}
          <button 
            onClick={handleAdClick}
            className="bg-imei-cyan text-imei-dark px-4 py-2 rounded-lg w-full font-medium"
          >
            زيارة الموقع
          </button>
        </div>
      </div>
    </PageContainer>
  );
};

export default SpecialAdPage;
