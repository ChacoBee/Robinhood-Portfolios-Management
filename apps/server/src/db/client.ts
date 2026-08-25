import postgres from 'postgres';

export interface QueryResult<T> {
  rows: T[];
  affectedRows?: number;
}

export interface DatabaseClient {
  query<T>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
  transaction<T>(callback: (transaction: DatabaseClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

type RawResult = Array<Record<string, unknown>> & { count?: number };

interface RawSqlExecutor {
  unsafe(query: string, params?: readonly unknown[]): Promise<RawResult>;
  begin?<T>(callback: (transaction: RawSqlExecutor) => Promise<T>): Promise<T>;
}

function wrapExecutor(
  executor: RawSqlExecutor,
  close: () => Promise<void>,
): DatabaseClient {
  const client: DatabaseClient = {
    async query<T>(query: string, params: readonly unknown[] = []) {
      const rows = await executor.unsafe(query, params);
      return {
        rows: rows as T[],
        ...(rows.count === undefined ? {} : { affectedRows: rows.count }),
      };
    },
    async transaction<T>(callback: (transaction: DatabaseClient) => Promise<T>) {
      if (!executor.begin) return callback(client);
      return executor.begin((transaction) =>
        callback(wrapExecutor(transaction, async () => {})),
      );
    },
    close,
  };

  return client;
}

export function createPostgresClient(databaseUrl: string): DatabaseClient {
  const sql = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

  return wrapExecutor(sql as unknown as RawSqlExecutor, () => sql.end({ timeout: 5 }));
}
