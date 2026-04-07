import fs from 'fs';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: './paymop-server/.env' });

const WEBHOOK_SECRET = process.env.SUPABASE_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  console.error('Missing SUPABASE_WEBHOOK_SECRET in paymop-server/.env');
  process.exit(1);
}

(async () => {
  try {
    const id = uuidv4();
    const payload = {
      record: {
        id,
        email: `test+${Date.now()}@example.com`,
        email_confirmed_at: new Date().toISOString(),
        user_metadata: {
          full_name: 'Scripted Test',
          phone: '+201234567890',
          store_name: 'Script Store',
          address: 'Cairo',
          business_type: 'shop',
          id_last6: '654321'
        }
      }
    };

    console.log('Posting webhook with id:', id);
    const res = await fetch('http://localhost:3000/api/supabase-auth-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    console.log('\n--- WEBHOOK RESPONSE ---');
    console.log('STATUS', res.status);
    console.log(text);
  } catch (e) {
    console.error('SCRIPT ERROR', e);
    process.exit(1);
  }
})();
