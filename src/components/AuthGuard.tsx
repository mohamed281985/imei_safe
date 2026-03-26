
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
    // Redirect to login with return path
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  
  // إذا كان المستخدم مصادقًا عليه ولكن ملفه التجاري غير مكتمل، قم بتوجيهه إلى صفحة الإكمال
  if (needsProfileCompletion && location.pathname !== '/business-profile-complete') {
    return <Navigate to="/business-profile-complete" replace />;
  }
  
  return <>{children}</>;
};

export default AuthGuard;
