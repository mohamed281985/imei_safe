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

  return (
    <Link to="/" className="no-underline" aria-label="IMEI">
      <img src="/images/imei-logo.png" alt="IMEI" className={imgClass} />
    </Link>
  );
};

export default Logo;
