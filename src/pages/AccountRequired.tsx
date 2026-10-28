import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BriefcaseBusiness, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PageContainer from '@/components/PageContainer';
import BackButton from '@/components/BackButton';
import Logo from '@/components/Logo';
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
      <div className="mx-auto w-full max-w-lg px-3 py-6 sm:px-5 sm:py-8" dir={isArabic ? 'rtl' : 'ltr'}>
        <div className="mb-5 flex justify-center">
          <Logo size="lg" />
        </div>
        <div className="mb-6 flex min-h-14 items-center gap-3 rounded-xl bg-gradient-to-r from-[#053060] to-[#0a4d8c] p-2 shadow-md">
          <BackButton to="/dashboard" className="shrink-0" />
          <h1 className="flex-1 text-center text-lg font-bold leading-snug text-white sm:text-xl">
            {isArabic ? `متابعة: ${actionTitle[returnTo] || 'إنشاء حساب'}` : `Continue: ${actionTitle[returnTo] || 'create an account'}`}
          </h1>
        </div>
        <Card className="overflow-hidden border border-[#b9dce6] border-t-4 border-t-orange-500 bg-white shadow-[0_8px_24px_rgba(5,48,96,0.14)]">
          <CardHeader className="space-y-2 pb-4">
            <CardTitle className="text-center text-xl font-bold text-[#0a4d8c] sm:text-2xl">
              {isArabic ? 'اختر نوع الحساب للمتابعة' : 'Choose an account type to continue'}
            </CardTitle>
            <p className="text-center text-sm leading-6 text-slate-600">
              {isArabic ? 'اختر نوع الحساب المناسب لإكمال العملية بأمان.' : 'Choose the account type that fits how you want to continue.'}
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
            <Button className="h-14 gap-2 rounded-lg bg-orange-500 text-base font-bold text-white shadow-sm hover:bg-orange-600" onClick={() => chooseAccount('personal')}>
              <UserRound size={20} />
              {isArabic ? 'حساب شخصي' : 'Personal account'}
            </Button>
            <Button className="h-14 gap-2 rounded-lg bg-[#0a4d8c] text-base font-bold text-white shadow-sm hover:bg-[#053060]" onClick={() => chooseAccount('business')}>
              <BriefcaseBusiness size={20} />
              {isArabic ? 'حساب تجاري' : 'Business account'}
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-lg border-[#159bb0] bg-white font-semibold text-[#0a4d8c] hover:bg-[#eaf8fb] hover:text-[#053060] sm:col-span-2"
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