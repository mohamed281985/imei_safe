
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';

const AuthLinks = () => {
  const { t } = useLanguage();

  return (
    <div className="space-y-2">
      {/* تم نقل زر نسيت كلمة المرور إلى AppNavbar */}
      
    <Card className="rounded-xl p-3 mt-2 border" style={{background: '#ffffff', borderColor: '#ff9500', boxShadow: '0 0 0 1px #ff9500 inset'}}>
      <div className="mt-2 space-y-3 text-center">
          <p className="text-base md:text-lg font-bold text-black">{t('dont_have_account')}</p>
          <div className="flex gap-4">
            <Link
              to="/signup"
              className="text-l font-medium bg-[#1276da] text-white px-4 py-1 rounded-lg shadow-lg shadow-black/30 hover:bg-[#0a5bb8] transition-colors duration-300"
            >
              {t('user_account')}
            </Link>
            <span className="text-black mx-2">|</span>
            <Link 
              to="/business-signup"
              className="text-l font-medium bg-[#ff7700] text-white px-4 py-1 rounded-lg shadow-lg shadow-black/30 hover:bg-[#e56a00] transition-colors duration-300"
            >
              {t('business_account')}
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AuthLinks;
