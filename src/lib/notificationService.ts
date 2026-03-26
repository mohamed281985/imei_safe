import { supabase } from './supabase';

export interface NotificationPayload {
  title: string;
  body: string;
  user_id?: string;
  email: string;
  finder_phone?: string;
  imei?: string;
  notification_type?: string;
  is_read?: boolean;
  created_at?: string;
}

/**
 * إنشاء إشعار جديد في جدول notifications
 * @param payload بيانات الإشعار
 * @returns Promise مع بيانات الإشعار أو خطأ
 */
export const createNotification = async (payload: NotificationPayload) => {
  try {
    // التأكد من وجود email
    if (!payload.email) {
      throw new Error('Email is required');
    }

    // التحقق من وجود سجل في phone_reports يتطابق مع الـ IMEI
    if (payload.imei) {
      const { count: phoneReportCount } = await supabase
        .from('phone_reports')
        .select('*', { count: 'exact', head: true })
        .eq('imei', payload.imei);

      if (!phoneReportCount || phoneReportCount === 0) {
        throw new Error('لا يوجد سجل للهاتف بهذا الـ IMEI في قاعدة البيانات. يجب تسجيل الهاتف أولاً.');
      }
    }

    // إضافة رقم الايمي إلى العنوان إذا كان موجوداً
    let titleWithImei = payload.title;
    if (payload.imei) {
      titleWithImei = `${payload.title} (IMEI: ${payload.imei})`;
    }

    // إنشاء الإشعار
    const result = await supabase
      .from('notifications')
      .insert({
        ...payload,
        title: titleWithImei,
        is_read: payload.is_read || false,
        created_at: payload.created_at || new Date().toISOString()
      })
      .select()
      .single();

    if (result.error) {
      console.debug('Error creating notification:', result.error);
      throw result.error;
    }

    return result.data;
  } catch (error) {
    console.debug('Error in createNotification:', error);
    throw error;
  }
};

/**
 * جلب عدد الإشعارات غير المقروءة للمستخدم
 * @param email البريد الإلكتروني للمستخدم
 * @returns Promise مع عدد الإشعارات غير المقروءة
 */
export const getUnreadNotificationCount = async (email: string) => {
  try {
    console.log('Getting unread count for email:', email);
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('email', email)
      .eq('is_read', false);

    console.log('Unread count result:', count);

    if (error) {
      console.error('Error getting unread notification count:', error);
      throw error;
    }

    return count || 0;
  } catch (error) {
    console.error('Error in getUnreadNotificationCount:', error);
    throw error;
  }
};

/**
 * جلب جميع الإشعارات غير المقروءة للمستخدم
 * @param email البريد الإلكتروني للمستخدم
 * @returns Promise مع قائمة الإشعارات غير المقروءة
 */
export const getUnreadNotifications = async (email: string) => {
  try {
    console.log('Getting unread notifications for email:', email);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('email', email)
      .eq('is_read', false)
      .order('created_at', { ascending: false });

    console.log('Unread notifications result:', data);

    if (error) {
      console.error('Error getting unread notifications:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getUnreadNotifications:', error);
    throw error;
  }
};

/**
 * تحديث حالة الإشعار إلى مقروء
 * @param notificationId معرف الإشعار
 * @returns Promise مع بيانات الإشعار أو خطأ
 */
export const markNotificationAsRead = async (notificationId: string) => {
  try {
    // تحديث جميع الإشعارات غير المقروءة لهذا البريد الإلكتروني
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('email', notificationId) // الآن notificationId هو البريد الإلكتروني
      .eq('is_read', false)
      .select('*');

    if (error) {
      console.error('Error marking notifications as read:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error('لم يتم العثور على إشعارات غير مقروءة لهذا البريد الإلكتروني');
    }

    return data;
  } catch (error) {
    console.error('Error في markNotificationAsRead:', error);
    throw error;
  }
};

/**
 * تحديث جميع الإشعارات إلى مقروءة
 * @param email البريد الإلكتروني للمستخدم
 * @returns Promise مع عدد الإشعارات التي تم تحديثها
 */
export const markAllNotificationsAsRead = async (email: string) => {
  try {
    console.log('Marking all notifications as read for email:', email);
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('email', email)
      .eq('is_read', false)
      .select();

    console.log('Marked as read notifications:', data);

    if (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in markAllNotificationsAsRead:', error);
    throw error;
  }
};
