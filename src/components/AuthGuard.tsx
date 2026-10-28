
import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface AuthGuardProps {
  children: React.ReactNode;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { isAuthenticated, isLoading, needsProfileCompletion } = useAuth();
  const location = useLocation();
  
  if (isLoading) {
    return (
  <div className="min-h-screen flex items-center justify-center glass-bg">
        <div className="p-6 rounded-md">
          <div className="animate-pulse text-imei-cyan text-xl">Loading...</div>
        </div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/account-required" state={{ returnTo: location.pathname, returnState: location.state }} replace />;
  }
  
  // إذا كان المستخدم مصادقًا عليه ولكن ملفه التجاري غير مكتمل، قم بتوجيهه إلى صفحة الإكمال
  if (needsProfileCompletion && location.pathname !== '/business-profile-complete') {
    return <Navigate to="/business-profile-complete" replace />;
  }
  
  return <>{children}</>;
};

export default AuthGuard;
