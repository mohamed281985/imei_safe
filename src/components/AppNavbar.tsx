import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Logo from './Logo';
import { X, Search, Plus, LogOut, User, Settings, Key, Gift, MessageCircle } from 'lucide-react';
import Notifications from './Notifications';
import NotificationBell from './NotificationBell';
import { supabase } from '../lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const AppNavbar: React.FC = () => {
  const { user, logout, isAdmin } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  // تم إزالة حالة menuOpen
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotPasswordData, setForgotPasswordData] = useState({
    imei: '',
    newPassword: ''
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [bonusBalance, setBonusBalance] = useState(0);
  const [supportNumber, setSupportNumber] = useState('');
  const [countryCode, setCountryCode] = useState('');

  const handleLogout = () => {
    logout();
    navigate('/login');
  
  };

  const handleForgotPassword = async () => {
    if (!forgotPasswordData.imei || !forgotPasswordData.newPassword) {
      toast({
        title: 'خطأ',
        description: 'يرجى ملء جميع الحقول',
        variant: 'destructive'
      });
      return;
    }

    setIsProcessing(true);

    try {
      const resp = await fetch('/api/reset-registered-phone-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imei: forgotPasswordData.imei, newPassword: forgotPasswordData.newPassword })
      });

      if (!resp.ok) {
        const errText = await resp.text();
        toast({ title: 'خطأ', description: errText || 'حدث خطأ أثناء تحديث كلمة المرور', variant: 'destructive' });
        setIsProcessing(false);
        return;
      }

      toast({ title: 'نجح', description: 'تم تحديث كلمة المرور بنجاح' });
      setShowForgotPasswordModal(false);
      setForgotPasswordData({ imei: '', newPassword: '' });
    } catch (error) {
      console.error('Error updating password:', error);
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء تحديث كلمة المرور', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  // جلب معلومات الدعم الفني من قاعدة البيانات
  useEffect(() => {
    const fetchSupportInfo = async () => {
      try {
        console.log('جاري جلب بيانات الدعم الفني...');
        
        // جلب رقم الهاتف ورمز الدولة فقط
        const { data, error } = await supabase
          .from('support')
          .select('phone, cun');

        if (error) {
          console.error('خطأ في جلب بيانات الدعم الفني:', error);
          return;
        }

        // طباعة البيانات المسترجعة للتصحيح
        console.log('بيانات الدعم الفني المسترجعة:', data);
        
        // إذا كانت هناك بيانات، خذ السجل الأول
        if (data && data.length > 0) {
          const firstRecord = data[0];
          console.log('السجل الأول:', firstRecord);
          
          setSupportNumber(firstRecord.phone || '');
          setCountryCode(firstRecord.cun || '');
          
          console.log('تم تحديث معلومات الدعم الفني:', {
            phone: firstRecord.phone,
            cun: firstRecord.cun
          });
        } else {
          console.log('لا توجد بيانات في جدول الدعم الفني');
          // جرب استخدام قيم افتراضية للتصحيح
          setSupportNumber('1234567890');
          setCountryCode('20');
        }
      } catch (err) {
        console.error('خطأ في جلب بيانات الدعم الفني:', err);
      }
    };

    fetchSupportInfo();
  }, []);

  // دالة للتعامل مع الضغط على زر الدعم الفني
  const handleSupportClick = () => {
    if (!supportNumber) {
      toast({
        title: 'خطأ',
        description: 'رقم الدالفني غير متاح حالياً، يرجى المحاولة لاحقاً',
        variant: 'destructive'
      });
      return;
    }

    // فتح رابط واتساب مع رقم الدعم الفني مع رمز الدولة
    const fullNumber = countryCode ? `${countryCode}${supportNumber}` : supportNumber;
    const whatsappUrl = `https://wa.me/${fullNumber}`;
    window.open(whatsappUrl, '_blank');
  };

  // ⭐ جلب وتحديث رصيد البونص
  useEffect(() => {
    if (!user?.id) return;

    // 1. جلب أحدث رصيد بونص من آخر عملية دفع ناجحة
    const fetchBonus = async () => {
      console.log("جاري جلب بيانات البونص للمستخدم:", user.id);
      const { data: latestPaidRecord, error: fetchError } = await supabase
        .from('ads_payment')
        .select('id, user_id, bonus_offer, is_paid, payment_date')
        .eq('user_id', user.id)
        .eq('is_paid', true)
        .order('payment_date', { ascending: false })
        .limit(1);

      // جلب جميع السجلات المدفوعة للمستخدم للبحث عن البونص وتاريخ الانتهاء
      const { data: allPaidRecords, error: allRecordsError } = await supabase
        .from('ads_payment')
        .select('bonus_offer, expires_at')
        .eq('user_id', user.id)
        .eq('is_paid', true)
        .order('payment_date', { ascending: false });

      if (allRecordsError) {
        console.error("خطأ في جلب سجلات الدفع:", allRecordsError);
        setBonusBalance(0);
        return;
      }

      if (allPaidRecords && allPaidRecords.length > 0) {
        const recordWithBonus = allPaidRecords.find(record => record.bonus_offer != null && record.bonus_offer > 0);

        if (recordWithBonus) {
          const now = new Date();
          const expiresAt = recordWithBonus.expires_at ? new Date(recordWithBonus.expires_at) : null;

          // التحقق من أن الباقة لم تنتهِ صلاحيتها
          if (expiresAt && expiresAt > now) {
            const bonusValue = parseFloat(recordWithBonus.bonus_offer) || 0;
            setBonusBalance(bonusValue);
          } else {
            // إذا انتهت الصلاحية، يتم تعيين الرصيد إلى صفر
            setBonusBalance(0);
          }
        } else {
          setBonusBalance(0);
        }
      } else {
        setBonusBalance(0);
      }
    };

    fetchBonus();

    // 2. الاشتراك في التحديثات الفورية لجدول ads_payment
    const channel = supabase
      .channel(`user_payments_bonus_${user.id}`)
      .on('postgres_changes', {
        event: '*', // الاستماع للإنشاء والتحديث
        schema: 'public',
        table: 'ads_payment',
        filter: `user_id=eq.${user.id}`
      }, () => {
        // عند حدوث أي تغيير في مدفوعات المستخدم، أعد حساب البونص
        console.log('تغيير في مدفوعات المستخدم، إعادة حساب البونص...');
        fetchBonus();
      })
      .subscribe();

    // 3. إلغاء الاشتراك عند الخروج
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <div className="relative">
      {/* تم تعديل الكلاسات لتكون متجاوبة مع مختلف أحجام الشاشات */}
      <div className="flex justify-between items-center pt-8 sm:pt-8 pb-2 px-4 min-h-[3.5rem]">
        <div className="flex items-center h-14 min-h-[3.5rem]">
          {/* تصغير حجم الشعار على الشاشات الصغيرة */}
          <Logo size="md" className="scale-110" />
        </div>

        <div className="flex items-center gap-2 h-14 min-h-[3.5rem]">
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl py-1 flex items-center gap-2 shadow-lg transform transition-transform hover:scale-105 px-2 sm:px-4 h-10 min-h-[2.5rem] border border-blue-300">
            <Gift className="w-5 h-5 text-white" />
            <span className="text-white font-bold text-sm sm:text-base">
              {bonusBalance > 0 ? t('bonus_x_egp', { amount: Math.floor(bonusBalance).toLocaleString() }) : t('no_bonus')}
            </span>
          </div>
          {/* تم إزالة زر القائمة المنسدلة */}
        </div>
      </div>

      {/* Modal لنسيت كلمة المرور */}
      {showForgotPasswordModal && (
        <Dialog open={showForgotPasswordModal} onOpenChange={setShowForgotPasswordModal}>
          <DialogContent className="bg-imei-darker border-imei-cyan/30">
            <DialogHeader className="text-center">
              <DialogTitle className="text-white text-center">إعادة تعيين كلمة المرور</DialogTitle>
              <DialogDescription className="text-gray-300 text-center">
                الخاصه بالتطبيق وليس تسجيل الدخول
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="block text-white mb-2">رقم IMEI</label>
                <input
                  type="text"
                  value={forgotPasswordData.imei}
                  onChange={(e) => setForgotPasswordData(prev => ({
                    ...prev,
                    imei: e.target.value.replace(/\D/g, '')
                  }))}
                  className="input-field w-full"
                  maxLength={15}
                  placeholder="أدخل رقم IMEI"
                />
              </div>

              <div>
                <label className="block text-white mb-2">كلمة المرور الجديدة</label>
                <input
                  type="password"
                  value={forgotPasswordData.newPassword}
                  onChange={(e) => setForgotPasswordData(prev => ({
                    ...prev,
                    newPassword: e.target.value
                  }))}
                  className="input-field w-full"
                  placeholder="أدخل كلمة المرور الجديدة"
                />
              </div>
            </div>

            <DialogFooter className="gap-3">
              <Button
                onClick={() => setShowForgotPasswordModal(false)}
                variant="outline"
                className="border-imei-cyan/30 text-white"
              >
                إلغاء
              </Button>
              <Button
                onClick={handleForgotPassword}
                disabled={isProcessing}
                className="bg-orange-500 hover:bg-orange-600 text-white border-orange-500"
              >
                {isProcessing ? 'جارٍ التحديث...' : 'تحديث كلمة المرور'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default AppNavbar;
