import { describe, expect, it, vi } from 'vitest';
import * as transportModule from '../../src/robinhood/transport';

type SdkMcpTransportConstructor = new (options: {
  endpoint: string;
  approvedEndpointOrigins: readonly string[];
  authProvider: unknown;
  clientFactory: (input: { endpoint: URL; authProvider: unknown }) => unknown;
}) => {
  call<T>(tool: string, args: Readonly<Record<string, unknown>>): Promise<T>;
};

function constructorUnderTest(): SdkMcpTransportConstructor | undefined {
  return (transportModule as { SdkMcpTransport?: SdkMcpTransportConstructor })
    .SdkMcpTransport;
}

describe('SDK provider boundary', () => {
  it('rejects write tool names before creating an SDK client', async () => {
    const factory = vi.fn();
    const SdkMcpTransport = constructorUnderTest();

    expect(SdkMcpTransport).toBeTypeOf('function');
    if (!SdkMcpTransport) return;

    const transport = new SdkMcpTransport({
      endpoint: 'https://mcp.example.test/read',
      approvedEndpointOrigins: ['https://mcp.example.test'],
      authProvider: { token: async () => undefined },
      clientFactory: factory,
    });

    await expect(transport.call('place_equity_order', {})).rejects.toThrow(
      'read-only boundary',
    );
    expect(factory).not.toHaveBeenCalled();
  });

  it('pins the exact approved HTTPS endpoint before creating an SDK client', () => {
    const factory = vi.fn();
    const SdkMcpTransport = constructorUnderTest();

    expect(SdkMcpTransport).toBeTypeOf('function');
    if (!SdkMcpTransport) return;

    expect(
      () =>
        new SdkMcpTransport({
          endpoint: 'https://mcp.example.test.evil/read',
          approvedEndpointOrigins: ['https://mcp.example.test'],
          authProvider: { token: async () => undefined },
          clientFactory: factory,
        }),
    ).toThrow('provider_protocol_error');
    expect(factory).not.toHaveBeenCalled();
  });

  it('redacts SDK error content', async () => {
    const factory = vi.fn(() => ({
      connect: async () => undefined,
      listTools: async () => ({
        tools: [
          'get_accounts',
          'get_portfolio',
          'get_equity_positions',
          'get_equity_quotes',
          'get_option_positions',
          'get_option_quotes',
          'get_option_instruments',
        ].map((name) => ({ name })),
      }),
      callTool: async () => {
        throw new Error('account 123456789 bearer secret-token');
      },
      close: async () => undefined,
    }));
    const SdkMcpTransport = constructorUnderTest();

    expect(SdkMcpTransport).toBeTypeOf('function');
    if (!SdkMcpTransport) return;

    let error: unknown;
    try {
      await new SdkMcpTransport({
        endpoint: 'https://mcp.example.test/read',
        approvedEndpointOrigins: ['https://mcp.example.test'],
        authProvider: { token: async () => undefined },
        clientFactory: factory,
      }).call('get_accounts', {});
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ code: 'provider_http_error' });
    expect(String(error)).not.toContain('123456789');
    expect(String(error)).not.toContain('secret-token');
  });

  it('redacts a secret-bearing SDK client factory failure', async () => {
    const factory = vi.fn(() => {
      throw new Error('account 123456789 bearer secret-token');
    });
    const SdkMcpTransport = constructorUnderTest();

    expect(SdkMcpTransport).toBeTypeOf('function');
    if (!SdkMcpTransport) return;

    let error: unknown;
    try {
      await new SdkMcpTransport({
        endpoint: 'https://mcp.example.test/read',
        approvedEndpointOrigins: ['https://mcp.example.test'],
        authProvider: { token: async () => undefined },
        clientFactory: factory,
      }).call('get_accounts', {});
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ code: 'provider_http_error' });
    expect(String(error)).not.toContain('123456789');
    expect(String(error)).not.toContain('secret-token');
  });
});
