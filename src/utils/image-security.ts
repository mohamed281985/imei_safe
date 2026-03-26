export const preloadImage = (src: string): Promise<void> => {
  if (!src) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });
};

export const isValidImageUrl = (url: string): boolean => {
  try {
    const u = new URL(url);

    // Disallow data: and javascript: schemes explicitly (check first to avoid narrowing issues)
    if (u.protocol === 'data:' || u.protocol === 'javascript:') return false;

    // Only allow secure protocols
    if (u.protocol !== 'https:') return false;

    // Disallow embedded credentials
    if (u.username || u.password) return false;

    const host = u.hostname.toLowerCase();

    // Disallow localhost and loopback
    if (host === 'localhost' || host === '127.0.0.1') return false;

    // If host is an IP literal, ensure it's not a private/reserved range
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const parts = host.split('.').map((p) => parseInt(p, 10));
      if (parts[0] === 10) return false; // 10.0.0.0/8
      if (parts[0] === 127) return false; // 127.0.0.0/8
      if (parts[0] === 169 && parts[1] === 254) return false; // 169.254.0.0/16
      if (parts[0] === 192 && parts[1] === 168) return false; // 192.168.0.0/16
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false; // 172.16.0.0/12
    }

    // Basic path check: prefer known image extensions but don't strictly require them
    const path = u.pathname.toLowerCase();
    if (path && /\.(png|jpg|jpeg|webp|gif|svg)$/.test(path)) return true;

    // Allow URLs that look like storage/render endpoints (Supabase storage)
    if (url.includes('/storage/v1/')) return true;

    // As a fallback, allow the URL (we've already checked protocol and host/ip ranges)
    return true;
  } catch {
    return false;
  }
};
