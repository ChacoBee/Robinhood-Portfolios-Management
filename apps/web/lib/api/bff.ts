type Fetcher = typeof fetch;

const exactRoutes = new Set([
  'GET /v1/auth/session',
  'GET /v1/auth/csrf',
  'POST /v1/refresh',
  'POST /v1/imports/preview',
  'POST /v1/imports/confirm',
  'POST /v1/alert-rules',
  'GET /v1/settings',
  'GET /v1/export/preview',
  'GET /v1/delete/preview',
  'POST /v1/auth/recovery-codes/regenerate',
  'POST /v1/export',
  'POST /v1/delete',
]);
const alertAction = /^\/v1\/alerts\/[A-Za-z0-9_-]{1,128}\/(read|mute)$/;
const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function routeAllowed(method: string, path: string): boolean {
  if (exactRoutes.has(`${method} ${path}`)) return true;
  if (!alertAction.test(path)) return false;
  if (path.endsWith('/read')) return method === 'POST';
  return method === 'POST' || method === 'DELETE';
}

function safeApiBase(value: string): string | null {
  try {
    const url = new URL(value);
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
      return null;
    }
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function errorResponse(status: number, code: string): Response {
  return Response.json(
    { error: { code, message: 'The connected request could not be forwarded.' } },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

export async function forwardAurumRequest(
  request: Request,
  path: string,
  apiBaseUrl: string,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  const method = request.method.toUpperCase();
  if (!routeAllowed(method, path)) return errorResponse(404, 'not_found');
  if (writeMethods.has(method) && !request.headers.get('x-csrf-token')) {
    return errorResponse(403, 'csrf_required');
  }
  const api = safeApiBase(apiBaseUrl);
  if (!api) return errorResponse(503, 'api_unavailable');

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > 15 * 1024 * 1024) {
    return errorResponse(413, 'request_too_large');
  }
  const headers = new Headers({ accept: 'application/json' });
  for (const name of [
    'authorization',
    'cookie',
    'content-type',
    'origin',
    'x-csrf-token',
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const body = writeMethods.has(method) ? await request.arrayBuffer() : undefined;
  if (body && body.byteLength > 15 * 1024 * 1024) {
    return errorResponse(413, 'request_too_large');
  }

  let upstream: Response;
  try {
    upstream = await fetcher(`${api}${path}`, {
      method,
      headers,
      ...(body ? { body } : {}),
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    return errorResponse(502, 'upstream_unavailable');
  }
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: {
      'cache-control': 'no-store',
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}
