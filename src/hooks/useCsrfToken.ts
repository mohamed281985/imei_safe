// src/hooks/useCsrfToken.ts
// Hook مخصص لإدارة CSRF token في React

import { useState, useEffect, useCallback } from 'react';
import { csrfService } from '@/services/csrfService';

interface UseCsrfTokenReturn {
  csrfToken: string | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Hook لجلب وإدارة CSRF token
 * @param shouldFetchOnMount - جلب token عند تحميل المكون (افتراضي: true)
 * @returns CSRF token، loading state، error، و refresh function
 */
export const useCsrfToken = (shouldFetchOnMount = true): UseCsrfTokenReturn => {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // جلب CSRF token
  const fetchToken = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await csrfService.fetchCsrfToken();
      setCsrfToken(token);

      console.log('✅ تم جلب CSRF token');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('خطأ غير معروف');
      setError(error);
      console.error('❌ خطأ في جلب CSRF token:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // جلب token عند تحميل المكون
  useEffect(() => {
    if (shouldFetchOnMount) {
      fetchToken();
    } else {
      // احصل على token المحفوظ بدون جلب جديد
      const token = csrfService.getStoredToken?.();
      if (token) {
        setCsrfToken(token);
      }
    }
  }, [shouldFetchOnMount, fetchToken]);

  return {
    csrfToken,
    loading,
    error,
    refresh: fetchToken
  };
};

export default useCsrfToken;
