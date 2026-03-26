import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { X, Star, Crown, Zap, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';

import AdsOfferSliderComponent from '@/components/advertisements/AdsOfferSlider';
interface AdsOfferSliderProps {
  onClose: () => void;
  userId: string;
  isUpgradePrompt?: boolean; // تمرير الخاصية من المكون الأب
}

const AdsOfferSlider: React.FC<AdsOfferSliderProps> = ({ onClose, userId, isUpgradePrompt }) => {
  const { t } = useLanguage();
  const [adsData, setAdsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // دالة لجلب بيانات العروض من جدول users أو businesses
  const fetchAdsData = async () => {
    try {
      setLoading(true);

      // التحقق من تسجيل الدخول
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // جلب بيانات المستخدم من جدول users
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!userError && userData) {
        // إذا كان المستخدم موجودًا في جدول users، نعرض صوره من نفس الصف
        console.log('المستخدم موجود في جدول users:', userData);
        setAdsData([{
          id: userData.id,
          title: userData.name || 'باقة المستخدم',
          description: userData.description || 'عروض خاصة بالمستخدم',
          imagesmall_url: userData.imagesmall_url || '/placeholder.svg',
          all_users: 'users',
          features: userData.features || ['زيادة عمليات البحث', 'وصول مسبق', 'دعم فني']
        }]);
        setLoading(false);
        return;
      }

      // إذا لم يكن المستخدم في جدول users، نتحقق من جدول businesses
      const { data: businessData, error: businessError } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!businessError && businessData) {
        // إذا كان المستخدم موجودًا في جدول businesses، نعرض صوره من نفس الصف
        console.log('المستخدم موجود في جدول businesses:', businessData);
        setAdsData([{
          id: businessData.id,
          title: businessData.name || 'باقة الشركة',
          description: businessData.description || 'عروض خاصة بالشركة',
          imagesmall_url: businessData.imagesmall_url || '/placeholder.svg',
          all_users: 'businesses',
          features: businessData.features || ['عمليات بحث غير محدودة', 'تقارير مفصلة', 'وصول فوري']
        }]);
        setLoading(false);
        return;
      }

      // إذا لم يكن المستخدم في أي من الجداول، نعرض رسالة مناسبة
      console.log('المستخدم غير موجود في أي جدول');
      setAdsData([{
        id: 0,
        title: 'لم يتم العثور على عروض',
        description: 'لم يتم العثور على عروض خاصة بهذا المستخدم',
        imagesmall_url: '/placeholder.svg',
        all_users: 'none',
        features: ['تواصل معنا للحصول على عرض خاص']
      }]);
      setLoading(false);
    } catch (error) {
      console.error('خطأ في جلب بيانات العروض:', error);
      // في حالة حدوث خطأ، نستخدم بيانات افتراضية
      setAdsData([{
        id: 1,
        title: 'خطأ في تحميل العروض',
        description: 'حدث خطأ أثناء تحميل العروض الخاصة بك',
        imagesmall_url: '/placeholder.svg',
        all_users: 'none',
        features: ['تواصل معنا للحصول على مساعدة']
      }]);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdsData();
  }, [userId]);

  const handleSubscribe = async (planId: string) => {
    try {
      // هنا يمكنك إضافة منطق الاشتراك في الباقة
      console.log('الاشتراك في الباقة:', planId);

      // مثال على تحديث دور المستخدم
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // تحديث دور المستخدم في جدول users
        const { error } = await supabase
          .from('users')
          .update({ role: planId })
          .eq('id', user.id);

        if (error) {
          console.error('خطأ في تحديث دور المستخدم:', error);
          return;
        }

        console.log('تم تحديث دور المستخدم بنجاح');
      }

      // إغلاق النافذة بعد الاشتراك
      onClose();
    } catch (error) {
      console.error('خطأ في عملية الاشتراك:', error);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center  p-4">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // استخدام createPortal لعرض النافذة على مستوى أعلى في DOM
  const modalRoot = document.getElementById('modal-root') || document.body;
  
  const modalContent = (
    <div className="fixed inset-0 bg-black bg-opacity-0 flex items-center justify-center z-50">
      <div className="bg-green-100/30 backdrop-blur-2xl rounded-2xl shadow-2xl w-[95%] h-[95vh] max-w-lg mx-auto border border-white/0 relative overflow-hidden pt-[50px] bg-clip-padding">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 bg-red-600 text-white rounded-full p-1.5 shadow-lg hover:bg-red-700 transition-colors z-10"
          aria-label="إغلاق"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center justify-center h-full pt-35 pb-16">
          <AdsOfferSliderComponent isUpgradePrompt={isUpgradePrompt} />
        </div>
      </div>
    </div>
  );
  
  return createPortal(modalContent, modalRoot);
};

export default AdsOfferSlider;
