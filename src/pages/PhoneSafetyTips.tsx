import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeAlert,
  CreditCard,
  FileText,
  Hash,
  Lightbulb,
  LockKeyhole,
  MapPinOff,
  QrCode,
  ShieldCheck,
  Siren,
  Smartphone,
  ShoppingCart,
  UsersRound,
} from 'lucide-react';
import PageContainer from '@/components/PageContainer';
import AppNavbar from '@/components/AppNavbar';
import BottomNavbar from './BottomNavbar';
import BackButton from '@/components/BackButton';
import { useScrollToTop } from '../hooks/useScrollToTop';

type Tip = {
  title: string;
  description: string;
  icon: React.ElementType;
};

const safetyTips: Tip[] = [
  {
    title: 'احمِ هاتفك',
    description: 'فعّل قفل الشاشة والبصمة أو Face ID، ولا تشارك رمز الدخول مع أي شخص.',
    icon: ShieldCheck,
  },
  {
    title: 'احتفظ برقم IMEI',
    description: 'احتفظ برقم IMEI في مكان آمن، فقد تحتاج إليه عند فقد الهاتف أو تقديم بلاغ.',
    icon: Hash,
  },
  {
    title: 'إذا فُقد هاتفك',
    description: 'استخدم خدمة إخطار فقد سريع داخل التطبيق للإبلاغ عن الهاتف.',
    icon: BadgeAlert,
  },
  {
    title: 'احتفظ ببيانات الهاتف',
    description: 'احتفظ بفاتورة الشراء وبيانات الجهاز ورقم IMEI وأي مستندات تثبت ملكيتك للهاتف.',
    icon: FileText,
  },
  {
    title: 'أمّن حساباتك',
    description: 'غيّر كلمات مرور الحسابات المهمة وسجّل الخروج من الهاتف المفقود إذا كان ذلك ممكنًا.',
    icon: LockKeyhole,
  },
  {
    title: 'أوقف وسائل الدفع',
    description: 'إذا كان الهاتف يحتوي على تطبيقات بنكية أو محافظ إلكترونية، تواصل مع الجهة المختصة لتأمين حساباتك.',
    icon: CreditCard,
  },
  {
    title: 'لا تحاول استرجاع الهاتف بنفسك',
    description: 'إذا ظهر موقع الهاتف، لا تواجه الشخص بنفسك؛ استخدم المعلومات المتاحة للجهات المختصة.',
    icon: MapPinOff,
  },
  {
    title: 'قبل شراء هاتف مستعمل',
    description: 'افحص IMEI وتأكد من حالة الهاتف قبل دفع ثمنه.',
    icon: ShoppingCart,
  },
];

const PhoneSafetyTips: React.FC = () => {
  useScrollToTop();

  return (
    <PageContainer>
      <AppNavbar />
      <main className="w-full px-3 pb-24 pt-3" dir="rtl">
        <div className="mb-5 flex items-center gap-3">
          <BackButton className="shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">نصائح مهمة لهاتفك</h1>
            <p className="mt-1 text-xs font-bold text-slate-500">خطوات بسيطة لحماية هاتفك وبياناتك</p>
          </div>
        </div>

        <section aria-labelledby="safety-tips-heading">
          <h2 id="safety-tips-heading" className="mb-3 text-sm font-bold text-slate-800">حماية الهاتف والبيانات</h2>
          <div className="space-y-2.5">
            {safetyTips.slice(0, 2).map(({ title, description, icon: Icon }) => (
              <article key={title} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <Icon className="h-5 w-5" strokeWidth={1.9} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{title}</h3>
                  <p className="mt-1 text-xs font-bold leading-5 text-slate-600">{description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-5" aria-labelledby="lost-phone-heading">
          <h2 id="lost-phone-heading" className="mb-3 text-sm font-bold text-slate-800">عند فقد الهاتف</h2>
          <div className="space-y-2.5">
            <article className="rounded-xl border border-orange-200 bg-orange-50/70 p-3 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
                  <Siren className="h-5 w-5" strokeWidth={1.9} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-orange-950">أبلغ قسم الشرطة</h3>
                  <p className="mt-1 text-xs font-bold leading-5 text-orange-900">
                    بعد فقد الهاتف، توجّه إلى قسم الشرطة المختص وحرّر محضرًا رسميًا، واحتفظ برقم المحضر لاستخدامه عند الحاجة.
                  </p>
                </div>
              </div>
            </article>
            <div className="grid gap-2.5">
              {safetyTips.slice(2, 3).map(({ title, description, icon: Icon }) => (
                <article key={title} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
                    <Icon className="h-5 w-5" strokeWidth={1.9} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{title}</h3>
                    <p className="mt-1 text-xs font-bold leading-5 text-slate-600">{description}</p>
                  </div>
                </article>
              ))}
              {safetyTips.slice(3).map(({ title, description, icon: Icon }) => (
                <article key={title} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-700">
                    <Icon className="h-5 w-5" strokeWidth={1.9} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{title}</h3>
                    <p className="mt-1 text-xs font-bold leading-5 text-slate-600">{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-xl border border-cyan-200 bg-cyan-50/70 p-3 shadow-sm" aria-labelledby="qr-heading">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-800">
              <QrCode className="h-6 w-6" strokeWidth={1.9} />
            </div>
            <div>
              <h2 id="qr-heading" className="text-sm font-bold text-cyan-950">خدمة QR تساعدك</h2>
              <p className="mt-1 text-xs font-bold text-cyan-900">طريقة آمنة لتسهيل التواصل مع مالك الهاتف</p>
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="rounded-lg bg-white/80 p-2.5">
              <h3 className="text-sm font-bold text-slate-900">📲 ضع رمز التعريف على شاشة القفل</h3>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-600">بعد تسجيل الهاتف، يمكنك طباعة أو عرض الباركود/QR الخاص به ووضعه على شاشة القفل أو خلفية الشاشة، ليساعد من يعثر على الهاتف في معرفة طريقة التواصل مع مالكه دون فتح الجهاز.</p>
            </div>
            <div className="rounded-lg bg-white/80 p-2.5">
              <h3 className="text-sm font-bold text-slate-900">🔗 كيف يعمل الرمز؟</h3>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-600">عند مسح الرمز، تظهر صفحة آمنة تحتوي على وسيلة للتواصل مع صاحب الهاتف أو الإبلاغ بأنه تم العثور عليه، دون كشف بيانات المستخدم الحساسة.</p>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-white/80 p-2.5">
              <UsersRound className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" strokeWidth={1.9} />
              <div>
                <h3 className="text-sm font-bold text-slate-900">نحن منصة مجتمعية</h3>
                <p className="mt-1 text-xs font-bold leading-5 text-slate-600">IMEI Safe يحاول مساعدتك في استعادة هاتفك، لكنه لا يضمن استرجاعه. نجاح الفكرة يعتمد على تعاون المجتمع: إذا عثر شخص على هاتف، يمكنه مسح الرمز والتواصل مع صاحبه أو الإبلاغ عنه.</p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-white/80 p-2.5">
              <Siren className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" strokeWidth={1.9} />
              <div>
                <h3 className="text-sm font-bold text-slate-900">الإبلاغ الرسمي مهم</h3>
                <p className="mt-1 text-xs font-bold leading-5 text-slate-600">في حالة فقد الهاتف، استخدم خدمة الإبلاغ داخل التطبيق، وتوجّه أيضًا إلى قسم الشرطة المختص وحرّر محضرًا رسميًا، واحتفظ برقم المحضر.</p>
              </div>
            </div>
          </div>
        </section>

        <Link
          to="/report"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-950 px-4 py-3 text-sm font-bold text-white shadow-md transition-shadow hover:shadow-lg"
        >
          <Smartphone className="h-5 w-5" strokeWidth={2} />
          إخطار فقد سريع
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </Link>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold leading-5 text-amber-950">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.9} />
          <span>تنبيه مهم: الإبلاغ داخل التطبيق لا يُغني عن تحرير محضر رسمي لدى قسم الشرطة. التطبيق وسيلة مساعدة مجتمعية لتسهيل التعرف على الهاتف والتواصل مع مالكه، وليس بديلًا عن الشرطة أو الجهات الرسمية، ولا يمكنه ضمان استعادة الهاتف.</span>
        </div>
      </main>
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <BottomNavbar />
      </div>
    </PageContainer>
  );
};

export default PhoneSafetyTips;
