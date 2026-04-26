import { App as CapacitorApp } from '@capacitor/app';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export default function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    CapacitorApp.addListener('appUrlOpen', (event) => {
      try {
        const urlStr = event.url;
        if (!urlStr || typeof urlStr !== 'string') return;

        // التحقق من صحة الـ URL scheme الأساسي
        const supportedSchemes = ['myapp://', 'https://', 'http://'];
        const hasValidScheme = supportedSchemes.some(s => urlStr.startsWith(s));
        if (!hasValidScheme) {
          navigate('/');
          return;
        }

        // دعم deep link مثل myapp://special-ad أو myapp://publish-ad أو myapp://my-ads
        if (urlStr.startsWith('myapp://')) {
          const path = urlStr.replace('myapp://', '').split('?')[0];
          const validRoutes = ['special-ad', 'publish-ad', 'my-ads'];
          if (!validRoutes.includes(path)) {
            navigate('/');
            return;
          }
          navigate('/' + path);
          return;
        }

        // دعم الروابط القديمة (hash params) - تحقق إضافي من صحة الـ URL
        let url;
        try {
          url = new URL(urlStr);
        } catch {
          navigate('/');
          return;
        }
        // التأكد أن الـ protocol مسموح به
        if (!['http:', 'https:', 'myapp:'].includes(url.protocol)) {
          navigate('/');
          return;
        }
        const hash = url.hash.replace('#', '');
        const params = new URLSearchParams(hash);
        const type = params.get('type');
        const token = params.get('access_token');

        if (type === 'signup') {
          navigate('/business-profile-complete');
        } else if (type === 'recovery') {
          if (!token || typeof token !== 'string' || token.length < 10) {
            navigate('/');
            return;
          }
          navigate(`/reset?token=${encodeURIComponent(token)}`);
        } else {
          navigate('/');
        }
      } catch (e) {
        // في حالة خطأ غير متوقع، التنقل للصفحة الرئيسية بأمان
        navigate('/');
      }
    });
  }, [navigate]);

  return null;
}
