import React from 'react';
import TopBar from './TopBar';

interface PageContainerProps {
  children: React.ReactNode;
  fullWidth?: boolean;
  clearBackground?: boolean;
  edgeToEdge?: boolean;
}

const PageContainer: React.FC<PageContainerProps> = ({ children, fullWidth = false, clearBackground = false, edgeToEdge = false }) => {
  return (
    <div className={`bg-transparent flex flex-col min-w-0 items-center justify-center ${edgeToEdge ? 'px-0 pt-0' : 'px-2 pt-2 sm:px-4 sm:pt-4'} pb-0 relative`}>
      <div className={`w-full ${fullWidth ? 'max-w-none' : 'max-w-4xl'} flex flex-col items-center relative`}>
        <TopBar />
        <div
          className={`w-full ${fullWidth ? 'max-w-none' : 'max-w-4xl'} ${edgeToEdge ? 'px-0 rounded-none border-0' : 'px-1 sm:px-2 rounded-2xl border border-white/80'} py-0 flex flex-col my-0 ${clearBackground ? 'bg-transparent shadow-none backdrop-blur-none' : 'bg-white/40 shadow-[0_12px_35px_rgba(15,23,42,0.12)] backdrop-blur-xl'} z-10`}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default PageContainer;