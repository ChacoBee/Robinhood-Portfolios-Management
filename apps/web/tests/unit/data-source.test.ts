import { describe, expect, it, vi } from 'vitest';
import {
  createConnectedPortfolioDataSource,
  createDemoPortfolioDataSource,
} from '../../lib/api/data-source';
import { demoDashboard } from '../../lib/demo/dashboard-fixture';

describe('portfolio data sources', () => {
  it('serves deterministic fixtures in demo mode without opening the network', async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetcher);
    const source = createDemoPortfolioDataSource();

    await expect(source.dashboard()).resolves.toEqual(demoDashboard);
    await expect(source.refresh()).resolves.toMatchObject({ mode: 'demo', state: 'disabled' });
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('uses the connected API and unwraps its typed envelope', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: demoDashboard,
          requestId: 'request-1',
          generatedAt: '2026-08-25T14:14:01.000Z',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const source = createConnectedPortfolioDataSource({
      baseUrl: 'https://portfolio-api.example.test',
      fetcher,
    });

    await expect(source.dashboard()).resolves.toEqual(demoDashboard);
    expect(fetcher).toHaveBeenCalledWith(
      'https://portfolio-api.example.test/v1/dashboard',
      expect.objectContaining({ headers: expect.objectContaining({ accept: 'application/json' }) }),
    );
  });

  it('forwards explicitly supplied server request credentials to the private API', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: demoDashboard,
          requestId: 'request-auth',
          generatedAt: '2026-08-25T14:14:01.000Z',
        }),
        { status: 200 },
      ),
    );
    const source = createConnectedPortfolioDataSource({
      baseUrl: 'https://portfolio-api.example.test',
      fetcher,
      requestHeaders: async () => ({
        authorization: 'Bearer synthetic-session-token',
        cookie: '__session=synthetic-session',
      }),
    });

    await source.dashboard();

    expect(fetcher).toHaveBeenCalledWith(
      'https://portfolio-api.example.test/v1/dashboard',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer synthetic-session-token',
          cookie: '__session=synthetic-session',
        }),
      }),
    );
  });

  it('fails closed when connected data is unavailable instead of returning demo data', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'provider_unavailable' } }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const source = createConnectedPortfolioDataSource({
      baseUrl: 'https://portfolio-api.example.test/',
      fetcher,
    });

    await expect(source.dashboard()).rejects.toMatchObject({
      name: 'ConnectedDataSourceError',
      status: 503,
      code: 'provider_unavailable',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('fails safely when the connected API returns a malformed success envelope', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('null', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const source = createConnectedPortfolioDataSource({
      baseUrl: 'https://portfolio-api.example.test',
      fetcher,
    });

    await expect(source.dashboard()).rejects.toMatchObject({
      name: 'ConnectedDataSourceError',
      code: 'invalid_response',
    });
  });

  it('handles an upstream 401 before parsing its response body', async () => {
    const bodyWasRead = vi.fn();
    const unauthorized = {
      ok: false,
      status: 401,
      json: async () => {
        bodyWasRead();
        return { error: { code: 'upstream_payload_must_not_escape' } };
      },
    } as unknown as Response;
    const onUnauthorized = vi.fn(() => {
      throw new Error('authentication_required');
    });
    const source = createConnectedPortfolioDataSource({
      baseUrl: 'https://portfolio-api.example.test',
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(unauthorized),
      onUnauthorized,
    });

    await expect(source.dashboard()).rejects.toThrow('authentication_required');
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(bodyWasRead).not.toHaveBeenCalled();
  });

  it('encodes dynamic identifiers and forwards the selected performance range', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(
        JSON.stringify({ data: {}, requestId: 'request-2', generatedAt: '2026-08-25T14:14:01.000Z' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const source = createConnectedPortfolioDataSource({
      baseUrl: 'https://portfolio-api.example.test',
      fetcher,
    });

    await source.account('account/with spaces');
    await source.performance('YTD');

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://portfolio-api.example.test/v1/accounts/account%2Fwith%20spaces',
    );
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      'https://portfolio-api.example.test/v1/performance?range=YTD',
    );
  });
});
