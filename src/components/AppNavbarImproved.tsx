import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Logo from './Logo';
import { Menu, X, Search, Plus, LogOut, User, Settings, Key, ArrowLeft } from 'lucide-react';
import Notifications from './Notifications';
import { supabase } from '../lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Props for AppNavbar
interface AppNavbarProps {
  title?: string;
  onBack?: () => void;
}

const AppNavbar: React.FC<AppNavbarProps> = ({ title, onBack }) => {
  const { user, logout, isAdmin } = useAuth();
  const { language, changeLanguage } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotPasswordData, setForgotPasswordData] = useState({
    imei: '',
    newPassword: ''
  });
  const [isProcessing, setIsProcessing] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
    setMenuOpen(false);
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
        // Delegate password reset to server which will verify ownership by user email
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

  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener('closeMenu', close);
    return () => window.removeEventListener('closeMenu', close);
  }, []);

  return (
    <div className="relative">
      <div className="flex justify-between items-center py-3">
        <div className="flex items-center">
          {onBack && (
            <button
              onClick={onBack}
              className="text-white mr-3"
            >
              <ArrowLeft size={24} />
            </button>
          )}
          {title && (
            <h1 className="text-white text-xl font-semibold">{title}</h1>
          )}
          {!title && <Logo size="md" />}
        </div>

        <div className="flex items-center gap-2">
          <Notifications />
          <button
                  className="text-imei-cyan hover:text-white transition-colors shadow-lg"
            onClick={() => {
              setMenuOpen(!menuOpen);
              window.dispatchEvent(new Event('closeNotifications'));
            }}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {menuOpen && (
  <div className="absolute top-full left-0 right-0 mt-2 glass-bg rounded-lg shadow-lg z-50 border border-imei-cyan border-opacity-30 animate-accordion-down">
          <div className="py-2">
            <Link
              to="/dashboard"
                   className="flex items-center px-4 py-2 text-white hover:glass-bg shadow-lg hover:shadow-black/20"
              onClick={() => setMenuOpen(false)}
            >
              <User size={18} className="mr-2 text-imei-cyan" />
              {language === 'ar' ? 'لوحة التحكم' : 'Dashboard'}
            </Link>

            <Link
              to="/report"
                   className="flex items-center px-4 py-2 text-white hover:glass-bg shadow-lg hover:shadow-black/20"
              onClick={() => setMenuOpen(false)}
            >
              <Plus size={18} className="mr-2 text-imei-cyan" />
              {language === 'ar' ? 'الإبلاغ عن هاتف مفقود' : 'Report Lost Phone'}
            </Link>

            <Link
              to="/search"
                   className="flex items-center px-4 py-2 text-white hover:glass-bg shadow-lg hover:shadow-black/20"
              onClick={() => setMenuOpen(false)}
            >
              <Search size={18} className="mr-2 text-imei-cyan" />
              {language === 'ar' ? 'بحث برقم IMEI' : 'Search IMEI'}
            </Link>

            {isAdmin && (
              <Link
                to="/admin"
                     className="flex items-center px-4 py-2 text-white hover:glass-bg shadow-lg hover:shadow-black/20"
                onClick={() => setMenuOpen(false)}
              >
                <Settings size={18} className="mr-2 text-imei-cyan" />
                Admin
              </Link>
            )}
            <button
              onClick={() => {
                setShowForgotPasswordModal(true);
                setMenuOpen(false);
              }}
                   className="flex items-center px-4 py-2 text-white hover:glass-bg w-full text-left shadow-lg hover:shadow-black/20"
            >
              <Key size={18} className="mr-2 text-imei-cyan" />
              {language === 'ar' ? 'نسيت كلمة المرور' : 'Forgot Password'}
            </button>

            <button
              onClick={handleLogout}
                   className="w-full text-left flex items-center px-4 py-2 text-white hover:glass-bg shadow-lg hover:shadow-black/20"
            >
              <LogOut size={18} className="mr-2 text-imei-cyan" />
              {language === 'ar' ? 'تسجيل الخروج' : 'Logout'}
            </button>
          </div>
        </div>
      )}

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
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                onClick={handleForgotPassword}
                disabled={isProcessing}
                className="bg-orange-500 hover:bg-orange-600 text-white border-orange-500"
              >
                {isProcessing ? (language === 'ar' ? 'جارٍ التحديث...' : 'Updating...') : (language === 'ar' ? 'تحديث كلمة المرور' : 'Update Password')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default AppNavbar;
