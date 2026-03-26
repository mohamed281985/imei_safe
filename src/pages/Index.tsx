
import React, { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const Index = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  
  useEffect(() => {
    // If user is already authenticated, redirect to dashboard
    // Otherwise redirect to language selection page
    if (!isLoading) {
      console.log("Index page - Auth state:", isAuthenticated ? "authenticated" : "not authenticated");
      if (isAuthenticated) {
        console.log("Redirecting to dashboard");
        navigate('/dashboard', { replace: true });
      } else {
        console.log("Redirecting to welcome page");
        navigate('/welcome', { replace: true });
      }
    }
  }, [isAuthenticated, isLoading, navigate]);
  
  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-imei-dark">
        <div className="p-6 rounded-md">
          <div className="animate-pulse text-imei-cyan text-xl">{t('loading')}...</div>
        </div>
      </div>
    );
  }
  
  // Return null instead of a Navigate component to avoid redirection issues
  return null;
};

export default Index;
