import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCheck, Clock, Inbox, Phone, Sparkles, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { renderNotificationBody } from '../lib/notificationDisplay';

interface NotificationRecord {
  id: string;
  title: string;
  body: string;
  created_at: string;
  is_read: boolean;
  notification_type?: string;
  type?: string;
  imei?: string;
  is_deleted?: string;
  metadata?: { imei?: string; [key: string]: unknown };
}

const NOTIFICATIONS_PER_PAGE = 10;

const NotificationsPage: React.FC = () => {
  const { user, refreshNotifications } = useAuth();
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .or('is_deleted.is.null,is_deleted.neq.deleted')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications((data || []) as NotificationRecord[]);
    } catch (error) {
      console.error('Error loading notifications:', error);
      toast({ title: t('error'), description: t('notifications_load_failed'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [t, toast, user?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const displayedNotifications = useMemo(() => notifications, [notifications]);

  const unreadCount = useMemo(
    () => displayedNotifications.filter((notification) => !notification.is_read).length,
    [displayedNotifications]
  );

  const totalPages = Math.max(1, Math.ceil(displayedNotifications.length / NOTIFICATIONS_PER_PAGE));
  const visibleNotifications = displayedNotifications.slice(
    (currentPage - 1) * NOTIFICATIONS_PER_PAGE,
    currentPage * NOTIFICATIONS_PER_PAGE
  );

  const softDeleteNotifications = async (notificationIds: string[]) => {
    if (!user?.id || notificationIds.length === 0) return false;

    const { error } = await supabase
      .from('notifications')
      .update({ is_deleted: 'deleted' })
      .eq('user_id', user.id)
      .in('id', notificationIds);

    if (error) {
      console.error('Error soft-deleting notifications:', error);
      toast({ title: t('error'), description: t('notification_update_failed'), variant: 'destructive' });
      return false;
    }

    setNotifications((current) => current.filter((notification) => !notificationIds.includes(notification.id)));
    setSelectedIds((current) => {
      const next = new Set(current);
      notificationIds.forEach((id) => next.delete(id));
      return next;
    });
    await refreshNotifications();
    return true;
  };

  const dismissSelected = async () => {
    await softDeleteNotifications([...selectedIds]);
  };

  const dismissOne = async (notificationId: string) => {
    await softDeleteNotifications([notificationId]);
  };

  const dismissAll = async () => {
    await softDeleteNotifications(displayedNotifications.map((notification) => notification.id));
  };

  const toggleSelected = (notificationId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(notificationId)) next.delete(notificationId);
      else next.add(notificationId);
      return next;
    });
  };

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const markAsRead = async (notification: NotificationRecord) => {
    if (notification.is_read) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notification.id);

    if (error) {
      toast({ title: t('error'), description: t('notification_update_failed'), variant: 'destructive' });
      return;
    }

    setNotifications((current) => current.map((item) => (
      item.id === notification.id ? { ...item, is_read: true } : item
    )));
    refreshNotifications();
  };

  const markAllAsRead = async () => {
    if (!user?.id || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      if (error) throw error;
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
      refreshNotifications();
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      toast({ title: t('error'), description: t('notification_update_failed'), variant: 'destructive' });
    } finally {
      setMarkingAll(false);
    }
  };

  const openNotification = async (notification: NotificationRecord) => {
    await markAsRead(notification);
    const notificationType = notification.notification_type || notification.type;
    const imei = notification.imei || notification.metadata?.imei;
    if (notificationType === 'phone_found' && imei) {
      navigate(`/phone-found?imei=${encodeURIComponent(imei)}`);
    }
  };

  const dateLocale = language === 'ar' ? 'ar-EG' : language === 'fr' ? 'fr-FR' : language === 'hi' ? 'hi-IN' : 'en-US';

  return (
    <PageContainer>
      <AppNavbar />
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#e8f7fb_0%,#ffffff_42%,#f7fbfc_100%)] px-4 pb-28 pt-4 backdrop-blur-[2px] sm:px-6 sm:pt-6">
        <div className="mx-auto max-w-4xl">
          <header className="relative mb-7 overflow-hidden rounded-[2rem] border border-[#79c8e4]/60 bg-gradient-to-br from-[#0d78a8] via-[#11658e] to-[#123b68] px-6 py-8 text-center shadow-xl shadow-[#123b55]/20 sm:px-10 sm:py-10">
            <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[#8be8f2]/35 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-[#3c9fd0]/25 blur-3xl" />
            <div className="pointer-events-none absolute inset-x-1/4 top-0 h-px bg-white/50 blur-sm" />
            <div className="relative mx-auto max-w-2xl">
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label={t('back')}
                className="absolute left-0 top-0 rounded-xl border border-orange-300 bg-orange-500 p-3 text-white shadow-lg shadow-orange-900/20 transition hover:border-orange-500 hover:bg-orange-600"
              >
                <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
              </button>
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t('my_notifications')}</h1>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-white/75">{t('notifications_page_description')}</p>
            </div>
          </header>

          <section className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-[#b7dce8] bg-white p-5 shadow-lg shadow-[#123b55]/8 transition hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-[#dff3f8] p-3 text-[#14748a]"><Inbox className="h-6 w-6" /></div>
                <div>
                  <p className="text-sm text-[#66808c]">{t('total_notifications')}</p>
                  <p className="mt-1 text-2xl font-bold text-[#123b55]">{displayedNotifications.length}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-[#b7dce8] bg-[#dff3f8] p-5 shadow-lg shadow-[#123b55]/8 transition hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[#527080]">{t('unread_notifications')}</p>
                <span className="rounded-full bg-[#f6c85f] px-2.5 py-1 text-xs font-bold text-[#174c5a]">{t('new_notification')}</span>
              </div>
              <p className="mt-1 text-3xl font-bold text-[#123b55]">{unreadCount}</p>
            </div>
          </section>

          <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
            <button
              type="button"
              onClick={markAllAsRead}
              disabled={markingAll || unreadCount === 0}
              className="flex min-h-14 items-center justify-center gap-1 rounded-xl border border-[#9fcddd] bg-[#dff3f8] px-2 py-2 text-center text-xs font-bold text-[#176b68] shadow-sm transition hover:border-orange-400 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40 sm:gap-2 sm:px-3 sm:text-sm"
            >
              <CheckCheck className="h-4 w-4 shrink-0" />
              <span>{markingAll ? t('processing') : t('mark_all_as_read')}</span>
            </button>
            <button
              type="button"
              onClick={dismissSelected}
              disabled={selectedIds.size === 0}
              className="flex min-h-14 items-center justify-center gap-1 rounded-xl border border-[#e7b1a6] bg-white px-2 py-2 text-center text-xs font-bold text-[#b44d3c] transition hover:border-orange-400 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40 sm:gap-2 sm:px-3 sm:text-sm"
            >
              <Trash2 className="h-4 w-4" />
              <span>{t('clear_selected')}</span>
            </button>
            <button
              type="button"
              onClick={dismissAll}
              disabled={displayedNotifications.length === 0}
              className="flex min-h-14 items-center justify-center gap-1 rounded-xl border border-[#e7b1a6] bg-white px-2 py-2 text-center text-xs font-bold text-[#b44d3c] transition hover:border-orange-400 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40 sm:gap-2 sm:px-3 sm:text-sm"
            >
              <Trash2 className="h-4 w-4" />
              <span>{t('clear_all')}</span>
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-[#b7dce8] bg-white p-12 text-center text-[#66808c] shadow-lg shadow-[#123b55]/8">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[#289c8e]/20 border-t-[#289c8e]" />
              {t('loading_notifications')}
            </div>
          ) : displayedNotifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#9fcddd] bg-white px-6 py-16 text-center shadow-lg shadow-[#123b55]/8">
              <Sparkles className="mx-auto mb-4 h-12 w-12 text-[#289c8e]" />
              <h2 className="text-xl font-bold text-[#123b55]">{t('no_notifications')}</h2>
              <p className="mt-2 text-sm text-[#66808c]">{t('notifications_empty_description')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleNotifications.map((notification) => {
                const notificationType = notification.notification_type || notification.type;
                return (
                  <article
                    key={notification.id}
                    className={`group rounded-2xl border p-5 transition duration-200 hover:-translate-y-0.5 hover:border-orange-400 hover:bg-orange-50 ${notification.is_read ? 'border-[#d2e7ed] bg-white shadow-md shadow-[#123b55]/8' : 'border-[#77bdd2] bg-[#dff3f8] shadow-lg shadow-[#123b55]/12'}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(notification.id)}
                        onChange={() => toggleSelected(notification.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={t('select_notification')}
                        className="mt-4 h-4 w-4 shrink-0 accent-orange-500"
                      />
                      <div className={`mt-1 rounded-xl p-3 ${notification.is_read ? 'bg-[#f1f6f8] text-[#78909a]' : 'bg-white text-[#14748a] shadow-sm'}`}>
                        {notificationType === 'phone_found' ? <Phone className="h-5 w-5" /> : <Inbox className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h2 className="font-bold text-[#123b55]">{notification.title}</h2>
                          {!notification.is_read && <span className="rounded-full bg-[#f6c85f] px-2 py-1 text-[10px] font-bold text-[#174c5a]">{t('new_notification')}</span>}
                        </div>
                        <p className="mt-2 text-sm leading-7 text-[#527080]">{renderNotificationBody(notification.body, notificationType)}</p>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#78909a]">
                          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{new Date(notification.created_at).toLocaleString(dateLocale)}</span>
                          <div className="flex items-center gap-3">
                            {!notification.is_read && (
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); markAsRead(notification); }}
                                className="font-semibold text-[#176b68] hover:text-[#123b55]"
                              >
                                {t('mark_as_read')}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(event) => { event.stopPropagation(); dismissOne(notification.id); }}
                              className="flex items-center gap-1 font-semibold text-[#b44d3c] hover:text-orange-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {t('clear')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    {notificationType === 'phone_found' && (notification.imei || notification.metadata?.imei) && (
                      <button type="button" onClick={() => openNotification(notification)} className="mt-4 w-full rounded-xl border border-[#289c8e]/25 bg-[#eaf8f7] px-4 py-3 text-sm font-semibold text-[#176b68] transition hover:bg-[#d8f0ec]">
                        {t('view_phone_details')}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {!loading && displayedNotifications.length > 0 && totalPages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-2" aria-label={t('notifications_pagination')}>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  aria-current={currentPage === page ? 'page' : undefined}
                  aria-label={`${t('page')} ${page}`}
                    className={`h-10 min-w-10 rounded-xl border px-3 text-sm font-bold transition ${currentPage === page
                    ? 'border-[#176b68] bg-[#b8dce9] text-[#123b55] shadow-sm hover:border-orange-400 hover:bg-orange-100'
                    : 'border-[#74b9d3] bg-[#b9e3f2] text-[#527080] shadow-sm hover:border-orange-400 hover:bg-orange-100'
                    }`}
                >
                  {page}
                </button>
              ))}
            </nav>
          )}
        </div>
      </main>
    </PageContainer>
  );
};

export default NotificationsPage;
