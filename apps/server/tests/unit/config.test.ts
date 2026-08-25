import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config';

describe('environment guards', () => {
  const accountReferenceKey = Buffer.alloc(32, 19).toString('base64');

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

  it('rejects connected startup when a required server secret is absent', () => {
    expect(() =>
      parseEnvironment({
        APP_MODE: 'connected',
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/aurum',
        OWNER_EMAIL: 'owner@example.test',
      }),
    ).toThrow(/CLERK_SECRET_KEY|ACCOUNT_REFERENCE_ENCRYPTION_KEY/);
  });

  it('accepts a complete connected configuration', () => {
    expect(
      parseEnvironment({
        APP_MODE: 'connected',
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/aurum',
        OWNER_EMAIL: 'owner@example.test',
        CLERK_SECRET_KEY: 'sk_test_12345678901234567890',
        ACCOUNT_REFERENCE_ENCRYPTION_KEY: accountReferenceKey,
      }),
    ).toMatchObject({
      APP_MODE: 'connected',
      OWNER_EMAIL: 'owner@example.test',
    });
  });

  it('does not accept executable provider credentials or self-asserted scopes from env', () => {
    const parsed = parseEnvironment({
      APP_MODE: 'connected',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://localhost/aurum',
      OWNER_EMAIL: 'owner@example.test',
      CLERK_SECRET_KEY: 'sk_test_12345678901234567890',
      ROBINHOOD_MCP_URL: 'https://attacker.example/read',
      ROBINHOOD_MCP_BEARER_TOKEN:
        'synthetic_test_token_12345678901234567890',
      ROBINHOOD_READONLY_SCOPES: 'accounts:read,positions:read,orders:write',
      ACCOUNT_REFERENCE_ENCRYPTION_KEY: accountReferenceKey,
    });

    expect(parsed).not.toHaveProperty('ROBINHOOD_MCP_URL');
    expect(parsed).not.toHaveProperty('ROBINHOOD_MCP_BEARER_TOKEN');
    expect(parsed).not.toHaveProperty('ROBINHOOD_READONLY_SCOPES');
  });
});
