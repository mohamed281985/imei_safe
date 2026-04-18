// src/services/axiosInterceptor.ts
// Axios interceptor لإضافة CSRF token و معالجة الأخطاء التلقائية

import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import { csrfService } from '@/services/csrfService';

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
 * إعداد axios interceptor للتعامل مع CSRF token
 * @param axiosInstance - instance من axios
 */
export const setupCsrfInterceptor = (axiosInstance: AxiosInstance) => {
  /**
   * Interceptor للطلب: إضافة CSRF token
   */
  axiosInstance.interceptors.request.use(
    async (config) => {
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
export const createAxiosInstance = (): AxiosInstance => {
  const instance = axios.create({
    baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3001/api',
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  setupCsrfInterceptor(instance);

  return instance;
};

export default createAxiosInstance;
