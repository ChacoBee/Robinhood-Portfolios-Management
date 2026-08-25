import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config';

describe('environment guards', () => {
  it('does not expose provider credentials in Demo mode', () => {
    expect(
      parseEnvironment({
        APP_MODE: 'demo',
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://should-not-be-read.example/db',
        ROBINHOOD_MCP_URL: 'https://should-not-be-read.example',
      }),
    ).toEqual({ APP_MODE: 'demo', NODE_ENV: 'production' });
  });

  it('rejects connected startup when a required secret or scope is absent', () => {
    expect(() =>
      parseEnvironment({
        APP_MODE: 'connected',
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/aurum',
        OWNER_EMAIL: 'owner@example.test',
      }),
    ).toThrow(/CLERK_SECRET_KEY|ROBINHOOD_MCP_URL|ROBINHOOD_READONLY_SCOPES/);
  });

  it('accepts a complete connected configuration', () => {
    expect(
      parseEnvironment({
        APP_MODE: 'connected',
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/aurum',
        OWNER_EMAIL: 'owner@example.test',
        CLERK_SECRET_KEY: 'sk_test_12345678901234567890',
        ROBINHOOD_MCP_URL: 'https://mcp.example.test/read',
        ROBINHOOD_READONLY_SCOPES: 'accounts:read,positions:read,history:read',
      }),
    ).toMatchObject({
      APP_MODE: 'connected',
      OWNER_EMAIL: 'owner@example.test',
    });
  });
});
