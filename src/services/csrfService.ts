// src/services/csrfService.ts
// خدمة جلب وإدارة CSRF tokens

import axios from 'axios';

// Prefer VITE_API_BASE_URL (set in Render / .env). Fall back to legacy VITE_API_URL then localhost.
const API_BASE_URL = (import.meta.env.VITE_API_BASEURL as string)
  || (import.meta.env.VITE_API_BASE_URL as string)
  || (import.meta.env.VITE_API_URL as string)
  || 'http://localhost:3000';

interface CsrfTokenResponse {
  csrfToken: string;
  expiresAt?: string;
}

class CsrfService {
  private csrfToken: string | null = null;
  private csrfExpiresAt: number | null = null;
  private readonly TOKEN_EXPIRY_TIME = 60 * 60 * 1000; // ساعة واحدة

  /**
   * جلب CSRF token من الخادم
   */
  async fetchCsrfToken(): Promise<string> {
    try {
      // تحقق من الذاكرة أولاً
      const storedToken = this.getStoredToken();
      if (storedToken) {
        console.log('✅ استخدام CSRF token من الذاكرة');
        return storedToken;
      }

      console.log('📝 جاري جلب CSRF token من الخادم...');

      // اطلب token جديد من الخادم
      // Prefer the simple endpoint which sets a basic cookie and returns
      // the token. This avoids issues where the more advanced doubleCsrf
      // flow may reject the request during token fetch.
      const response = await axios.get<CsrfTokenResponse>(
        `${API_BASE_URL}/api/csrf-token`,
        { withCredentials: true }
      );

      const token = response.data.csrfToken;
      
      // احفظ الـ token
      this.setCsrfToken(token);
      
      console.log('✅ تم جلب CSRF token بنجاح');
      return token;

    } catch (error) {
      console.error('❌ خطأ في جلب CSRF token:', error);
      throw new Error('فشل جلب CSRF token');
    }
  }

  /**
   * احفظ CSRF token محلياً
   */
  private setCsrfToken(token: string): void {
    this.csrfToken = token;
    this.csrfExpiresAt = Date.now() + this.TOKEN_EXPIRY_TIME;
  }

  /**
   * احصل على CSRF token المحفوظ
   */
  public getStoredToken(): string | null {
    if (this.csrfToken && this.csrfExpiresAt && Date.now() < this.csrfExpiresAt) {
      return this.csrfToken;
    }
    return null;
  }

  /**
   * احصل على CSRF token (احفظه إذا لم يكن موجوداً)
   */
  async getToken(): Promise<string> {
    if (this.csrfToken && this.csrfExpiresAt && Date.now() < this.csrfExpiresAt) {
      return this.csrfToken;
    }
    return this.fetchCsrfToken();
  }

  /**
   * امسح CSRF token
   */
  clearToken(): void {
    this.csrfToken = null;
    this.csrfExpiresAt = null;
  }

  /**
   * تحقق من صلاحية التوكن
   */
  isTokenValid(): boolean {
    return this.csrfToken !== null && 
           this.csrfExpiresAt !== null && 
           Date.now() < this.csrfExpiresAt;
  }

  /**
   * احصل على وقت انتهاء الصلاحية
   */
  getTokenExpiry(): number | null {
    return this.csrfExpiresAt;
  }
}

// صدّر instance واحد من الخدمة
export const csrfService = new CsrfService();

export default CsrfService;
