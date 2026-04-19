// src/services/axiosInterceptor.ts
// Axios interceptor لإضافة CSRF token و معالجة الأخطاء التلقائية

import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import { csrfService } from '@/services/csrfService';
import { supabase } from '@/lib/supabase';

// تخزين حالة إعادة المحاولة لتجنب حلقة لا نهائية
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: AxiosError) => void;
}> = [];

/**
 * معالجة طابور الطلبات الفاشلة بانتظار token جديد
 */
const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });

  isRefreshing = false;
  failedQueue = [];
};

/**
 * إعداد axios interceptor للتعامل مع CSRF token والمصادقة
 * @param axiosInstance - instance من axios
 */
const setupCsrfInterceptor = (axiosInstance: AxiosInstance) => {
  /**
   * Interceptor للطلب: إضافة CSRF token و Authorization header
   */
  axiosInstance.interceptors.request.use(
    async (config) => {
      // إضافة Authorization header من Supabase session
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          if (!config.headers) {
            config.headers = {} as any;
          }
          (config.headers as any)['Authorization'] = `Bearer ${session.access_token}`;
        }
      } catch (err) {
        console.error('❌ خطأ في جلب access token:', err);
      }

      // الطرق التي تحتاج CSRF token
      const methodsNeedingCsrf = ['post', 'put', 'patch', 'delete'];

      if (methodsNeedingCsrf.includes(config.method?.toLowerCase() || '')) {
        try {
          const token = await csrfService.getToken();
          if (token) {
            if (!config.headers) {
              config.headers = {} as any;
            }
            (config.headers as any)['X-CSRF-Token'] = token;
          }
        } catch (err) {
          console.error('❌ خطأ في جلب CSRF token:', err);
        }
      }

      return config;
    },
    (error) => Promise.reject(error)
  );

  /**
   * Interceptor للرد: معالجة أخطاء CSRF
   */
  axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as any;

      // التحقق من خطأ CSRF (403 Forbidden)
      if (error.response?.status === 403 && !originalRequest._retry) {
        if (isRefreshing) {
          // انتظر حتى يتم تحديث token
          return new Promise((resolve, reject) => {
            failedQueue.push({
              resolve: (token: string) => {
                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers['X-CSRF-Token'] = token;
                resolve(axiosInstance(originalRequest));
              },
              reject: (err) => reject(err)
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          // جلب token جديد
          const newToken = await csrfService.fetchCsrfToken();

          // تحديث headers
          if (originalRequest.headers) {
            (originalRequest.headers as any)['X-CSRF-Token'] = newToken;
          }

          processQueue(null, newToken);

          // إعادة محاولة الطلب الأصلي
          return axiosInstance(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError as AxiosError, null);
          return Promise.reject(refreshError);
        }
      }

      return Promise.reject(error);
    }
  );
};

/**
 * إنشاء axios instance مع CSRF interceptor
 */
const createAxiosInstance = (): AxiosInstance => {
  // Priority: VITE_API_URL env var > detect from hostname > localhost
  let baseURL: string;
  
  if (import.meta.env.VITE_API_URL) {
    baseURL = import.meta.env.VITE_API_URL as string;
    console.log('✅ Using VITE_API_URL:', baseURL);
  } else if (typeof window !== 'undefined') {
    // Detect from current location
    const { hostname, protocol } = window.location;
    console.log('📍 Window location - protocol:', protocol, 'hostname:', hostname);
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      baseURL = 'http://localhost:3000'; // Local dev
      console.log('🏠 Local dev detected, using:', baseURL);
    } else {
      // Production: use current domain as API base
      baseURL = `${protocol}//${hostname}`;
      console.log('🌐 Production detected, using:', baseURL);
    }
  } else {
    // SSR or non-browser environment
    baseURL = import.meta.env.PROD ? 'https://imei-safe.me' : 'http://localhost:3000';
    console.log('⚙️ Using fallback URL:', baseURL);
  }
  
  const instance = axios.create({
    baseURL,
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  setupCsrfInterceptor(instance);

  return instance;
};

// إنشاء instance واحد للاستخدام في جميع أنحاء التطبيق
const axiosInstance = createAxiosInstance();

export default axiosInstance;
export { setupCsrfInterceptor };
