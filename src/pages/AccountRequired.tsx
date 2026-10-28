import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BriefcaseBusiness, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PageContainer from '@/components/PageContainer';
import BackButton from '@/components/BackButton';
import { useLanguage } from '@/contexts/LanguageContext';

const ACTION_PATHS = new Set([
  '/register-phone',
  '/report',
  '/ownership-transfer',
  '/businesstransfer',
  '/BusinessTransferbuy',
  '/BusinessTransfersell',
]);

const AccountRequired: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const returnTo = ACTION_PATHS.has(location.state?.returnTo) ? location.state.returnTo : '/dashboard';
  const returnState = location.state?.returnState;
  const isArabic = language === 'ar';

  const actionTitle: Record<string, string> = isArabic ? {
    '/register-phone': 'تسجيل هاتف',
    '/report': 'تقديم بلاغ',
    '/ownership-transfer': 'نقل ملكية هاتف',
    '/businesstransfer': 'إتمام نقل الملكية',
    '/BusinessTransferbuy': 'شراء هاتف ونقل ملكيته',
    '/BusinessTransfersell': 'بيع هاتف ونقل ملكيته',
  } : {
    '/register-phone': 'Register a phone',
    '/report': 'Submit a report',
    '/ownership-transfer': 'Transfer phone ownership',
    '/businesstransfer': 'Complete an ownership transfer',
    '/BusinessTransferbuy': 'Buy a phone and transfer ownership',
    '/BusinessTransfersell': 'Sell a phone and transfer ownership',
  };

  const chooseAccount = (type: 'personal' | 'business') => {
    navigate(type === 'personal' ? '/signup' : '/business-signup', {
      state: { returnTo, returnState },
    });
  };

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-lg px-4 py-8" dir={isArabic ? 'rtl' : 'ltr'}>
        <div className="mb-6 flex items-center">
          <BackButton to="/search" />
          <h1 className="flex-1 text-center text-xl font-bold text-slate-900">
            {isArabic ? `متابعة: ${actionTitle[returnTo] || 'إنشاء حساب'}` : `Continue: ${actionTitle[returnTo] || 'create an account'}`}
          </h1>
        </div>
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-center text-lg">
              {isArabic ? 'اختر نوع الحساب للمتابعة' : 'Choose an account type to continue'}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Button className="h-14 gap-2 bg-orange-600 text-base hover:bg-orange-700" onClick={() => chooseAccount('personal')}>
              <UserRound size={20} />
              {isArabic ? 'حساب شخصي' : 'Personal account'}
            </Button>
            <Button className="h-14 gap-2 bg-slate-800 text-base hover:bg-slate-900" onClick={() => chooseAccount('business')}>
              <BriefcaseBusiness size={20} />
              {isArabic ? 'حساب تجاري' : 'Business account'}
            </Button>
            <Button
              variant="outline"
              className="sm:col-span-2"
              onClick={() => navigate('/login', { state: { returnTo, returnState } })}
            >
              {isArabic ? 'لدي حساب بالفعل، تسجيل الدخول' : 'I already have an account, sign in'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
};

export default AccountRequired;