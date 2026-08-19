import Constants from 'expo-constants';

export type ApiClientErrorCode =
  | 'NETWORK_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'SERVER_ERROR';

export class ApiClientError extends Error {
  code: ApiClientErrorCode;
  status?: number;

  constructor(code: ApiClientErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const getApiBaseUrl = () => {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) {
    try {
      const parsed = new URL(fromEnv);
      const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1';
      if (!isLoopback) return fromEnv;
      console.warn('[ApiClient] Ignoring loopback API URL; use a LAN or HTTPS gateway URL for the iOS simulator.', {
        configuredUrl: fromEnv
      });
    } catch {
      throw new Error('Fiteatsy API base URL is invalid. Configure EXPO_PUBLIC_API_BASE_URL with a reachable HTTP(S) URL.');
    }
  }

  const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;
  if (fromExtra) {
    try {
      const parsed = new URL(fromExtra);
      const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1';
      if (!isLoopback) return fromExtra;
    } catch {
      throw new Error('Configured Fiteatsy API base URL is invalid.');
    }
  }

  throw new Error('Fiteatsy API base URL is not configured with a reachable HTTP(S) gateway.');
};

export const apiBaseUrl = getApiBaseUrl();

let accessTokenProvider: (() => string | null | undefined) | null = null;

export const registerAccessTokenProvider = (provider: () => string | null | undefined) => {
  accessTokenProvider = provider;
};

const buildHeaders = (headers?: HeadersInit) => {
  const token = accessTokenProvider?.();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers
  };
};

export const buildAuthorizationHeaders = (): Record<string, string> => {
  const token = accessTokenProvider?.();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const toErrorCode = (status: number): ApiClientErrorCode => {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 422 || status === 400) return 'VALIDATION_ERROR';
  return 'SERVER_ERROR';
};

export const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: buildHeaders(init.headers)
    });
  } catch {
    throw new ApiClientError('NETWORK_ERROR', 'Unable to reach the platform backend.');
  }

  if (!response.ok) {
    let payload: { message?: string } | null = null;
    try {
      payload = (await response.json()) as { message?: string };
    } catch {
      payload = null;
    }
    throw new ApiClientError(toErrorCode(response.status), payload?.message ?? 'Platform request failed.', response.status);
  }

  return (await response.json()) as T;
};

export const postJson = async <T>(path: string, body: unknown, headers?: HeadersInit) =>
  apiFetch<T>(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
