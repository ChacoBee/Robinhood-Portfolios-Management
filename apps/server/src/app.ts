import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
} from 'fastify';
import {
  authorizeOwner,
  type OwnerPrincipal,
  type TrustedOwnerVerifier,
} from './auth';
import type { AppEnvironment } from './config';
import type { RepositorySet } from './db/repositories';
import { createDemoReadModelSource } from './read-models/demo-source';
import { ReadModelSourceError } from './read-models/errors';
import type { PortfolioReadModelSource } from './read-models/source';
import { createUnavailableConnectedReadModelSource } from './read-models/unavailable-source';
import {
  registerAuthRoutes,
  type TrustedRecoveryComposition,
} from './routes/auth';
import {
  registerDeletionRoutes,
  type OwnerDeletionService,
} from './routes/delete';
import {
  registerAlertActionRoutes,
  type AlertActionStore,
} from './routes/alert-actions';
import {
  registerExportRoutes,
  type OwnerDataExportService,
} from './routes/export';
import {
  registerImportRoutes,
  type ImportRouteController,
} from './routes/imports';
import { registerSettingsRoutes } from './routes/settings';
import { apiErrorEnvelope, registerV1Routes } from './routes/v1';
import {
  ApiControlError,
  rateLimitPolicy,
  securityHeaders,
  verifyCsrfToken,
} from './security';

export interface ApiDependencies {
  repositories: RepositorySet | null;
  webOrigin?: string;
  readinessCheck?: () => Promise<boolean>;
  readModels?: PortfolioReadModelSource;
  now?: () => Date;
  ownerVerifier?: TrustedOwnerVerifier;
  recovery?: TrustedRecoveryComposition;
  dataExport?: OwnerDataExportService;
  deletion?: OwnerDeletionService;
  imports?: ImportRouteController;
  alerts?: AlertActionStore;
}

const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isV1Request(request: FastifyRequest): boolean {
  return request.url === '/v1' || request.url.startsWith('/v1/');
}

function headerRecord(
  request: FastifyRequest,
): Readonly<Record<string, string | readonly string[] | undefined>> {
  return Object.freeze({ ...request.headers });
}

function errorEnvelope(
  code: string,
  message: string,
  requestId: string,
  now: () => Date,
) {
  return {
    error: { code, message },
    requestId,
    generatedAt: now().toISOString(),
  };
}

export function createApi(
  config: AppEnvironment,
  dependencies: ApiDependencies,
): FastifyInstance {
  const now = dependencies.now ?? (() => new Date());
  // Keep Demo completely detached from the authentication composition. In
  // particular, do not even read a lazy ownerVerifier property in Demo mode.
  const ownerVerifier =
    config.APP_MODE === 'connected' ? dependencies.ownerVerifier : undefined;
  const recovery =
    config.APP_MODE === 'connected' ? dependencies.recovery : undefined;
  const dataExport =
    config.APP_MODE === 'connected' ? dependencies.dataExport : undefined;
  const deletion =
    config.APP_MODE === 'connected' ? dependencies.deletion : undefined;
  const imports =
    config.APP_MODE === 'connected' ? dependencies.imports : undefined;
  const alerts =
    config.APP_MODE === 'connected' ? dependencies.alerts : undefined;
  const exactWebOrigin =
    config.APP_MODE === 'connected' ? config.WEB_ORIGIN : dependencies.webOrigin;
  const readModels =
    dependencies.readModels ??
    (config.APP_MODE === 'demo'
      ? createDemoReadModelSource({ now })
      : createUnavailableConnectedReadModelSource());
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
    // Do not trust client-supplied forwarding headers by default. A deployment
    // may put Aurum behind a private ingress, but the API itself keys security
    // controls from the peer address unless an explicit trusted proxy policy is
    // added to the composition.
    trustProxy: false,
    requestIdHeader: 'x-request-id',
  });

  // This hook is intentionally registered before @fastify/rate-limit so the
  // plugin observes the stricter refresh policy when the route is added.
  app.addHook('onRoute', (routeOptions) => {
    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];
    if (
      routeOptions.url === '/v1/refresh' &&
      methods.some((method) => method.toUpperCase() === 'POST')
    ) {
      routeOptions.config = {
        ...routeOptions.config,
        rateLimit: rateLimitPolicy.refresh,
      };
    }
  });

  void app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
  });
  void app.register(cors, {
    origin: exactWebOrigin
      ? (origin, callback) => {
          callback(null, origin === exactWebOrigin);
        }
      : false,
    credentials: true,
  });
  void app.register(rateLimit, {
    global: true,
    ...rateLimitPolicy.reads,
  });

  const ownerByRequest = new WeakMap<FastifyRequest, OwnerPrincipal>();

  // The rate limiter runs at onRequest. Authenticate at preParsing so abusive
  // traffic is rejected before Clerk work, while untrusted bodies are not
  // parsed before the connected identity gate.
  app.addHook('preParsing', async (request) => {
    if (
      config.APP_MODE !== 'connected' ||
      request.method === 'OPTIONS' ||
      !isV1Request(request)
    ) {
      return;
    }

    if (!ownerVerifier) {
      throw new ApiControlError('authentication_unavailable', 503);
    }

    const suppliedOrigin = request.headers.origin;
    if (suppliedOrigin && suppliedOrigin !== config.WEB_ORIGIN) {
      throw new ApiControlError('authorization_denied', 403);
    }

    let principal;
    try {
      principal = await ownerVerifier.verify({
        method: request.method,
        url: new URL(request.url, config.WEB_ORIGIN).toString(),
        headers: headerRecord(request),
        expectedAuthorizedParty: config.WEB_ORIGIN,
        expectedIssuer: config.CLERK_ISSUER_URL,
      });
    } catch {
      throw new ApiControlError('authentication_required', 401);
    }

    let owner: OwnerPrincipal;
    try {
      owner = authorizeOwner(principal, {
        clerkUserId: config.OWNER_CLERK_USER_ID,
        email: config.OWNER_EMAIL,
        authorizedParty: config.WEB_ORIGIN,
      });
    } catch {
      throw new ApiControlError('authorization_denied', 403);
    }
    ownerByRequest.set(request, owner);

    if (stateChangingMethods.has(request.method) && request.headers.cookie) {
      const csrfToken = request.headers['x-csrf-token'];
      if (
        typeof csrfToken !== 'string' ||
        !verifyCsrfToken(owner.sessionId, csrfToken, config.CSRF_SECRET)
      ) {
        throw new ApiControlError('csrf_invalid', 403);
      }
    }
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    for (const [name, value] of Object.entries(securityHeaders)) {
      void reply.header(name, value);
    }
    if (!reply.hasHeader('cache-control')) {
      void reply.header('cache-control', 'no-store');
    }
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiControlError) {
      void reply.header('cache-control', 'no-store');
      return reply.code(error.statusCode).send(
        errorEnvelope(
          error.code,
          error.publicMessage,
          String(request.id),
          now,
        ),
      );
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      error.statusCode === 429
    ) {
      void reply.header('cache-control', 'no-store');
      return reply
        .code(429)
        .send(
          errorEnvelope(
            'rate_limited',
            'Too many requests.',
            String(request.id),
            now,
          ),
        );
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      (error.statusCode === 400 ||
        error.statusCode === 413 ||
        error.statusCode === 415)
    ) {
      void reply.header('cache-control', 'no-store');
      return reply
        .code(error.statusCode)
        .send(
          errorEnvelope(
            'invalid_request',
            'The request is invalid.',
            String(request.id),
            now,
          ),
        );
    }

    const sourceError =
      error instanceof ReadModelSourceError
        ? error
        : new ReadModelSourceError('internal_error', 500);
    if (!(error instanceof ReadModelSourceError)) {
      request.log.error(
        { errorCode: 'internal_error', requestId: String(request.id) },
        'api_request_failed',
      );
    }
    void reply.header('cache-control', 'no-store');
    return reply
      .code(sourceError.statusCode)
      .send(apiErrorEnvelope(sourceError.code, String(request.id), now));
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .send(apiErrorEnvelope('not_found', String(request.id), now)),
  );

  const getOwner = (request: FastifyRequest): OwnerPrincipal | null => {
    if (config.APP_MODE === 'demo') return null;
    const owner = ownerByRequest.get(request);
    if (!owner) {
      throw new ApiControlError('authentication_unavailable', 503);
    }
    return owner;
  };

  // @fastify/rate-limit installs an onRoute hook during plugin startup. Add
  // routes only after that startup completes so both global and per-route
  // policies are actually attached.
  app.after((pluginError) => {
    if (pluginError) throw pluginError;

    app.get('/health', async () => ({ status: 'ok' }));

    app.get('/ready', async (_request, reply) => {
      const infrastructureReady = dependencies.readinessCheck
        ? await dependencies.readinessCheck()
        : config.APP_MODE === 'demo' || dependencies.repositories !== null;
      const authenticationReady =
        config.APP_MODE === 'demo' || ownerVerifier !== undefined;
      if (!infrastructureReady || !authenticationReady) {
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

    registerV1Routes(app, readModels, now);
    registerImportRoutes(app, {
      mode: config.APP_MODE,
      ...(imports ? { controller: imports } : {}),
      ...(config.APP_MODE === 'connected'
        ? {
            assertMutationAuthorized: async (request) => {
              getOwner(request);
            },
          }
        : {}),
    });
    registerAlertActionRoutes(app, {
      mode: config.APP_MODE,
      ...(alerts ? { store: alerts } : {}),
      ...(config.APP_MODE === 'connected'
        ? {
            assertMutationAuthorized: async (request) => {
              getOwner(request);
            },
          }
        : {}),
      now,
    });
    registerAuthRoutes(app, {
      mode: config.APP_MODE,
      getOwner,
      now,
      ...(config.APP_MODE === 'connected'
        ? { csrfSecret: config.CSRF_SECRET }
        : {}),
      ...(recovery ? { recovery } : {}),
    });
    registerSettingsRoutes(app, {
      mode: config.APP_MODE,
      getOwner,
      now,
      exportEnabled: dataExport !== undefined,
      deletionEnabled: deletion !== undefined,
      ...(recovery ? { recovery } : {}),
    });
    registerExportRoutes(app, {
      getOwner,
      now,
      ...(dataExport ? { service: dataExport } : {}),
    });
    registerDeletionRoutes(app, {
      getOwner,
      now,
      ...(deletion ? { service: deletion } : {}),
    });
  });

  return app;
}
