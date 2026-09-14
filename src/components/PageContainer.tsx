import React from 'react';
import TopBar from './TopBar';

interface PageContainerProps {
  children: React.ReactNode;
  fullWidth?: boolean;
}

const PageContainer: React.FC<PageContainerProps> = ({ children, fullWidth = false }) => {
  return (
    <div className="bg-transparent flex flex-col min-w-0 items-center justify-center px-2 pt-2 pb-0 sm:px-4 sm:pt-4 sm:pb-0 relative">
      <div className={`w-full ${fullWidth ? 'max-w-none' : 'max-w-4xl'} flex flex-col items-center relative`}>
        <TopBar />
        <div
          className={`w-full ${fullWidth ? 'max-w-none' : 'max-w-4xl'} px-1 sm:px-2 py-0 flex flex-col my-0 rounded-2xl border border-white/80 bg-white/40 shadow-[0_12px_35px_rgba(15,23,42,0.12)] backdrop-blur-xl z-10`}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default PageContainer;