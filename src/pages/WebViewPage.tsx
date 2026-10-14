import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import { X, ExternalLink } from 'lucide-react';
import { Loader } from 'lucide-react';

const WebViewPage: React.FC = () => {
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [progress, setProgress] = useState(0);

  // استخراج الرابط من URL
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const urlParam = searchParams.get('url');

    if (urlParam) {
      setUrl(decodeURIComponent(urlParam));
    } else {
      setError('لم يتم توفير رابط للعرض');
      setLoading(false);
    }
  }, [location]);

  // دالة للتعامل مع تغييرات التحميل
  const handleLoadStart = () => {
    setLoading(true);
    setProgress(0);
  };

  const handleLoad = () => {
    setLoading(false);
    setProgress(100);
  };

  const handleLoadError = () => {
    setLoading(false);
    setProgress(0);
    setError('فشل تحميل الصفحة');
  };

  const handleProgress = (event: any) => {
    if (event.lengthComputable) {
      const percentComplete = (event.loaded / event.total) * 100;
      setProgress(percentComplete);
    }
  };

  const handleClose = () => {
    navigate(-1); // العودة للصفحة السابقة
  };

  const handleRefresh = () => {
    if (url) {
      setLoading(true);
      setError(null);
      setProgress(0);
      // في تطبيق حقيقي، سيتم إعادة تحميل محتوى WebView هنا
      // في هذا المثال، سنقوم فقط بمحاكاة إعادة التحميل
      setTimeout(() => {
        setLoading(false);
        setProgress(100);
      }, 1000);
    }
  };

  const handleGoBack = () => {
    if (canGoBack) {
      // في تطبيق حقيقي، سيتم العودة للصفحة السابقة في WebView هنا
      setCanGoBack(false);
    }
  };

  const handleGoForward = () => {
    if (canGoForward) {
      // في تطبيق حقيقي، سيتم التقدم للصفحة التالية في WebView هنا
      setCanGoForward(false);
    }
  };

  if (error) {
    return (
      <PageContainer>
        <AppNavbar />
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <div className="text-red-500 text-xl mb-4">{error}</div>
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
        {/* شريط الأدوات */}
        <div className="absolute top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-sm p-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button 
              onClick={handleGoBack}
              disabled={!canGoBack}
              className={`p-2 rounded-full ${canGoBack ? 'text-white hover:bg-black/50' : 'text-gray-400'}`}
            >
              {/* سهم اليسار */}
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <button 
              onClick={handleGoForward}
              disabled={!canGoForward}
              className={`p-2 rounded-full ${canGoForward ? 'text-white hover:bg-black/50' : 'text-gray-400'}`}
            >
              {/* سيم يمين */}
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>

          <div className="flex-1 mx-4">
            <div className="bg-black/30 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-imei-cyan h-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button 
              onClick={handleRefresh}
              className="p-2 rounded-full text-white hover:bg-black/50"
            >
              {/* رمز التحديث */}
              <Loader className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button 
              onClick={handleClose}
              className="p-2 rounded-full text-white hover:bg-black/50"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* محتوى WebView */}
        <div className="w-full h-screen pt-16">
          {loading ? (
            <div className="flex items-center justify-center h-full pt-16">
              <div className="text-center">
                <Loader className="w-10 h-10 animate-spin mx-auto mb-4 text-imei-cyan" />
                <p className="text-white">جاري التحميل...</p>
                <p className="text-white/70 text-sm mt-2">{url}</p>
              </div>
            </div>
          ) : (
            <div className="w-full h-full bg-white">
              {/* في تطبيق حقيقي، سيتم هنا استخدام WebView لعرض المحتوى */}
              {/* في هذا المثال، سنعرض واجهة بسيطة تخبر المستخدم بأنه في وضع WebView */}
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <ExternalLink className="w-16 h-16 text-imei-cyan mb-4" />
                <h2 className="text-xl font-bold mb-2 text-gray-800">عرض خارجي</h2>
                <p className="text-gray-600 mb-6">تم فتح الرابط في وضع العرض الخارجي</p>
                <div className="bg-gray-100 p-4 rounded-lg w-full max-w-md overflow-x-auto">
                  <p className="text-sm text-gray-700 break-all">{url}</p>
                </div>
                <div className="mt-6 text-sm text-gray-500">
                  <p>للعودة للتطبيق، استخدم زر الرجوع أو الإغلاق أعلى الشاشة</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
};

export default WebViewPage;
