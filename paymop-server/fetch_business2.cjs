const https = require('https');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const userId = process.argv[2];
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing SUPABASE_URL or SUPABASE_KEY'); process.exit(2); }
if (!userId) { console.error('Usage: node fetch_business2.cjs <user_id>'); process.exit(2); }

const url = `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1/businesses?user_id=eq.${userId}&select=*`;
const u = new URL(url);
const opts = {
  hostname: u.hostname,
  path: u.pathname + u.search,
  method: 'GET',
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  }
};

const req = https.request(opts, (res) => {
  let s = '';
  res.on('data', (c) => s += c);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    try { console.log(JSON.parse(s)); } catch (e) { console.log('BODY_TEXT', s); }
  });
});
req.on('error', (e) => console.error('ERR', e));
req.end();
