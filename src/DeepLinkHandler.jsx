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
        console.log('DeepLinkHandler received URL:', urlStr);

        // التحقق من صحة الـ URL scheme الأساسي
        const supportedSchemes = ['myapp://', 'https://', 'http://'];
        const hasValidScheme = supportedSchemes.some(s => urlStr.startsWith(s));
        if (!hasValidScheme) {
          navigate('/');
          return;
        }

        // دعم deep link مثل myapp://special-ad أو myapp://publish-ad أو myapp://my-ads
        // لا نعيد التوجيه مباشرة إلى '/' عند استقبال scheme الخاص بالتطبيق لأن
        // روابط المصادقة قد تستخدم myapp://auth#access_token=... ويجب معالجتها لاحقاً.
        if (urlStr.startsWith('myapp://')) {
          let tmpUrl;
          try {
            tmpUrl = new URL(urlStr);
          } catch {
            navigate('/');
            return;
          }
          const pathCandidate = (tmpUrl.host || tmpUrl.pathname.replace(/^\/+/, '')).split('?')[0];
          const validRoutes = ['special-ad', 'publish-ad', 'my-ads'];
          if (validRoutes.includes(pathCandidate)) {
            navigate('/' + pathCandidate);
            return;
          }
          // لم يتم التعامل مع المسار كـ route معروف => تابع المعالجة الأسفل (للتعامل مع auth/hash)
        }

        // دعم روابط المصادقة القديمة والجديدة: نفحص كل من search و hash
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

        // دمج معلمات الاستعلام (query) ومعلمات الـ hash إن وُجدت
        const combined = new URLSearchParams();
        if (url.search && url.search.length > 1) {
          const s = new URLSearchParams(url.search);
          for (const [k, v] of s) combined.set(k, v);
        }
        if (url.hash && url.hash.includes('=')) {
          const h = new URLSearchParams(url.hash.replace(/^#/, ''));
          for (const [k, v] of h) combined.set(k, v);
        }

        const type = combined.get('type');
        const accessToken = combined.get('access_token');
        const refreshToken = combined.get('refresh_token');
        console.log('DeepLinkHandler parsed params:', combined.toString());

          // حالة خاصة: روابط Supabase قد تعيد توجيه إلى myapp://reset?code=...,
          // حيث لا يوجد 'type' أو 'access_token'. إذا كان المسار أو الـ host هو 'reset'
          // فنوجّه المستخدم مباشرةً إلى صفحة إعادة التعيين مع المعلمات كما هي.
          if ((url.host && url.host.toLowerCase() === 'reset') || url.pathname === '/reset' || url.pathname === 'reset') {
            console.log('DeepLinkHandler detected reset path — navigating to /reset');
            navigate(`/reset?${combined.toString()}`);
            return;
          }

          if (type === 'signup') {
            navigate('/login?confirmed=1');
          } else if (type === 'recovery') {
            // بعض روابط Supabase تحتوي فقط على access_token في الـ hash أو query.
            if (!accessToken || accessToken.length < 10) {
              console.warn('DeepLinkHandler: invalid or missing access_token for recovery');
              navigate('/');
              return;
            }
            console.log('DeepLinkHandler navigating to /reset with params');
            navigate(`/reset?${combined.toString()}`);
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
