import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config({ path: './paymop-server/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in paymop-server/.env');
  process.exit(1);
}

(async () => {
  try {
    const email = `test+${Date.now()}@example.com`;
    const password = 'P@ssw0rd123!';
    const userMetadata = { full_name: 'Auto Test', phone: '+201234567890', store_name: 'Auto Store' };

    console.log('Creating auth user via Supabase Admin API:', email);
    const createRes = await fetch(`${SUPABASE_URL.replace(/\/+$/,'')}/admin/v1/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE}`,
        'apikey': SERVICE_ROLE
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: userMetadata
      })
    });

    const createText = await createRes.text();
    console.log('Admin API STATUS', createRes.status);
    try { console.log('Admin API RESP', JSON.stringify(JSON.parse(createText), null, 2)); } catch(e){ console.log('Admin API RESP TEXT', createText); }

    if (!createRes.ok) {
      console.error('Failed to create auth user via Admin API. Check service role key or project URL.');
      process.exit(1);
    }

    const created = JSON.parse(createText);
    const id = created.id;
    if (!id) {
      console.error('No id returned from Admin API response');
      process.exit(1);
    }

    console.log('Created auth user id:', id);

    // Now call local create-app-user
    const payload = {
      id,
      email,
      metadata: { ...userMetadata, address: 'Cairo', business_type: 'shop', id_last6: '654321' }
    };

    const localRes = await fetch('http://localhost:3000/api/create-app-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const localText = await localRes.text();
    console.log('\nLocal create-app-user STATUS', localRes.status);
    try { console.log('Local RESP', JSON.stringify(JSON.parse(localText), null, 2)); } catch(e){ console.log('Local RESP TEXT', localText); }

  } catch (e) {
    console.error('SCRIPT ERROR', e);
    process.exit(1);
  }
})();
