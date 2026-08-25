import { afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../helpers/database';

const openDatabases: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((close) => close()));
});

describe('initial PostgreSQL schema', () => {
  it('creates every durable portfolio boundary', async () => {
    const database = await createTestDatabase();
    openDatabases.push(database.close);

    const tables = await database.raw.query<{ tablename: string }>(
      `select tablename
       from pg_tables
       where schemaname = 'public'
       order by tablename`,
    );

    expect(tables.rows.map((row) => row.tablename)).toEqual(
      expect.arrayContaining([
        'users',
        'accounts',
        'securities',
        'position_observations',
        'cash_observations',
        'quote_observations',
        'account_snapshots',
        'portfolio_snapshots',
        'transactions',
        'import_batches',
        'import_rows',
        'sync_runs',
        'jobs',
        'benchmark_observations',
        'alert_rules',
        'alert_events',
        'notification_deliveries',
        'audit_events',
        'recovery_codes',
      ]),
    );
  });

  it('stores financial amounts as PostgreSQL numeric values', async () => {
    const database = await createTestDatabase();
    openDatabases.push(database.close);

    const result = await database.raw.query<{ data_type: string }>(
      `select data_type
       from information_schema.columns
       where table_name = 'portfolio_snapshots'
         and column_name = 'total_value'`,
    );

    expect(result.rows).toEqual([{ data_type: 'numeric' }]);
  });
});
