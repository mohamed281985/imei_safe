import React, { useEffect, useState } from 'react';
import { Gift, Award, Crown } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Props {
  user?: any | null;
  className?: string;
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
      className="flex items-center gap-2 p-1.5 sm:p-2 rounded-full bg-white/70 backdrop-blur-md border border-transparent transition-transform duration-300 ease-in-out"
      style={{ boxShadow: glow || '0 6px 16px rgba(2,6,23,0.12)' }}
    >
      <div className={`flex items-center justify-center w-8 h-8 rounded-full ${gradientClass} flex-shrink-0`} style={{ boxShadow: 'inset 0 -3px 8px rgba(255,255,255,0.26)' }}>
        <Icon className="w-4 h-4 text-white drop-shadow-md" />
      </div>

      <div className="min-w-0">
        <div className="text-sm sm:text-xs font-extrabold text-slate-900 tracking-wide">{title}</div>
      </div>
    </div>
  );
};

const PackageBadge: React.FC<Props> = ({ user = null, className = '' }) => {
  const [dbRole, setDbRole] = useState<string | null>(null);
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
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        
        if (error) {
          console.error('PackageBadge: failed fetching role', error);
          setIsLoading(false);
          return;
        }
        
        console.log('Fetched user data from DB:', data);
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
    return (
      <div className={`flex items-center gap-2 p-1.5 sm:p-2 rounded-full bg-white/70 backdrop-blur-md border border-transparent ${className}`}>
        <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse"></div>
        <div className="min-w-0">
          <div className="h-3 bg-gray-200 rounded w-16 animate-pulse"></div>
        </div>
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
            title="GOLD VIP"
            arabic="عضو ذهبي VIP"
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
