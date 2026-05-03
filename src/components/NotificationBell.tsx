import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bell, X, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { markNotificationAsRead, markAllNotificationsAsRead } from '../lib/notificationService';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { decryptIMEI, encryptIMEI } from '@/lib/imeiCrypto';

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

const NotificationBell: React.FC = () => {
  const { user, unreadNotificationsCount, refreshNotifications } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const encryptedEmail = encryptIMEI(user.email || '');
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('email', encryptedEmail)
        .eq('is_read', false)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('خطأ في جلب الإشعارات:', error);
        toast({
          title: 'خطأ',
          description: 'فشل في جلب الإشعارات',
          variant: 'destructive',
        });
      } else {
        const notificationsData = data || [];
        setNotifications(notificationsData);
        setUnreadCount(notificationsData.length);
      }
    } catch (err) {
      console.error('خطأ:', err);
      toast({
        title: 'خطأ',
        description: 'حدث خطأ غير متوقع أثناء جلب الإشعارات',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    try {
      if (!notification.is_read && notification.id) {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notification.id);
        // تحديث حالة الإشعار في الواجهة بدلاً من إزالته
        setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n));
        refreshNotifications();
      }

      const decodeImei = (value?: string) => {
        if (!value) return '';
        try {
          const decoded = decryptIMEI(value);
          if (/^\d{14,16}$/.test(decoded)) return decoded;
        } catch (e) {
          // ignore
        }
        return value;
      };

      if (notification.notification_type === 'phone_found') {
        const imei = decodeImei(notification.imei || (notification.metadata && notification.metadata.imei));
        if (imei) {
          navigate(`/phone-found?imei=${encodeURIComponent(imei)}`);
          setShowNotifications(false);
        }
      }
    } catch (err) {
      console.error('خطأ في معالجة النقر على الإشعار:', err);
      toast({ title: 'خطأ', description: 'فشل في التعامل مع الإشعار', variant: 'destructive' });
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    try {
      await markAllNotificationsAsRead(user.email);
      fetchNotifications();
      refreshNotifications();
    } catch (err) {
      console.error('خطأ:', err);
      toast({ title: 'خطأ', description: 'فشل في تحديث جميع الإشعارات', variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    } else {
      setUnreadCount(0);
      setNotifications([]);
    }
  }, [user]);

  useEffect(() => {
    if (showNotifications && user) {
      fetchNotifications();
    }
  }, [showNotifications, user]);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "relative w-10 h-10 rounded-lg transition-all duration-300 hover:scale-105 group",
          "bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600",
          "text-white shadow-lg hover:shadow-xl overflow-hidden",
          unreadCount > 0 && "animate-pulse"
        )}
        onClick={() => setShowNotifications(!showNotifications)}
      >
        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <Bell className="h-5 w-5 relative z-10" />
        {unreadCount > 0 && (
          <Badge
            className={cn(
              "absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs",
              "bg-gradient-to-br from-yellow-400 to-orange-500 text-white",
              "animate-bounce shadow-lg border-2 border-white"
            )}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>

      {showNotifications && (
        <div className={cn(
          "fixed w-80 bg-white/40 backdrop-blur-lg rounded-lg shadow-lg border border-imei-cyan border-opacity-30 z-[9999]",
          "bg-gradient-to-br from-blue-50 to-sky-50",
          "border border-cyan-200 backdrop-blur-sm",
          "transform transition-all duration-300 ease-out"
        )} style={{
          top: 90,
          ['ar' === 'ar' ? 'left' : 'right']: 8 // تحريك النافذة إلى اليسار قليلاً
        }}>
          <div className={cn(
            "flex justify-between items-center p-4",
            "bg-gradient-to-r from-blue-600 to-sky-600",
            "text-white shadow-lg"
          )}>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Bell className="h-6 w-6" />
                <Sparkles className="h-3 w-3 absolute -top-1 -right-1 text-yellow-300" />
              </div>
              <h3 className="font-bold text-lg">
                الإشعارات
              </h3>
              {unreadCount > 0 && (
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "bg-white/20 text-white border-white/30",
                    "hover:bg-white/30"
                  )}
                >
                  {unreadCount} غير مقروء
                </Badge>
              )}
            </div>
            <div className="flex space-x-2">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                  className={cn(
                    "text-white hover:bg-white/20 font-bold",
                    "transition-all duration-200 h-auto py-2 px-3",
                    "flex flex-col items-center gap-1 text-sm leading-tight"
                  )}
                >
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <div className="text-center">
                    <div>تحديد الكل</div>
                    <div>كمقروء</div>
                  </div>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowNotifications(false)}
                className={cn(
                  "text-white hover:bg-white/20",
                  "transition-all duration-200"
                )}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
                <p className="mt-2 text-sm text-gray-600">جاري التحميل...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="relative">
                  <Bell className="h-16 w-16 text-purple-300 mx-auto mb-4" />
                  <Sparkles className="h-6 w-6 absolute top-0 right-1/2 text-yellow-400 animate-pulse" />
                </div>
                <p className="text-gray-600 font-medium">لا توجد إشعارات جديدة</p>
                <p className="text-sm text-gray-500 mt-2">{user?.email}</p>
              </div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  className={cn(
                    "p-4 border-b last:border-b-0 cursor-pointer",
                    "transition-all duration-300 hover:shadow-lg hover:scale-[1.02]",
                    "hover:bg-white/50",
                    !notification.is_read ? "bg-gradient-to-r from-purple-100/50 to-pink-100/50" : ""
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className={cn(
                        "font-bold mb-2 text-lg",
                        !notification.is_read ? "text-purple-800" : "text-gray-800"
                      )}>
                        {notification.title}
                      </h4>
                      <p className="text-sm text-gray-700 leading-relaxed">{notification.body}</p>
                      <div className="flex items-center mt-3 text-xs text-gray-500">
                        <Clock className="h-3 w-3 ml-1" />
                        <span>{new Date(notification.created_at).toLocaleDateString('ar-SA')}</span>
                      </div>
                    </div>
                    {!notification.is_read && (
                      <div className={cn(
                        "w-3 h-3 rounded-full flex-shrink-0 mt-2",
                        "bg-gradient-to-br from-purple-500 to-pink-500",
                        "animate-pulse shadow-lg"
                      )}></div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
