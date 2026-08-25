import { pathToFileURL } from 'node:url';
import { createApi } from './app';
import { parseEnvironment } from './config';
import { createPostgresClient } from './db/client';
import { createRepositories } from './db/repositories';

export async function startApi(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const config = parseEnvironment(environment);
  const database =
    config.APP_MODE === 'connected'
      ? createPostgresClient(config.DATABASE_URL)
      : null;
  const repositories = database ? createRepositories(database) : null;
  const app = createApi(config, {
    repositories,
    ...(environment.WEB_ORIGIN ? { webOrigin: environment.WEB_ORIGIN } : {}),
    ...(database
      ? {
          readinessCheck: async () => {
            try {
              await database.query('select 1');
              return true;
            } catch {
              return false;
            }
          },
        }
      : {}),
  });

  if (database) {
    app.addHook('onClose', async () => database.close());
  }

  const port = Number(environment.API_PORT ?? 8787);
  const host = environment.API_HOST ?? '127.0.0.1';
  await app.listen({ port, host });
  return app;
}

const invokedFile = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (invokedFile === import.meta.url) {
  await startApi();
}
