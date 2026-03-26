import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from "@/hooks/use-toast";
import PageContainer from '../components/PageContainer';

const PaymobRedirectFailed: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    const handleRedirectFailed = async () => {
      const urlParams = new URLSearchParams(location.search);
      const source = urlParams.get('source');

      try {
        toast({
          title: t('payment_failed') || 'فشل الدفع',
          description: t('payment_failed_description') || 'عذراً، لم يتم إتمام عملية الدفع بنجاح. يرجى المحاولة مرة أخرى أو الاتصال بالدعم الفني إذا استمرت المشكلة.',
          variant: 'destructive'
        });

        // الانتقال إلى الصفحة المناسبة بناءً على مصدر الدفع
        setTimeout(() => {
          if (source === 'special') {
            navigate('/special-ad');
          } else if (source === 'publish') {
            navigate('/publish-ad');
          } else {
            navigate('/dashboard');
          }
        }, 2000);

      } catch (error) {
        console.error('Error handling payment failure:', error);
        navigate('/dashboard');
      }
    };

    handleRedirectFailed();
  }, [location, navigate, t]);

  return (
    <PageContainer>
      <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[70vh] relative">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-white mb-4">{t('payment_failed') || 'فشل الدفع'}</h1>

          <p className="text-gray-300 mb-8">
            {t('processing') || 'جاري معالجة طلبك...'}
          </p>

          <div className="flex justify-center">
            <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

export default PaymobRedirectFailed;
