import React, { useEffect, useState } from 'react';
import { AppLauncher } from '@capacitor/app-launcher';
import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { BellRing, CheckCircle2, ShieldCheck, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type PermissionState = 'prompt' | 'denied' | 'granted' | 'unknown';

interface NotificationSettingsPlugin {
  openAppNotificationSettings(): Promise<void>;
}

const NativeNotificationSettings = registerPlugin<NotificationSettingsPlugin>('NotificationSettings');

const NotificationPermissionPrompt: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [busy, setBusy] = useState(false);

  const checkPermission = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const status = await PushNotifications.checkPermissions();
      const nextPermission = status.receive as PermissionState;
      setPermission(nextPermission);
      setOpen(nextPermission !== 'granted');
    } catch (error) {
      console.warn('Could not check push notification permission:', error);
    }
  };

  useEffect(() => {
    void checkPermission();
    const onResume = () => { void checkPermission(); };
    window.addEventListener('focus', onResume);
    let appStateListener: { remove: () => Promise<void> } | undefined;
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void checkPermission();
      }).then((listener) => { appStateListener = listener; });
    }
    return () => {
      window.removeEventListener('focus', onResume);
      void appStateListener?.remove();
    };
  }, []);

  const requestPermission = async () => {
    setBusy(true);
    try {
      const status = await PushNotifications.requestPermissions();
      const nextPermission = status.receive as PermissionState;
      setPermission(nextPermission);
      if (nextPermission === 'granted') {
        setOpen(false);
        window.dispatchEvent(new Event('imei-safe-notifications-permission-granted'));
      } else {
        await openNotificationSettings();
      }
    } catch (error) {
      console.warn('Could not request push notification permission:', error);
      await openNotificationSettings();
    } finally {
      setBusy(false);
    }
  };

  const openNotificationSettings = async () => {
    try {
      if (Capacitor.getPlatform() === 'android') {
        await NativeNotificationSettings.openAppNotificationSettings();
        return;
      }

      await AppLauncher.openUrl({ url: 'app-settings:' });
    } catch (error) {
      console.warn('Could not open notification settings:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-3xl border-0 bg-white p-0 text-right shadow-2xl">
        <div className="bg-gradient-to-l from-sky-950 via-blue-900 to-cyan-800 p-5 text-white sm:p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10">
            <BellRing className="h-6 w-6 text-cyan-200" />
          </div>
          <DialogHeader className="text-right">
            <DialogTitle className="text-xl font-black text-white">فعّل إشعارات IMEI Safe</DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-blue-100">
              ليصلك تحديث تسجيل الهاتف أو البلاغ فور حدوثه، وتعرف سريعًا إذا احتجنا منك إجراءً مهمًا.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-3 p-5 sm:p-6">
          <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3.5">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></span>
            <div><p className="text-sm font-bold text-slate-900">تابع حالة طلبك</p><p className="mt-0.5 text-xs leading-5 text-slate-600">تنبيه عند تحديث حالة التسجيل أو مراجعة البلاغ.</p></div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3.5">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><ShieldCheck className="h-5 w-5" /></span>
            <div><p className="text-sm font-bold text-slate-900">لا تفوّت التنبيهات المهمة</p><p className="mt-0.5 text-xs leading-5 text-slate-600">قد تساعدك الإشعارات على متابعة حماية جهازك في الوقت المناسب.</p></div>
          </div>
          {permission === 'denied' && <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900"><Smartphone className="h-4 w-4 shrink-0" />الإذن مرفوض حاليًا. فعّله من إعدادات إشعارات التطبيق على هاتفك.</p>}
        </div>

        <DialogFooter className="flex-col gap-2 border-t border-slate-100 p-4 sm:flex-row sm:justify-start sm:p-5">
          <Button type="button" onClick={() => void requestPermission()} disabled={busy} className="w-full gap-2 rounded-xl bg-orange-500 font-black text-white hover:bg-orange-600 sm:w-auto">
            {permission === 'denied' ? <Smartphone className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
            {busy ? 'جارٍ فتح الإعدادات...' : permission === 'denied' ? 'فتح إعدادات الإشعارات' : 'تفعيل الإشعارات'}
          </Button>
        </DialogFooter>
        <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="absolute left-3 top-3 rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
      </DialogContent>
    </Dialog>
  );
};

export default NotificationPermissionPrompt;
