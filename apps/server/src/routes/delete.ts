import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { OwnerPrincipal } from '../auth';
import { hasRecentPasskey } from '../auth';
import { ReadModelSourceError } from '../read-models/errors';
import { ApiControlError, rateLimitPolicy } from '../security';

export const DELETE_CONFIRMATION_PHRASE = 'DELETE ALL AURUM DATA' as const;

const DeleteBodySchema = z
  .object({ confirmation: z.literal(DELETE_CONFIRMATION_PHRASE) })
  .strict();

export interface OwnerDeletionService {
  deleteOwnerData(input: {
    ownerId: string;
    ownerEmail: string;
    requestId: string;
  }): Promise<{
    deletionId: string;
    state: 'scheduled' | 'completed';
    backupExpiresAt: string;
  }>;
}

export interface DeletionRouteOptions {
  service?: OwnerDeletionService;
  getOwner(request: FastifyRequest): OwnerPrincipal | null;
  now?: () => Date;
}

export function registerDeletionRoutes(
  app: FastifyInstance,
  options: DeletionRouteOptions,
): void {
  const now = options.now ?? (() => new Date());

  app.get('/v1/delete/preview', async (request) => ({
    data: {
      state: options.service ? 'available' : 'disabled',
      confirmationPhrase: DELETE_CONFIRMATION_PHRASE,
      removes: ['live_records', 'exports', 'credentials', 'retained_source_objects'],
      backups: {
        individuallyRewritten: false,
        disposition: 'expire_under_documented_retention_policy',
      },
    },
    requestId: String(request.id),
    generatedAt: now().toISOString(),
  }));

  app.post(
    '/v1/delete',
    { config: { rateLimit: rateLimitPolicy.sensitive } },
    async (request, reply) => {
      if (!DeleteBodySchema.safeParse(request.body).success) {
        throw new ReadModelSourceError('invalid_request', 400);
      }
      const owner = options.getOwner(request);
      if (!owner || !options.service) {
        throw new ApiControlError('deletion_unavailable', 503);
      }
      if (!hasRecentPasskey(owner, now())) {
        throw new ApiControlError('recent_passkey_required', 403);
      }
      const result = await options.service.deleteOwnerData({
        ownerId: owner.clerkUserId,
        ownerEmail: owner.email,
        requestId: String(request.id),
      });
      return reply.code(202).send({
        data: result,
        requestId: String(request.id),
        generatedAt: now().toISOString(),
      });
    },
  );
}
