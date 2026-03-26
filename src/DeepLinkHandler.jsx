import { App as CapacitorApp } from '@capacitor/app';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export default function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    CapacitorApp.addListener('appUrlOpen', (event) => {
      try {
        const urlStr = event.url;
        if (!urlStr) return;
        // دعم deep link مثل myapp://special-ad أو myapp://publish-ad أو myapp://my-ads
        if (urlStr.startsWith('myapp://')) {
          if (urlStr.includes('special-ad')) {
            navigate('/special-ad');
            return;
          }
          if (urlStr.includes('publish-ad')) {
            navigate('/publish-ad');
            return;
          }
          if (urlStr.includes('my-ads')) {
            navigate('/myads');
            return;
          }
        }
        // دعم الروابط القديمة (hash params)
        const url = new URL(urlStr);
        const hash = url.hash.replace('#', '');
        const params = new URLSearchParams(hash);
        const type = params.get('type');
        const token = params.get('access_token');
        if (type === 'signup') {
          navigate('/business-profile-complete');
        } else if (type === 'recovery' && token) {
          localStorage.setItem('resetToken', token);
          navigate('/reset');
        } else {
          navigate('/');
        }
      } catch (e) {
        navigate('/');
      }
    });
  }, [navigate]);

  return null;
}
