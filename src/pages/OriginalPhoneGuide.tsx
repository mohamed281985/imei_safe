import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Camera, FileText, Lightbulb, ScanLine, ShieldCheck } from 'lucide-react';
import PageContainer from '@/components/PageContainer';
import AppNavbar from '@/components/AppNavbar';
import BottomNavbar from './BottomNavbar';
import BackButton from '@/components/BackButton';
import { useScrollToTop } from '../hooks/useScrollToTop';

const steps = [
  {
    number: '1',
    title: 'افحص رقم IMEI',
    description: 'تأكد أن رقم IMEI الظاهر في الهاتف يطابق الرقم الموجود على العلبة والفاتورة.',
    icon: FileText,
    color: 'text-blue-700 bg-blue-50',
  },
  {
    number: '2',
    title: 'افحص بيانات الجهاز',
    description: 'قارن الشركة والموديل والبيانات الظاهرة على الهاتف مع بيانات الجهاز الأصلية.',
    icon: ShieldCheck,
    color: 'text-emerald-700 bg-emerald-50',
  },
  {
    number: '3',
    title: 'افحص الهاتف قبل الشراء',
    description: 'تحقق من الشاشة والكاميرات والأزرار والشحن والاتصال قبل إتمام الشراء.',
    icon: Camera,
    color: 'text-orange-700 bg-orange-50',
  },
  {
    number: '4',
    title: 'افحص IMEI عبر التطبيق',
    description: 'استخدم أداة الفحص داخل التطبيق للحصول على نتيجة أوضح قبل الشراء.',
    icon: ScanLine,
    color: 'text-cyan-700 bg-cyan-50',
  },
];

const OriginalPhoneGuide: React.FC = () => {
  useScrollToTop();

  return (
    <PageContainer>
      <AppNavbar />
      <main className="w-full px-3 pb-24 pt-3" dir="rtl">
        <div className="mb-5 flex items-center gap-3">
          <BackButton className="shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">كيف تعرف الهاتف الأصلي؟</h1>
            <p className="mt-1 text-xs font-bold text-slate-500">دليل سريع قبل شراء أي هاتف</p>
          </div>
        </div>

        <div className="space-y-3">
          {steps.map(({ number, title, description, icon: Icon, color }) => (
            <article key={number} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start gap-3">
                <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${color}`}>
                  <Icon className="h-6 w-6" strokeWidth={1.9} />
                  <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                    {number}
                  </span>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-slate-900">{title}</h2>
                  <p className="mt-1 text-xs font-bold leading-5 text-slate-600">{description}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <Link
          to="/search"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-950 px-4 py-3 text-sm font-bold text-white shadow-md transition-shadow hover:shadow-lg"
        >
          <ScanLine className="h-5 w-5" strokeWidth={2} />
          فحص IMEI الآن
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </Link>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs font-bold leading-5 text-amber-900">
          <Lightbulb className="h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.9} />
          <span>لا تعتمد على طريقة واحدة فقط للتأكد من الهاتف.</span>
        </div>
      </main>
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <BottomNavbar />
      </div>
    </PageContainer>
  );
};

export default OriginalPhoneGuide;
