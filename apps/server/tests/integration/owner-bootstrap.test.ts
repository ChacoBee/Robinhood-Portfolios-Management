import { afterEach, describe, expect, it } from 'vitest';
import { createRepositories } from '../../src/db/repositories';
import {
  bootstrapConfiguredOwner,
  ownerRecordId,
} from '../../src/runtime/owner-bootstrap';
import { createTestDatabase } from '../helpers/database';

const closeDatabase: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeDatabase.splice(0).map((close) => close()));
});

describe('configured owner bootstrap', () => {
  it('idempotently creates the configured Clerk owner on a clean database', async () => {
    const database = await createTestDatabase();
    closeDatabase.push(database.close);
    const repositories = createRepositories(database.client);
    const input = {
      clerkUserId: 'user_owner123',
      email: 'Owner@Example.test',
    };

    const first = await bootstrapConfiguredOwner(repositories.portfolios, input);
    const second = await bootstrapConfiguredOwner(repositories.portfolios, {
      ...input,
      email: 'owner@example.test',
    });

    expect(first).toBe(ownerRecordId(input.clerkUserId));
    expect(second).toBe(first);
    const rows = await database.client.query<{
      id: string;
      email: string;
      clerk_user_id: string;
    }>('select id, email, clerk_user_id from users');
    expect(rows.rows).toEqual([
      {
        id: first,
        email: 'owner@example.test',
        clerk_user_id: 'user_owner123',
      },
    ]);
  });

  it('adopts a manually seeded owner whose email uses different casing', async () => {
    const database = await createTestDatabase();
    closeDatabase.push(database.close);
    const repositories = createRepositories(database.client);
    const seededId = '00000000-0000-4000-8000-000000000951';
    await database.client.query(
      'insert into users (id, email) values ($1, $2)',
      [seededId, 'Owner@Example.test'],
    );

    const deterministicId = await bootstrapConfiguredOwner(repositories.portfolios, {
      clerkUserId: 'user_owner123',
      email: 'owner@example.test',
    });

    expect(deterministicId).toBe(ownerRecordId('user_owner123'));
    await expect(database.client.query(
      'select id, email, clerk_user_id from users',
    )).resolves.toMatchObject({
      rows: [{ id: seededId, email: 'owner@example.test', clerk_user_id: 'user_owner123' }],
    });
  });

  it('fails explicitly when configured owner identities resolve to different rows', async () => {
    const database = await createTestDatabase();
    closeDatabase.push(database.close);
    const repositories = createRepositories(database.client);
    const deterministicId = ownerRecordId('user_owner123');
    await database.client.query(
      `insert into users (id, email, clerk_user_id) values
       ($1, 'first@example.test', null),
       ($2, 'owner@example.test', 'user_other')`,
      [deterministicId, '00000000-0000-4000-8000-000000000952'],
    );

    await expect(bootstrapConfiguredOwner(repositories.portfolios, {
      clerkUserId: 'user_owner123',
      email: 'owner@example.test',
    })).rejects.toThrow('configured_owner_identity_conflict');
  });
});
