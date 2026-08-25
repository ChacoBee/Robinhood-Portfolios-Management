import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppEnvironment } from './config';
import type { RepositorySet } from './db/repositories';

export interface ApiDependencies {
  repositories: RepositorySet | null;
  webOrigin?: string;
  readinessCheck?: () => Promise<boolean>;
}

export function createApi(
  config: AppEnvironment,
  dependencies: ApiDependencies,
): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers.set-cookie',
          '*.token',
          '*.secret',
          '*.accountNumber',
        ],
        censor: '[REDACTED]',
      },
    },
    trustProxy: true,
    requestIdHeader: 'x-request-id',
  });

  void app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
  });
  void app.register(cors, {
    origin: dependencies.webOrigin ?? false,
    credentials: true,
  });
  void app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    void reply.header('cache-control', 'no-store');
    return payload;
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/ready', async (_request, reply) => {
    const ready = dependencies.readinessCheck
      ? await dependencies.readinessCheck()
      : config.APP_MODE === 'demo' || dependencies.repositories !== null;

    if (!ready) {
      return reply.code(503).send({ status: 'not_ready' });
    }

    return { status: 'ready', mode: config.APP_MODE };
  });

  app.get('/v1/status', async () => ({
    mode: config.APP_MODE,
    source:
      config.APP_MODE === 'demo'
        ? 'synthetic_demo'
        : 'server_side_readonly_adapter',
    liveBrokerageConnected: false,
  }));

  return app;
}
