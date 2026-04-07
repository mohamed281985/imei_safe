(async () => {
  try {
    const payload = { record: { id: "dc618f2a-20bb-4bbb-9719-355c6dfd75d1", email: "user+test@example.com", email_confirmed_at: new Date().toISOString(), user_metadata: { full_name: "Test User", phone: "+201234567890", store_name: "Test Store", address: "Cairo", business_type: "shop", id_last6: "654321" } } };
    const res = await fetch("http://localhost:3000/api/supabase-auth-webhook", { method: "POST", headers: { "x-webhook-secret": "5ea21f9100e2f61811d9a4da60a33cb21547ae504fa0bd6ad3a234c24a7ba171", "Content-Type":"application/json" }, body: JSON.stringify(payload) });
    const text = await res.text();
    console.log('\n--- WEBHOOK RESPONSE ---');
    console.log('STATUS', res.status);
    console.log(text);
  } catch (e) {
    console.error('SCRIPT ERROR', e);
  }
})();
