import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useAppUserRole(userId?: string) {
  const [role, setRole] = useState('');

  useEffect(() => {
    let active = true;
    setRole('');

    if (!userId) return () => { active = false; };

    const loadRole = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Could not load authenticated user role:', error);
        return;
      }
      if (active) setRole(data?.role || '');
    };

    void loadRole();
    return () => { active = false; };
  }, [userId]);

  return role;
}
