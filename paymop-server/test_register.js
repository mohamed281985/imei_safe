// Simple test script to POST a test business registration to /api/test-insert
(async () => {
  try {
    const body = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'biz-test@example.com',
      metadata: {
        full_name: 'أحمد التجاري',
        store_name: 'متجر أحمد',
        phone: '+201234567890',
        address: 'القاهرة',
        business_type: 'متجر الكتروني',
        id_last6: '123456'
      }
    };

    const res = await fetch('http://localhost:3000/api/test-insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const text = await res.text();
    console.log('STATUS', res.status);
    console.log(text);
  } catch (err) {
    console.error('Request failed:', err);
    process.exit(1);
  }
})();
