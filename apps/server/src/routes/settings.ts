import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { OwnerPrincipal } from '../auth';
import { isTrustedRecoveryComposition, type TrustedRecoveryComposition } from './auth';

export interface SettingsRouteOptions {
  mode: 'demo' | 'connected';
  recovery?: TrustedRecoveryComposition;
  exportEnabled: boolean;
  deletionEnabled: boolean;
  getOwner(request: FastifyRequest): OwnerPrincipal | null;
  now?: () => Date;
}

export function registerSettingsRoutes(
  app: FastifyInstance,
  options: SettingsRouteOptions,
): void {
  const now = options.now ?? (() => new Date());
  app.get('/v1/settings', async (request) => {
    const owner = options.getOwner(request);
    return {
      data: {
        mode: options.mode,
        authentication: {
          state: owner ? 'verified_owner' : 'public_synthetic_demo',
          provider: owner ? 'clerk' : 'none',
          ownerEmail: owner?.email ?? null,
        },
        connection: {
          state: options.mode === 'connected' ? 'server_managed' : 'disconnected_demo',
          readOnly: true,
        },
        recovery: {
          state: isTrustedRecoveryComposition(options.recovery)
            ? 'available'
            : 'disabled',
          requirement: 'recovery_code_and_verified_email',
          capability: 'passkey_reenrollment_only',
        },
        export: { state: options.exportEnabled ? 'available' : 'disabled' },
        deletion: { state: options.deletionEnabled ? 'available' : 'disabled' },
        retention: {
          intradayObservationsDays: 30,
          importEvidenceDays: 90,
        },
        privacy: {
          screenPrivacyIsAuthorizationBoundary: false,
        },
      },
      requestId: String(request.id),
      generatedAt: now().toISOString(),
    };
  });
}
