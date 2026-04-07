(async () => {
  try {
    const payload = {
      id: "dc618f2a-20bb-4bbb-9719-355c6dfd75d1",
      email: "user+test@example.com",
      metadata: {
        full_name: "Test User",
        phone: "+201234567890",
        store_name: "Test Store",
        address: "Cairo",
        business_type: "shop",
        id_last6: "654321"
      }
    };

    const res = await fetch('http://localhost:3000/api/create-app-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    console.log('\n--- CREATE-APP-USER RESPONSE ---');
    console.log('STATUS', res.status);
    console.log(text);
  } catch (e) {
    console.error('SCRIPT ERROR', e);
  }
})();
