import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate, useLocation } from 'react-router-dom';
import PageContainer from '../components/PageContainer';

const PaymentFailed: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const urlParams = new URLSearchParams(location.search);
  const sourcePage = urlParams.get('source') || '/'; // القيمة الافتراضية هي الصفحة الرئيسية

  return (
    <PageContainer>
      <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[70vh]">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-white mb-4">{t('payment_failed') || 'فشل الدفع'}</h1>

          <p className="text-gray-300 mb-8">
            {t('payment_failed_description') || 'عذراً، لم يتم إتمام عملية الدفع بنجاح. يرجى المحاولة مرة أخرى أو الاتصال بالدعم الفني إذا استمرت المشكلة.'}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate(sourcePage)}
              className="bg-imei-cyan hover:bg-imei-cyan/90 text-white font-medium py-3 px-6 rounded-lg transition duration-200"
            >
              {t('try_again') || 'إعادة المحاولة'}
            </button>

            <button
              onClick={() => navigate('/')}
              className="bg-imei-darker hover:bg-imei-darker/90 border border-imei-cyan/50 text-imei-cyan font-medium py-3 px-6 rounded-lg transition duration-200"
            >
              {t('back_to_home') || 'العودة للرئيسية'}
            </button>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

export default PaymentFailed;
