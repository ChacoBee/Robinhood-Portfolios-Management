import { describe, expect, it, vi } from 'vitest';
import { forwardAurumRequest } from '../../lib/api/bff';

describe('connected BFF allowlist', () => {
  it('allows the internal Compose API origin only outside production', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: {} }));
    const request = new Request('http://localhost:3000/api/aurum/v1/settings');

    const development = await forwardAurumRequest(
      request,
      '/v1/settings',
      'http://api:8787',
      fetcher,
      'development',
    );
    const production = await forwardAurumRequest(
      request,
      '/v1/settings',
      'http://api:8787',
      fetcher,
      'production',
    );

    expect(development.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith(
      'http://api:8787/v1/settings',
      expect.objectContaining({ redirect: 'error' }),
    );
    expect(production.status).toBe(503);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['trailing slash', 'http://api:8787/', 'development'],
    ['path', 'http://api:8787/internal', 'development'],
    ['query', 'http://api:8787?debug=true', 'development'],
    ['alternate port', 'http://api:8788', 'development'],
    ['alternate host', 'http://api.internal:8787', 'development'],
    ['credentials', 'http://user:password@api:8787', 'development'],
    ['other plaintext service', 'http://service.example.test:8787', 'development'],
    ['production loopback', 'http://127.0.0.1:8787', 'production'],
  ])('rejects a %s BFF upstream without network access', async (_label, baseUrl, nodeEnvironment) => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await forwardAurumRequest(
      new Request('https://portfolio.example.test/api/aurum/v1/settings'),
      '/v1/settings',
      baseUrl,
      fetcher,
      nodeEnvironment,
    );

    expect(response.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards only owner credentials and CSRF to an allowed mutation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: { state: 'queued' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const request = new Request('https://portfolio.example.test/api/aurum/v1/refresh', {
      method: 'POST',
      headers: {
        authorization: 'Bearer synthetic-session',
        cookie: '__session=synthetic',
        origin: 'https://portfolio.example.test',
        'x-csrf-token': 'synthetic-csrf-token',
      },
    });

    const response = await forwardAurumRequest(
      request,
      '/v1/refresh',
      'https://api.example.test',
      fetcher,
    );

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/v1/refresh',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
      }),
    );
    const headers = fetcher.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer synthetic-session');
    expect(headers.get('cookie')).toBe('__session=synthetic');
    expect(headers.get('x-csrf-token')).toBe('synthetic-csrf-token');
  });

  it('rejects missing CSRF and every non-allowlisted path before network access', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const noCsrf = await forwardAurumRequest(
      new Request('https://portfolio.example.test/api/aurum/v1/refresh', {
        method: 'POST',
      }),
      '/v1/refresh',
      'https://api.example.test',
      fetcher,
    );
    const forbidden = await forwardAurumRequest(
      new Request('https://portfolio.example.test/api/aurum/v1/orders', {
        method: 'POST',
        headers: { 'x-csrf-token': 'synthetic-csrf-token' },
      }),
      '/v1/orders',
      'https://api.example.test',
      fetcher,
    );

    expect(noCsrf.status).toBe(403);
    expect(forbidden.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('allows only the read-only export and deletion preview routes', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({ data: { state: 'available' } }),
    );
    for (const path of ['/v1/export/preview', '/v1/delete/preview']) {
      const response = await forwardAurumRequest(
        new Request(`https://portfolio.example.test/api/aurum${path}`),
        path,
        'https://api.example.test',
        fetcher,
      );
      expect(response.status).toBe(200);
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('forwards only the Clerk session cookie and replaces upstream 401 bytes', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('upstream-secret-error-body', {
        status: 401,
        headers: { 'content-type': 'text/plain', 'set-cookie': 'unsafe=upstream' },
      }),
    );
    const request = new Request('https://portfolio.example.test/api/aurum/v1/settings', {
      headers: { cookie: 'other=value; __session=owner-session; another=value' },
    });

    const response = await forwardAurumRequest(request, '/v1/settings', 'https://api.example.test', fetcher);

    const headers = fetcher.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('cookie')).toBe('__session=owner-session');
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    await expect(response.text()).resolves.not.toContain('upstream-secret-error-body');
  });
});
