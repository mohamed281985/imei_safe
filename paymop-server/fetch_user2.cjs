const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env from this folder if env vars are not already set
const envPath = path.join(__dirname, '.env');
if ((!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) && fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  envText.split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Za-z0-9_]+)=(.*)\s*$/);
    if (m) {
      const key = m[1];
      let val = m[2] || '';
      // strip optional surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const userId = process.argv[2];
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing SUPABASE_URL or SUPABASE_KEY'); process.exit(2); }
if (!userId) { console.error('Usage: node fetch_user2.cjs <user_id>'); process.exit(2); }

const url = `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1/users?id=eq.${userId}&select=*`;
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
