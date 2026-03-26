import React from 'react';
import { Link } from 'react-router-dom';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'text-3xl',
    md: 'text-4xl',
    lg: 'text-5xl',
    xl: 'text-7xl'
  };

  const supSize = {
    sm: 'text-sm',    // أصغر حجم
    md: 'text-base',  // حجم متوسط
    lg: 'text-lg'     // حجم كبير
  };
  
  return (
    <Link to="/" className="no-underline relative overflow-hidden flex-shrink-0">
      <div className={`flex justify-center px-2 mb-2 ${className}`}>  {/* تم إضافة px-8 (2rem من اليمين واليسار) */}
        <h1 className={`font-bold text-[#ff9500] ${sizeClasses[size]} tracking-wider [text-shadow:1px_1px_2px_#000]`}>
          <span className="text-[#1276da] tracking-wide">IM</span><span className="text-[#ff7700] tracking-wide">EI</span>
          {/* <sup 
            className={`${supSize[size]} filter drop-shadow-[0_2px_1px_rgba(0,0,0,0.2)] -mt-1 relative -top-7`}
            style={{ color: '#ff5500' }}
          >
            •
          </sup> */}
        </h1>
      </div>
    </Link>
  );
};

export default Logo;
