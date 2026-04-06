import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './styles/mobile-input-fix.css'
import './styles/input-field-fix.css'
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import enTranslations from './translations/en'
import arTranslations from './translations/ar'
import frTranslations from './translations/fr'
import hiTranslations from './translations/hi'
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AdModalProvider } from './contexts/AdModalContext';
import { clearExpiredSecureItems } from '@/utils/secureStorage';

// Initialize i18next
i18next
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
      ar: { translation: arTranslations },
      fr: { translation: frTranslations },
      hi: { translation: hiTranslations }
    },
    lng: localStorage.getItem('language') || 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

// Initialize PWA elements
defineCustomElements(window);

// Fallback for web (if needed)
if (window.location.protocol === 'myapp:' && (window.location.host === 'verify' || window.location.host === 'index')) {
  window.location.hash = '#/dashboard';
} 

// تنظيف العناصر المنتهية عند الإقلاع
try {
  clearExpiredSecureItems();
  // تنظيف دوري كل ساعة
  setInterval(clearExpiredSecureItems, 60 * 60 * 1000);
} catch (e) {
  // لا نرمي هنا — فقط نرصد الأخطاء إن وُجدت
  console.warn('Failed to schedule secureStorage cleanup', e);
}

// Create a router and enable the v7_relativeSplatPath future flag to opt-in
const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <AdModalProvider>
        <App />
      </AdModalProvider>
    ),
  },
], {
  future: { v7_relativeSplatPath: true, v7_startTransition: true },
});

createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />
);
