import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getRewardBalanceFromStorage, setRewardBalanceInStorage } from '@/data/rewards';

export const useRewardBalance = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const [balance, setBalance] = useState(() => getRewardBalanceFromStorage(userId));

  useEffect(() => {
    let active = true;
    setBalance(getRewardBalanceFromStorage(userId));

    const syncFromDatabase = async () => {
      if (!userId) return;
      const { data, error } = await supabase
        .from('users_plans')
        .select('points')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.warn('Could not sync reward points:', error.message);
        return;
      }
      if (active && data) {
        const points = Math.max(0, Number(data.points) || 0);
        setRewardBalanceInStorage(points, userId);
        setBalance(points);
      }
    };

    const handleBalanceUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string | null; balance: number }>).detail;
      if ((detail?.userId || undefined) === userId) setBalance(getRewardBalanceFromStorage(userId));
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === `imei-safe-reward-balance:${userId || 'guest'}`) {
        setBalance(getRewardBalanceFromStorage(userId));
      }
    };

    window.addEventListener('imei-safe-reward-balance-updated', handleBalanceUpdate);
    window.addEventListener('storage', handleStorage);
    void syncFromDatabase();

    return () => {
      active = false;
      window.removeEventListener('imei-safe-reward-balance-updated', handleBalanceUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, [userId]);

  return { balance, userId };
};