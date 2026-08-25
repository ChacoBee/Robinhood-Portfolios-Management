import { describe, expect, it, vi } from 'vitest';
import { csrfMutation } from '../../lib/api/csrf-mutation';

describe('csrfMutation', () => {
  it('gets a session-bound token and sends it on the cookie-authenticated write', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { token: 'synthetic-csrf-token' },
            requestId: 'csrf-request',
            generatedAt: '2026-08-25T15:00:00.000Z',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await csrfMutation(
      'https://api.example.test/',
      '/v1/refresh',
      { method: 'POST' },
      fetcher,
    );

    expect(fetcher.mock.calls[0]).toEqual([
      'https://api.example.test/v1/auth/csrf',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    ]);
    expect(fetcher.mock.calls[1]).toEqual([
      'https://api.example.test/v1/refresh',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
        headers: expect.objectContaining({
          'x-csrf-token': 'synthetic-csrf-token',
        }),
      }),
    ]);
  });

  it('fails closed without issuing the write when the token response is invalid', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(
      csrfMutation('https://api.example.test', '/v1/refresh', { method: 'POST' }, fetcher),
    ).rejects.toThrow('csrf_unavailable');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
