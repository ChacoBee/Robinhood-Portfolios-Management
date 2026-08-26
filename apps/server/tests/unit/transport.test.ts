import { SdkError, SdkErrorCode } from '@modelcontextprotocol/client';
import { describe, expect, it, vi } from 'vitest';
import { allowedRobinhoodTools } from '../../src/robinhood/read-methods';
import * as transportModule from '../../src/robinhood/transport';

const endpoint = 'https://mcp.example.test/read';

interface AdapterClient {
  connect(): Promise<void>;
  listTools(): Promise<{ tools: Array<{ name: string }> }>;
  callTool(
    request: { name: string; arguments: Readonly<Record<string, unknown>> },
    options: { timeout: number },
  ): Promise<unknown>;
  close(): Promise<void>;
}

interface AdapterFactoryInput {
  endpoint: URL;
  authProvider: unknown;
}

type AdapterFactory = (input: AdapterFactoryInput) => AdapterClient;

type SdkMcpTransportConstructor = new (options: {
  endpoint: string;
  approvedEndpointOrigins: readonly string[];
  authProvider: unknown;
  clientFactory: AdapterFactory;
}) => {
  connect(): Promise<void>;
  call<T>(tool: string, args: Readonly<Record<string, unknown>>): Promise<T>;
  close(): Promise<void>;
};

function constructorUnderTest(): SdkMcpTransportConstructor | undefined {
  return (transportModule as { SdkMcpTransport?: SdkMcpTransportConstructor })
    .SdkMcpTransport;
}

function advertisedTools() {
  return { tools: allowedRobinhoodTools.map((name) => ({ name })) };
}

function options(clientFactory: AdapterFactory) {
  return {
    endpoint,
    approvedEndpointOrigins: ['https://mcp.example.test'],
    authProvider: { token: async () => undefined },
    clientFactory,
  };
}

describe('SDK MCP transport lifecycle', () => {
  it('connects and verifies the advertised read tools before the first call', async () => {
    const client: AdapterClient = {
      connect: vi.fn(async () => undefined),
      listTools: vi.fn(async () => advertisedTools()),
      callTool: vi.fn(async () => ({ structuredContent: { data: { results: [] } } })),
      close: vi.fn(async () => undefined),
    };
    const factory = vi.fn<AdapterFactory>(() => client);
    const SdkMcpTransport = constructorUnderTest();

    expect(SdkMcpTransport).toBeTypeOf('function');
    if (!SdkMcpTransport) return;

    const transport = new SdkMcpTransport(options(factory));
    await expect(transport.call('get_accounts', {})).resolves.toEqual({ results: [] });

    expect(factory).toHaveBeenCalledWith({
      endpoint: new URL(endpoint),
      authProvider: { token: expect.any(Function) },
    });
    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.listTools).toHaveBeenCalledOnce();
    expect(client.callTool).toHaveBeenCalledWith(
      { name: 'get_accounts', arguments: {} },
      { timeout: 15_000 },
    );
  });

  it('reuses one initialized SDK client across calls', async () => {
    const client: AdapterClient = {
      connect: vi.fn(async () => undefined),
      listTools: vi.fn(async () => advertisedTools()),
      callTool: vi.fn(async () => ({ structuredContent: { data: { results: [] } } })),
      close: vi.fn(async () => undefined),
    };
    const factory = vi.fn<AdapterFactory>(() => client);
    const SdkMcpTransport = constructorUnderTest();

    expect(SdkMcpTransport).toBeTypeOf('function');
    if (!SdkMcpTransport) return;

    const transport = new SdkMcpTransport(options(factory));
    await transport.call('get_accounts', {});
    await transport.call('get_portfolio', { account_number: '123456789' });

    expect(factory).toHaveBeenCalledOnce();
    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.listTools).toHaveBeenCalledOnce();
    expect(client.callTool).toHaveBeenNthCalledWith(
      2,
      { name: 'get_portfolio', arguments: { account_number: '123456789' } },
      { timeout: 15_000 },
    );
  });

  it('rejects a connection that does not advertise every allowlisted read tool', async () => {
    const client: AdapterClient = {
      connect: vi.fn(async () => undefined),
      listTools: vi.fn(async () => ({
        tools: advertisedTools().tools.filter((tool) => tool.name !== 'get_option_quotes'),
      })),
      callTool: vi.fn(async () => ({ structuredContent: { data: { results: [] } } })),
      close: vi.fn(async () => undefined),
    };
    const SdkMcpTransport = constructorUnderTest();

    expect(SdkMcpTransport).toBeTypeOf('function');
    if (!SdkMcpTransport) return;

    await expect(new SdkMcpTransport(options(() => client)).connect()).rejects.toMatchObject({
      code: 'provider_protocol_error',
    });
    expect(client.callTool).not.toHaveBeenCalled();
  });

  it('closes the initialized SDK client cleanly', async () => {
    const client: AdapterClient = {
      connect: vi.fn(async () => undefined),
      listTools: vi.fn(async () => advertisedTools()),
      callTool: vi.fn(async () => ({ structuredContent: { data: { results: [] } } })),
      close: vi.fn(async () => undefined),
    };
    const SdkMcpTransport = constructorUnderTest();

    expect(SdkMcpTransport).toBeTypeOf('function');
    if (!SdkMcpTransport) return;

    const transport = new SdkMcpTransport(options(() => client));
    await transport.connect();
    await transport.close();

    expect(client.close).toHaveBeenCalledOnce();
  });

  it('rejects a result without structuredContent.data', async () => {
    const client: AdapterClient = {
      connect: vi.fn(async () => undefined),
      listTools: vi.fn(async () => advertisedTools()),
      callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'ignore me' }] })),
      close: vi.fn(async () => undefined),
    };
    const SdkMcpTransport = constructorUnderTest();

    expect(SdkMcpTransport).toBeTypeOf('function');
    if (!SdkMcpTransport) return;

    await expect(
      new SdkMcpTransport(options(() => client)).call('get_accounts', {}),
    ).rejects.toMatchObject({ code: 'provider_protocol_error' });
  });

  it('maps an SDK request timeout to the safe timeout boundary error', async () => {
    const client: AdapterClient = {
      connect: vi.fn(async () => undefined),
      listTools: vi.fn(async () => advertisedTools()),
      callTool: vi.fn(async () => {
        throw new SdkError(
          SdkErrorCode.RequestTimeout,
          'account 123456789 bearer secret-token',
        );
      }),
      close: vi.fn(async () => undefined),
    };
    const SdkMcpTransport = constructorUnderTest();

    expect(SdkMcpTransport).toBeTypeOf('function');
    if (!SdkMcpTransport) return;

    let error: unknown;
    try {
      await new SdkMcpTransport(options(() => client)).call('get_accounts', {});
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ code: 'provider_timeout' });
    expect(String(error)).not.toContain('123456789');
    expect(String(error)).not.toContain('secret-token');
  });

  it('rejects an error tool result instead of returning its structured data', async () => {
    const client: AdapterClient = {
      connect: vi.fn(async () => undefined),
      listTools: vi.fn(async () => advertisedTools()),
      callTool: vi.fn(async () => ({
        isError: true,
        content: [{ type: 'text', text: 'account 123456789 bearer secret-token' }],
        structuredContent: { data: { results: ['must-not-return'] } },
      })),
      close: vi.fn(async () => undefined),
    };
    const SdkMcpTransport = constructorUnderTest();

    expect(SdkMcpTransport).toBeTypeOf('function');
    if (!SdkMcpTransport) return;

    let error: unknown;
    try {
      await new SdkMcpTransport(options(() => client)).call('get_accounts', {});
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ code: 'provider_protocol_error' });
    expect(String(error)).not.toContain('123456789');
    expect(String(error)).not.toContain('secret-token');
  });
});
