import React, { useEffect, useState } from 'react';
import { Gift, Award, Crown } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Props {
  user?: any | null;
  className?: string;
  compact?: boolean;
}

const PlanCard: React.FC<{
  id: 'FREE' | 'SILVER' | 'GOLD';
  title: string;
  arabic: string;
  Icon: React.ComponentType<any>;
  gradientClass: string;
  glow?: string;
}> = ({ id, title, arabic, Icon, gradientClass, glow }) => {
  return (
    <div
      className="flex h-12 items-center gap-2 rounded-full border border-transparent bg-white/70 p-1.5 backdrop-blur-md transition-transform duration-300 ease-in-out"
      style={{ boxShadow: glow || '0 6px 16px rgba(2,6,23,0.12)' }}
    >
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${gradientClass}`} style={{ boxShadow: 'inset 0 -3px 8px rgba(255,255,255,0.26)' }}>
        <Icon className="w-4 h-4 text-white drop-shadow-md" />
      </div>

      <div className="min-w-0">
        <div className="text-xs font-extrabold tracking-wide text-slate-900">{title}</div>
      </div>
    </div>
  );
};

const PackageBadge: React.FC<Props> = ({ user = null, className = '', compact = false }) => {
  const [dbRole, setDbRole] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // دالة لجلب دور المستخدم من قاعدة البيانات
    const fetchUserRole = async () => {
      if (!user?.id) {
        console.log('No user ID provided');
        setIsLoading(false);
        return;
      }

      try {
        console.log('Fetching role for user:', user.id);
        const { data, error } = await supabase
          .from('users')
          .select('role, expires_at')
          .eq('id', user.id)
          .maybeSingle();
        
        if (error) {
          console.error('PackageBadge: failed fetching role', error);
          setIsLoading(false);
          return;
        }
        
        console.log('Fetched user data from DB:', data);
        setExpiresAt(data?.expires_at || null);
        if (data?.role) {
          const normalizedFromDb = String(data.role).toLowerCase().trim();
          console.log('Setting role from DB to:', data.role, '-> normalized:', normalizedFromDb);
          setDbRole(normalizedFromDb);
        } else {
          console.log('No role found in database, using default: free');
          setDbRole('free');
        }
        setIsLoading(false);
      } catch (e) {
        console.error('PackageBadge: unexpected error fetching role', e);
        setIsLoading(false);
      }
    };

    // Show incoming user object for debugging
    console.log('PackageBadge mount - user object:', user);

    // If user.role exists, temporarily use it (normalized) while we fetch authoritative value from DB
    if (user?.role) {
      const normalizedUserRole = String(user.role).toLowerCase().trim();
      console.log('Temporarily using role from user object:', user.role, '-> normalized:', normalizedUserRole);
      setDbRole(normalizedUserRole);
    }

    // Always fetch the role from DB to ensure we use the authoritative value
    fetchUserRole();
  }, [user?.id, user?.role]);

  // تحديد الباقة النشطة بناءً على دور المستخدم
  const getActivePlan = () => {
    const raw = dbRole ?? 'free';
    const roleStr = String(raw).toLowerCase().trim();
    // Normalize separators and extract base token (gold, silver, free)
    const normalized = roleStr.replace(/[\s\-]+/g, '_');
    const base = normalized.split('_')[0];
    console.log('Determining active plan - raw:', raw, 'normalized:', normalized, 'base:', base);

    if (base === 'gold') {
      console.log('Active plan: GOLD');
      return 'GOLD';
    } else if (base === 'silver') {
      console.log('Active plan: SILVER');
      return 'SILVER';
    } else {
      console.log('Active plan: FREE');
      return 'FREE';
    }
  };

  const activePlan = getActivePlan();

  // عرض حالة التحميل
  if (isLoading) {
    if (compact) {
      return <div className={`flex h-14 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm ${className}`}><span className="h-9 w-9 animate-pulse rounded-lg bg-slate-200" /><span className="space-y-1.5"><span className="block h-2 w-20 animate-pulse rounded bg-slate-200" /><span className="block h-2.5 w-28 animate-pulse rounded bg-slate-300" /></span></div>;
    }
    return (
      <div className={`flex h-12 items-center gap-2 rounded-full border border-transparent bg-white/70 p-1.5 backdrop-blur-md ${className}`}>
        <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse"></div>
        <div className="min-w-0">
          <div className="h-3 bg-gray-200 rounded w-16 animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (compact) {
    const planBadge = activePlan === 'GOLD'
      ? { title: 'GOLD', description: 'الباقة الذهبية', Icon: Crown, className: 'border-amber-200 border-r-4 border-r-amber-400 bg-gradient-to-l from-amber-100 via-amber-50 to-white text-amber-950', iconClassName: 'bg-gradient-to-br from-yellow-400 to-amber-500 text-white', statusClassName: 'bg-amber-100 text-amber-800' }
      : activePlan === 'SILVER'
        ? { title: 'SILVER', description: 'الباقة الفضية', Icon: Award, className: 'border-slate-300 border-r-4 border-r-slate-400 bg-gradient-to-l from-slate-100 via-slate-50 to-white text-slate-800', iconClassName: 'bg-gradient-to-br from-slate-400 to-slate-600 text-white', statusClassName: 'bg-slate-200 text-slate-700' }
        : { title: 'FREE', description: 'الباقة المجانية', Icon: Gift, className: 'border-sky-200 border-r-4 border-r-sky-400 bg-gradient-to-l from-sky-100 via-sky-50 to-white text-sky-950', iconClassName: 'bg-gradient-to-br from-sky-400 to-cyan-600 text-white', statusClassName: 'bg-sky-100 text-sky-800' };
    const Icon = planBadge.Icon;
    const parsedExpiryDate = expiresAt ? new Date(expiresAt) : null;
    const expiryLabel = parsedExpiryDate && Number.isFinite(parsedExpiryDate.getTime())
      ? `ينتهي في ${parsedExpiryDate.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : 'تاريخ الانتهاء غير مسجل';
    return (
      <div aria-label={`${planBadge.description} ${planBadge.title}، ${expiryLabel}`} className={`flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 py-2 shadow-sm ${planBadge.className} ${className}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-inner ${planBadge.iconClassName}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[10px] font-semibold text-slate-500">مستوى عضويتك</span>
          <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-black tracking-wide">{planBadge.title}</span>
            <span className="text-xs font-semibold opacity-80">{planBadge.description}</span>
          </span>
          <span className="mt-1 block text-[10px] font-medium text-slate-600">{expiryLabel}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${planBadge.statusClassName}`}>نشطة</span>
      </div>
    );
  }

  // تحديد الباقة النشطة بناءً على دور المستخدم
  const renderActivePlan = () => {
    switch (activePlan) {
      case 'GOLD':
        return (
          <PlanCard
            id="GOLD"
            title="GOLD"
            arabic="عضو ذهبي"
            Icon={Crown}
            gradientClass="bg-gradient-to-br from-yellow-400 to-amber-400"
            glow="0 8px 20px rgba(250,204,21,0.16)"
          />
        );
      case 'SILVER':
        return (
          <PlanCard
            id="SILVER"
            title="SILVER"
            arabic="عضو فضي"
            Icon={Award}
            gradientClass="bg-gradient-to-br from-slate-200 to-emerald-200"
            glow="0 6px 16px rgba(88,116,255,0.06)"
          />
        );
      default: // FREE
        return (
          <PlanCard
            id="FREE"
            title="FREE"
            arabic="عضو مجاني"
            Icon={Gift}
            gradientClass="bg-gradient-to-br from-blue-400 to-blue-300"
          />
        );
    }
  };

  return (
    <div className={className}>
      {renderActivePlan()}
    </div>
  );
};

export default PackageBadge;
