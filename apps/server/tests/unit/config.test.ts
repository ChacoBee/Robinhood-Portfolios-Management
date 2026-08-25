import { describe, expect, it } from 'vitest';
import { parseEnvironment, parseMigrationDatabaseUrl } from '../../src/config';

describe('environment guards', () => {
  const accountReferenceKey = Buffer.alloc(32, 19).toString('base64');

  const connectedEnvironment = {
    APP_MODE: 'connected',
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://localhost/aurum?sslmode=verify-full',
    OWNER_CLERK_USER_ID: 'user_owner123',
    OWNER_EMAIL: 'owner@example.test',
    WEB_ORIGIN: 'https://portfolio.example.test',
    CLERK_PUBLISHABLE_KEY: 'pk_live_synthetic_public_identity_12345',
    CLERK_ISSUER_URL: 'https://synthetic.clerk.accounts.dev',
    CLERK_SECRET_KEY: 'sk_test_12345678901234567890',
    CSRF_SECRET: 'synthetic-csrf-secret-is-at-least-32-chars',
    ACCOUNT_REFERENCE_ENCRYPTION_KEY: accountReferenceKey,
  } as const;

  it('validates the migration URL and enforces production TLS', () => {
    expect(
      parseMigrationDatabaseUrl('postgresql://localhost/aurum', 'test'),
    ).toBe('postgresql://localhost/aurum');
    expect(() =>
      parseMigrationDatabaseUrl('postgresql://localhost/aurum', 'production'),
    ).toThrow('sslmode=verify-full');
    expect(
      parseMigrationDatabaseUrl(
        'postgresql://db.example.test/aurum?sslmode=verify-full',
        'production',
      ),
    ).toContain('sslmode=verify-full');
  });

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
        ...connectedEnvironment,
        CSRF_SECRET: undefined,
      }),
    ).toThrow(/CSRF_SECRET/);
  });

  it('requires PostgreSQL and verified TLS in connected production', () => {
    expect(() =>
      parseEnvironment({
        ...connectedEnvironment,
        DATABASE_URL: 'https://database.example.test/aurum',
      }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      parseEnvironment({
        ...connectedEnvironment,
        DATABASE_URL: 'postgresql://database.example.test/aurum',
      }),
    ).toThrow(/verify-full/);
  });

  it('requires an exact owner identity and normalizes the verified-email allowlist', () => {
    expect(
      parseEnvironment({
        ...connectedEnvironment,
        OWNER_EMAIL: ' Owner@Example.test ',
      }),
    ).toMatchObject({
      APP_MODE: 'connected',
      OWNER_CLERK_USER_ID: 'user_owner123',
      OWNER_EMAIL: 'owner@example.test',
      WEB_ORIGIN: 'https://portfolio.example.test',
      CLERK_PUBLISHABLE_KEY: 'pk_live_synthetic_public_identity_12345',
      CLERK_ISSUER_URL: 'https://synthetic.clerk.accounts.dev',
    });
  });

  it.each([
    ['http://portfolio.example.test', 'https'],
    ['https://portfolio.example.test/', 'origin'],
    ['https://portfolio.example.test/app', 'origin'],
    ['https://portfolio.example.test?debug=true', 'origin'],
  ])('rejects a non-exact WEB_ORIGIN %s', (WEB_ORIGIN) => {
    expect(() =>
      parseEnvironment({ ...connectedEnvironment, WEB_ORIGIN }),
    ).toThrow(/WEB_ORIGIN/);
  });

  it('rejects a connected identity without the immutable Clerk owner ID', () => {
    expect(() =>
      parseEnvironment({ ...connectedEnvironment, OWNER_CLERK_USER_ID: undefined }),
    ).toThrow(/OWNER_CLERK_USER_ID/);
  });

  it('does not accept executable provider credentials or self-asserted scopes from env', () => {
    const parsed = parseEnvironment({
      ...connectedEnvironment,
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
