import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Logo from './Logo';
import { X, Search, Plus, LogOut, User, Settings, Key, Gift, MessageCircle, Coins } from 'lucide-react';
import Notifications from './Notifications';
import NotificationBell from './NotificationBell';
import { useRewardBalance } from '@/hooks/useRewardBalance';
import { dailyRewardSchedule } from '@/data/rewards';
import { supabase } from '../lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const AppNavbar: React.FC = () => {
  const { user, logout, isAdmin } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  // تم إزالة حالة menuOpen
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotPasswordData, setForgotPasswordData] = useState({
    imei: '',
    newPassword: ''
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [supportNumber, setSupportNumber] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const { balance: coinBalance } = useRewardBalance();
  const userId = user?.id;
  const [dailyRewardStatus, setDailyRewardStatus] = useState({
    claimedToday: false,
    amount: dailyRewardSchedule[0].amount,
  });

  useEffect(() => {
    let active = true;
    const syncDailyRewardStatus = async () => {
      if (!userId) {
        if (active) setDailyRewardStatus({ claimedToday: false, amount: dailyRewardSchedule[0].amount });
        return;
      }

      const { data, error } = await supabase.rpc('get_daily_reward_status');
      if (error) {
        console.warn('Could not sync daily reward status:', error.message);
        return;
      }
      if (!active || !data) return;

      const status = data as { claimed_today?: boolean; amount?: number };
      setDailyRewardStatus({
        claimedToday: Boolean(status.claimed_today),
        amount: Number(status.amount) || dailyRewardSchedule[0].amount,
      });
    };

    void syncDailyRewardStatus();
    window.addEventListener('imei-safe-daily-reward-updated', syncDailyRewardStatus);
    window.addEventListener('focus', syncDailyRewardStatus);
    return () => {
      active = false;
      window.removeEventListener('imei-safe-daily-reward-updated', syncDailyRewardStatus);
      window.removeEventListener('focus', syncDailyRewardStatus);
    };
  }, [userId]);

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
    const cleanPhone = fullNumber.replace(/\D/g, '');
    const whatsappDeepLink = `whatsapp://send?phone=${cleanPhone}`;
    const whatsappWebLink = `https://wa.me/${cleanPhone}`;

    const capacitor = (window as any)?.Capacitor;
    if (capacitor) {
      try {
        capacitor.Plugins.Browser.open({ url: whatsappDeepLink });
      } catch (e) {
        capacitor.Plugins.Browser.open({ url: whatsappWebLink });
      }
    } else {
      window.location.href = whatsappDeepLink;
      setTimeout(() => {
        window.open(whatsappWebLink, '_blank');
      }, 500);
    }
  };

  // bonus system removed: package/role will govern privileges

  return (
    <div className="relative">
      {/* تم تعديل الكلاسات لتكون متجاوبة مع مختلف أحجام الشاشات */}
      <div className="flex justify-between items-center pt-3 pb-2 px-4">
        <div className="flex items-center h-14 min-h-[3.5rem]">
          {/* تصغير حجم الشعار على الشاشات الصغيرة */}
          <Logo size="md" className="scale-110" />
        </div>

        <div className="flex items-center gap-2 h-14 min-h-[3.5rem]">
          <div className="relative">
            <button
              type="button"
              onClick={() => navigate('/daily-reward')}
              className="group inline-flex min-h-10 min-w-0 max-w-[min(220px,calc(100vw-2rem))] items-center gap-2 rounded-2xl border border-amber-200/80 bg-white/80 px-2 py-1 text-right shadow-[0_6px_16px_rgba(2,6,23,0.12)] backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-amber-50"
              aria-label={dailyRewardStatus.claimedToday ? 'تم استلام مكافأة اليوم' : `مكافأة الدخول اليومي +${dailyRewardStatus.amount} Coins`}
            >
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-400 text-white shadow-inner shadow-amber-600/30">
                <Coins className="h-4 w-4 drop-shadow-sm" />
                {!dailyRewardStatus.claimedToday && userId && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white"><span className="absolute inset-0 animate-ping rounded-full bg-rose-400 opacity-60" /></span>}
              </span>
              <span className="flex min-w-0 flex-col items-center gap-0 text-center leading-none">
                <span className="-translate-y-0.5 text-sm font-extrabold leading-none text-slate-700">اضغط واجمع</span>
                <span className="max-w-full text-base font-black leading-none text-slate-900 [overflow-wrap:anywhere]">{new Intl.NumberFormat('en-US').format(coinBalance)}</span>
                {dailyRewardStatus.claimedToday ? (
                  null
                ) : userId ? (
                  <span className="animate-pulse max-w-full whitespace-normal rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-black leading-none text-amber-800">🎁 اضغط واجمع +{dailyRewardStatus.amount}</span>
                ) : (
                  <span className="whitespace-nowrap text-[10px] font-black text-amber-700">مكافأة الدخول</span>
                )}
              </span>
            </button>
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
