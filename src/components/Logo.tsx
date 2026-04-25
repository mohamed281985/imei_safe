import React from 'react';
import { Link } from 'react-router-dom';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ size = 'md', className = '' }) => {
  const sizeMap: Record<string, string> = {
    sm: 'h-12',
    md: 'h-14',
    lg: 'h-16',
    xl: 'h-24'
  };

  const imgClass = `!m-0 ${sizeMap[size] || sizeMap.md} ${className} object-contain`;

  return (
    <Link to="/" className="no-underline" aria-label="IMEI">
      <img src="/images/imei-logo.png" alt="IMEI" className={imgClass} />
    </Link>
  );
};

export default Logo;
