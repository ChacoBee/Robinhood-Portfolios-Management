import { describe, expect, it, vi } from 'vitest';
import { allowedRobinhoodTools } from '../../src/robinhood/read-methods';
import * as connectModule from '../../src/robinhood/connect-cli';

const issuer = 'https://agent.robinhood.com/mcp/trading';

interface EnrollmentClient {
  connect(transport: unknown): Promise<void>;
  listTools(): Promise<{ tools: readonly { name: string }[] }>;
  close(): Promise<void>;
}

interface EnrollmentTransport {
  finishAuth(params: URLSearchParams): Promise<void>;
  close(): Promise<void>;
}

function cliUnderTest() {
  return connectModule as unknown as {
    connectRobinhood?: (options: {
      environment: Readonly<Record<string, string | undefined>>;
      createDatabase: (url: string) => { close(): Promise<void> };
      createRepositories: () => { portfolios: unknown; oauthCredentials: unknown };
      bootstrapOwner: (portfolios: unknown, input: { clerkUserId: string; email: string }) => Promise<string>;
      createStore: (credentials: unknown, ownerId: string, key: string) => unknown;
      createProvider: (input: { store: unknown; fetch?: typeof fetch }) => {
        authorizationUrl(): string | undefined;
        consumeState(value: string): boolean;
      };
      createCallbackServer: (input: {
        host: string;
        port: number;
        validate: (params: URLSearchParams) => boolean;
      }) => Promise<{ waitForCallback(): Promise<URLSearchParams>; close(): Promise<void> }>;
      createClientTransport: (input: { provider: unknown; fetch?: typeof fetch }) => {
        client: EnrollmentClient;
        transport: EnrollmentTransport;
      };
      openUrl: (url: string) => Promise<void>;
      logger: { info(message: string): void; error(message: string): void };
      fetch?: typeof fetch;
    }) => Promise<void>;
    startOAuthCallbackServer?: (input: {
      host: string;
      port: number;
      validate: (params: URLSearchParams) => boolean;
      timeoutMs?: number;
    }) => Promise<{ waitForCallback(): Promise<URLSearchParams>; close(): Promise<void> }>;
    validateOAuthCallback?: (
      provider: { consumeState(value: string): boolean },
      params: URLSearchParams,
    ) => boolean;
  };
}

function connectedEnvironment() {
  return {
    APP_MODE: 'connected',
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/aurum',
    OWNER_CLERK_USER_ID: 'user_1234',
    OWNER_EMAIL: 'owner@example.com',
    WEB_ORIGIN: 'https://app.example.com',
    CLERK_PUBLISHABLE_KEY: 'pk_test_abcdefghijk',
    CLERK_ISSUER_URL: 'https://clerk.example.com',
    CLERK_SECRET_KEY: 'sk_test_12345678901234567890',
    CSRF_SECRET: '12345678901234567890123456789012',
    ACCOUNT_REFERENCE_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    ROBINHOOD_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
  };
}

function dependencies(overrides: Partial<Parameters<NonNullable<ReturnType<typeof cliUnderTest>['connectRobinhood']>>[0]> = {}) {
  const firstClient: EnrollmentClient = {
    connect: vi.fn(async () => { throw new Error('authorization_required'); }),
    listTools: vi.fn(async () => ({ tools: [] })),
    close: vi.fn(async () => undefined),
  };
  const secondClient: EnrollmentClient = {
    connect: vi.fn(async () => undefined),
    listTools: vi.fn(async () => ({ tools: allowedRobinhoodTools.map((name) => ({ name })) })),
    close: vi.fn(async () => undefined),
  };
  const firstTransport: EnrollmentTransport = {
    finishAuth: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  const secondTransport: EnrollmentTransport = {
    finishAuth: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  const callback = {
    waitForCallback: vi.fn(async () => new URLSearchParams({ code: 'opaque-code', state: 'state', iss: issuer })),
    close: vi.fn(async () => undefined),
  };
  const provider = {
    authorizationUrl: vi.fn(() => 'https://robinhood.com/oauth?state=state'),
    consumeState: vi.fn((value: string) => value === 'state'),
  };
  const providerFetch = vi.fn<typeof fetch>();
  const database = { close: vi.fn(async () => undefined) };
  let durableConnectionState: 'connected' | 'disconnected' = 'connected';
  const connectedStore = {
    markConnected: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => {
      durableConnectionState = 'disconnected';
    }),
    connectionState: () => durableConnectionState,
  };
  const createClientTransport = vi
    .fn()
    .mockReturnValueOnce({ client: firstClient, transport: firstTransport })
    .mockReturnValueOnce({ client: secondClient, transport: secondTransport });

  return {
    environment: connectedEnvironment(),
    createDatabase: vi.fn(() => database),
    createRepositories: vi.fn(() => ({ portfolios: { marker: 'portfolio' }, oauthCredentials: { marker: 'oauth' } })),
    bootstrapOwner: vi.fn(async () => 'internal-owner-uuid'),
    createStore: vi.fn(() => connectedStore),
    createProvider: vi.fn(() => ({ ...provider, fetch: providerFetch })),
    createCallbackServer: vi.fn(async () => callback),
    createClientTransport,
    openUrl: vi.fn(async () => undefined),
    logger: { info: vi.fn(), error: vi.fn() },
    fixtures: { firstClient, secondClient, firstTransport, secondTransport, callback, provider, providerFetch, database, createClientTransport, connectedStore },
    ...overrides,
  };
}

describe('Robinhood enrollment command', () => {
  it('bootstraps the configured owner, completes OAuth, and verifies exactly the read allowlist', async () => {
    const { connectRobinhood } = cliUnderTest();
    expect(connectRobinhood).toBeTypeOf('function');
    if (!connectRobinhood) return;
    const deps = dependencies();

    await expect(connectRobinhood(deps)).resolves.toBeUndefined();

    expect(deps.bootstrapOwner).toHaveBeenCalledWith(
      { marker: 'portfolio' },
      { clerkUserId: 'user_1234', email: 'owner@example.com' },
    );
    expect(deps.createStore).toHaveBeenCalledWith(
      { marker: 'oauth' },
      'internal-owner-uuid',
      expect.any(String),
    );
    expect(deps.createCallbackServer).toHaveBeenCalledWith(
      expect.objectContaining({ host: '127.0.0.1', port: 43117, timeoutMs: expect.any(Number) }),
    );
    expect(deps.fixtures.firstTransport.finishAuth).toHaveBeenCalledWith(
      expect.any(URLSearchParams),
    );
    expect(deps.fixtures.createClientTransport).toHaveBeenCalledTimes(2);
    expect(deps.fixtures.createClientTransport).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ fetch: deps.fixtures.providerFetch }),
    );
    expect(deps.fixtures.createClientTransport).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ fetch: deps.fixtures.providerFetch }),
    );
    expect(deps.fixtures.secondClient.listTools).toHaveBeenCalledOnce();
    expect(deps.openUrl).toHaveBeenCalledWith('https://robinhood.com/oauth?state=state');
    expect(deps.fixtures.callback.close).toHaveBeenCalledOnce();
    expect(deps.fixtures.database.close).toHaveBeenCalledOnce();
  });

  it('rejects an initial connection failure before any authorization URL is emitted', async () => {
    const { connectRobinhood } = cliUnderTest();
    expect(connectRobinhood).toBeTypeOf('function');
    if (!connectRobinhood) return;
    const deps = dependencies({
      createProvider: vi.fn(() => ({ authorizationUrl: () => undefined, consumeState: () => true })),
    });

    await expect(connectRobinhood(deps)).rejects.toThrow('provider_authorization_invalid');
    expect(deps.openUrl).not.toHaveBeenCalled();
    expect(deps.fixtures.callback.close).toHaveBeenCalledOnce();
  });

  it('keeps an injected underlying fetch behind the provider fetch wrapper', async () => {
    const { connectRobinhood } = cliUnderTest();
    expect(connectRobinhood).toBeTypeOf('function');
    if (!connectRobinhood) return;
    const rawFetch = vi.fn<typeof fetch>();
    const deps = dependencies({ fetch: rawFetch });

    await expect(connectRobinhood(deps)).resolves.toBeUndefined();

    expect(deps.createProvider).toHaveBeenCalledWith(
      expect.objectContaining({ fetch: rawFetch }),
    );
    expect(deps.fixtures.createClientTransport).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ fetch: deps.fixtures.providerFetch }),
    );
    expect(deps.fixtures.createClientTransport).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ fetch: deps.fixtures.providerFetch }),
    );
  });

  it('allows extra provider tools after verifying the required read subset', async () => {
    const { connectRobinhood } = cliUnderTest();
    expect(connectRobinhood).toBeTypeOf('function');
    if (!connectRobinhood) return;
    const deps = dependencies();
    deps.fixtures.secondClient.listTools = vi.fn(async () => ({
      tools: [...allowedRobinhoodTools.map((name) => ({ name })), { name: 'place_order' }],
    }));

    await expect(connectRobinhood(deps)).resolves.toBeUndefined();
    expect(deps.fixtures.connectedStore.markConnected).toHaveBeenCalledOnce();
  });

  it('disconnects a previously connected grant when tool verification drifts', async () => {
    const { connectRobinhood } = cliUnderTest();
    expect(connectRobinhood).toBeTypeOf('function');
    if (!connectRobinhood) return;
    const deps = dependencies();
    deps.fixtures.secondClient.listTools = vi.fn(async () => ({ tools: [{ name: 'place_order' }] }));

    await expect(connectRobinhood(deps)).rejects.toThrow('provider_authorization_invalid');
    expect(deps.fixtures.connectedStore.markConnected).not.toHaveBeenCalled();
    expect(deps.fixtures.connectedStore.disconnect).toHaveBeenCalledOnce();
    expect(deps.fixtures.connectedStore.connectionState()).toBe('disconnected');
    expect(deps.fixtures.secondClient.close).toHaveBeenCalledOnce();
    expect(deps.fixtures.secondTransport.close).toHaveBeenCalledOnce();
  });

  it('rejects wrong callback routes, methods, missing code, issuer mismatch, and state replay without logging values', async () => {
    const { startOAuthCallbackServer } = cliUnderTest();
    expect(startOAuthCallbackServer).toBeTypeOf('function');
    if (!startOAuthCallbackServer) return;
    const validate = vi.fn((params: URLSearchParams) =>
      params.get('state') === 'state' && params.get('iss') === issuer,
    );
    const server = await startOAuthCallbackServer({
      host: '127.0.0.1',
      port: 0,
      validate,
      timeoutMs: 1_000,
    });
    const address = (server as unknown as { address(): { port: number } }).address();
    const base = `http://127.0.0.1:${address.port}`;

    await expect(fetch(`${base}/other`)).resolves.toMatchObject({ status: 404 });
    await expect(fetch(`${base}/callback`, { method: 'POST' })).resolves.toMatchObject({ status: 405 });
    await expect(fetch(`${base}/callback?state=state&iss=${encodeURIComponent(issuer)}`)).resolves.toMatchObject({ status: 400 });
    await expect(fetch(`${base}/callback?code=opaque-code&state=wrong&iss=${encodeURIComponent(issuer)}`)).resolves.toMatchObject({ status: 400 });
    await expect(fetch(`${base}/callback?code=opaque-code&state=state&iss=${encodeURIComponent(issuer)}`)).resolves.toMatchObject({ status: 200 });
    await expect(fetch(`${base}/callback?code=opaque-code&state=state&iss=${encodeURIComponent(issuer)}`)).resolves.toMatchObject({ status: 400 });
    await server.waitForCallback();
    await server.close();
  });

  it('rejects an issuer mismatch before consuming the single-use state', () => {
    const { validateOAuthCallback } = cliUnderTest();
    expect(validateOAuthCallback).toBeTypeOf('function');
    if (!validateOAuthCallback) return;
    const provider = { consumeState: vi.fn(() => true) };

    expect(
      validateOAuthCallback(provider, new URLSearchParams({ state: 'state', iss: 'https://wrong.example' })),
    ).toBe(false);
    expect(provider.consumeState).not.toHaveBeenCalled();
    expect(
      validateOAuthCallback(provider, new URLSearchParams({ state: 'state', iss: issuer })),
    ).toBe(true);
    expect(provider.consumeState).toHaveBeenCalledWith('state');
  });

  it('closes a real unawaited callback lifecycle without an unhandled rejection', async () => {
    const { startOAuthCallbackServer } = cliUnderTest();
    expect(startOAuthCallbackServer).toBeTypeOf('function');
    if (!startOAuthCallbackServer) return;
    const unhandled = vi.fn();
    process.once('unhandledRejection', unhandled);
    const server = await startOAuthCallbackServer({
      host: '127.0.0.1',
      port: 0,
      validate: () => false,
      timeoutMs: 1_000,
    });

    await server.close();
    await new Promise((resolve) => setImmediate(resolve));

    expect(unhandled).not.toHaveBeenCalled();
  });
});
