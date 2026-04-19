export const encryptPaymentData = async (data: any) => {
  const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.PROD ? 'https://imei-safe.me' : '') || '';
  const url = `${API_BASE}/api/encrypt`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`Failed to encrypt payment data (status ${response.status})`);
    return response.json();
  } catch (e) {
    console.error('encryptPaymentData network error:', e, 'url:', url);
    throw e;
  }
};
