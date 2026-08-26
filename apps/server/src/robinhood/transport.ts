import {
  Client,
  SdkError,
  SdkErrorCode,
  StreamableHTTPClientTransport,
  type AuthProvider,
  type CallToolResult,
  type OAuthClientProvider,
} from '@modelcontextprotocol/client';
import {
  allowedRobinhoodTools,
  assertAllowedRobinhoodTool,
  type AllowedRobinhoodTool,
} from './read-methods';
import { ProviderBoundaryError } from './errors';

const toolTimeoutMs = 15_000;

export type RobinhoodAuthProvider = AuthProvider | OAuthClientProvider;

export interface McpTransport {
  call<T>(
    tool: AllowedRobinhoodTool,
    args: Readonly<Record<string, unknown>>,
  ): Promise<T>;
}

export interface McpSdkClient {
  connect(): Promise<void>;
  listTools(): Promise<{ tools: readonly { name: string }[] }>;
  callTool(
    request: {
      name: AllowedRobinhoodTool;
      arguments: Readonly<Record<string, unknown>>;
    },
    options: { timeout: number },
  ): Promise<CallToolResult>;
  close(): Promise<void>;
}

export interface McpClientFactoryInput {
  endpoint: URL;
  authProvider: RobinhoodAuthProvider;
  fetch?: typeof fetch;
}

export type McpClientFactory = (input: McpClientFactoryInput) => McpSdkClient;

export interface SdkMcpTransportOptions {
  endpoint: string;
  approvedEndpointOrigins: readonly string[];
  authProvider: RobinhoodAuthProvider;
  clientFactory?: McpClientFactory;
  fetch?: typeof fetch;
}

function createMcpSdkClient({ endpoint, authProvider, fetch }: McpClientFactoryInput): McpSdkClient {
  const client = new Client({ name: 'aurum-portfolio', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    authProvider,
    ...(fetch ? { fetch } : {}),
  });

  return {
    connect: () => client.connect(transport),
    listTools: () => client.listTools(),
    callTool: (request, options) => client.callTool(request, options),
    close: () => client.close(),
  };
}

function parseApprovedEndpoint(
  endpointValue: string,
  approvedEndpointOrigins: readonly string[],
): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(endpointValue);
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
      approvedEndpointOrigins.map((value) => {
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

  if (approvedOrigins.size === 0 || !approvedOrigins.has(endpoint.origin)) {
    throw new ProviderBoundaryError('provider_protocol_error');
  }
  return endpoint;
}

function structuredData(result: CallToolResult): unknown {
  const content = result.structuredContent;
  if (
    typeof content !== 'object' ||
    content === null ||
    !Object.hasOwn(content, 'data')
  ) {
    throw new ProviderBoundaryError('provider_protocol_error');
  }
  return (content as { data: unknown }).data;
}

function providerFailure(error: unknown): ProviderBoundaryError {
  if (
    (error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout) ||
    (error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError'))
  ) {
    return new ProviderBoundaryError('provider_timeout');
  }
  return new ProviderBoundaryError('provider_http_error');
}

export class SdkMcpTransport implements McpTransport {
  private readonly endpoint: URL;
  private readonly clientFactory: McpClientFactory;
  private readonly fetch: typeof fetch | undefined;
  private client: McpSdkClient | undefined;
  private connection: Promise<McpSdkClient> | undefined;

  constructor(options: SdkMcpTransportOptions) {
    this.endpoint = parseApprovedEndpoint(
      options.endpoint,
      options.approvedEndpointOrigins,
    );
    this.clientFactory = options.clientFactory ?? createMcpSdkClient;
    this.authProvider = options.authProvider;
    this.fetch = options.fetch;
  }

  private readonly authProvider: RobinhoodAuthProvider;

  async connect(): Promise<void> {
    await this.connectedClient();
  }

  async call<T>(
    tool: AllowedRobinhoodTool,
    args: Readonly<Record<string, unknown>>,
  ): Promise<T> {
    assertAllowedRobinhoodTool(tool);

    let result: CallToolResult;
    try {
      result = await (await this.connectedClient()).callTool(
        { name: tool, arguments: args },
        { timeout: toolTimeoutMs },
      );
    } catch (error) {
      if (error instanceof ProviderBoundaryError) throw error;
      throw providerFailure(error);
    }

    if (result.isError === true) {
      throw new ProviderBoundaryError('provider_protocol_error');
    }
    return structuredData(result) as T;
  }

  async close(): Promise<void> {
    const client = this.client ?? (this.connection ? await this.connection : undefined);
    this.client = undefined;
    this.connection = undefined;
    if (!client) return;
    try {
      await client.close();
    } catch {
      throw new ProviderBoundaryError('provider_http_error');
    }
  }

  private async connectedClient(): Promise<McpSdkClient> {
    if (this.client) return this.client;
    if (!this.connection) {
      this.connection = this.initializeClient();
    }
    return this.connection;
  }

  private async initializeClient(): Promise<McpSdkClient> {
    let client: McpSdkClient | undefined;
    try {
      client = this.clientFactory({
        endpoint: this.endpoint,
        authProvider: this.authProvider,
        ...(this.fetch ? { fetch: this.fetch } : {}),
      });
      await client.connect();
      const advertised = new Set((await client.listTools()).tools.map((tool) => tool.name));
      if (allowedRobinhoodTools.some((tool) => !advertised.has(tool))) {
        throw new ProviderBoundaryError('provider_protocol_error');
      }
      this.client = client;
      return client;
    } catch (error) {
      if (client) {
        try {
          await client.close();
        } catch {
          // The original initialization error is the useful, already-redacted boundary error.
        }
      }
      if (error instanceof ProviderBoundaryError) throw error;
      throw providerFailure(error);
    } finally {
      this.connection = undefined;
    }
  }
}
