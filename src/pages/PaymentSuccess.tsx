import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../components/PageContainer';

const PaymentSuccess: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  React.useEffect(() => {
    // تم نقل منطق تحديث قاعدة البيانات إلى الـ webhook في الخادم لضمان الأمان
    // هذه الصفحة الآن للعرض فقط
  }, []);

  return (
    <PageContainer>
      <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[70vh]">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-white mb-4">{t('payment_success') || 'تم الدفع بنجاح'}</h1>

          <p className="text-gray-300 mb-8">
            {t('payment_successful_description') || 'شكراً لكم! تم تأكيد الدفع بنجاح. سيتم نشر إعلانكم المميز قريباً.'}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/myads')}
              className="bg-imei-cyan hover:bg-imei-cyan/90 text-white font-medium py-3 px-6 rounded-lg transition duration-200"
            >
              {t('view_my_ads') || 'عرض إعلاناتي'}
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

export default PaymentSuccess;
