(async () => {
  try {
    const payload = { record: { id: "ee5c54a2-50d8-43de-bc7d-2666870339ca", email: "test@example.com", email_confirmed_at: "2026-04-07T00:00:00", user_metadata: { full_name: "Ali", phone: "+201234567890", store_name: "My Store", address: "Cairo", business_type: "shop", id_last6: "123456" } } };
    const res = await fetch("http://localhost:3000/api/supabase-auth-webhook", { method: "POST", headers: { "x-webhook-secret": "5ea21f9100e2f61811d9a4da60a33cb21547ae504fa0bd6ad3a234c24a7ba171", "Content-Type":"application/json" }, body: JSON.stringify(payload) });
    const text = await res.text();
    console.log('\n--- WEBHOOK RESPONSE ---');
    console.log('STATUS', res.status);
    console.log(text);

    const payload2 = { id: "ee5c54a2-50d8-43de-bc7d-2666870339ca", email: "test@example.com", metadata: { full_name: "Ali", phone: "+201234567890", store_name: "My Store", address: "Cairo", business_type: "shop", id_last6: "123456" } };
    const res2 = await fetch("http://localhost:3000/api/create-app-user", { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(payload2) });
    const text2 = await res2.text();
    console.log('\n--- CREATE-APP-USER RESPONSE ---');
    console.log('STATUS', res2.status);
    console.log(text2);
  } catch (e) {
    console.error('SCRIPT ERROR', e);
  }
})();
