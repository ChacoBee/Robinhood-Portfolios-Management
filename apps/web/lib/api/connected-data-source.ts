import type { ApiEnvelope } from '@aurum/domain';
import type { PortfolioDataSource } from './data-source-types';

type Fetcher = typeof fetch;
type ConnectedOptions = {
  baseUrl: string;
  fetcher?: Fetcher;
  requestHeaders?: () => Promise<Readonly<Record<string, string>>>;
  onUnauthorized?: () => never;
};

export class ConnectedDataSourceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ConnectedDataSourceError';
    this.status = status;
    this.code = code;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) throw new ConnectedDataSourceError('Connected mode requires an API base URL.', 0, 'api_url_required');
  return trimmed;
}

async function errorCode(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { code?: unknown } };
    return typeof payload.error?.code === 'string' ? payload.error.code : 'request_failed';
  } catch {
    return 'request_failed';
  }
}

export function createConnectedPortfolioDataSource({
  baseUrl,
  fetcher = fetch,
  requestHeaders,
  onUnauthorized,
}: ConnectedOptions): PortfolioDataSource {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      const forwardedCredentials = (await requestHeaders?.()) ?? {};
      response = await fetcher(`${normalizedBaseUrl}${path}`, {
        ...init,
        cache: 'no-store',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...init.headers,
          ...forwardedCredentials,
        },
      });
    } catch {
      throw new ConnectedDataSourceError('The connected portfolio service could not be reached.', 0, 'network_unavailable');
    }
    if (response.status === 401) {
      if (onUnauthorized) onUnauthorized();
      throw new ConnectedDataSourceError('Authentication is required.', 401, 'authentication_required');
    }
    if (!response.ok) {
      throw new ConnectedDataSourceError('The connected portfolio service returned an error.', response.status, await errorCode(response));
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ConnectedDataSourceError('The connected portfolio response was invalid.', response.status, 'invalid_response');
    }
    if (
      typeof payload !== 'object' || payload === null ||
      !('data' in payload) || typeof payload.data !== 'object' || payload.data === null ||
      !('requestId' in payload) || typeof payload.requestId !== 'string' ||
      !('generatedAt' in payload) || typeof payload.generatedAt !== 'string'
    ) {
      throw new ConnectedDataSourceError('The connected portfolio response was invalid.', response.status, 'invalid_response');
    }
    return (payload as ApiEnvelope<T>).data;
  }

  async function optionalRequest<T>(path: string): Promise<T | null> {
    try {
      return await request<T>(path);
    } catch (error) {
      if (error instanceof ConnectedDataSourceError && error.status === 404) return null;
      throw error;
    }
  }

  return {
    mode: 'connected',
    dashboard: () => request('/v1/dashboard'),
    accounts: () => request('/v1/accounts'),
    account: (accountId) => optionalRequest(`/v1/accounts/${encodeURIComponent(accountId)}`),
    holdings: () => request('/v1/holdings'),
    holding: (instrumentId) => optionalRequest(`/v1/holdings/${encodeURIComponent(instrumentId)}`),
    performance: (range) => request(`/v1/performance?range=${encodeURIComponent(range)}`),
    analytics: () => request('/v1/analytics'),
    activity: () => request('/v1/activity'),
    reconciliation: () => request('/v1/activity/reconciliation'),
    alerts: () => request('/v1/alerts'),
    refresh: () => request('/v1/refresh', { method: 'POST' }),
  };
}
