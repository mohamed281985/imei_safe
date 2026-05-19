import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Logo from './Logo';
import { X, Search, Plus, LogOut, User, Settings, Key, Gift, MessageCircle } from 'lucide-react';
import PackageBadge from '@/components/PackageBadge';
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
          <div>
            <PackageBadge user={user} />
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
