// src/lib/fcm-capacitor.ts
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabase';

export function registerFCMToken() {
  // طلب صلاحيات الإشعارات
  PushNotifications.requestPermissions().then(result => {
    if (result.receive === 'granted') {
      PushNotifications.register();
    }
  });

  // الاستماع لحدث التسجيل واستلام التوكن
  PushNotifications.addListener('registration', async (token) => {
    const fcmToken = token.value;
    localStorage.setItem('fcmToken', fcmToken);
    console.log('FCM Token (Capacitor):', fcmToken);
    
    // حفظ التوكن في قاعدة بيانات Supabase للمستخدم الحالي
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      
      if (user) {
        // حفظ التوكن في جدول users
        const { error: updateError } = await supabase
          .from('users')
          .update({ fcm_token: fcmToken })
          .eq('id', user.id);
          
        if (updateError) {
          console.debug('خطأ في حفظ FCM token في جدول users:', updateError);
        } else {
          console.log('تم حفظ FCM token بنجاح في جدول users');
        }
        
        // حفظ التوكن في جدول phone_reports إذا كان هناك أي بلاغات مرتبطة بالمستخدم
        const { error: reportsUpdateError } = await supabase
          .from('phone_reports')
          .update({ fcm_token: fcmToken })
          .eq('user_id', user.id);
          
        if (reportsUpdateError) {
          console.debug('خطأ في حفظ FCM token في جدول phone_reports:', reportsUpdateError);
        } else {
          console.log('تم حفظ FCM token بنجاح في جدول phone_reports');
        }
      }
    } catch (err) {
      console.debug('خطأ في حفظ FCM token:', err);
    }
  });

  // الاستماع لأخطاء التسجيل
  PushNotifications.addListener('registrationError', (error) => {
    console.debug('FCM registration error:', error);
  });
}
