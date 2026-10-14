
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface GuestGuardProps {
  children: React.ReactNode;
}

const GuestGuard: React.FC<GuestGuardProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
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
  
  if (isAuthenticated) {
    // Redirect to dashboard if already logged in
    // First check if there's a redirect in state, otherwise go to dashboard
    const returnPath = location.state?.from || '/dashboard';
    return <Navigate to={returnPath} replace />;
  }
  
  return <>{children}</>;
};

export default GuestGuard;
