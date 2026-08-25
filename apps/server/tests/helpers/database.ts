import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { DatabaseClient, QueryResult } from '../../src/db/client';

export async function createTestDatabase(): Promise<{
  client: DatabaseClient;
  raw: PGlite;
  close: () => Promise<void>;
}> {
  const raw = new PGlite();
  await raw.waitReady;
  for (const filename of ['0000_initial.sql', '0001_light_jetstream.sql']) {
    const migration = await readFile(
      new URL(`../../drizzle/${filename}`, import.meta.url),
      'utf8',
    );
    await raw.exec(migration);
  }

  const wrap = (
    queryable: Pick<PGlite, 'query'>,
    canStartTransaction: boolean,
  ): DatabaseClient => {
    const client: DatabaseClient = {
      async query<T>(sql: string, params: readonly unknown[] = []) {
        const result = await queryable.query<T>(sql, [...params]);
        return {
          rows: result.rows,
          ...(result.affectedRows === undefined
            ? {}
            : { affectedRows: result.affectedRows }),
        } satisfies QueryResult<T>;
      },
      async transaction<T>(callback: (transaction: DatabaseClient) => Promise<T>) {
        if (!canStartTransaction) return callback(client);
        return raw.transaction((transaction) =>
          callback(wrap(transaction, false)),
        );
      },
      async close() {},
    };

    return client;
  };

  return {
    raw,
    client: wrap(raw, true),
    close: () => raw.close(),
  };
}
