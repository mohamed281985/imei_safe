import { supabaseUrl } from '../lib/supabase';

interface ImageOptimizationOptions {
  width?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
  blur?: boolean;
}

const imageCache = new Map<string, string>();

export const optimizeImageUrl = (url: string, options: ImageOptimizationOptions = {}) => {
  const {
    width = 1024,
    quality = 75,
    format = 'webp',
    blur = false
  } = options;

  if (!url) return '';

  const cacheKey = `${url}-${width}-${quality}-${format}-${blur}`;
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)!;
  }

  try {
    const transformUrl = (originalUrl: string) => {
      const baseUrl = supabaseUrl;
      let finalUrl = originalUrl;

      if (originalUrl.includes('/storage/v1/object/public/')) {
        finalUrl = originalUrl.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
      }

      const params = new URLSearchParams();
      params.set('width', width.toString());
      params.set('quality', quality.toString());
      params.set('format', format);
      if (blur) params.set('blur', '2');

      return `${finalUrl}?${params.toString()}`;
    };

    const optimizedUrl = transformUrl(url);
    imageCache.set(cacheKey, optimizedUrl);
    return optimizedUrl;
  } catch (error) {
    console.debug('Error optimizing image URL:', error);
    return url;
  }
};

export const preloadImage = (src: string): Promise<void> => {
  if (!src) return Promise.resolve();
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = src;
  });
};

export const preloadImages = (urls: string[]) => {
  return Promise.all(urls.filter(Boolean).map(preloadImage));
};
