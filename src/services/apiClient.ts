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
  const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;
  if (fromExtra) return fromExtra;

  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  if (!host) return 'http://localhost:4001';
  return `http://${host}:4001`;
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
