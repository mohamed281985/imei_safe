import { supabase } from '../lib/supabase';

/**
 * خدمة الإشعارات - لإرسال واستقبال الإشعارات بين المستخدمين
 */
export class NotificationService {
  /**
   * إرسال إشعار من مستخدم لآخر
   * @param senderId معرف المرسل
   * @param receiverToken توكن جهاز المستلم
   * @param عنوان الإشعار
   * @param body محتوى الإشعار
   * @param data بيانات إضافية
   * @returns Promise مع نتيجة الإرسال
   */
  static async sendNotification(
    senderId: string,
    receiverToken: string,
    title: string,
    body: string,
    data: Record<string, any> = {}
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      const apiBase = process.env.REACT_APP_API_URL || 'https://imei-safe.me';
      const response = await fetch(`${apiBase}/api/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          senderId,
          receiverToken,
          title,
          body,
          data
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        return { success: false, error: result.error || 'فشل في إرسال الإشعار' };
      }

      return { success: true, result };
    } catch (error) {
      console.debug('خطأ في إرسال الإشعار:', error);
      return { success: false, error: 'خطأ في الاتصال بالخادم' };
    }
  }

  /**
   * تسجيل توكن الجهاز لتلقي الإشعارات
   * @param userId معرف المستخدم
   * @param deviceToken توكن الجهاز
   * @returns Promise مع نتيجة التسجيل
   */
  static async registerDeviceToken(userId: string, deviceToken: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('user_devices')
        .upsert({
          user_id: userId,
          device_token: deviceToken,
          updated_at: new Date().toISOString()
        });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.debug('خطأ في تسجيل توكن الجهاز:', error);
      return { success: false, error: 'خطأ في الاتصال بالخادم' };
    }
  }

  /**
   * الحصول على الإشعارات الخاصة بالمستخدم
   * @param userId معرف المستخدم
   * @returns Promise مع قائمة الإشعارات
   */
  static async getUserNotifications(userId: string): Promise<{ success: boolean; notifications?: any[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('receiver_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, notifications: data || [] };
    } catch (error) {
      console.debug('خطأ في جلب الإشعارات:', error);
      return { success: false, error: 'خطأ في الاتصال بالخادم' };
    }
  }

  /**
   * تحديث حالة الإشعار
   * @param notificationId معرف الإشعار
   * @param status الحالة الجديدة (مثل: 'read', 'delivered')
   * @returns Promise مع نتيجة التحديث
   */
  static async updateNotificationStatus(notificationId: string, status: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', notificationId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.debug('خطأ في تحديث حالة الإشعار:', error);
      return { success: false, error: 'خطأ في الاتصال بالخادم' };
    }
  }
}
