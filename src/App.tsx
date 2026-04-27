import OffersGallery from "./pages/OffersGallery";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useEffect, Suspense, lazy } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { supabase } from './lib/supabase';
import { Routes, Route, useNavigate, useLocation, Link } from "react-router-dom";

import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AdProvider } from "./contexts/AdContext";
import { AdModalProvider } from "./contexts/AdModalContext";
import AuthGuard from "./components/AuthGuard";
import { useAdModal } from "./contexts/AdModalContext";
import LoginAdModal from "./components/advertisements/LoginAdModal";
import GuestGuard from "./components/GuestGuard";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SplashScreen = lazy(() => import("./pages/SplashScreen"));
const LanguageSelect = lazy(() => import("./pages/LanguageSelect"));
const Welcome = lazy(() => import("./pages/Welcome"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ReportPhone = lazy(() => import("./pages/ReportPhone"));
const SearchIMEI = lazy(() => import("./pages/SearchIMEI"));
const PhoneDetails = lazy(() => import("./pages/PhoneDetails"));
const OwnershipTransfer = lazy(() => import('./pages/OwnershipTransfer.tsx'));
const PayToUnlock = lazy(() => import('./pages/OwnershipTransfer.tsx'));
const RegisterPhone = lazy(() => import("./pages/RegisterPhone"));
const TransferHistory = lazy(() => import('./pages/TransferHistory'));
const CreateAdvertisement = lazy(() => import('./pages/CreateAdvertisement'));
const PublishAd = lazy(() => import('./pages/PublishAd'));
const SpecialAd = lazy(() => import('./pages/SpecialAd.tsx'));
const WebViewPage = lazy(() => import('./pages/WebViewPage'));
const MyAds = lazy(() => import('./pages/MyAds'));
const Reset = lazy(() => import("./pages/Reset"));
const DeepLinkHandler = lazy(() => import('./DeepLinkHandler'));
const PhoneFound = lazy(() => import('./pages/PhoneFound'));
const ResetRegister = lazy(() => import("./pages/ResetRegister"));
const PaymentSuccess = lazy(() => import('./pages/PaymentSuccess'));
const PaymentFailed = lazy(() => import('./pages/PaymentFailed'));
const PaymobRedirectSuccess = lazy(() => import('./pages/PaymobRedirectSuccess'));
const PaymobRedirectFailed = lazy(() => import('./pages/PaymobRedirectFailed'));
const BusinessSignup = lazy(() => import('@/pages/BusinessSignup'));
const BusinessProfileComplete = lazy(() => import('@/pages/BusinessProfileComplete'));
const BusinessTransfer = lazy(() => import('@/pages/BusinessTransfer'));
const BusinessTransferBuy = lazy(() => import('@/pages/BusinessTransferbuy'));
const BusinessTransferSell = lazy(() => import('@/pages/BusinessTransfersell'));
const PhonesForSale = lazy(() => import('@/pages/PhonesForSale'));
const SellerDashboard = lazy(() => import('@/pages/SellerDashboard'));
const AddPhoneForm = lazy(() => import('@/pages/AddPhoneForm'));
const AddAccessoriesForm = lazy(() => import('@/pages/AddaccessoriesForm'));
const AccessoriesForSalePage = lazy(() => import('@/pages/AccessoriesForSalePage'));
import { PushNotifications, Token } from '@capacitor/push-notifications';
const ChallengeGamePage = lazy(() => import('./pages/ChallengeGamePage'));
const ProfileMenuPage = lazy(() => import('./pages/ProfileMenuPage'));
const RewardsPage = lazy(() => import('./pages/RewardsPage'));
const EditPhoneListing = lazy(() => import('./pages/EditPhoneListing'));
const EditAccessoryListing = lazy(() => import('./pages/EditAccessoryListing'));
const ProductDetails = lazy(() => import('./pages/ProductDetails'));

import { toast } from "@/hooks/use-toast";

declare global {
  interface Window {
    Capacitor?: any;
  }
}

const queryClient = new QueryClient();

// =================================================================
// ⭐ الزر العائم لإنشاء الإعلانات - تم نقله هنا ليكون ثابتاً
// =================================================================



//  const { user } = useAuth();
//  const location = useLocation();

// تعديل الشرط ليشمل جميع أنواع الحسابات التجارية ويظهر فقط في لوحة التحكم
//  const isBusinessUser = user?.role && ['business', 'free_business', 'gold_business', 'silver_business'].includes(user.role);
//  const showButton = isBusinessUser && location.pathname === '/dashboard';
//
//  if (!showButton) {
//    return null;
//  }
//
//  return (
//    <div className="fixed bottom-20 sm:bottom-24 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center group" style={{ paddingBottom: 'env(safe-area-inset-bottom, 20px)' }}>
//      <Link to="/create-advertisement" className="flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-r from-orange-500 to-orange-600 rounded-full shadow-lg hover:shadow-xl hover:shadow-orange-500/30 transition-all transform group-hover:-translate-y-1" aria-label="إنشاء إعلان">
//        <Plus className="text-white relative z-10 transition-transform duration-300 group-hover:rotate-12" size={40} />
//      </Link>
//      <span className="text-white text-sm sm:text-base mt-2 font-semibold">إعلان</span>
//    </div>
//  );
// };

// =================================================================
// ⭐ المكون الجديد الذي يحتوي على المنطق المعتمد على useAuth
// =================================================================
const AppCore = () => {
  const navigate = useNavigate();
  const { adToShow, hideAd } = useAdModal();
  const { user } = useAuth();

  useEffect(() => {
    const setupListener = async () => {
      listener = await CapacitorApp.addListener('appUrlOpen', (event) => {
        const urlString = event.url;
        if (!urlString) return;

        console.log('Deep link opened:', urlString);

        try {
          const url = new URL(urlString);
          const { pathname, hash } = url;

          // معالجة myapp://my-ads
          if (url.protocol === 'myapp:') {
            if (pathname === '//my-ads' || pathname === '/my-ads') {
              navigate('/myads');
            }
            return;
          }

          // معالجة روابط المصادقة من Supabase
          if (hash.includes('access_token') && hash.includes('refresh_token')) {
            const params = new URLSearchParams(hash.substring(1));
            const type = params.get('type');
            if (type === 'recovery') {
              navigate(`/reset?${params.toString()}`);
            }
          }
        } catch (e) {
          console.error('Failed to parse deep link URL:', e);
        }
      });
    };
    let listener: PluginListenerHandle | null = null;
    setupListener();
    return () => {
      if (listener) listener.remove();
    };
  }, [navigate]);

  // =================================================================
  // إدارة الإشعارات (Push Notifications) بشكل كامل
  // =================================================================
  useEffect(() => {
    // لا تقم بتشغيل هذا المنطق إلا على الأجهزة الأصلية (iOS/Android)
    if (Capacitor.getPlatform && Capacitor.getPlatform() === 'web') {
      return;
    }

    // 1. وظيفة لإرسال توكن FCM إلى السيرفر
    const updateTokenToServer = async (fcmToken: string) => {
      if (!user || !user.id) {
        console.log('المستخدم غير مسجل دخوله، تخطي تحديث توكن FCM.');
        return;
      }
      console.log('جاري تحديث توكن FCM للمستخدم:', user.id);
      try {
        const response = await fetch('https://imei-safe.me/api/update-fcm-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: user.id, fcmToken: fcmToken }),
        });
        const result = await response.json();
        if (response.ok) {
          console.log('تم تحديث توكن FCM بنجاح على السيرفر.');
        } else {
          console.error('فشل السيرفر في تحديث التوكن:', result.error);
        }
      } catch (error) {
        console.error('فشل إرسال توكن FCM إلى السيرفر:', error);
      }
    };

    // 2. وظيفة لإعداد كل ما يتعلق بالإشعارات
    const setupPushNotifications = async () => {
      // لا تقم بالتسجيل إذا لم يكن المستخدم مسجلاً دخوله
      if (!user) {
        return;
      }

      try {
        // طلب الأذونات
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive !== 'granted') {
          console.warn('لم يمنح المستخدم إذن الإشعارات.');
          return;
        }

        // تسجيل الجهاز لتلقي الإشعارات
        await PushNotifications.register();

        // --- إضافة المستمعات (Listeners) ---

        // أ. عند نجاح التسجيل والحصول على التوكن
        PushNotifications.addListener('registration', (token: Token) => {
          // console.log removed: sensitive token data
          updateTokenToServer(token.value);
        });

        // ب. عند حدوث خطأ في التسجيل
        PushNotifications.addListener('registrationError', (error: any) => {
          console.warn('فشل تسجيل الإشعارات');
        });

        // ج. عند استقبال إشعار والتطبيق في الواجهة الأمامية (foreground)
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          // console.log removed: notification data not logged
          toast({
            title: notification.title || 'إشعار جديد',
            description: notification.body || '',
            duration: 6000,
          });
        });

        // ⭐ د. عند الضغط على الإشعار (توجيه مباشر دائماً إلى صفحة PhoneFound)
        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          console.log('Push notification action performed:', action);
          const { notification } = action;
          const data = notification.data || {};
          // توجيه دائماً إلى صفحة PhoneFound مع IMEI وfinderId إن وجدا
          let url = '/phone-found';
          if (data.imei) {
            url += `/${data.imei}`;
          }
          if (data.finderId) {
            url += `?finderId=${data.finderId}`;
          }
          console.log(`توجيه إجباري إلى صفحة العثور على الهاتف: ${url}`);
          navigate(url);
        });

      } catch (e) {
        console.error("خطأ في إعداد الإشعارات:", e);
      }
    };

    setupPushNotifications();

    // 3. وظيفة التنظيف عند إلغاء تحميل المكون
    return () => {
      console.log('Cleaning up push notification listeners.');
      if (!(Capacitor.getPlatform && Capacitor.getPlatform() === 'web')) {
        try {
          PushNotifications.removeAllListeners(); // يزيل جميع المستمعات التي تم إضافتها في هذا التأثير
        } catch (e) {
          console.debug('PushNotifications.removeAllListeners() failed or not available on this platform', e);
        }
      }
    };
  }, [user, navigate]); // ✅ يعتمد على `user` و `navigate`

  return (
    <div
      style={{ 
        backgroundImage: "url('/assets/images/background.png')", 
        backgroundSize: 'cover', 
        backgroundPosition: 'center', 
        minHeight: '100vh' 
      }}
    >

      <>
        {adToShow && <LoginAdModal ad={adToShow} onClose={hideAd} />}
        <DeepLinkHandler />
        <Toaster />
        <Sonner />
        <Suspense fallback={<div>Loading...</div>}>
          <Routes>
            <Route path="/" element={<SplashScreen />} />
            <Route path="/index" element={<Index />} />
            <Route path="/language" element={<LanguageSelect />} />
            <Route path="/welcome" element={<Welcome />} />

            <Route path="/login" element={<GuestGuard><Login /></GuestGuard>} />
            <Route path="/signup" element={<GuestGuard><Signup /></GuestGuard>} />
            <Route path="/forgot-password" element={<GuestGuard><ForgotPassword /></GuestGuard>} />

            <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
            <Route path="/report" element={<AuthGuard><ReportPhone /></AuthGuard>} />
            <Route path="/search" element={<AuthGuard><SearchIMEI /></AuthGuard>} />
            <Route path="/phone/:id" element={<PhoneDetails />} />
            <Route path="/ownership-transfer" element={<OwnershipTransfer />} />

            <Route path="/pay/:id" element={<AuthGuard><PayToUnlock /></AuthGuard>} />
            <Route path="/register-phone" element={<AuthGuard><RegisterPhone /></AuthGuard>} />
            <Route path="/transfer-history" element={<AuthGuard><TransferHistory /></AuthGuard>} />
            <Route path="/create-advertisement" element={<AuthGuard><CreateAdvertisement /></AuthGuard>} />
            <Route path="/publish-ad" element={<AuthGuard><PublishAd /></AuthGuard>} />
            <Route path="/special-ad" element={<AuthGuard><SpecialAd /></AuthGuard>} />
            <Route path="/webview" element={<AuthGuard><WebViewPage /></AuthGuard>} />
            {/* مسار العرووف لعرض الصورة الكاملة */}
            <Route path="/offersgallery" element={<AuthGuard><OffersGallery /></AuthGuard>} />
            <Route path="/myads" element={<AuthGuard><MyAds /></AuthGuard>} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/payment-failed" element={<PaymentFailed />} />
            <Route path="/paymob/redirect-success" element={<PaymobRedirectSuccess />} />
            <Route path="/paymob/redirect-failed" element={<PaymobRedirectFailed />} />
            <Route path="/business-signup" element={<BusinessSignup />} />
            <Route path="/businesstransfer" element={<AuthGuard><BusinessTransfer /></AuthGuard>} />
            <Route path="/business-profile-complete" element={<AuthGuard><BusinessProfileComplete /></AuthGuard>} />
            <Route path="/reset" element={<Reset />} />
            <Route path="/reset-register" element={<AuthGuard><ResetRegister /></AuthGuard>} />
            <Route path="/BusinessTransferbuy" element={<AuthGuard><BusinessTransferBuy /></AuthGuard>} />
            <Route path="/challenge-game" element={<AuthGuard><ChallengeGamePage /></AuthGuard>} />
            <Route path="/BusinessTransfersell" element={<AuthGuard><BusinessTransferSell /></AuthGuard>} />
            <Route path="/phone-found/:imei" element={<PhoneFound />} />
            <Route path="/phone-found" element={<PhoneFound />} />
            <Route path="/phones-for-sale" element={<AuthGuard><PhonesForSale /></AuthGuard>} /> {/* Add the new route */}
            <Route path="/seller-dashboard" element={<AuthGuard><SellerDashboard /></AuthGuard>} />
            <Route path="/add-phone" element={<AuthGuard><AddPhoneForm /></AuthGuard>} />
            <Route path="/add-accessories" element={<AuthGuard><AddAccessoriesForm /></AuthGuard>} />
            <Route path="/edit-phone/:id" element={<AuthGuard><EditPhoneListing /></AuthGuard>} />
            <Route path="/accessories-for-sale" element={<AuthGuard><AccessoriesForSalePage /></AuthGuard>} />
            <Route path="/edit-accessory/:id" element={<AuthGuard><EditAccessoryListing /></AuthGuard>} />
            <Route path="/product/:id" element={<AuthGuard><React.Suspense fallback={null}><ProductDetails /></React.Suspense></AuthGuard>} />
            <Route path="*" element={<NotFound />} />
            <Route path="/profile-menu" element={<AuthGuard><ProfileMenuPage /></AuthGuard>} />
            <Route path="/rewards" element={<AuthGuard><RewardsPage /></AuthGuard>} />
          </Routes>
        </Suspense>
      </>
    </div>
  );
};


// =================================================================
// المكون الرئيسي أصبح بسيطاً ومسؤولاً فقط عن تقديم Providers
// =================================================================
const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider> {/* ✅ AuthProvider يوفر السياق لـ AppCore */}
          <AdProvider>
            <AdModalProvider>
              <TooltipProvider>
                <AppCore /> {/* ✅ هنا يتم تقديم المكون الذي يحتوي المنطق */}
              </TooltipProvider>
            </AdModalProvider>
          </AdProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
};

export default App;
