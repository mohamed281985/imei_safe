import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

export async function openPaymentUrl(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url, toolbarColor: '#000000' });
    return;
  }

  window.location.assign(url);
}