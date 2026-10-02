import { authHeaders } from './auth.js';
import { getJson, patchJson, postJson, putJson } from './http.js';

type JsonMethod = 'GET' | 'POST' | 'PUT' | 'PATCH';

export const authenticatedJson = async (
  baseUrl: string,
  token: string,
  method: JsonMethod,
  path: string,
  body?: unknown,
) => {
  const init = { headers: authHeaders(token) };
  const result = method === 'GET'
    ? await getJson(baseUrl, path, init)
    : method === 'POST'
      ? await postJson(baseUrl, path, body ?? {}, init)
      : method === 'PUT'
        ? await putJson(baseUrl, path, body ?? {}, init)
        : await patchJson(baseUrl, path, body ?? {}, init);
  return {
    route: path,
    method,
    status: result.response.status,
    requestId: result.response.headers.get('x-request-id'),
    errorCode: result.body?.error ?? result.body?.code ?? null,
    body: result.body,
    response: result.response,
  };
};
