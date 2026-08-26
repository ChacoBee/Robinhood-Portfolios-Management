import { describe, expect, it, vi } from 'vitest';

describe('verify enrollment command', () => {
  it('accepts only a connected, decryptable Robinhood credential and closes its database handle', async () => {
    const { verifyEnrollment } = await import('../../src/verify-enrollment');
    const close = vi.fn();
    const load = vi.fn().mockResolvedValue({
      connectionState: 'connected',
      clientInformation: { client_id: 'synthetic-client' },
      tokens: { refresh_token: 'synthetic-refresh' },
    });

    await expect(verifyEnrollment({
      environment: {
        APP_MODE: 'connected', NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/aurum',
        OWNER_CLERK_USER_ID: 'user_owner123', OWNER_EMAIL: 'owner@example.test',
        ROBINHOOD_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 23).toString('base64'),
      },
      createDatabase: () => ({ close } as never),
      createRepositories: () => ({
        portfolios: { createOwner: vi.fn() },
        oauthCredentials: { load: vi.fn() },
      } as never),
      bootstrapOwner: vi.fn().mockResolvedValue('11111111-1111-5111-8111-111111111111'),
      createStore: () => ({ load }),
    })).resolves.toBeUndefined();

    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing', undefined],
    ['empty', {}],
    ['non-object', []],
  ])('rejects a %s decrypted client-information value', async (_kind, clientInformation) => {
    const { verifyEnrollment } = await import('../../src/verify-enrollment');
    const close = vi.fn();

    await expect(verifyEnrollment({
      environment: {
        APP_MODE: 'connected', NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/aurum',
        OWNER_CLERK_USER_ID: 'user_owner123', OWNER_EMAIL: 'owner@example.test',
        ROBINHOOD_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 23).toString('base64'),
      },
      createDatabase: () => ({ close } as never),
      createRepositories: () => ({
        portfolios: { createOwner: vi.fn() },
        oauthCredentials: { load: vi.fn() },
      } as never),
      bootstrapOwner: vi.fn().mockResolvedValue('11111111-1111-5111-8111-111111111111'),
      createStore: () => ({ load: vi.fn().mockResolvedValue({
        connectionState: 'connected',
        clientInformation,
        tokens: { refresh_token: 'synthetic-refresh' },
      }) }),
    })).rejects.toThrow('verified_robinhood_authorization_required');

    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing', undefined],
    ['empty', {}],
    ['non-object', []],
  ])('rejects a %s decrypted token-set value', async (_kind, tokens) => {
    const { verifyEnrollment } = await import('../../src/verify-enrollment');
    const close = vi.fn();

    await expect(verifyEnrollment({
      environment: {
        APP_MODE: 'connected', NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/aurum',
        OWNER_CLERK_USER_ID: 'user_owner123', OWNER_EMAIL: 'owner@example.test',
        ROBINHOOD_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 23).toString('base64'),
      },
      createDatabase: () => ({ close } as never),
      createRepositories: () => ({
        portfolios: { createOwner: vi.fn() },
        oauthCredentials: { load: vi.fn() },
      } as never),
      bootstrapOwner: vi.fn().mockResolvedValue('11111111-1111-5111-8111-111111111111'),
      createStore: () => ({ load: vi.fn().mockResolvedValue({
        connectionState: 'connected',
        clientInformation: { client_id: 'synthetic-client' },
        tokens,
      }) }),
    })).rejects.toThrow('verified_robinhood_authorization_required');

    expect(close).toHaveBeenCalledOnce();
  });

  it('fails closed without disclosing decryption errors', async () => {
    const { verifyEnrollment } = await import('../../src/verify-enrollment');
    const close = vi.fn();

    await expect(verifyEnrollment({
      environment: {
        APP_MODE: 'connected', NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/aurum',
        OWNER_CLERK_USER_ID: 'user_owner123', OWNER_EMAIL: 'owner@example.test',
        ROBINHOOD_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 23).toString('base64'),
      },
      createDatabase: () => ({ close } as never),
      createRepositories: () => ({
        portfolios: { createOwner: vi.fn() },
        oauthCredentials: { load: vi.fn() },
      } as never),
      bootstrapOwner: vi.fn().mockResolvedValue('11111111-1111-5111-8111-111111111111'),
      createStore: () => ({ load: vi.fn().mockRejectedValue(new Error('synthetic_decryption_failure')) }),
    })).rejects.toThrow('verified_robinhood_authorization_required');

    expect(close).toHaveBeenCalledOnce();
  });
});
