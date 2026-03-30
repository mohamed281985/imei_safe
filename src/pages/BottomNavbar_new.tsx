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
        .eq('email', user.email);

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
        await supabase.from('notifications').update({ is_read: true }).eq('id', notification.id);
        fetchNotifications();
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
      console.error('Error handling notification click:', err);
      toast({ title: 'خطأ', description: 'فشل في التعامل مع الإشعار', variant: 'destructive' });
    }
  };

  const markAllAsRead = async () => {
    if (!user || unreadCount === 0) return;
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('email', user.email).eq('is_read', false);
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

      const notificationsChannel = supabase.channel(`notifications:${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `email=eq.${user.email}` }, fetchNotifications).subscribe();
      const reportsChannel = supabase.channel(`reports:${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'phone_reports', filter: `user_id=eq.${user.id}` }, fetchActiveReportsCount).subscribe();

      return () => {
        supabase.removeChannel(notificationsChannel);
        supabase.removeChannel(reportsChannel);
      };
    }
  }, [user, showAllNotifications]);

  const navItems = [
  { path: '/dashboard', icon: House, label: 'الرئيسية', side: 'left' },
  { id: 'my-reports', icon: FileText, label: t('my_reports') || 'بلاغاتي', side: 'left', action: () => setShowMyReports(prev => !prev) },
  { id: 'notifications', icon: Bell, label: 'الإشعارات', side: 'right', action: () => setShowNotifications(prev => !prev) },
  { id: 'profile-menu', icon: User, label: 'حسابي', side: 'right', action: () => setMenuOpen(prev => !prev) },
  ];

  const getLocalizedNotificationText = (notification: Notification) => {
    if (notification.notification_type !== 'phone_found') {
      return { title: notification.title, body: notification.body };
    }

    const imei = notification.imei || (notification.metadata && notification.metadata.imei) || '';
    const phoneMatch = (notification.body || '').match(/\+?\d{6,}/);
    const phone = phoneMatch ? phoneMatch[0] : '';

    return {
      title: t('notification_phone_found_title', { imei: imei || '-' }),
      body: t('notification_phone_found_body', { phone: phone || '-' })
    };
  };

  return (
    <div //
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
                    className={cn(
                      "p-3 border-b border-imei-cyan/10 cursor-pointer transition-colors duration-200",
                      !notification.is_read ? "bg-imei-cyan/10 hover:bg-imei-cyan/20" : "hover:bg-imei-dark/50"
                    )}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        {(() => {
                          const localized = getLocalizedNotificationText(notification);
                          return (
                            <>
                              <h4 className={cn("font-semibold mb-1", !notification.is_read ? "text-white" : "text-gray-300")}>
                                {localized.title}
                              </h4>
                              <p className="text-sm text-gray-400 leading-relaxed">{localized.body}</p>
                            </>
                          );
                        })()}
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
        style={{ background: '#003b46' }}
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
        {isBusinessUser && location.pathname === '/dashboard' ? (
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
                className="absolute bottom-14 left-1/2 -translate-x-1/2 mx-auto max-w-md z-50 bg-imei-darker rounded-lg shadow-lg border border-imei-cyan border-opacity-30 animate-accordion-down w-64"
              >
                <div className="py-1.5">
                  <Link
                    to="/seller-dashboard"
                    className="flex items-center px-4 py-3.5 text-white hover:bg-imei-dark/80 transition-colors duration-200 relative overflow-hidden group"
                    onClick={() => setShowCreateAdModal(false)}
                  >
                    <div className="absolute inset-0 bg-imei-cyan/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
                    <div className="relative z-10 mr-3 flex items-center justify-center w-8 h-8 rounded-lg bg-imei-cyan/10 group-hover:bg-imei-cyan/20 transition-colors duration-200">
                      <PlusSquare className="text-imei-cyan" size={18} />
                    </div>
                    <span className="relative z-10 font-medium text-sm">{t('sell_phone')}</span>
                  </Link>
                  <Link
                    to="/create-advertisement"
                    className="flex items-center px-4 py-3.5 text-white hover:bg-imei-dark/80 transition-colors duration-200 relative overflow-hidden group"
                    onClick={() => setShowCreateAdModal(false)}
                  >
                    <div className="absolute inset-0 bg-imei-cyan/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
                    <div className="relative z-10 mr-3 flex items-center justify-center w-8 h-8 rounded-lg bg-imei-cyan/10 group-hover:bg-imei-cyan/20 transition-colors duration-200">
                      <FileText className="text-imei-cyan" size={18} />
                    </div>
                    <span className="relative z-10 font-medium text-sm">{t('create_ad')}</span>
                  </Link>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="col-span-1" />
        )}

        {navItems.filter(item => item.side === 'right').map((item) => {
          if (item.id === 'profile-menu') {
            return (
              <Link key={item.id} to="/profile-menu" className={`relative flex items-center justify-center w-full h-full hover:bg-imei-cyan/10 group transition-colors duration-200 text-white/80 hover:text-white`}>
                <div className="flex flex-col items-center justify-center w-full h-full py-1 relative">
                  <item.icon className="w-6 h-6 mb-1 transition-all duration-200 text-white" strokeWidth={2} />
                  <span className="text-xs transition-all duration-200 group-hover:text-white">{item.label}</span>
                </div>
              </Link>
            );
          }
          if ('path' in item) {
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} className={`flex items-center justify-center w-full h-full hover:bg-imei-cyan/10 group transition-colors duration-200 ${isActive ? 'text-imei-cyan' : 'text-white/80 hover:text-white'}`}>
                <div className="flex flex-col items-center justify-center w-full h-full py-1">
                  <item.icon className={`w-6 h-6 mb-1 transition-all duration-200 text-white ${isActive ? 'scale-110' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
                  <span className={`text-xs transition-all duration-200 ${isActive ? 'font-bold' : 'group-hover:text-white'}`}>{item.label}</span>
                </div>
              </Link>
            );
          }
          const isActive = showNotifications;
          return (
            <button key={item.id} onClick={item.action} className={`relative flex items-center justify-center w-full h-full hover:bg-imei-cyan/10 group transition-colors duration-200 ${isActive ? 'text-imei-cyan' : 'text-white/80 hover:text-white'}`}>
              <div className="flex flex-col items-center justify-center w-full h-full py-1 relative">
                <item.icon className={`w-6 h-6 mb-1 transition-all duration-200 text-white ${isActive ? 'scale-110' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-xs transition-all duration-200 ${isActive ? 'font-bold' : 'group-hover:text-white'}`}>{item.label}</span>
                {unreadCount > 0 && <Badge className="absolute top-0 right-1 h-4 w-4 p-0 flex items-center justify-center text-xs bg-red-500 text-white">{unreadCount > 9 ? '9+' : unreadCount}</Badge>}
              </div>
            </button>
          );
        })}
      {/* القائمة المنسدلة لحسابي */}
      {menuOpen && (
        <div className="absolute bottom-16 right-0 left-0 mx-auto max-w-md z-50 bg-imei-darker rounded-lg shadow-lg border border-imei-cyan border-opacity-30 animate-accordion-down">
          <div className="py-1.5">
            <Link to="/dashboard" className="flex items-center px-4 py-3.5 text-white hover:bg-imei-dark/80 transition-colors duration-200 relative overflow-hidden group" onClick={() => setMenuOpen(false)}>
              <div className="absolute inset-0 bg-imei-cyan/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
              <div className="relative z-10 mr-3 flex items-center justify-center w-8 h-8 rounded-lg bg-imei-cyan/10 group-hover:bg-imei-cyan/20 transition-colors duration-200">
                <User className="text-imei-cyan" size={18} />
              </div>
              <span className="relative z-10 font-medium text-sm">{t('dashboard')}</span>
            </Link>
            <Link to="/report" className="flex items-center px-4 py-3.5 text-white hover:bg-imei-dark/80 transition-colors duration-200 relative overflow-hidden group" onClick={() => setMenuOpen(false)}>
              <div className="absolute inset-0 bg-imei-cyan/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
              <div className="relative z-10 mr-3 flex items-center justify-center w-8 h-8 rounded-lg bg-imei-cyan/10 group-hover:bg-imei-cyan/20 transition-colors duration-200">
                <PlusSquare className="text-imei-cyan" size={18} />
              </div>
              <span className="relative z-10 font-medium text-sm">{t('report_lost_phone')}</span>
            </Link>
            <Link to="/search" className="flex items-center px-4 py-3.5 text-white hover:bg-imei-dark/80 transition-colors duration-200 relative overflow-hidden group" onClick={() => setMenuOpen(false)}>
              <div className="absolute inset-0 bg-imei-cyan/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
              <div className="relative z-10 flex items-center mr-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-imei-cyan/10 group-hover:bg-imei-cyan/20 transition-colors duration-200 mr-2">
                  <Search className="text-imei-cyan" size={18} />
                </div>
                <span className="font-medium text-sm">{t('search_imei')}</span>
              </div>
            </Link>
            <button onClick={() => { /* دعم فني أو إعدادات */ setMenuOpen(false); }} className="flex items-center px-4 py-3.5 text-white hover:bg-imei-dark/80 transition-colors duration-200 relative overflow-hidden group w-full text-left">
              <div className="absolute inset-0 bg-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
              <div className="relative z-10 flex items-center mr-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-500/10 group-hover:bg-green-500/20 transition-colors duration-200 mr-2">
                  <Sparkles className="text-green-500" size={18} />
                </div>
                <span className="font-medium text-sm">{t('support')}</span>
              </div>
            </button>
            <button onClick={() => { /* تسجيل خروج */ setMenuOpen(false); }} className="w-full text-left flex items-center px-4 py-3.5 text-white hover:bg-imei-dark/80 transition-colors duration-200 relative overflow-hidden group rounded-b-lg">
              <div className="absolute inset-0 bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
              <div className="relative z-10 mr-3 flex items-center justify-center w-8 h-8 rounded-lg bg-rose-500/10 group-hover:bg-rose-500/20 transition-colors duration-200">
                <X className="text-rose-400" size={18} />
              </div>
              <span className="relative z-10 font-medium text-sm">{t('logout')}</span>
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default BottomNavbar;
