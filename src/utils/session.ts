import { supabase } from '@/lib/supabase';

export async function validateSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    const session = data?.session || null;
    if (error) throw error;
    if (!session) throw new Error('No active session');

    // session.expires_at is in seconds since epoch
    const nowSec = Date.now() / 1000;
    if (session.expires_at && session.expires_at < nowSec) {
      throw new Error('Session expired');
    }

    return session;
  } catch (e) {
    throw e;
  }
}

export default validateSession;
