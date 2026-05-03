import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: './paymop-server/.env' });
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in paymop-server/.env');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  try {
    const sql = `select column_name, data_type from information_schema.columns where table_name = 'notifications' order by ordinal_position;`;
    const { data, error } = await supabase.rpc('pg_exec', { sql });
    // if pg_exec not available, fallback to raw query via rpc "sql" not standard; instead use PostgREST: select from pg_catalog
    if (error) {
      console.error('RPC exec error:', error);
      // try using PostgREST table pg_catalog.pg_attribute is not directly accessible; fetch using supabase.from('notifications').select().limit(1)
      const { data: sample, error: sampErr } = await supabase.from('notifications').select().limit(1);
      if (sampErr) {
        console.error('Fallback sample error:', sampErr);
        process.exit(2);
      }
      console.log('Sample row keys:', sample && sample[0] ? Object.keys(sample[0]) : []);
      process.exit(0);
    }
    console.log('Columns:', data);
  } catch (e) {
    console.error('Unexpected error describing notifications table:', e);
    process.exit(3);
  }
})();