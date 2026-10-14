const BASE_URL = process.env.API_BASE_URL || 'https://imei-safe.me';
const VALID_BEARER_TOKEN = process.env.VALID_BEARER_TOKEN || '';

const endpoints = [
  { method: 'POST', path: '/api/update-finder-phone-by-imei', body: { imei: '123456789012345', finderPhone: '01000000000' } },
  { method: 'POST', path: '/api/transfer-ownership', body: { imei: '123456789012345', sellerPassword: 'x', newOwner: { owner_name: 't' } } },
  { method: 'GET', path: '/api/get-contact-info?phoneId=123456789012345' },
  { method: 'POST', path: '/api/get-owner-email-by-imei', body: { imei: '123456789012345' } },
  { method: 'POST', path: '/api/send-fcm-v1', body: { token: 'x', title: 't', body: 'b' } },
  { method: 'POST', path: '/api/send-notification-by-imei', body: { imei: '123456789012345', title: 't', body: 'b' } },
  { method: 'POST', path: '/api/send-notification', body: { receiverToken: 'x', title: 't', body: 'b' } },
  { method: 'POST', path: '/api/report-lost-phone', body: { imei: '123456789012345' } },
];

async function runCase(caseName, authHeader, expectedMode = 'enforce_reject') {
  console.log(`\n=== ${caseName} ===`);
  let passCount = 0;

  for (const ep of endpoints) {
    const url = `${BASE_URL}${ep.path}`;
    const headers = { 'Content-Type': 'application/json', ...(authHeader ? { Authorization: authHeader } : {}) };
    const options = { method: ep.method, headers };
    if (ep.body) options.body = JSON.stringify(ep.body);

    try {
      const res = await fetch(url, options);
      const text = await res.text();
      const ok = expectedMode === 'enforce_reject'
        ? (res.status === 401 || res.status === 403)
        : (res.status !== 401 && res.status !== 403);
      if (ok) passCount += 1;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${ep.method} ${ep.path} -> ${res.status} | ${text.slice(0, 120).replace(/\n/g, ' ')}`);
    } catch (err) {
      console.log(`FAIL ${ep.method} ${ep.path} -> ERROR | ${err.message}`);
    }
  }

  const label = expectedMode === 'enforce_reject' ? 'enforced auth reject' : 'passed auth gate';
  console.log(`\n${caseName} result: ${passCount}/${endpoints.length} ${label}`);
  return passCount;
}

async function main() {
  console.log(`Testing auth enforcement against: ${BASE_URL}`);

  // Security check: endpoints should reject missing/invalid tokens with 401/403
  const noAuth = await runCase('NO_AUTH', null, 'enforce_reject');
  const badToken = await runCase('BAD_TOKEN', 'Bearer invalid.token.value', 'enforce_reject');
  const rejectTotal = endpoints.length * 2;
  const rejectPassed = noAuth + badToken;

  // Functional sanity: when valid token is present, request should pass auth layer
  // (it may still return 400/404/500 بسبب البيانات التجريبية).
  let validTokenPassed = null;
  if (VALID_BEARER_TOKEN) {
    validTokenPassed = await runCase('VALID_TOKEN', `Bearer ${VALID_BEARER_TOKEN}`, 'pass_auth');
  } else {
    console.log('\n=== VALID_TOKEN ===');
    console.log('SKIPPED: set VALID_BEARER_TOKEN to run auth-passed functional sanity.');
  }

  console.log(`\nSUMMARY`);
  console.log(`- Auth enforcement (NO_AUTH + BAD_TOKEN): ${rejectPassed}/${rejectTotal}`);
  if (validTokenPassed !== null) {
    console.log(`- Functional sanity with valid token: ${validTokenPassed}/${endpoints.length}`);
  } else {
    console.log(`- Functional sanity with valid token: SKIPPED`);
  }

  const rejectOk = rejectPassed === rejectTotal;
  const validOk = validTokenPassed === null || validTokenPassed === endpoints.length;
  process.exit(rejectOk && validOk ? 0 : 1);
}

main();
