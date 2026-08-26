import { describe, expect, it, vi } from 'vitest';
import type { RobinhoodOAuthGrant } from '../../src/robinhood/oauth-store';
import * as oauthProviderModule from '../../src/robinhood/oauth-provider';

const issuer = 'https://agent.robinhood.com/mcp/trading';
const metadata = {
  issuer,
  authorization_endpoint: 'https://robinhood.com/oauth',
  registration_endpoint: 'https://agent.robinhood.com/oauth/trading/register',
  token_endpoint: 'https://api.robinhood.com/oauth2/token/',
  code_challenge_methods_supported: ['S256'],
};

interface TestStore {
  load(): Promise<RobinhoodOAuthGrant | null>;
  saveClientInformation(value: Record<string, unknown>): Promise<void>;
  saveTokens(value: Record<string, unknown>): Promise<void>;
  markConnected(): Promise<void>;
  disconnect(): Promise<void>;
}

function store(grant: RobinhoodOAuthGrant | null = null): TestStore {
  return {
    load: vi.fn(async () => grant),
    saveClientInformation: vi.fn(async () => undefined),
    saveTokens: vi.fn(async () => undefined),
    markConnected: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
  };
}

function providerUnderTest() {
  return (oauthProviderModule as unknown as {
    RobinhoodOAuthProvider?: new (options: {
      store: TestStore;
      randomState?: () => string;
      fetch?: typeof fetch;
    }) => {
      readonly redirectUrl: string;
      readonly clientMetadata: Record<string, unknown>;
      state(): string;
      clientInformation(context?: { issuer: string }): Promise<Record<string, unknown> | undefined>;
      saveClientInformation(value: Record<string, unknown>, context?: { issuer: string }): Promise<void>;
      tokens(context?: { issuer: string }): Promise<Record<string, unknown> | undefined>;
      saveTokens(value: Record<string, unknown>, context?: { issuer: string }): Promise<void>;
      redirectToAuthorization(url: URL): void;
      authorizationUrl(): string | undefined;
      saveCodeVerifier(value: string): void;
      codeVerifier(): string;
      consumeState(value: string): boolean;
      saveDiscoveryState(value: Record<string, unknown>): void;
      discoveryState(): Record<string, unknown> | undefined;
      validateResourceURL(server: string | URL, resource?: string): Promise<URL | undefined>;
      invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void>;
      fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    };
  }).RobinhoodOAuthProvider;
}

describe('Robinhood OAuth provider', () => {
  it('uses the exact native DCR metadata and has no metadata URL', () => {
    const RobinhoodOAuthProvider = providerUnderTest();
    expect(RobinhoodOAuthProvider).toBeTypeOf('function');
    if (!RobinhoodOAuthProvider) return;

    const provider = new RobinhoodOAuthProvider({ store: store() });

    expect(provider.clientMetadata).toEqual({
      redirect_uris: ['http://127.0.0.1:43117/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      application_type: 'native',
      client_name: 'Aurum Portfolio',
      scope: 'internal',
    });
    expect('clientMetadataUrl' in provider).toBe(false);
  });

  it('keeps the state and PKCE verifier in one-shot process memory', () => {
    const RobinhoodOAuthProvider = providerUnderTest();
    expect(RobinhoodOAuthProvider).toBeTypeOf('function');
    if (!RobinhoodOAuthProvider) return;

    const provider = new RobinhoodOAuthProvider({
      store: store(),
      randomState: () => 'cryptographically-random-state',
    });
    const state = provider.state();
    provider.saveCodeVerifier('pkce-verifier');

    expect(state).toBe('cryptographically-random-state');
    expect(provider.consumeState(state)).toBe(true);
    expect(provider.consumeState(state)).toBe(false);
    expect(provider.codeVerifier()).toBe('pkce-verifier');
  });

  it('accepts the SDK authorization URL only on the pinned authorization endpoint', () => {
    const RobinhoodOAuthProvider = providerUnderTest();
    expect(RobinhoodOAuthProvider).toBeTypeOf('function');
    if (!RobinhoodOAuthProvider) return;

    const provider = new RobinhoodOAuthProvider({ store: store() });
    provider.redirectToAuthorization(
      new URL('https://robinhood.com/oauth?state=opaque-state&code_challenge=pkce'),
    );

    expect(provider.authorizationUrl()).toBe(
      'https://robinhood.com/oauth?state=opaque-state&code_challenge=pkce',
    );
  });

  it('loads persisted credentials only for the pinned issuer and returns tokens without context', async () => {
    const RobinhoodOAuthProvider = providerUnderTest();
    expect(RobinhoodOAuthProvider).toBeTypeOf('function');
    if (!RobinhoodOAuthProvider) return;

    const testStore = store({
      clientInformation: { client_id: 'registered-client', issuer },
      tokens: { access_token: 'rotated-token', issuer },
      connectionState: 'enrolling',
      tokenUpdatedAt: null,
      lastHeartbeatAt: null,
    });
    const provider = new RobinhoodOAuthProvider({ store: testStore });

    await expect(provider.clientInformation({ issuer })).resolves.toEqual({
      client_id: 'registered-client',
      issuer,
    });
    await expect(provider.tokens()).resolves.toEqual({
      access_token: 'rotated-token',
      issuer,
    });
    await expect(provider.tokens({ issuer: 'https://unexpected.example' })).rejects.toThrow(
      'provider_authorization_invalid',
    );
  });

  it('persists DCR data and rotated tokens only for the pinned issuer', async () => {
    const RobinhoodOAuthProvider = providerUnderTest();
    expect(RobinhoodOAuthProvider).toBeTypeOf('function');
    if (!RobinhoodOAuthProvider) return;

    const testStore = store();
    const provider = new RobinhoodOAuthProvider({ store: testStore });
    await provider.saveClientInformation({ client_id: 'registered-client', issuer }, { issuer });
    await provider.saveTokens({ access_token: 'rotated-token', issuer }, { issuer });

    expect(testStore.saveClientInformation).toHaveBeenCalledWith({
      client_id: 'registered-client',
      issuer,
    });
    expect(testStore.saveTokens).toHaveBeenCalledWith({
      access_token: 'rotated-token',
      issuer,
    });
    await expect(
      provider.saveTokens({ access_token: 'leak' }, { issuer: 'https://unexpected.example' }),
    ).rejects.toThrow('provider_authorization_invalid');
  });

  it('pins resource and discovery metadata including every endpoint and S256', async () => {
    const RobinhoodOAuthProvider = providerUnderTest();
    expect(RobinhoodOAuthProvider).toBeTypeOf('function');
    if (!RobinhoodOAuthProvider) return;

    const provider = new RobinhoodOAuthProvider({ store: store() });
    await expect(provider.validateResourceURL(issuer, issuer)).resolves.toEqual(new URL(issuer));
    await expect(
      provider.validateResourceURL(issuer, 'https://agent.robinhood.com/mcp/other'),
    ).rejects.toThrow('provider_authorization_invalid');

    provider.saveDiscoveryState({
      authorizationServerUrl: issuer,
      resourceMetadataUrl: 'https://agent.robinhood.com/.well-known/oauth-protected-resource/mcp/trading',
      resourceMetadata: { resource: issuer, authorization_servers: [issuer] },
      authorizationServerMetadata: metadata,
    });
    expect(provider.discoveryState()).toEqual({
      authorizationServerUrl: issuer,
      resourceMetadataUrl: 'https://agent.robinhood.com/.well-known/oauth-protected-resource/mcp/trading',
      resourceMetadata: { resource: issuer, authorization_servers: [issuer] },
      authorizationServerMetadata: metadata,
    });

    expect(() =>
      provider.saveDiscoveryState({
        authorizationServerUrl: issuer,
        authorizationServerMetadata: { ...metadata, token_endpoint: 'https://evil.example/token' },
      }),
    ).toThrow('provider_authorization_invalid');
  });

  it('fails closed on redirects and unapproved fetch origins', async () => {
    const RobinhoodOAuthProvider = providerUnderTest();
    expect(RobinhoodOAuthProvider).toBeTypeOf('function');
    if (!RobinhoodOAuthProvider) return;

    const innerFetch = vi.fn(async () => new Response('', { status: 302 }));
    const provider = new RobinhoodOAuthProvider({ store: store(), fetch: innerFetch });

    await expect(provider.fetch('https://agent.robinhood.com/mcp/trading')).rejects.toThrow(
      'provider_authorization_invalid',
    );
    expect(innerFetch).toHaveBeenCalledWith(
      'https://agent.robinhood.com/mcp/trading',
      expect.objectContaining({ redirect: 'manual' }),
    );
    await expect(provider.fetch('https://evil.example/')).rejects.toThrow(
      'provider_authorization_invalid',
    );
  });

  it('invalidates persisted credentials and transient authorization state', async () => {
    const RobinhoodOAuthProvider = providerUnderTest();
    expect(RobinhoodOAuthProvider).toBeTypeOf('function');
    if (!RobinhoodOAuthProvider) return;

    const testStore = store();
    const provider = new RobinhoodOAuthProvider({
      store: testStore,
      randomState: () => 'single-use',
    });
    provider.state();
    provider.saveCodeVerifier('pkce-verifier');
    provider.saveDiscoveryState({ authorizationServerUrl: issuer, authorizationServerMetadata: metadata });
    await provider.invalidateCredentials('all');

    expect(testStore.disconnect).toHaveBeenCalledOnce();
    expect(provider.consumeState('single-use')).toBe(false);
    expect(provider.discoveryState()).toBeUndefined();
    expect(() => provider.codeVerifier()).toThrow('provider_authorization_invalid');
  });
});
