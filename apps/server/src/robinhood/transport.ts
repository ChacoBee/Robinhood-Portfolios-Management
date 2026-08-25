import { randomUUID } from 'node:crypto';
import {
  assertAllowedRobinhoodTool,
  parseExactRobinhoodReadScopes,
  requiredRobinhoodReadScopes,
  type AllowedRobinhoodTool,
} from './read-methods';
import { ProviderBoundaryError } from './errors';
import type {
  VerifiedRobinhoodAuthorizationGrant,
  VerifiedRobinhoodAuthorizationProvider,
} from './authorization';

export interface McpTransport {
  call<T>(
    tool: AllowedRobinhoodTool,
    args: Readonly<Record<string, unknown>>,
  ): Promise<T>;
}

export interface HttpMcpTransportOptions {
  endpoint: string;
  approvedEndpointOrigins: readonly string[];
  expectedIssuer: string;
  expectedAudience: string;
  authorizationProvider: VerifiedRobinhoodAuthorizationProvider;
  fetchImplementation?: typeof fetch;
  now?: () => Date;
}

interface McpJsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: string;
  result?: T;
  error?: { code: number; message: string };
}

export class HttpMcpTransport implements McpTransport {
  private readonly fetchImplementation: typeof fetch;
  private readonly endpoint: string;
  private readonly endpointOrigin: string;
  private readonly now: () => Date;

  constructor(private readonly options: HttpMcpTransportOptions) {
    let endpoint: URL;
    try {
      endpoint = new URL(options.endpoint);
    } catch {
      throw new ProviderBoundaryError('provider_protocol_error');
    }
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username.length > 0 ||
      endpoint.password.length > 0
    ) {
      throw new ProviderBoundaryError('provider_protocol_error');
    }
    let approvedOrigins: Set<string>;
    try {
      approvedOrigins = new Set(
        options.approvedEndpointOrigins.map((value) => {
          const origin = new URL(value);
          if (
            origin.protocol !== 'https:' ||
            origin.username.length > 0 ||
            origin.password.length > 0
          ) {
            throw new Error('invalid approved origin');
          }
          return origin.origin;
        }),
      );
    } catch {
      throw new ProviderBoundaryError('provider_protocol_error');
    }
    if (
      approvedOrigins.size === 0 ||
      !approvedOrigins.has(endpoint.origin) ||
      options.expectedIssuer.trim().length === 0 ||
      options.expectedAudience.trim().length === 0
    ) {
      throw new ProviderBoundaryError('provider_protocol_error');
    }
    this.endpoint = endpoint.href;
    this.endpointOrigin = endpoint.origin;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async call<T>(
    tool: AllowedRobinhoodTool,
    args: Readonly<Record<string, unknown>>,
  ): Promise<T> {
    assertAllowedRobinhoodTool(tool);
    let grant: VerifiedRobinhoodAuthorizationGrant;
    try {
      grant = await this.options.authorizationProvider.getVerifiedAuthorization({
        endpointOrigin: this.endpointOrigin,
        expectedIssuer: this.options.expectedIssuer,
        expectedAudience: this.options.expectedAudience,
        requiredScopes: requiredRobinhoodReadScopes,
      });
    } catch {
      throw new ProviderBoundaryError('provider_authorization_invalid');
    }
    try {
      parseExactRobinhoodReadScopes(grant.actualScopes.join(','));
    } catch {
      throw new ProviderBoundaryError('provider_scope_invalid');
    }
    const expiresAt = Date.parse(grant.expiresAt);
    if (
      !/^Bearer \S+$/.test(grant.header) ||
      grant.issuer !== this.options.expectedIssuer ||
      grant.audience !== this.options.expectedAudience ||
      (grant.verification !== 'signed_claims' &&
        grant.verification !== 'oauth_introspection') ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= this.now().getTime()
    ) {
      throw new ProviderBoundaryError('provider_authorization_invalid');
    }
    let authorizedOrigin: string;
    try {
      authorizedOrigin = new URL(grant.authorizedEndpointOrigin).origin;
    } catch {
      throw new ProviderBoundaryError('provider_authorization_invalid');
    }
    if (authorizedOrigin !== this.endpointOrigin) {
      throw new ProviderBoundaryError('provider_authorization_invalid');
    }
    const authorization = grant.header;
    const id = randomUUID();
    let response: Response;
    try {
      response = await this.fetchImplementation(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        authorization,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name: tool, arguments: args },
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')
      ) {
        throw new ProviderBoundaryError('provider_timeout');
      }
      throw new ProviderBoundaryError('provider_http_error');
    }

    if (!response.ok) {
      throw new ProviderBoundaryError('provider_http_error');
    }

    let body: McpJsonRpcResponse<T>;
    try {
      body = (await response.json()) as McpJsonRpcResponse<T>;
    } catch {
      throw new ProviderBoundaryError('provider_protocol_error');
    }
    if (body.id !== id || body.jsonrpc !== '2.0') {
      throw new ProviderBoundaryError('provider_protocol_error');
    }
    if (body.error) {
      throw new ProviderBoundaryError('provider_protocol_error');
    }
    if (body.result === undefined) {
      throw new ProviderBoundaryError('provider_protocol_error');
    }

    return body.result;
  }
}
