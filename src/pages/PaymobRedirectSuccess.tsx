import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from "@/hooks/use-toast";
import PageContainer from '../components/PageContainer';

const PaymobRedirectSuccess: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    const handleRedirectSuccess = async () => {
      const urlParams = new URLSearchParams(location.search);
      const paymobOrderId = urlParams.get('order'); // ⭐ جلب رقم طلب Paymob
      const success = urlParams.get('success');

      if (success !== 'true' || !paymobOrderId) {
        toast({ title: t('error'), description: 'بيانات الدفع غير مكتملة أو غير ناجحة.', variant: 'destructive' });
        navigate('/payment-failed');
        return;
      }

      try {
        // ⭐ تحديث حالة الدفع في جدول ads_payment باستخدام paymob_order_id
        // هذا التحديث سيتم معالجته بواسطة الـ webhook على الخادم لضمان الأمان
        // هنا فقط نعرض رسالة النجاح ونوجه المستخدم

        toast({
          title: t('payment_success') || 'تم الدفع بنجاح',
          description: t('payment_successful_description') || 'شكراً لكم! تم تأكيد الدفع. سيتم تحديث حالة إعلانكم قريباً.',
          variant: 'default'
        });

        // الانتقال إلى الصفحة المناسبة بناءً على مصدر الدفع
        setTimeout(() => {
          // ⭐ توجيه المستخدم دائماً إلى صفحة إعلاناته
          navigate('/myads');
        }, 2000);

      } catch (error) {
        console.error('Error handling payment success:', error);
        toast({
          title: t('error') || 'خطأ',
          description: 'حدث خطأ أثناء معالجة الدفع الناجح',
          variant: 'destructive'
        });
        navigate('/myads'); // توجيه المستخدم إلى إعلاناته حتى في حالة الخطأ
      }
    };

    handleRedirectSuccess();
  }, [location, navigate, user, t]);

  return (
    <PageContainer>
      <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[70vh] relative">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-white mb-4">{t('payment_success') || 'تم الدفع بنجاح'}</h1>

          <p className="text-gray-300 mb-8">
            {t('processing') || 'جاري معالجة طلبك...'}
          </p>

          <div className="flex justify-center">
            <div className="w-8 h-8 border-4 border-imei-cyan border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

export default PaymobRedirectSuccess;
