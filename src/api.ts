import { loadConfig, saveConfig, getApiUrl } from './config.js';

async function refreshToken(apiUrl: string, token: string): Promise<{ jwt: string } | null> {
  const res = await fetch(`${apiUrl}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `refreshToken=${token}`,
    },
  });
  if (!res.ok) return null;

  const setCookie = res.headers.get('set-cookie') || '';
  const jwtMatch = setCookie.match(/jwt=([^;]+)/);
  if (jwtMatch) return { jwt: jwtMatch[1] };

  return null;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const config = loadConfig();
  if (!config?.jwt) {
    throw new Error('Not logged in. Run: deploy login');
  }

  const apiUrl = getApiUrl();

  let res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.jwt}`,
      ...options.headers,
    },
  });

  // Token expired — try refresh
  if (res.status === 401 && config.refreshToken) {
    const refreshed = await refreshToken(apiUrl, config.refreshToken);
    if (refreshed) {
      config.jwt = refreshed.jwt;
      saveConfig(config);
      res = await fetch(`${apiUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.jwt}`,
          ...options.headers,
        },
      });
    }
  }

  if (!res.ok) {
    let message = `API error: ${res.status} ${res.statusText}`;
    let code: string | undefined;
    let details: unknown;
    try {
      const body = await res.json();
      if (body?.message) {
        message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      }
      if (typeof body?.code === 'string') code = body.code;
      if (body?.details !== undefined) details = body.details;
    } catch {}
    const err = new Error(message) as Error & {
      status?: number;
      code?: string;
      details?: unknown;
    };
    err.status = res.status;
    if (code) err.code = code;
    if (details !== undefined) err.details = details;
    throw err;
  }

  const text = await res.text();
  return text ? JSON.parse(text) : {};
}
