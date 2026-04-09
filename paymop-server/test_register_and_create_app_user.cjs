(async ()=>{
  try{
    const base = 'http://127.0.0.1:3000';
    const crypto = require('crypto');
    const rnd = crypto.randomBytes(6).toString('hex');
    const email = `inttest+${Date.now()}-${rnd}@example.com`;
    const password = 'TestPass123!';
    const metadata = { full_name: 'IntegrationTester', phone: '+201234567890', id_last6: '654321' };

    console.log('Registering auth user:', email);
    const reg = await fetch(base + '/api/register-user', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({email,password,metadata}) });
    const regText = await reg.text();
    let regJson = null; try{ regJson = regText ? JSON.parse(regText) : null }catch(e){}
    console.log('register status', reg.status, regJson || regText);
    if(!reg.ok) process.exit(2);

    const userId = regJson && regJson.id;
    if(!userId){ console.error('no id returned'); process.exit(3); }

    console.log('Calling /api/create-app-user with id:', userId);
    const payload = { id: userId, email, metadata };
    const wh = await fetch(base + '/api/create-app-user', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const whText = await wh.text(); let whJson=null; try{ whJson = whText ? JSON.parse(whText) : null }catch(e){}
    console.log('/api/create-app-user status', wh.status, whJson || whText);

    console.log('Fetching inserted user via REST');
    const fetchUser = await fetch(`${base}/rest/v1/users?id=eq.${userId}&select=*`, { method: 'GET', headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY}` } });
    const fuText = await fetchUser.text(); let fuJson=null; try{ fuJson = fuText ? JSON.parse(fuText) : null }catch(e){}
    console.log('fetch user status', fetchUser.status, fuJson || fuText);

    process.exit(0);
  }catch(err){ console.error('ERROR', err); process.exit(1);} 
})();
