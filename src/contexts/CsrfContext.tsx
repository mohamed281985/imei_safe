// src/contexts/CsrfContext.tsx
// Context provider لإدارة CSRF token على مستوى التطبيق

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { csrfService } from '@/services/csrfService';

interface CsrfContextType {
  csrfToken: string | null;
  loading: boolean;
  error: Error | null;
  refreshToken: () => Promise<void>;
}

const CsrfContext = createContext<CsrfContextType | undefined>(undefined);

/**
 * CSRF Provider Component
 */
export const CsrfProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  /**
   * جلب CSRF token عند تحميل المكون
   */
  const initializeCsrf = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await csrfService.getToken();
      setCsrfToken(token);

      console.log('✅ تم تهيئة CSRF token');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('خطأ في تهيئة CSRF token');
      setError(error);
      console.error('❌ خطأ في تهيئة CSRF token:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * تحديث CSRF token
   */
  const refreshToken = useCallback(async () => {
    try {
      setLoading(true);
      const newToken = await csrfService.fetchCsrfToken();
      setCsrfToken(newToken);
      console.log('✅ تم تحديث CSRF token');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('خطأ في تحديث CSRF token');
      setError(error);
      console.error('❌ خطأ في تحديث CSRF token:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * تهيئة CSRF عند تحميل المكون
   */
  useEffect(() => {
    initializeCsrf();

    // تحديث token قبل انتهائه بـ 5 دقائق
    const refreshInterval = setInterval(() => {
      if (!csrfService.isTokenValid?.()) {
        console.log('⏰ CSRF token قرب الانتهاء - جاري التحديث');
        refreshToken();
      }
    }, 30 * 60 * 1000); // كل 30 دقيقة

    return () => clearInterval(refreshInterval);
  }, []);

  const value: CsrfContextType = {
    csrfToken,
    loading,
    error,
    refreshToken
  };

  return (
    <CsrfContext.Provider value={value}>
      {children}
    </CsrfContext.Provider>
  );
};

/**
 * Hook للوصول إلى CSRF context
 */
export const useCsrfContext = (): CsrfContextType => {
  const context = useContext(CsrfContext);
  if (!context) {
    throw new Error('useCsrfContext يجب أن يستخدم داخل CsrfProvider');
  }
  return context;
};

export default CsrfContext;
