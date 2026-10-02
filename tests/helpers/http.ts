const TEST_REQUEST_TIMEOUT_MS = 15_000;

export const getJson = async (baseUrl: string, path: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`test request timed out after ${TEST_REQUEST_TIMEOUT_MS}ms`)), TEST_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...init, signal: init?.signal ?? controller.signal });
    const text = await response.text();
    return {
      response,
      body: text ? JSON.parse(text) : null,
      text,
    };
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new Error(`Authenticated test request failed: ${method} ${path}; ${detail}`, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
};

export const postJson = async (baseUrl: string, path: string, body: unknown, init?: RequestInit) =>
  getJson(baseUrl, path, {
    ...init,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
  });

export const patchJson = async (baseUrl: string, path: string, body: unknown, init?: RequestInit) =>
  getJson(baseUrl, path, {
    ...init,
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
  });

export const putJson = async (baseUrl: string, path: string, body: unknown, init?: RequestInit) =>
  getJson(baseUrl, path, {
    ...init,
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
  });

export const deleteRequest = async (baseUrl: string, path: string, init?: RequestInit) =>
  getJson(baseUrl, path, {
    method: 'DELETE',
    ...init,
  });
