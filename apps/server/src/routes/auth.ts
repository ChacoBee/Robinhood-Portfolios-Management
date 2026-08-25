import type { FastifyInstance, FastifyRequest } from 'fastify';
import { hasRecentPasskey, type OwnerPrincipal } from '../auth';
import { ReadModelSourceError } from '../read-models/errors';
import { createCsrfToken, ApiControlError, rateLimitPolicy } from '../security';

export interface TrustedRecoveryComposition {
  readonly assurance: {
    readonly dualProof: 'recovery_code_and_verified_email';
    readonly resultingCapability: 'passkey_reenrollment_only';
  };
  regenerateRecoveryCodes(input: {
    ownerId: string;
    ownerEmail: string;
    requestId: string;
  }): Promise<{ codes: readonly string[] }>;
}

export interface AuthRouteOptions {
  mode: 'demo' | 'connected';
  csrfSecret?: string;
  recovery?: TrustedRecoveryComposition;
  getOwner(request: FastifyRequest): OwnerPrincipal | null;
  now?: () => Date;
}

function trustedRecovery(
  value: TrustedRecoveryComposition | undefined,
): value is TrustedRecoveryComposition {
  return (
    value?.assurance.dualProof === 'recovery_code_and_verified_email' &&
    value.assurance.resultingCapability === 'passkey_reenrollment_only'
  );
}

function envelope<T>(request: FastifyRequest, data: T, now: () => Date) {
  return {
    data,
    requestId: String(request.id),
    generatedAt: now().toISOString(),
  };
}

function assertEmptyBody(request: FastifyRequest): void {
  if (
    request.body !== undefined &&
    (request.body === null ||
      typeof request.body !== 'object' ||
      Array.isArray(request.body) ||
      Object.keys(request.body).length !== 0)
  ) {
    throw new ReadModelSourceError('invalid_request', 400);
  }
}

export function registerAuthRoutes(
  app: FastifyInstance,
  options: AuthRouteOptions,
): void {
  const now = options.now ?? (() => new Date());

  app.get('/v1/auth/session', async (request) => {
    const owner = options.getOwner(request);
    return envelope(
      request,
      owner
        ? {
            mode: 'connected' as const,
            state: 'verified_owner' as const,
            owner: {
              clerkUserId: owner.clerkUserId,
              email: owner.email,
            },
          }
        : {
            mode: 'demo' as const,
            state: 'public_synthetic_demo' as const,
            owner: null,
          },
      now,
    );
  });

  app.get('/v1/auth/csrf', async (request) => {
    const owner = options.getOwner(request);
    if (!owner || !options.csrfSecret) {
      throw new ApiControlError('authentication_unavailable', 503);
    }
    return envelope(
      request,
      { token: createCsrfToken(owner.sessionId, options.csrfSecret) },
      now,
    );
  });

  app.post(
    '/v1/auth/recovery-codes/regenerate',
    { config: { rateLimit: rateLimitPolicy.recovery } },
    async (request, reply) => {
      assertEmptyBody(request);
      const owner = options.getOwner(request);
      if (!owner || !trustedRecovery(options.recovery)) {
        throw new ApiControlError('recovery_unavailable', 503);
      }
      if (!hasRecentPasskey(owner, now())) {
        throw new ApiControlError('recent_passkey_required', 403);
      }
      const result = await options.recovery.regenerateRecoveryCodes({
        ownerId: owner.clerkUserId,
        ownerEmail: owner.email,
        requestId: String(request.id),
      });
      void reply.header('cache-control', 'no-store');
      return envelope(
        request,
        { state: 'generated' as const, codes: result.codes },
        now,
      );
    },
  );
}

export function isTrustedRecoveryComposition(
  value: TrustedRecoveryComposition | undefined,
): boolean {
  return trustedRecovery(value);
}
