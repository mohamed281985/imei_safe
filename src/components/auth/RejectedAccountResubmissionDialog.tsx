import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import axiosInstance from '@/services/axiosInterceptor';
import CountryCodeSelector from '@/components/CountryCodeSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const RejectedAccountResubmissionDialog: React.FC = () => {
  const { rejectedAccountProfile, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [countryCode, setCountryCode] = useState('+20');
  const [phone, setPhone] = useState('');
  const [idLast6, setIdLast6] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!rejectedAccountProfile) return;
    setEmail(rejectedAccountProfile.email || '');
    setFullName(rejectedAccountProfile.full_name || '');
    setCountryCode(rejectedAccountProfile.country_code || '+20');
    setPhone(String(rejectedAccountProfile.phone || '').replace(/\D/g, ''));
    setIdLast6(String(rejectedAccountProfile.id_last6 || '').replace(/\D/g, '').slice(-6));
  }, [rejectedAccountProfile]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = fullName.trim().replace(/\s+/g, ' ');
    const digitsOnlyPhone = phone.replace(/\D/g, '');
    const digitsOnlyCountryCode = countryCode.replace(/\D/g, '');
    const digitsOnlyLast6 = idLast6.replace(/\D/g, '');

    if (normalizedName.split(' ').filter(Boolean).length < 4) {
      toast({ title: 'الاسم رباعي مطلوب', description: 'يرجى إدخال الاسم الكامل المكوّن من أربعة أجزاء.', variant: 'destructive' });
      return;
    }
    if (digitsOnlyPhone.length < 6 || !digitsOnlyCountryCode || digitsOnlyLast6.length !== 6) {
      toast({ title: 'راجع البيانات', description: 'أدخل رقم الهاتف ورمز الدولة وآخر 6 أرقام بشكل صحيح.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      await axiosInstance.post('/api/resubmit-rejected-account', {
        email: normalizedEmail,
        full_name: normalizedName,
        country_code: `+${digitsOnlyCountryCode}`,
        phone: digitsOnlyPhone,
        id_last6: digitsOnlyLast6,
      });

      toast({ title: 'تم إرسال البيانات للمراجعة', description: 'سيتم تسجيل خروجك حتى تتم مراجعة الحساب.' });
      await logout();
      navigate('/login', { replace: true });
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'تعذر إرسال البيانات للمراجعة.';
      toast({ title: 'تعذر إرسال الطلب', description: message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(rejectedAccountProfile)} onOpenChange={() => undefined}>
      <DialogContent
        className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-xl overflow-y-auto border-rose-200 p-0 text-right [&>button]:hidden"
        dir="rtl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b border-rose-100 bg-rose-50 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-lg font-bold text-rose-950">تم رفض الحساب</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-rose-900">
                لا يمكن استخدام التطبيق قبل تعديل البيانات وإرسالها للمراجعة مرة أخرى.
              </DialogDescription>
            </div>
          </div>
          {rejectedAccountProfile?.rejection_reason && (
            <div className="mt-4 rounded-md border border-rose-200 bg-white p-3">
              <p className="mb-1 text-xs font-semibold text-rose-700">سبب الرفض</p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-rose-950">{rejectedAccountProfile.rejection_reason}</p>
            </div>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 p-5 sm:p-6">
          <div className="space-y-1.5">
            <label htmlFor="resubmit-email" className="text-sm font-medium">البريد الإلكتروني</label>
            <Input id="resubmit-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={isSubmitting} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="resubmit-full-name" className="text-sm font-medium">الاسم رباعي</label>
            <Input id="resubmit-full-name" autoComplete="name" required value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={isSubmitting} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="resubmit-phone" className="text-sm font-medium">رقم الهاتف ورمز الدولة</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <CountryCodeSelector value={countryCode} onChange={setCountryCode} disabled={isSubmitting} />
              <Input id="resubmit-phone" type="tel" inputMode="numeric" autoComplete="tel-national" required value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 15))} disabled={isSubmitting} dir="ltr" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="resubmit-id-last6" className="text-sm font-medium">آخر 6 أرقام من البطاقة</label>
            <Input id="resubmit-id-last6" inputMode="numeric" autoComplete="off" required maxLength={6} value={idLast6} onChange={(event) => setIdLast6(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={isSubmitting} dir="ltr" />
          </div>
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={async () => { await logout(); navigate('/login', { replace: true }); }}>
              <LogOut className="ml-2 h-4 w-4" /> تسجيل الخروج
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-rose-700 hover:bg-rose-800">
              {isSubmitting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              إرسال للمراجعة مرة أخرى
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RejectedAccountResubmissionDialog;