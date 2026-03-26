import { useEffect } from 'react';

export const useScrollToTop = () => {
  useEffect(() => {
    // التأكد من أن النافذة موجودة (للSSR)
    if (typeof window !== 'undefined') {
      // استخدام smooth scroll للحصول على تأثير أفضل
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'auto' // يمكن تغييرها إلى 'smooth' للتمرير الناعم
      });
    }
  }, []);
};
