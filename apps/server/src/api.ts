import { pathToFileURL } from 'node:url';
import { createApi, type ApiDependencies } from './app';
import { parseEnvironment } from './config';
import { createPostgresClient } from './db/client';
import { createRepositories } from './db/repositories';
import { createPostgresAlertActionStore } from './alerts/postgres-action-store';
import {
  createConnectedReadModelSource,
  type ConnectedHealthProbeResult,
} from './read-models/connected-source';
import { loadTrustedComposition } from './runtime/composition-loader';
import { bootstrapConfiguredOwner } from './runtime/owner-bootstrap';

export type TrustedApiComposition = Pick<
  ApiDependencies,
  | 'ownerVerifier'
  | 'recovery'
  | 'dataExport'
  | 'deletion'
  | 'imports'
  | 'alerts'
> & {
  connectedHealthProbe?: () => Promise<ConnectedHealthProbeResult>;
};

export async function startApi(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  trustedComposition?: TrustedApiComposition,
) {
  const config = parseEnvironment(environment);
  const resolvedComposition =
    config.APP_MODE === 'connected'
      ? trustedComposition ??
        (await loadTrustedComposition<TrustedApiComposition>(
          environment.AURUM_TRUSTED_COMPOSITION_MODULE,
          'createApiComposition',
        ))
      : null;
  const connectedOwnerVerifier = resolvedComposition?.ownerVerifier;
  if (config.APP_MODE === 'connected' && !connectedOwnerVerifier) {
    throw new Error('trusted_api_composition_required');
  }
  if (
    config.APP_MODE === 'connected' &&
    !resolvedComposition?.connectedHealthProbe
  ) {
    throw new Error('connected_health_probe_required');
  }
  const database =
    config.APP_MODE === 'connected'
      ? createPostgresClient(config.DATABASE_URL)
      : null;
  const repositories = database ? createRepositories(database) : null;
  if (repositories && config.APP_MODE === 'connected') {
    try {
      await bootstrapConfiguredOwner(repositories.portfolios, {
        clerkUserId: config.OWNER_CLERK_USER_ID,
        email: config.OWNER_EMAIL,
      });
    } catch (error) {
      await database?.close();
      throw error;
    }
  }
  let app: ReturnType<typeof createApi> | null = null;
  try {
    const connectedHealthProbe = resolvedComposition?.connectedHealthProbe;
    const connectedComposition =
    config.APP_MODE === 'connected' && resolvedComposition
      ? {
          ownerVerifier: connectedOwnerVerifier!,
          ...(resolvedComposition.recovery
            ? { recovery: resolvedComposition.recovery }
            : {}),
          ...(resolvedComposition.dataExport
            ? { dataExport: resolvedComposition.dataExport }
            : {}),
          ...(resolvedComposition.deletion
            ? { deletion: resolvedComposition.deletion }
            : {}),
          ...(resolvedComposition.imports
            ? { imports: resolvedComposition.imports }
            : {}),
          ...(resolvedComposition.alerts
            ? { alerts: resolvedComposition.alerts }
            : database
              ? {
                  alerts: createPostgresAlertActionStore({
                    database,
                    ownerEmail: config.OWNER_EMAIL,
                  }),
                }
              : {}),
        }
      : {};
    app = createApi(config, {
    repositories,
    ...(config.APP_MODE === 'demo' && environment.WEB_ORIGIN
      ? { webOrigin: environment.WEB_ORIGIN }
      : {}),
    ...connectedComposition,
    ...(database && repositories && config.APP_MODE === 'connected'
      ? {
          readModels: createConnectedReadModelSource({
            database,
            jobs: repositories.jobs,
            ownerEmail: config.OWNER_EMAIL,
            ...(connectedHealthProbe
              ? { healthProbe: connectedHealthProbe }
              : {}),
          }),
        }
      : {}),
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
  } catch (error) {
    if (app) {
      try {
        await app.close();
      } catch {
        await database?.close();
      }
    } else {
      await database?.close();
    }
    throw error;
  }
}

const invokedFile = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (invokedFile === import.meta.url) {
  await startApi();
}
