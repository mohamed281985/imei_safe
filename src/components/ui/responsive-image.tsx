import React from 'react';
import { useOptimizedImage } from '@/lib/imageUtils';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  optimizationOptions?: {
    width?: number;
    quality?: number;
    format?: 'webp' | 'jpeg' | 'png';
    blur?: boolean;
  };
}

export const ResponsiveImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  optimizationOptions,
  className = '',
  ...props
}) => {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [error, setError] = React.useState(false);
  
  const optimizedUrl = useOptimizedImage(src, {
    width: 1024,
    quality: 75,
    format: 'webp',
    ...optimizationOptions
  });

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setError(true);
    if (optimizedUrl !== src) {
      e.currentTarget.src = src;
    }
  };

  return (
    <img
      {...props}
      src={error ? src : optimizedUrl}
      alt={alt}
      className={`transition-opacity duration-300 ${
        isLoaded ? 'opacity-100' : 'opacity-0'
      } ${className}`}
      onLoad={() => setIsLoaded(true)}
      onError={handleError}
    />
  );
};
