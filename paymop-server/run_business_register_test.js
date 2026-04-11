(async ()=>{
  try{
    const fs = await import('fs');
    const path = await import('path');
    const crypto = await import('crypto');
    const base = 'http://127.0.0.1:3000';
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // load .env if present
    const envPath = path.join(__dirname, '.env');
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      if (fs.existsSync(envPath)) {
        const envText = fs.readFileSync(envPath, 'utf8');
        envText.split(/\r?\n/).forEach(line => {
          const m = line.match(/^\s*([A-Za-z0-9_]+)=(.*)\s*$/);
          if (m) {
            const key = m[1];
            let val = m[2] || '';
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1,-1);
            if (!process.env[key]) process.env[key] = val;
          }
        });
      }
    }

    const rnd = crypto.randomBytes(6).toString('hex');
    const email = `biztest+${Date.now()}-${rnd}@example.com`;
    const password = 'TestPass123!';
    const metadata = { full_name: 'BizOwner', phone: '+201112223334', id_last6: '123456', store_name: 'Test Store Inc', is_business: true, business_type: 'retail' };

    console.log('Registering auth business user:', email);
    const regResp = await fetch(base + '/api/register-user', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({email,password,metadata}) });
    const regText = await regResp.text();
    let regJson = null; try{ regJson = regText ? JSON.parse(regText) : null }catch(e){}
    console.log('register status', regResp.status, regJson || regText);
    if (!regResp.ok) process.exit(2);

    const userId = regJson && regJson.id;
    if (!userId) { console.error('no id returned'); process.exit(3); }

    console.log('Calling /api/create-app-user with id:', userId);
    const wh = await fetch(base + '/api/create-app-user', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id: userId, email, metadata }) });
    const whText = await wh.text(); let whJson = null; try{ whJson = whText ? JSON.parse(whText) : null }catch(e){}
    console.log('/api/create-app-user status', wh.status, whJson || whText);

    // Fetch via Supabase REST
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env or .env');
      process.exit(4);
    }

    const userUrl = `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1/users?id=eq.${userId}&select=*`;
    const userRes = await fetch(userUrl, { method: 'GET', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
    const userText = await userRes.text(); let userJson=null; try{ userJson = userText ? JSON.parse(userText) : null }catch(e){}
    console.log('fetch user status', userRes.status, userJson || userText);

    const businessUrl = `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1/businesses?user_id=eq.${userId}&select=*`;
    const bizRes = await fetch(businessUrl, { method: 'GET', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
    const bizText = await bizRes.text(); let bizJson=null; try{ bizJson = bizText ? JSON.parse(bizText) : null }catch(e){}
    console.log('fetch business status', bizRes.status, bizJson || bizText);

    process.exit(0);
  }catch(err){ console.error('ERROR', err); process.exit(1);} 
})();
