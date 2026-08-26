import { randomBytes } from 'node:crypto';
import type {
  OAuthClientInformationContext,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from '@modelcontextprotocol/client';
import { RobinhoodOAuthStore } from './oauth-store';

export const robinhoodMcpEndpoint = 'https://agent.robinhood.com/mcp/trading';
export const robinhoodAuthorizationEndpoint = 'https://robinhood.com/oauth';
export const robinhoodRegistrationEndpoint =
  'https://agent.robinhood.com/oauth/trading/register';
export const robinhoodTokenEndpoint = 'https://api.robinhood.com/oauth2/token/';

const protectedResourceMetadataUrl =
  'https://agent.robinhood.com/.well-known/oauth-protected-resource/mcp/trading';
const approvedOrigins = new Set([
  'https://agent.robinhood.com',
  'https://robinhood.com',
  'https://api.robinhood.com',
]);

export const robinhoodClientMetadata = {
  redirect_uris: ['http://127.0.0.1:43117/callback'],
  token_endpoint_auth_method: 'none',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  application_type: 'native',
  client_name: 'Aurum Portfolio',
  scope: 'internal',
} as const satisfies OAuthClientMetadata;

export class RobinhoodOAuthProviderError extends Error {
  constructor() {
    super('provider_authorization_invalid');
    this.name = 'RobinhoodOAuthProviderError';
  }
}

function invalidAuthorization(): never {
  throw new RobinhoodOAuthProviderError();
}

function exactUrl(value: string | URL, expected: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(String(value));
  } catch {
    return invalidAuthorization();
  }
  if (
    parsed.href !== expected ||
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    return invalidAuthorization();
  }
  return parsed;
}

function pinnedAuthorizationUrl(value: URL): URL {
  const expected = new URL(robinhoodAuthorizationEndpoint);
  if (
    value.origin !== expected.origin ||
    value.pathname !== expected.pathname ||
    value.username !== '' ||
    value.password !== '' ||
    value.hash !== ''
  ) {
    return invalidAuthorization();
  }
  for (const [name, expectedValue] of [
    ['scope', 'internal'],
    ['resource', robinhoodMcpEndpoint],
    ['redirect_uri', robinhoodClientMetadata.redirect_uris[0]],
    ['code_challenge_method', 'S256'],
  ] as const) {
    if (value.searchParams.getAll(name).length !== 1 || value.searchParams.get(name) !== expectedValue) {
      return invalidAuthorization();
    }
  }
  return value;
}

function exactScopeList(value: unknown): void {
  if (
    value !== undefined &&
    (!Array.isArray(value) || value.length !== 1 || value[0] !== robinhoodClientMetadata.scope)
  ) {
    invalidAuthorization();
  }
}

function exactScope(value: unknown): void {
  if (value !== undefined && value !== robinhoodClientMetadata.scope) invalidAuthorization();
}

function hasExactIssuer(context: OAuthClientInformationContext | undefined): boolean {
  return context === undefined || context.issuer === robinhoodMcpEndpoint;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalidAuthorization();
  }
  return value as Record<string, unknown>;
}

function credentialForIssuer<T extends Record<string, unknown>>(
  value: Record<string, unknown> | null,
  context: OAuthClientInformationContext | undefined,
): T | undefined {
  if (!hasExactIssuer(context)) return invalidAuthorization();
  if (value === null) return undefined;
  const credential = record(value);
  if (credential.issuer !== undefined && credential.issuer !== robinhoodMcpEndpoint) {
    return invalidAuthorization();
  }
  exactScope(credential.scope);
  return credential as T;
}

function validateRegistrationRequest(url: URL, init: RequestInit | undefined): void {
  if (url.href !== robinhoodRegistrationEndpoint) return;
  if (typeof init?.body !== 'string') invalidAuthorization();
  let metadata: unknown;
  try {
    metadata = JSON.parse(init.body);
  } catch {
    invalidAuthorization();
  }
  exactScope(record(metadata).scope);
}

function validateDiscoveryState(state: OAuthDiscoveryState): OAuthDiscoveryState {
  exactUrl(state.authorizationServerUrl, robinhoodMcpEndpoint);
  if (state.resourceMetadataUrl !== undefined) {
    exactUrl(state.resourceMetadataUrl, protectedResourceMetadataUrl);
  }
  if (state.resourceMetadata !== undefined) {
    const resource = record(state.resourceMetadata);
    if (resource.resource !== robinhoodMcpEndpoint) invalidAuthorization();
    const servers = resource.authorization_servers;
    if (
      !Array.isArray(servers) ||
      servers.length !== 1 ||
      servers[0] !== robinhoodMcpEndpoint
    ) {
      invalidAuthorization();
    }
    exactScopeList(resource.scopes_supported);
  }
  const metadata = state.authorizationServerMetadata;
  if (metadata === undefined) invalidAuthorization();
  const value = record(metadata);
  if (value.issuer !== robinhoodMcpEndpoint) invalidAuthorization();
  if (value.authorization_endpoint !== robinhoodAuthorizationEndpoint) invalidAuthorization();
  if (value.registration_endpoint !== robinhoodRegistrationEndpoint) invalidAuthorization();
  if (value.token_endpoint !== robinhoodTokenEndpoint) invalidAuthorization();
  if (
    !Array.isArray(value.code_challenge_methods_supported) ||
    !value.code_challenge_methods_supported.includes('S256')
  ) {
    invalidAuthorization();
  }
  exactScopeList(value.scopes_supported);
  return state;
}

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof Request) return new URL(input.url);
  return new URL(String(input));
}

export interface RobinhoodOAuthProviderOptions {
  store: RobinhoodOAuthStore;
  randomState?: () => string;
  fetch?: typeof globalThis.fetch;
}

/** Persistent SDK v2 provider with only one-shot redirect state held in memory. */
export class RobinhoodOAuthProvider implements OAuthClientProvider {
  private stateValue: string | undefined;
  private verifier: string | undefined;
  private authorization: string | undefined;
  private discovered: OAuthDiscoveryState | undefined;
  readonly fetch: typeof globalThis.fetch;

  constructor(private readonly options: RobinhoodOAuthProviderOptions) {
    const innerFetch = options.fetch ?? globalThis.fetch;
    this.fetch = async (input, init) => {
      let url: URL;
      try {
        url = requestUrl(input);
      } catch {
        return invalidAuthorization();
      }
      if (!approvedOrigins.has(url.origin)) return invalidAuthorization();
      validateRegistrationRequest(url, init);
      const response = await innerFetch(input, { ...init, redirect: 'manual' });
      if (response.status >= 300 && response.status < 400) return invalidAuthorization();
      return response;
    };
  }

  get redirectUrl(): string {
    return robinhoodClientMetadata.redirect_uris[0];
  }

  get clientMetadata(): OAuthClientMetadata {
    return robinhoodClientMetadata;
  }

  state(): string {
    this.stateValue = this.options.randomState?.() ?? randomBytes(32).toString('base64url');
    return this.stateValue;
  }

  async clientInformation(
    context?: OAuthClientInformationContext,
  ): Promise<StoredOAuthClientInformation | undefined> {
    const grant = await this.options.store.load();
    return credentialForIssuer<StoredOAuthClientInformation>(grant?.clientInformation ?? null, context);
  }

  async saveClientInformation(
    clientInformation: StoredOAuthClientInformation,
    context?: OAuthClientInformationContext,
  ): Promise<void> {
    const value = credentialForIssuer<StoredOAuthClientInformation>(
      record(clientInformation),
      context,
    );
    if (!value) invalidAuthorization();
    await this.options.store.saveClientInformation(value);
  }

  async tokens(context?: OAuthClientInformationContext): Promise<StoredOAuthTokens | undefined> {
    const grant = await this.options.store.load();
    return credentialForIssuer<StoredOAuthTokens>(grant?.tokens ?? null, context);
  }

  async saveTokens(
    tokens: StoredOAuthTokens,
    context?: OAuthClientInformationContext,
  ): Promise<void> {
    const value = credentialForIssuer<StoredOAuthTokens>(record(tokens), context);
    if (!value) invalidAuthorization();
    await this.options.store.saveTokens(value);
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.authorization = pinnedAuthorizationUrl(authorizationUrl).toString();
  }

  authorizationUrl(): string | undefined {
    return this.authorization;
  }

  saveCodeVerifier(codeVerifier: string): void {
    if (codeVerifier.length === 0) invalidAuthorization();
    this.verifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this.verifier) invalidAuthorization();
    return this.verifier;
  }

  consumeState(candidate: string): boolean {
    const expected = this.stateValue;
    if (expected === undefined || candidate !== expected) return false;
    this.stateValue = undefined;
    return true;
  }

  saveDiscoveryState(state: OAuthDiscoveryState): void {
    this.discovered = validateDiscoveryState(state);
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return this.discovered;
  }

  async validateResourceURL(serverUrl: string | URL, resource?: string): Promise<URL | undefined> {
    const endpoint = exactUrl(serverUrl, robinhoodMcpEndpoint);
    if (resource !== undefined) exactUrl(resource, robinhoodMcpEndpoint);
    return endpoint;
  }

  async invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery',
  ): Promise<void> {
    if (scope === 'all' || scope === 'client' || scope === 'tokens') {
      await this.options.store.disconnect();
    }
    if (scope === 'all' || scope === 'verifier') {
      this.verifier = undefined;
      this.stateValue = undefined;
      this.authorization = undefined;
    }
    if (scope === 'all' || scope === 'discovery') this.discovered = undefined;
  }
}
