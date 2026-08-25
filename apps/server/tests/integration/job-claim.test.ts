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

  it('atomically blocks a superseded worker from promoting over the winner', async () => {
    const database = await createTestDatabase();
    openDatabases.push(database.close);
    const { jobs, portfolios } = createRepositories(database.client);
    const ownerId = '00000000-0000-4000-8000-000000000005';
    await portfolios.createOwner({ id: ownerId, email: 'owner5@example.test' });
    await jobs.enqueueUnique({
      userId: ownerId,
      kind: 'portfolio_refresh',
      key: 'refresh:owner5',
      payload: {},
    });
    const workerA = await jobs.claimNext('worker-a', -1);
    const workerB = await jobs.claimNext('worker-b', 60);
    expect(workerA?.id).toBe(workerB?.id);

    await portfolios.promoteSnapshot({
      id: '00000000-0000-4000-8000-000000000121',
      userId: ownerId,
      syncRunId: '00000000-0000-4000-8000-000000000221',
      totalValue: '120',
      asOf: '2026-08-25T14:01:00.000Z',
      coverage: 'complete',
      freshness: 'fresh',
      reconciliationStatus: 'reconciled',
      calculationVersion: 'portfolio-v1',
      payload: {},
      leaseGuard: { jobId: workerB!.id, workerId: 'worker-b' },
    });

    await expect(
      portfolios.promoteSnapshot({
        id: '00000000-0000-4000-8000-000000000122',
        userId: ownerId,
        syncRunId: '00000000-0000-4000-8000-000000000222',
        totalValue: '110',
        asOf: '2026-08-25T14:00:00.000Z',
        coverage: 'complete',
        freshness: 'fresh',
        reconciliationStatus: 'reconciled',
        calculationVersion: 'portfolio-v1',
        payload: {},
        leaseGuard: { jobId: workerA!.id, workerId: 'worker-a' },
      }),
    ).rejects.toThrow('job_lease_lost');
    expect(await portfolios.getCurrent(ownerId)).toMatchObject({
      id: '00000000-0000-4000-8000-000000000121',
      totalValue: '120',
    });
  });
});
