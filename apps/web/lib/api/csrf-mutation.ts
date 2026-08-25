type Fetcher = typeof fetch;

function base(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');
  if (!normalized) throw new Error('api_url_required');
  return normalized;
}

export async function csrfMutation(
  apiBaseUrl: string,
  path: string,
  init: RequestInit,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  const api = base(apiBaseUrl);
  const tokenResponse = await fetcher(`${api}/v1/auth/csrf`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  if (!tokenResponse.ok) throw new Error('csrf_unavailable');

  let token: unknown;
  try {
    const envelope = (await tokenResponse.json()) as { data?: { token?: unknown } };
    token = envelope.data?.token;
  } catch {
    throw new Error('csrf_unavailable');
  }
  if (typeof token !== 'string' || token.length < 16) {
    throw new Error('csrf_unavailable');
  }

  return fetcher(`${api}${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...init.headers,
      'x-csrf-token': token,
    },
  });
}
