import React from 'react';

interface Props {
  plan?: any | null;
  planType?: string;
  loading?: boolean;
}

const SubscriptionCard: React.FC<Props> = ({ plan = null, planType = 'free_business', loading = false }) => {
  if (loading) {
    return (
      <div className="rounded-[28px] p-4 bg-white/60 backdrop-blur-md border border-transparent shadow-sm flex items-center justify-center">
        <div className="h-3 w-24 bg-gray-200 animate-pulse rounded" />
      </div>
    );
  }

  const normalized = String(planType || 'free_business').toLowerCase().trim();
  const base = normalized.split('_')[0];

  if (base === 'gold') {
    return (
      <div className="rounded-[28px] p-4 bg-gradient-to-r from-yellow-100/60 to-white/60 backdrop-blur-md border border-yellow-200 shadow-lg" style={{ boxShadow: '0 10px 30px rgba(250,204,21,0.12)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-yellow-500 to-amber-400 text-white font-bold">GOLD VIP</div>
            <h3 className="mt-3 text-lg font-extrabold text-gray-900">ميزات باقة الذهبية</h3>
            <ul className="mt-2 text-sm text-gray-700 space-y-1">
              <li>متبقي 22 إعلان</li>
              <li>مدة الإعلان 30 يوم</li>
              <li>الباقة تنتهي بعد 28 يوم</li>
            </ul>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="p-3 rounded-lg bg-white/60 shadow-md">
              <div className="text-sm text-gray-700">الميزات</div>
              <div className="text-sm text-gray-900 font-semibold">ظهور ذهبي · تثبيت · واتساب مباشر</div>
            </div>
            <button className="px-4 py-2 rounded-lg bg-gradient-to-r from-yellow-500 to-amber-400 text-white font-bold">نشر ذهبي</button>
          </div>
        </div>
      </div>
    );
  }

  if (base === 'silver') {
    return (
      <div className="rounded-[28px] p-4 bg-gradient-to-r from-slate-50 to-white/60 backdrop-blur-md border border-slate-200 shadow-md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-emerald-400 to-slate-300 text-white font-bold">SILVER MEMBER</div>
            <h3 className="mt-3 text-lg font-extrabold text-gray-900">الباقة الفضية</h3>
            <ul className="mt-2 text-sm text-gray-700 space-y-1">
              <li>متبقي 10 إعلانات</li>
              <li>مدة الإعلان 15 يوم</li>
              <li>الباقة تنتهي بعد 28 يوم</li>
            </ul>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="p-3 rounded-lg bg-white/60 shadow-sm">
              <div className="text-sm text-gray-700">Silver Benefits</div>
              <div className="text-sm text-gray-900 font-semibold">ظهور فضي · أولوية متوسطة</div>
            </div>
            <button className="px-4 py-2 rounded-lg bg-emerald-500 text-white font-bold">نشر فضي</button>
          </div>
        </div>
      </div>
    );
  }

  // Default FREE UI
  return (
    <div className="rounded-[28px] p-4 bg-white/60 backdrop-blur-md border border-transparent shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500 text-white font-bold">FREE MEMBER</div>
          <h3 className="mt-3 text-lg font-extrabold text-gray-900">خطة مجانية</h3>
          <p className="mt-2 text-sm text-gray-700">اختر مدة الإعلان المدفوعة أدناه</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">أسعار</div>
          <div className="mt-2 text-sm text-gray-900 font-bold">3 أيام — 60 ج</div>
          <div className="text-sm text-gray-900 font-bold">7 أيام — 100 ج</div>
          <div className="text-sm text-gray-900 font-bold">15 يوم — 180 ج</div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionCard;
