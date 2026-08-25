import { afterEach, describe, expect, it } from 'vitest';
import { createRepositories } from '../../src/db/repositories';
import { createTestDatabase } from '../helpers/database';

const openDatabases: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((close) => close()));
});

describe('durable job coordination', () => {
  it('lets only one worker claim a refresh job', async () => {
    const database = await createTestDatabase();
    openDatabases.push(database.close);
    const { jobs, portfolios } = createRepositories(database.client);
    const ownerId = '00000000-0000-4000-8000-000000000001';
    await portfolios.createOwner({ id: ownerId, email: 'owner@example.test' });

    await jobs.enqueueUnique({
      userId: ownerId,
      kind: 'portfolio_refresh',
      key: 'refresh:owner',
      payload: { trigger: 'manual' },
    });

    const [first, second] = await Promise.all([
      jobs.claimNext('worker-a', 60),
      jobs.claimNext('worker-b', 60),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(first ?? second).toMatchObject({
      kind: 'portfolio_refresh',
      key: 'refresh:owner',
      status: 'running',
      attemptCount: 1,
    });
  });

  it('reclaims an expired lease without duplicating the job', async () => {
    const database = await createTestDatabase();
    openDatabases.push(database.close);
    const { jobs, portfolios } = createRepositories(database.client);
    const ownerId = '00000000-0000-4000-8000-000000000002';
    await portfolios.createOwner({ id: ownerId, email: 'owner2@example.test' });

    await jobs.enqueueUnique({
      userId: ownerId,
      kind: 'portfolio_refresh',
      key: 'refresh:owner2',
      payload: {},
    });
    const first = await jobs.claimNext('worker-a', -1);
    const reclaimed = await jobs.claimNext('worker-b', 60);

    expect(first).not.toBeNull();
    expect(reclaimed).toMatchObject({
      id: first?.id,
      leaseOwner: 'worker-b',
      attemptCount: 2,
    });
  });
});
