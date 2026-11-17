import Constants from 'expo-constants';

export type ApiClientErrorCode =
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'SERVER_ERROR';

export class ApiClientError extends Error {
  code: ApiClientErrorCode;
  status?: number;
  serverCode?: string;

  constructor(code: ApiClientErrorCode, message: string, status?: number, serverCode?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.serverCode = serverCode;
  }
}

export type ApiRequestDiagnostic = {
  hostname: string;
  route: string;
  method: string;
  networkType: string;
  authenticated: boolean;
  tokenRefreshAttempted: boolean;
  durationMs: number;
  outcome: ApiClientErrorCode | 'SUCCESS';
};

let diagnosticSink: ((event: ApiRequestDiagnostic) => void) | null = null;
let networkTypeProvider: (() => string | null | undefined) | null = null;
let networkReachabilityProvider: (() => boolean | null | undefined) | null = null;
export const registerApiDiagnosticSink = (sink: ((event: ApiRequestDiagnostic) => void) | null) => {
  diagnosticSink = sink;
};
export const registerNetworkTypeProvider = (provider: (() => string | null | undefined) | null) => {
  networkTypeProvider = provider;
};
export const registerNetworkReachabilityProvider = (provider: (() => boolean | null | undefined) | null) => {
  networkReachabilityProvider = provider;
};

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
export type UnauthorizedContext = { status: 401; serverCode?: string };
let unauthorizedHandler: ((context: UnauthorizedContext) => void) | null = null;

export const registerAccessTokenProvider = (provider: () => string | null | undefined) => {
  accessTokenProvider = provider;
};

export const hasAuthenticatedApiSession = () => Boolean(accessTokenProvider?.());

export const registerUnauthorizedHandler = (handler: ((context: UnauthorizedContext) => void) | null) => {
  unauthorizedHandler = handler;
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
  if (status === 409) return 'CONFLICT';
  if (status === 422 || status === 400) return 'VALIDATION_ERROR';
  return 'SERVER_ERROR';
};

export const API_REQUEST_TIMEOUT_MS = 15_000;
export const API_MAX_RETRY_ATTEMPTS = 2;
export const API_RETRY_BASE_DELAY_MS = 350;

export type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
  retryPolicy?: 'none' | 'safe' | 'idempotent';
  idempotencyKey?: string;
  maxRetryAttempts?: number;
};

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const retryableStatuses = new Set([408, 425, 429, 502, 503, 504]);
const boundedRetryCount = (value: number | undefined) =>
  Math.max(0, Math.min(API_MAX_RETRY_ATTEMPTS, value ?? API_MAX_RETRY_ATTEMPTS));
const retryDelayMs = (attempt: number, retryAfter: string | null) => {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(5_000, Math.max(0, seconds * 1_000));
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.min(5_000, Math.max(0, at - Date.now()));
  }
  return Math.min(2_000, API_RETRY_BASE_DELAY_MS * 2 ** attempt);
};
const waitForRetry = (delayMs: number, signal?: AbortSignal | null) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
    reject(new ApiClientError('NETWORK_ERROR', 'The request was cancelled.', undefined, 'REQUEST_CANCELLED'));
    return;
  }
  const timeout = setTimeout(() => {
    signal?.removeEventListener('abort', abort);
    resolve();
  }, delayMs);
  const abort = () => {
    clearTimeout(timeout);
    reject(new ApiClientError('NETWORK_ERROR', 'The request was cancelled.', undefined, 'REQUEST_CANCELLED'));
  };
  signal?.addEventListener('abort', abort, { once: true });
});

export const apiResponse = async (path: string, init: ApiRequestInit = {}): Promise<Response> => {
  const startedAt = Date.now();
  const method = init.method ?? 'GET';
  const hostname = new URL(apiBaseUrl).hostname;
  const authenticated = Boolean(accessTokenProvider?.());
  const emit = (outcome: ApiRequestDiagnostic['outcome']) => {
    const event = { hostname, route: path.split('?')[0], method,
      networkType: networkTypeProvider?.() ?? 'UNKNOWN', authenticated, tokenRefreshAttempted: false,
      durationMs: Date.now() - startedAt, outcome };
    diagnosticSink?.(event);
    if (__DEV__) console.info('[ApiRequest]', event);
  };
  const callerSignal = init.signal;
  const timeoutMs = init.timeoutMs ?? API_REQUEST_TIMEOUT_MS;
  const normalizedMethod = method.toUpperCase();
  const isMultipart = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const retryPolicy = init.retryPolicy ?? (safeMethods.has(normalizedMethod) ? 'safe' : 'none');
  const canRetry = !isMultipart && (retryPolicy === 'safe' && safeMethods.has(normalizedMethod) || retryPolicy === 'idempotent' && Boolean(init.idempotencyKey));
  const maxRetries = canRetry ? boundedRetryCount(init.maxRetryAttempts) : 0;
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      const {
        timeoutMs: _timeoutMs,
        retryPolicy: _retryPolicy,
        idempotencyKey: _idempotencyKey,
        maxRetryAttempts: _maxRetryAttempts,
        ...requestInit
      } = init;
      response = await fetch(`${apiBaseUrl}${path}`, {
        ...requestInit,
        signal: controller.signal,
        headers: isMultipart
          ? { ...buildAuthorizationHeaders(), ...init.headers }
          : buildHeaders({ ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}), ...init.headers })
      });
    } catch (error) {
      clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', abortFromCaller);
      if (callerSignal?.aborted) {
        emit('NETWORK_ERROR');
        throw new ApiClientError('NETWORK_ERROR', 'The request was cancelled.', undefined, 'REQUEST_CANCELLED');
      }
      const timedOut = controller.signal.aborted;
      if (attempt < maxRetries && networkReachabilityProvider?.() !== false) {
        await waitForRetry(retryDelayMs(attempt, null), callerSignal);
        attempt += 1;
        continue;
      }
      if (timedOut) {
        emit('TIMEOUT');
        throw new ApiClientError('TIMEOUT', 'The platform request timed out. Please try again.');
      }
      emit('NETWORK_ERROR');
      const isDefinitelyOffline = networkReachabilityProvider?.() === false;
      throw new ApiClientError(
        'NETWORK_ERROR',
        isDefinitelyOffline ? 'This device is offline.' : 'Unable to reach the platform backend.',
        undefined,
        isDefinitelyOffline ? 'DEVICE_OFFLINE' : 'SERVICE_UNREACHABLE'
      );
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }

    if (retryableStatuses.has(response.status) && attempt < maxRetries) {
      await waitForRetry(retryDelayMs(attempt, response.headers.get('Retry-After')), callerSignal);
      attempt += 1;
      continue;
    }
    if (!response.ok) {
    let payload: { error?: string; message?: string } | null = null;
    try {
      payload = (await response.json()) as { error?: string; message?: string };
    } catch {
      payload = null;
    }
    if (response.status === 401 && accessTokenProvider?.()) {
      unauthorizedHandler?.({ status: 401, serverCode: payload?.error });
    }
    const code = toErrorCode(response.status);
    emit(code);
      throw new ApiClientError(code, payload?.message ?? 'Platform request failed.', response.status, payload?.error);
    }

    emit('SUCCESS');
    return response;
  }
};

export const apiFetch = async <T>(path: string, init: ApiRequestInit = {}): Promise<T> =>
  (await apiResponse(path, init)).json() as Promise<T>;

export const postJson = async <T>(path: string, body: unknown, headers?: HeadersInit) =>
  apiFetch<T>(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

export const putJson = async <T>(path: string, body: unknown, headers?: HeadersInit) =>
  apiFetch<T>(path, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });
