(async ()=>{
  try{
    const base = 'http://127.0.0.1:3000';
    const crypto = require('crypto');
    const rnd = crypto.randomBytes(4).toString('hex');
    const email = `inttest+${Date.now()}-${rnd}@example.com`;
    const password = 'TestPass123!';
    const metadata = { full_name: 'IntegrationTester', phone: '+201234567890', id_last6: '654321' };

    console.log('Registering auth user:', email);
    const reg = await fetch(base + '/api/register-user', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({email,password,metadata}) });
    const text = await reg.text();
    let json = null; try{ json = text ? JSON.parse(text) : null }catch(e){}
    console.log('register status', reg.status, json || text);
    if(!reg.ok){ process.exit(2); }

    const userId = json && json.id;
    console.log('Created auth id:', userId);
    process.exit(0);
  }catch(err){ console.error('ERROR', err); process.exit(1);} 
})();
