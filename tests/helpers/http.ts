export const getJson = async (baseUrl: string, path: string, init?: RequestInit) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  return {
    response,
    body: text ? JSON.parse(text) : null,
    text,
  };
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

export const deleteRequest = async (baseUrl: string, path: string, init?: RequestInit) =>
  getJson(baseUrl, path, {
    method: 'DELETE',
    ...init,
  });
