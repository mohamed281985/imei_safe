/**
 * ملف أمان API
 * يحتوي على وظائف مساعدة لتحسين أمان طلبات API
 */

import { supabase } from './supabase';

// قائمة بالمسارات المسموح بها (Whitelist)
const ALLOWED_ENDPOINTS = [
  '/api/check-limit',
  '/api/increment-usage',
  '/api/search-imei',
  '/api/get-finder-phone',
  '/api/update-finder-phone-by-imei'
];

// التحقق من أن الرابط مسموح به
const isEndpointAllowed = (endpoint: string): boolean => {
  return ALLOWED_ENDPOINTS.some(allowed => endpoint.includes(allowed));
};

// دالة لجلب التوكن مع التحقق من صلاحيته
export const getAuthToken = async (): Promise<string | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.access_token) {
      return null;
    }

    // التحقق من أن التوكن لم ينتهِ
    const expiresAt = session.expires_at;
    if (expiresAt && Date.now() / 1000 > expiresAt) {
      // التوكن منتهي، محاولة تحديثه
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        return null;
      }
      return data.session.access_token;
    }

    return session.access_token;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
};

// دالة آمنة لإجراء طلبات API
export const secureApiRequest = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  // التحقق من أن الرابط مسموح به
  if (!isEndpointAllowed(endpoint)) {
    throw new Error('Endpoint not allowed');
  }

  // جلب التوكن
  const token = await getAuthToken();

  // إعداد الترويسات
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // إضافة التوكن إذا كان موجوداً
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // إضافة ترويسات أمان إضافية
  headers['X-Requested-With'] = 'XMLHttpRequest';
  headers['X-Content-Type-Options'] = 'nosniff';

  // إعداد خيارات الطلب
  const secureOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'same-origin', // إرسال الكوكيز فقط للنفس الأصل
    mode: 'cors', // تفعيل CORS
  };

  // إجراء الطلب
  const response = await fetch(endpoint, secureOptions);

  // التحقق من حالة الاستجابة
  if (!response.ok) {
    // إذا كان الخطأ بسبب انتهاء صلاحية التوكن، محاولة تحديثه وإعادة الطلب
    if (response.status === 401) {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session) {
        headers['Authorization'] = `Bearer ${data.session.access_token}`;
        const retryResponse = await fetch(endpoint, { ...secureOptions, headers });
        return retryResponse;
      }
    }
    throw new Error(`API request failed with status ${response.status}`);
  }

  return response;
};

// دالة لإنشاء طلب آمن مع إعدادات محددة
export const createSecureRequest = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: any
) => {
  return async (endpoint: string) => {
    const options: RequestInit = {
      method,
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    return secureApiRequest(endpoint, options);
  };
};
