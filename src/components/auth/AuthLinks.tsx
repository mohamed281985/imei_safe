
import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { Store, UserRound } from 'lucide-react';

const AuthLinks = () => {
  const { t, language } = useLanguage();

  return (
    <div className="space-y-3 pt-0.5">
      <div className="flex items-center gap-4" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-sm font-bold text-slate-500">{language === 'ar' ? '\u0623\u0648' : 'OR'}</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="flex gap-3" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <Link
          to="/signup"
          className="flex h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-sky-500 bg-white px-2 text-center text-sm font-bold text-sky-600 transition-colors hover:bg-sky-50 sm:gap-3 sm:text-base"
        >
          <UserRound className="h-7 w-7 shrink-0 fill-sky-500 text-sky-500" />
          <span dir="auto" className="font-extrabold">{t('user_account')}</span>
        </Link>
        <Link
          to="/business-signup"
          className="flex h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-orange-500 bg-white px-2 text-center text-sm font-bold text-orange-600 transition-colors hover:bg-orange-50 sm:gap-3 sm:text-base"
        >
          <Store className="h-7 w-7 shrink-0" />
          <span dir="auto" className="font-extrabold">{t('business_account')}</span>
        </Link>
      </div>
    </div>
  );
};

export default AuthLinks;
