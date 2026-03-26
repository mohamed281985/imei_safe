// secureFetch: adds timeout and CSRF header, uses AbortController
export function getCSRFToken(): string | null {
  try {
    const meta = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null;
    if (meta && meta.content) return meta.content;
    // fallback: cookie named csrfToken
    const match = document.cookie.match('(^|;)\\s*csrfToken\\s*=\\s*([^;]+)');
    return match ? decodeURIComponent(match[2]) : null;
  } catch (e) {
    return null;
  }
}

export default async function secureFetch(url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const csrf = getCSRFToken();
  const headers = Object.assign({}, options.headers || {});
  if (csrf) headers['X-CSRF-Token'] = csrf;

  try {
    const resp = await fetch(url, Object.assign({}, options, { signal: controller.signal, headers }));
    clearTimeout(timeout);
    return resp;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}
