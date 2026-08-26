import { afterEach, describe, expect, it } from 'vitest';
import { createRepositories } from '../../src/db/repositories';
import { createTestDatabase } from '../helpers/database';

const openDatabases: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((close) => close()));
});

describe('last-good portfolio snapshots', () => {
  it('preserves the current snapshot after a failed sync run', async () => {
    const database = await createTestDatabase();
    openDatabases.push(database.close);
    const { portfolios } = createRepositories(database.client);
    const ownerId = '00000000-0000-4000-8000-000000000003';
    await portfolios.createOwner({ id: ownerId, email: 'owner3@example.test' });
    await portfolios.promoteSnapshot({
      id: '00000000-0000-4000-8000-000000000101',
      userId: ownerId,
      syncRunId: '00000000-0000-4000-8000-000000000201',
      totalValue: '128640.25',
      asOf: '2026-08-25T14:00:00.000Z',
      coverage: 'complete',
      freshness: 'fresh',
      reconciliationStatus: 'reconciled',
      calculationVersion: 'portfolio-v1',
      payload: { source: 'synthetic_fixture' },
    });

    const before = await portfolios.getCurrent(ownerId);
    await portfolios.recordFailedRun(ownerId, 'provider_timeout');

    expect(await portfolios.getCurrent(ownerId)).toEqual(before);
  });

  it('promotes a new immutable snapshot without deleting history', async () => {
    const database = await createTestDatabase();
    openDatabases.push(database.close);
    const { portfolios } = createRepositories(database.client);
    const ownerId = '00000000-0000-4000-8000-000000000004';
    await portfolios.createOwner({ id: ownerId, email: 'owner4@example.test' });

    for (const [id, value] of [
      ['00000000-0000-4000-8000-000000000111', '100'],
      ['00000000-0000-4000-8000-000000000112', '110'],
    ] as const) {
      await portfolios.promoteSnapshot({
        id,
        userId: ownerId,
        syncRunId:
          id.endsWith('111')
            ? '00000000-0000-4000-8000-000000000211'
            : '00000000-0000-4000-8000-000000000212',
        totalValue: value,
        asOf: '2026-08-25T14:00:00.000Z',
        coverage: 'complete',
        freshness: 'fresh',
        reconciliationStatus: 'reconciled',
        calculationVersion: 'portfolio-v1',
        payload: id.endsWith('111')
          ? { quality: { regularSessionCloseEligible: true } }
          : {},
      });
    }

    expect(await portfolios.getCurrent(ownerId)).toMatchObject({
      id: '00000000-0000-4000-8000-000000000112',
      totalValue: '110',
    });
    expect(await portfolios.countSnapshots(ownerId)).toBe(2);
    expect(await portfolios.listOwnerRefreshStates()).toContainEqual(
      expect.objectContaining({
        userId: ownerId,
        lastRegularCloseCheckpointAsOf: '2026-08-25T14:00:00.000Z',
      }),
    );
  });
});
