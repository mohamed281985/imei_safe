(async () => {
  try {
    const base = 'http://localhost:3000';

    // 1. fetch CSRF token and cookie
    const r1 = await fetch(`${base}/api/csrf-token`, { method: 'GET' });
    const body1 = await r1.text();
    console.log('/api/csrf-token response body:', body1);
    let setCookie = r1.headers.get('set-cookie') || '';
    // remove any accidental whitespace/newlines inside long cookie value
    setCookie = setCookie.replace(/\s+/g, '');
    console.log('set-cookie header:', setCookie);

    // parse x-csrf-token cookie value (signed) and the raw token from JSON body
    const match = setCookie.match(/x-csrf-token=([^;]+)/i);
    const signedCookieValue = match ? decodeURIComponent(match[1]) : null;
    const parsedBody = (() => { try { return JSON.parse(body1); } catch (e) { return {}; } })();
    const rawToken = parsedBody && parsedBody.csrfToken ? parsedBody.csrfToken : null;
    console.log('parsed signedCookieValue:', signedCookieValue ? signedCookieValue.slice(0,60) + '...' : null);
    console.log('parsed rawToken:', rawToken ? rawToken.slice(0,60) + '...' : null);

    // 2. Create a phone report (so update-finder-phone-by-imei will find it)
    // generate a new random 15-digit IMEI to avoid conflicts with existing reports
    const randomImei = (() => {
      const now = Date.now().toString();
      // take last 12 digits of timestamp and pad to 15 with random digits
      const tail = now.slice(-12);
      const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return (tail + rand).slice(0, 15);
    })();
    console.log('Using test IMEI:', randomImei);
    const createPayload = { imei: randomImei, ownerName: 'Test Owner', email: 'owner@example.test' };
    const headers = { 'Content-Type': 'application/json' };
    if (rawToken) headers['X-CSRF-Token'] = rawToken;
    if (signedCookieValue) headers['Cookie'] = `x-csrf-token=${encodeURIComponent(signedCookieValue)}`;
    headers['Authorization'] = 'Bearer devtesttoken';

    console.log('Creating phone report...');
    const rCreate = await fetch(`${base}/api/create-phone`, { method: 'POST', headers, body: JSON.stringify(createPayload) });
    const createText = await rCreate.text();
    console.log('/api/create-phone status:', rCreate.status);
    console.log('/api/create-phone response:', createText);

    // 3. Call update-finder-phone-by-imei to trigger notify + server-side notification insert
    const payload = { imei: randomImei, ownerName: 'Test Owner', finderPhone: '+201234567890' };
    const r2 = await fetch(`${base}/api/update-finder-phone-by-imei`, { method: 'POST', headers, body: JSON.stringify(payload) });
    const text2 = await r2.text();
    console.log('/api/update-finder-phone-by-imei status:', r2.status);
    console.log('/api/update-finder-phone-by-imei response:', text2);
  } catch (e) {
    console.error('Test error:', e);
  }
})();