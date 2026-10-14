import React from 'react';
import { Link } from 'react-router-dom';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ size = 'md', className = '' }) => {
  const sizeMap: Record<string, string> = {
    sm: 'h-6',
    md: 'h-8',
    lg: 'h-10',
    xl: 'h-14'
  };

  const imgClass = `!m-0 ${sizeMap[size] || sizeMap.md} ${className} object-contain`;

  const textSizeMap: Record<string, string> = {
    sm: 'text-[8px]',
    md: 'text-[10px]',
    lg: 'text-xs',
    xl: 'text-sm'
  };

  return (
    <Link to="/" className="no-underline flex flex-col items-center" aria-label="IMEI">
      <img src="/images/imei-logo.png" alt="IMEI" className={imgClass} />
      <span className={`${textSizeMap[size] || textSizeMap.md} font-black text-[#0A84FF] w-full text-center mt-1`}>
        نحمي جهازك . نؤمن بياناتك
      </span>
    </Link>
  );
};

export default Logo;
