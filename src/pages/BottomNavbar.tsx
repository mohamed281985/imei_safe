import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { House, PlusSquare, User, Bell, FileText, CheckCircle2, Clock, Sparkles, X, Plus } from 'lucide-react';
import { Search } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Notifications from '../components/Notifications';

interface Notification {
  id: string;
  title: string;
  body: string;
  created_at: string;
  is_read: boolean;
  notification_type?: string;
  imei?: string;
  metadata?: {
    imei?: string;
    [key: string]: any;
  };
}

interface BottomNavbarProps {
  isVisible?: boolean;
}

const BottomNavbar: React.FC<BottomNavbarProps> = ({ isVisible = true }) => {
  // حالة القائمة المنسدلة
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { t } = useLanguage();
  const { user, refreshNotifications } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [showMyReports, setShowMyReports] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCreateAdModal, setShowCreateAdModal] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeReportsCount, setActiveReportsCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showAllNotifications, setShowAllNotifications] = useState(false);

  const navbarRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const myReportsRef = useRef<HTMLDivElement>(null);

  // التحقق مما إذا كان المستخدم تجاريًا لعرض زر إنشاء الإعلان
  // تعديل الشرط ليشمل جميع أنواع الحسابات التجارية
  const isBusinessUser = user?.role && ['business', 'free_business', 'gold_business', 'silver_business'].includes(user.role);

  const fetchActiveReportsCount = async () => {
    if (!user) return;
    try {
      const { count, error } = await supabase
        .from('phone_reports')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (error) throw error;
      setActiveReportsCount(count || 0);
    } catch (err) {
      console.error('Error fetching active reports count:', err);
    }
  };

  const fetchNotifications = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id); // <--- التغيير: استخدام user.id

      if (!showAllNotifications) {
        query = query.eq('is_read', false);
      }
      const { data, error, count } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      const notificationsData = data || [];
      setNotifications(notificationsData);
      setUnreadCount(count || 0);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    try {
      if (!notification.is_read) {
        // تحديث الواجهة فوراً قبل تحديث قاعدة البيانات
        setNotifications(prev => prev.map(n =>
          n.id === notification.id ? { ...n, is_read: true } : n
        ));
        setUnreadCount(prev => Math.max(0, prev - 1));

        // تحديث قاعدة البيانات
        await supabase.from('notifications').update({ is_read: true }).eq('id', notification.id);
        refreshNotifications();
      }

      if (notification.notification_type === 'phone_found') {
        const imei = notification.imei || (notification.metadata && notification.metadata.imei);
        if (imei) {
          navigate(`/phone-found?imei=${encodeURIComponent(imei)}`);
          setShowNotifications(false);
        }
      }
    } catch (err) {
      console.error('Error handling notification click:', err); //
      toast({ title: 'خطأ', description: 'فشل في التعامل مع الإشعار', variant: 'destructive' });
    }
  };

  const markAllAsRead = async () => {
    if (!user || unreadCount === 0) return;
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id) // <--- التغيير: استخدام user.id
        .eq('is_read', false);
      fetchNotifications();
      refreshNotifications();
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[role="dialog"]') || target.closest('[data-radix-toast-viewport]')) {
        return;
      }
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setShowNotifications(false);
      }
      if (myReportsRef.current && !myReportsRef.current.contains(target)) {
        setShowMyReports(false);
      }
      if (showCreateAdModal && !target.closest('.create-ad-modal')) {
        setShowCreateAdModal(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCreateAdModal]);

  useEffect(() => {
    if (user) {
      fetchActiveReportsCount();
      fetchNotifications();

      const notificationsChannel = supabase
        .channel(`notifications:${user.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}` // <--- التغيير: استخدام user.id
        }, fetchNotifications)
        .subscribe();

        
      const reportsChannel = supabase
        .channel(`reports:${user.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'phone_reports',
          filter: `user_id=eq.${user.id}`
        }, fetchActiveReportsCount)
        .subscribe();


      return () => {
        supabase.removeChannel(notificationsChannel);
        supabase.removeChannel(reportsChannel);
      };
    }
  }, [user, showAllNotifications]);

  const navItems = [
    { path: '/dashboard', icon: House, label: t('home'), side: 'left' },
    { id: 'my-reports', icon: FileText, label: t('my_reports') || 'بلاغاتي', side: 'left', action: () => setShowMyReports(prev => !prev) },
    { id: 'notifications', icon: Bell, label: t('notifications'), side: 'right', action: () => setShowNotifications(prev => !prev) },
    { id: 'profile-menu', icon: User, label: t('my_account'), side: 'right', action: () => setMenuOpen(prev => !prev) },
  ];

  return (
    <div
      ref={navbarRef}
      className={`fixed bottom-0 left-0 right-0 bg-transparent print:hidden transition-transform duration-300 ease-in-out ${isVisible ? 'translate-y-0' : 'translate-y-full'} border-t-2 border-orange-500 rounded-t-2xl`}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        zIndex: 50,
        willChange: 'transform',
      }}
    >
      {showMyReports && (
        <div
          ref={myReportsRef}
          className="fixed w-full max-w-md px-2 z-50"
          style={{
            bottom: 'calc(3.5rem + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)'
          }}
        >
          <div className="bg-imei-dark/90 backdrop-blur-xl rounded-xl shadow-xl border border-imei-cyan/30 overflow-hidden">
            <Notifications isBottomNavbarVersion={true} />
          </div>
        </div>
      )}
      {showNotifications && (
        <div
          ref={notificationsRef}
          className="fixed w-full max-w-md px-2 z-50"
          style={{
            bottom: 'calc(3.5rem + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)'
          }}
        >
          <div className="bg-imei-dark/90 backdrop-blur-xl rounded-xl shadow-xl border border-imei-cyan/30 overflow-hidden">
            <div className="flex justify-between items-center p-3 border-b border-imei-cyan/20 bg-imei-dark/50">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Bell className="w-5 h-5 text-imei-cyan" />
                {t('notifications')}
              </h3>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setShowAllNotifications(prev => !prev)} className="text-xs text-imei-cyan hover:bg-imei-cyan/10 h-auto px-2 py-1">
                    {showAllNotifications ? t('show_unread_only', { defaultValue: 'Show Unread' }) : t('show_all', { defaultValue: 'Show All' })}
                  </Button>
                )}
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs text-imei-cyan hover:bg-imei-cyan/10 h-auto px-2 py-1">
                    <CheckCircle2 className="w-4 h-4 ml-1" />
                    {t('mark_all_as_read', { defaultValue: 'Mark all as read' })}
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-white h-8 w-8">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-gray-400">{t('loading')}...</div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-gray-400">{t('no_notifications')}</div>
              ) : (
                notifications.map(notification => (
                  <div
                    key={notification.id}
                    className={cn( //
                      "p-3 border-b border-imei-cyan/10 cursor-pointer transition-colors duration-200",
                      !notification.is_read ? "bg-imei-cyan/10 hover:bg-imei-cyan/20" : "hover:bg-imei-dark/50"
                    )}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className={cn("font-semibold mb-1", !notification.is_read ? "text-orange-400" : "text-orange-300")}>
                          {notification.title}
                        </h4>
                        <p className="text-sm text-white font-medium leading-relaxed drop-shadow-md">{notification.body}</p>
                        <div className="flex items-center mt-2 text-xs text-gray-500">
                          <Clock className="w-3 h-3 ml-1" />
                          <span>{new Date(notification.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      {!notification.is_read && (
                        <div className="w-2.5 h-2.5 rounded-full bg-imei-cyan mt-1 ml-2 flex-shrink-0 animate-pulse"></div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className="relative grid h-14 w-full max-w-lg mx-auto grid-cols-5 border-t border-imei-cyan/20 shadow-[0_-2px_10px_rgba(40,156,142,0.1)] rounded-t-2xl"
        style={{ background: '#053060' }}
      >
        {navItems.filter(item => item.side === 'left').map((item) => {
          if ('path' in item) {
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} className={cn('relative flex items-center justify-center w-full h-full hover:bg-imei-cyan/10 group transition-colors duration-200', isActive ? 'text-imei-cyan' : 'text-white/80 hover:text-white')}>
                <div className="flex flex-col items-center justify-center w-full h-full py-1">
                  <item.icon className={`w-6 h-6 mb-1 transition-all duration-200 text-white ${isActive ? 'scale-110' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
                  <span className={`text-xs transition-all duration-200 ${isActive ? 'font-bold' : 'group-hover:text-white'}`}>{item.label}</span>
                </div>
              </Link>
            );
          }
          const isActive = showMyReports && item.id === 'my-reports';
          return (
            <button key={item.id} onClick={item.action} className={`relative flex items-center justify-center w-full h-full hover:bg-imei-cyan/10 group transition-colors duration-200 ${isActive ? 'text-imei-cyan' : 'text-white/80 hover:text-white'}`}>
              <div className="flex flex-col items-center justify-center w-full h-full py-1">
                <item.icon className={`w-6 h-6 mb-1 transition-all duration-200 text-white ${isActive ? 'scale-110' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-xs transition-all duration-200 ${isActive ? 'font-bold' : 'group-hover:text-white'}`}>{item.label}</span>
                {item.id === 'my-reports' && activeReportsCount > 0 && <Badge className="absolute top-0 right-1 h-4 w-4 p-0 flex items-center justify-center text-xs bg-red-500 text-white">{activeReportsCount > 9 ? '9+' : activeReportsCount}</Badge>}
              </div>
            </button>
          );
        })}

        {/* زر إنشاء الإعلان في المنتصف */}
        {location.pathname === '/dashboard' ? (
          <>
            <button
              onClick={() => setShowCreateAdModal(prev => !prev)}
              className="relative flex items-center justify-center w-full h-full group"
            >
              <div className="flex items-center justify-center w-full h-full">
                <div className="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-r from-orange-500 to-orange-600 rounded-full shadow-lg hover:shadow-xl hover:shadow-orange-500/30 transition-all transform group-hover:-translate-y-1 -mt-1">
                  <Plus className="text-white relative z-10 transition-transform duration-300 group-hover:rotate-12" size={24} />
                </div>
              </div>
            </button>

            {/* نافذة إنشاء إعلان */}
            {showCreateAdModal && (
              <div
                className="create-ad-modal fixed bottom-0 left-0 right-0 bg-blue-900 border-t border-imei-cyan/20 shadow-[0_-2px_10px_rgba(40,156,142,0.1)] rounded-t-2xl z-50 flex flex-col items-center justify-center py-4"
                style={{
                  height: 'calc(3.6rem + env(safe-area-inset-bottom))',
                  paddingBottom: 'env(safe-area-inset-bottom)',
                  paddingLeft: 'env(safe-area-inset-left)',
                  paddingRight: 'env(safe-area-inset-right)',
                  animation: 'slide-up 0.3s ease-out'
                }}
              >
                {/* تعديل لعرض الخيارات بناءً على نوع المستخدم */}
                <div className="flex items-center justify-center w-full h-full -mt-5 gap-4">
                  <Link
                    to="/seller-dashboard"
                    className="flex items-center justify-center px-8 sm:px-11 py-2 bg-white text-blue-800 rounded-full font-bold text-base sm:text-lg shadow-lg hover:bg-blue-50 transition-colors"
                    onClick={() => setShowCreateAdModal(false)}
                  >
                    {t('sell_now')}
                  </Link>
                  {/* عرض زر "إنشاء إعلان" فقط للمستخدمين التجاريين */}
                  {isBusinessUser && (
                    <Link
                      to="/create-advertisement"
                      className="flex items-center justify-center px-6 py-2 bg-white text-blue-800 rounded-full font-bold text-base sm:text-lg shadow-lg hover:bg-blue-50 transition-colors"
                      onClick={() => setShowCreateAdModal(false)}
                    >
                      {t('create_advertisement')}
                    </Link>
                  )}
                </div>
                <button
                  onClick={() => setShowCreateAdModal(false)}
                  className="absolute top-2 right-2 text-white hover:text-white"
                >
                  <X size={28} />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="col-span-1" />
        )}

        {navItems.filter(item => item.side === 'right').map((item) => {
          if (item.id === 'profile-menu') {
            return (
              <Link key={item.id} to="/profile-menu" className="relative flex items-center justify-center w-full h-full hover:bg-imei-cyan/10 group transition-colors duration-200 text-white/80 hover:text-white">
                <div className="flex flex-col items-center justify-center w-full h-full py-1 relative">
                  <item.icon className="w-6 h-6 mb-1 transition-all duration-200 text-white" strokeWidth={2} />
                  <span className="text-xs transition-all duration-200 group-hover:text-white">{item.label}</span>
                </div>
              </Link>
            );
          }
          const isActive = item.id === 'notifications' ? showNotifications : false;
          return (
            <button
              key={item.id}
              onClick={item.action}
              className={`relative flex items-center justify-center w-full h-full hover:bg-imei-cyan/10 group transition-colors duration-200 ${isActive ? 'text-imei-cyan' : 'text-white/80 hover:text-white'}`}
            >
              <div className="flex flex-col items-center justify-center w-full h-full py-1 relative">
                <item.icon className={`w-6 h-6 mb-1 transition-all duration-200 text-white ${isActive ? 'scale-110' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-xs transition-all duration-200 ${isActive ? 'font-bold' : 'group-hover:text-white'}`}>{item.label}</span>
                {item.id === 'notifications' && unreadCount > 0 && (
                  <Badge className="absolute top-0 right-1 h-4 w-4 p-0 flex items-center justify-center text-xs bg-red-500 text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNavbar;
