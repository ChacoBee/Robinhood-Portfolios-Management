import { afterEach, describe, expect, it } from 'vitest';
import { createRepositories } from '../../src/db/repositories';
import { RobinhoodOAuthStore } from '../../src/robinhood/oauth-store';
import { createTestDatabase } from '../helpers/database';

const closeDatabase: Array<() => Promise<void>> = [];
const encryptionKey = Buffer.alloc(32, 41).toString('base64');

afterEach(async () => {
  await Promise.all(closeDatabase.splice(0).map((close) => close()));
});

async function createStore() {
  const database = await createTestDatabase();
  closeDatabase.push(database.close);
  const ownerId = '00000000-0000-4000-8000-000000000302';
  const repositories = createRepositories(database.client);
  await repositories.portfolios.createOwner({
    id: ownerId,
    email: 'owner@example.test',
  });
  return {
    database,
    ownerId,
    store: new RobinhoodOAuthStore(
      repositories.oauthCredentials,
      ownerId,
      encryptionKey,
    ),
  };
}

describe('Robinhood OAuth credential store', () => {
  it('does not create a connected grant from tokens without client information', async () => {
    const { database, ownerId, store } = await createStore();

    await expect(store.saveTokens({ refreshToken: 'synthetic-rotated' })).rejects.toThrow(
      'oauth_credentials_incomplete',
    );

    await expect(store.load()).resolves.toBeNull();
    await expect(database.client.query<{ count: number }>(
      `select count(*) as count from robinhood_oauth_credentials
       where user_id = $1 and provider = 'robinhood'`,
      [ownerId],
    )).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it('persists client information and tokens only as encrypted envelopes', async () => {
    const { database, ownerId, store } = await createStore();
    const clientInformation = { clientId: 'synthetic-client' };
    const tokens = { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' };

    await store.saveClientInformation(clientInformation);
    await store.saveTokens(tokens);

    expect(await store.load()).toMatchObject({
      clientInformation,
      tokens,
      connectionState: 'connected',
    });
    const rows = await database.client.query<{
      client_information: string | null;
      token_set: string | null;
    }>(
      `select client_information, token_set from robinhood_oauth_credentials
       where user_id = $1 and provider = 'robinhood'`,
      [ownerId],
    );
    expect(JSON.stringify(rows.rows)).not.toContain('synthetic-access');
    expect(JSON.stringify(rows.rows)).not.toContain('synthetic-refresh');
    expect(JSON.stringify(rows.rows)).not.toContain('synthetic-client');
  });

  it('atomically replaces the token envelope and keeps the client information', async () => {
    const { database, ownerId, store } = await createStore();
    await store.saveClientInformation({ clientId: 'synthetic-client' });
    await store.saveTokens({ refreshToken: 'synthetic-first' });

    await store.saveTokens({ refreshToken: 'synthetic-rotated' });

    await expect(store.load()).resolves.toMatchObject({
      clientInformation: { clientId: 'synthetic-client' },
      tokens: { refreshToken: 'synthetic-rotated' },
      connectionState: 'connected',
    });
    await expect(database.client.query<{ count: number }>(
      `select count(*) as count from robinhood_oauth_credentials
       where user_id = $1 and provider = 'robinhood'`,
      [ownerId],
    )).resolves.toMatchObject({ rows: [{ count: 1 }] });
  });

  it('records a heartbeat without decrypting or replacing credentials', async () => {
    const { store } = await createStore();
    await store.saveClientInformation({ clientId: 'synthetic-client' });
    await store.saveTokens({ refreshToken: 'synthetic-rotated' });

    await store.markHeartbeat();

    await expect(store.load()).resolves.toMatchObject({
      clientInformation: { clientId: 'synthetic-client' },
      tokens: { refreshToken: 'synthetic-rotated' },
      lastHeartbeatAt: expect.any(String),
    });
  });

  it('removes the owner provider credential row when disconnected', async () => {
    const { database, ownerId, store } = await createStore();
    await store.saveClientInformation({ clientId: 'synthetic-client' });
    await store.saveTokens({ refreshToken: 'synthetic-rotated' });

    await store.disconnect();

    await expect(store.load()).resolves.toBeNull();
    await expect(database.client.query<{ count: number }>(
      `select count(*) as count from robinhood_oauth_credentials
       where user_id = $1 and provider = 'robinhood'`,
      [ownerId],
    )).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });
});
