import { describe, expect, it, vi } from 'vitest';
import type {
  VerifiedRobinhoodAuthorizationGrant,
  VerifiedRobinhoodAuthorizationProvider,
} from '../../src/robinhood/authorization';
import { HttpMcpTransport } from '../../src/robinhood/transport';

const endpoint = 'https://mcp.example.test/read';
const endpointOrigin = 'https://mcp.example.test';
const expectedIssuer = 'https://identity.example.test';
const expectedAudience = 'robinhood-readonly-mcp';
const now = () => new Date('2026-08-25T14:00:00.000Z');

function grant(
  overrides: Partial<VerifiedRobinhoodAuthorizationGrant> = {},
): VerifiedRobinhoodAuthorizationGrant {
  return {
    header: 'Bearer synthetic-token',
    actualScopes: ['accounts:read', 'positions:read'],
    issuer: expectedIssuer,
    audience: expectedAudience,
    expiresAt: '2026-08-25T14:05:00.000Z',
    verification: 'signed_claims',
    authorizedEndpointOrigin: endpointOrigin,
    ...overrides,
  };
}

function provider(
  value: VerifiedRobinhoodAuthorizationGrant = grant(),
): VerifiedRobinhoodAuthorizationProvider {
  return { getVerifiedAuthorization: async () => value };
}

function options(
  authorizationProvider: VerifiedRobinhoodAuthorizationProvider,
) {
  return {
    endpoint,
    approvedEndpointOrigins: [endpointOrigin],
    expectedIssuer,
    expectedAudience,
    authorizationProvider,
    now,
  } as const;
}

describe('Robinhood MCP transport boundary', () => {
  it('rejects an invalid actual scope grant before making a network request', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const transport = new HttpMcpTransport({
      ...options(
        provider(
          grant({
            actualScopes: ['accounts:read', 'positions:read', 'orders:write'],
          } as Partial<VerifiedRobinhoodAuthorizationGrant>),
        ),
      ),
      fetchImplementation,
    });

    await expect(
      transport.call('mcp__robinhood__get_accounts', {}),
    ).rejects.toThrow('provider_scope_invalid');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('rejects an expired verified grant before making a network request', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const transport = new HttpMcpTransport({
      ...options(
        provider(grant({ expiresAt: '2026-08-25T13:59:59.000Z' })),
      ),
      fetchImplementation,
    });

    await expect(
      transport.call('mcp__robinhood__get_accounts', {}),
    ).rejects.toThrow('provider_authorization_invalid');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('rejects a grant for a different audience before making a network request', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const transport = new HttpMcpTransport({
      ...options(provider(grant({ audience: 'different-service' }))),
      fetchImplementation,
    });

    await expect(
      transport.call('mcp__robinhood__get_accounts', {}),
    ).rejects.toThrow('provider_authorization_invalid');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('pins the endpoint to an explicitly approved HTTPS origin', () => {
    const fetchImplementation = vi.fn<typeof fetch>();

    expect(
      () =>
        new HttpMcpTransport({
          ...options(provider()),
          endpoint: 'https://attacker.example/read',
          fetchImplementation,
        }),
    ).toThrow('provider_protocol_error');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('redacts authorization-provider failures and performs zero fetches', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const authorizationProvider: VerifiedRobinhoodAuthorizationProvider = {
      getVerifiedAuthorization: async () => {
        throw new Error('bearer secret-token account 123456789');
      },
    };
    const transport = new HttpMcpTransport({
      ...options(authorizationProvider),
      fetchImplementation,
    });

    let error: unknown;
    try {
      await transport.call('mcp__robinhood__get_accounts', {});
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: 'provider_authorization_invalid' });
    expect(String(error)).not.toContain('secret-token');
    expect(String(error)).not.toContain('123456789');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('never includes an upstream secret-bearing error message', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { id: string };
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32000,
            message: 'account 123456789 bearer secret-token',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const transport = new HttpMcpTransport({
      ...options(provider()),
      fetchImplementation,
    });

    let error: unknown;
    try {
      await transport.call('mcp__robinhood__get_accounts', {});
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: 'provider_protocol_error' });
    expect(String(error)).not.toContain('123456789');
    expect(String(error)).not.toContain('secret-token');
  });

  it('rejects non-TLS provider endpoints', () => {
    expect(
      () =>
        new HttpMcpTransport({
          ...options(provider()),
          endpoint: 'http://mcp.example.test/read',
        }),
    ).toThrow('provider_protocol_error');
  });
});
