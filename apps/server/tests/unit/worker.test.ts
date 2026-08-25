import { describe, expect, it } from 'vitest';
import { startWorker } from '../../src/worker';

describe('connected worker composition', () => {
  it('fails closed without an injected verified authorization composition', async () => {
    await expect(
      startWorker({
        APP_MODE: 'connected',
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/aurum',
        OWNER_EMAIL: 'owner@example.test',
        CLERK_SECRET_KEY: 'sk_test_12345678901234567890',
        ACCOUNT_REFERENCE_ENCRYPTION_KEY: Buffer.alloc(32, 31).toString(
          'base64',
        ),
      }),
    ).rejects.toThrow('verified_robinhood_authorization_required');
  });
});
