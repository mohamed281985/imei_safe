import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load server .env where SUPABASE_SERVICE_ROLE_KEY is defined
dotenv.config({ path: './paymop-server/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in paymop-server/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const buildPayload = () => {
  const now = new Date().toISOString();
  return {
    title: 'Test notification (server-side)',
    body: 'This is a test notification inserted by insert_notification_test.mjs',
    email: 'owner@example.test',
    user_id: null,
    imei: 'TEST-IMEI-' + Math.floor(Math.random() * 1000000),
    notification_type: 'test_insert',
    is_read: false,
    created_at: now,
    metadata: { finder_phone: '+201234567890' }
  };
};

(async () => {
  try {
    const payload = buildPayload();
    console.log('Inserting notification payload:', payload);
    const { data, error } = await supabase
      .from('notifications')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Insert error:', error);
      process.exit(2);
    }

    console.log('Insert successful:', data);
    process.exit(0);
  } catch (e) {
    console.error('Unexpected error:', e);
    process.exit(3);
  }
})();