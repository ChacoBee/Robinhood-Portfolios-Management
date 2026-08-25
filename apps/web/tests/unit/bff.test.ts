import { describe, expect, it, vi } from 'vitest';
import { forwardAurumRequest } from '../../lib/api/bff';

describe('connected BFF allowlist', () => {
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
});
