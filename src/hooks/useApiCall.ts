// src/hooks/useApiCall.ts
// Custom hook للقيام ب API calls مع CSRF protection تلقائي

import { useState, useCallback } from 'react';
import { AxiosError } from 'axios';
import { createAxiosInstance } from '@/services/axiosInterceptor';

interface UseApiCallOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
  autoRetry?: boolean;
}

interface UseApiCallReturn<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  execute: (url: string, method?: string, payload?: any) => Promise<T | null>;
  reset: () => void;
}

/**
 * Custom hook للقيام ب API calls مع CSRF token تلقائي
 * @param options - خيارات إضافية
 * @returns data, loading, error, execute, reset
 */
export const useApiCall = <T = any>(
  options: UseApiCallOptions = {}
): UseApiCallReturn<T> => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const axiosInstance = createAxiosInstance();

  const execute = useCallback(
    async (url: string, method: string = 'get', payload: any = null): Promise<T | null> => {
      try {
        setLoading(true);
        setError(null);

        let response;
        const config = {
          headers: {
            'Content-Type': 'application/json'
          }
        };

        switch (method.toLowerCase()) {
          case 'post':
            response = await axiosInstance.post<T>(url, payload, config);
            break;
          case 'put':
            response = await axiosInstance.put<T>(url, payload, config);
            break;
          case 'patch':
            response = await axiosInstance.patch<T>(url, payload, config);
            break;
          case 'delete':
            response = await axiosInstance.delete<T>(url, config);
            break;
          case 'get':
          default:
            response = await axiosInstance.get<T>(url, config);
            break;
        }

        setData(response.data);
        options.onSuccess?.(response.data);

        return response.data;
      } catch (err) {
        const error = err instanceof AxiosError
          ? new Error(err.response?.data?.message || err.message)
          : err instanceof Error
          ? err
          : new Error('خطأ غير معروف');

        setError(error);
        options.onError?.(error);

        console.error('❌ خطأ API call:', error.message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [options]
  );

  const reset = useCallback(() => {
    setData(null);
    setLoading(false);
    setError(null);
  }, []);

  return {
    data,
    loading,
    error,
    execute,
    reset
  };
};

export default useApiCall;
