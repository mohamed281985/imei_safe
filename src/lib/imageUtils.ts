import React from 'react';
import { supabase } from './supabase';

// تخزين مؤقت للصور المحولة
const imageCache = new Map<string, string>();

// Types
export interface ImageOptimizationOptions {
  width?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
  blur?: boolean;
  cache?: boolean;
}

const defaultOptions: ImageOptimizationOptions = {
  width: 1024,
  quality: 75,
  format: 'webp',
  blur: false,
  cache: true,
};

/**
 * دالة تحويل روابط الصور في Supabase
 */
export const getTransformedImageUrl = (
  originalUrl: string,
  options: Partial<ImageOptimizationOptions> = {}
): string => {
  if (!originalUrl) {
    console.warn('getTransformedImageUrl: No URL provided');
    return '';
  }

  // تنظيف الرابط من الفراغات والأحرف غير المسموحة
  const cleanUrl = originalUrl.trim();
  if (!cleanUrl) {
    console.warn('getTransformedImageUrl: URL is empty after cleaning');
    return '';
  }

  try {
    new URL(cleanUrl);
  } catch (e) {
    console.debug('getTransformedImageUrl: Invalid URL:', cleanUrl);
    return originalUrl;
  }

  const finalOptions = { ...defaultOptions, ...options };
  const { width, quality, format, blur, cache } = finalOptions;

  // التحقق من وجود الصورة في التخزين المؤقت
  const cacheKey = `${originalUrl}_${width}_${quality}_${format}_${blur}`;
  if (cache && imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)!;
  }

  try {
    let transformedUrl = '';
    const baseUrl = 'https://idpnvgvamdedaynetjvm.supabase.co';

    // تحويل الرابط حسب نوعه
    if (originalUrl.includes('storage/v1/object/public')) {
      transformedUrl = originalUrl.replace('storage/v1/object/public', 'storage/v1/render/image/public');
    } else if (originalUrl.includes('supabase.co')) {
      transformedUrl = originalUrl;
    } else if (originalUrl.startsWith('/')) {
      transformedUrl = `${baseUrl}/storage/v1/render/image/public${originalUrl}`;
    } else {
      transformedUrl = originalUrl;
    }

    // إضافة معلمات التحويل
    const params = new URLSearchParams();
    if (width) params.set('width', width.toString());
    if (quality) params.set('quality', quality.toString());
    if (format) params.set('format', format);
    if (blur) params.set('blur', '2');
    if (cache) params.set('cache', 'true');

    const finalUrl = `${transformedUrl}?${params.toString()}`;

    // تخزين في الذاكرة المؤقتة
    if (cache) {
      imageCache.set(cacheKey, finalUrl);
    }

    return finalUrl;
  } catch (e) {
    console.debug('Error transforming image URL:', e);
    return originalUrl;
  }
};

/**
 * دالة التحميل المسبق للصور
 */
export const preloadImage = (url: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
};

/**
 * دالة تحميل مسبق لمجموعة من الصور
 */
export const preloadImages = async (urls: string[]): Promise<void> => {
  try {
    await Promise.all(urls.map(url => preloadImage(url)));
  } catch (e) {
    console.debug('Error preloading images:', e);
  }
};

/**
 * Hook خاص بتحسين الصور
 */
export const useOptimizedImage = (
  originalUrl: string,
  options: Partial<ImageOptimizationOptions> = {}
) => {
  const optimizedUrl = React.useMemo(
    () => getTransformedImageUrl(originalUrl, options),
    [originalUrl, JSON.stringify(options)]
  );

  React.useEffect(() => {
    // تحميل مسبق للصورة
    preloadImage(optimizedUrl);
    // تحميل النسخة الأصلية كنسخة احتياطية
    preloadImage(originalUrl);
  }, [optimizedUrl, originalUrl]);

  return optimizedUrl;
};

/**
 * مكون لعرض الصور المحسنة
 */
export const OptimizedImage: React.FC<{
  src: string;
  alt: string;
  className?: string;
  options?: Partial<ImageOptimizationOptions>;
  onLoad?: () => void;
  onError?: () => void;
}> = ({ src, alt, className = '', options = {}, onLoad, onError }) => {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);
  const optimizedUrl = useOptimizedImage(src, options);

  const handleLoad = () => {
    setIsLoaded(true);
    if (onLoad) onLoad();
  };

  const handleError = () => {
    setHasError(true);
    if (onError) onError();
  };

  return React.createElement('img', {
    src: optimizedUrl,
    alt,
    className: `transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'} ${className}`,
    onLoad: handleLoad,
    onError: handleError
  });
};
