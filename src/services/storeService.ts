import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://your-supabase-url.supabase.co';
const supabaseKey = 'your-supabase-key';
const supabase = createClient(supabaseUrl, supabaseKey);

export const getStoreName = async (userId: string): Promise<string> => {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('name')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.debug('Error fetching store name:', error);
      return 'اسم المحل غير متوفر';
    }

    return data?.name || 'اسم المحل غير متوفر';
  } catch (err) {
    console.debug('Unexpected error:', err);
    return 'اسم المحل غير متوفر';
  }
};
