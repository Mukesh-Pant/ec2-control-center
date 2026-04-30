import { getConfig } from '@/lib/config';
import * as Auth from '@/lib/auth';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function doFetch<T>(url: string, init: RequestInit): Promise<T> {
  const token = Auth.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(url, { ...init, headers });
  if (res.ok) return res.json() as Promise<T>;
  let msg = res.statusText;
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) msg = body.message;
  } catch {
    /* ignore parse error */
  }
  throw new ApiError(res.status, msg);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = getConfig().API_URL ?? '';
  const url = `${baseUrl}${path}`;

  try {
    return await doFetch<T>(url, init);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const refreshed = await Auth.refreshTokens();
      if (!refreshed) {
        Auth.logout();
        window.location.replace('/login');
        throw err;
      }
      // retry once with fresh token
      return doFetch<T>(url, init);
    }
    throw err;
  }
}
