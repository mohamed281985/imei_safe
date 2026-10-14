// Lightweight encrypted sessionStorage helper using Web Crypto (AES-GCM)
const KEY_NAME = '__secure_session_key_v1';

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const fromBase64 = (b64: string) => {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

async function ensureKey() {
  const existing = sessionStorage.getItem(KEY_NAME);
  if (existing) {
    const raw = fromBase64(existing);
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  sessionStorage.setItem(KEY_NAME, toBase64(raw));
  return key;
}

export async function encryptString(plain: string) {
  const key = await ensureKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plain);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
  return toBase64(iv.buffer) + ':' + toBase64(cipher);
}

export async function decryptString(payload: string) {
  try {
    const [ivB64, cipherB64] = payload.split(':');
    if (!ivB64 || !cipherB64) return null;
    const key = await ensureKey();
    const iv = new Uint8Array(fromBase64(ivB64));
    const cipher = fromBase64(cipherB64);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new TextDecoder().decode(plainBuf);
  } catch (e) {
    console.warn('Failed to decrypt secure storage value', e);
    return null;
  }
}

export async function setSecureItem(key: string, value: string, ttlSeconds: number | null = 3600) {
  try {
    const encrypted = await encryptString(value);
    const now = Date.now();
    const payload = {
      v: encrypted,
      iat: now,
      exp: ttlSeconds ? now + ttlSeconds * 1000 : null,
      fallback: false
    };
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch (e) {
    console.error('Failed to set secure item', e);
    // fallback: store in sessionStorage plaintext with expiry metadata if crypto unavailable
    try {
      const now = Date.now();
      const payload = {
        v: value,
        iat: now,
        exp: ttlSeconds ? now + ttlSeconds * 1000 : null,
        fallback: true
      };
      sessionStorage.setItem(key, JSON.stringify(payload));
    } catch (_) {}
  }
}

export async function getSecureItem(key: string) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;

    // support legacy entries where value is just the encrypted blob
    if (!raw.startsWith('{')) {
      const decryptedLegacy = await decryptString(raw).catch(() => null);
      return decryptedLegacy !== null ? decryptedLegacy : raw;
    }

    const parsed = JSON.parse(raw);
    const now = Date.now();
    if (parsed.exp && typeof parsed.exp === 'number' && parsed.exp <= now) {
      try { sessionStorage.removeItem(key); } catch (e) { /* ignore */ }
      return null;
    }

    if (parsed.fallback) {
      return parsed.v || null;
    }

    const decrypted = await decryptString(parsed.v).catch(() => null);
    return decrypted !== null ? decrypted : null;
  } catch (e) {
    console.error('Failed to get secure item', e);
    return null;
  }
}

export function removeSecureItem(key: string) {
  try { sessionStorage.removeItem(key); } catch (e) { console.warn('removeSecureItem failed', e); }
}

export function clearExpiredSecureItems() {
  try {
    const now = Date.now();
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k) continue;
      try {
        const raw = sessionStorage.getItem(k);
        if (!raw || !raw.startsWith('{')) continue;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.exp && parsed.exp <= now) sessionStorage.removeItem(k);
      } catch (_) { continue; }
    }
  } catch (e) {
    console.warn('clearExpiredSecureItems failed', e);
  }
}

export default {
  setSecureItem,
  getSecureItem,
  removeSecureItem
};
