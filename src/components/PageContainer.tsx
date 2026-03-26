import React from 'react';
import TopBar from './TopBar';

interface PageContainerProps {
  children: React.ReactNode;
}

const PageContainer: React.FC<PageContainerProps> = ({ children }) => {
  return (
    <div className="bg-transparent flex flex-col min-w-0 items-center justify-center px-2 pt-2 pb-0 sm:px-4 sm:pt-4 sm:pb-0 relative">
      <div className="w-full max-w-4xl flex flex-col items-center relative">
        <TopBar />
        <div
          className="w-full max-w-4xl px-1 sm:px-2 py-0 flex flex-col my-0 rounded-b-2xl rounded-t-none shadow-2xl glass-bg z-10"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.18)', backgroundColor: 'transparent' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default PageContainer;