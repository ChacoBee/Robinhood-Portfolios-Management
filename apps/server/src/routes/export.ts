import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { OwnerPrincipal } from '../auth';
import { hasRecentPasskey } from '../auth';
import { ApiControlError, rateLimitPolicy } from '../security';
import { ReadModelSourceError } from '../read-models/errors';

export interface OwnerDataExportService {
  createExport(input: {
    ownerId: string;
    ownerEmail: string;
    requestId: string;
  }): Promise<{
    exportId: string;
    state: 'queued' | 'ready';
    expiresAt: string | null;
  }>;
}

export interface ExportRouteOptions {
  service?: OwnerDataExportService;
  getOwner(request: FastifyRequest): OwnerPrincipal | null;
  now?: () => Date;
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

export function registerExportRoutes(
  app: FastifyInstance,
  options: ExportRouteOptions,
): void {
  const now = options.now ?? (() => new Date());

  app.get('/v1/export/preview', async (request) => ({
    data: {
      state: options.service ? 'available' : 'disabled',
      format: 'encrypted_archive',
      includes: ['normalized_portfolio_data', 'audit_events', 'import_lineage'],
      excludes: ['provider_credentials', 'session_tokens', 'recovery_code_hashes'],
    },
    requestId: String(request.id),
    generatedAt: now().toISOString(),
  }));

  app.post(
    '/v1/export',
    { config: { rateLimit: rateLimitPolicy.sensitive } },
    async (request, reply) => {
      assertEmptyBody(request);
      const owner = options.getOwner(request);
      if (!owner || !options.service) {
        throw new ApiControlError('export_unavailable', 503);
      }
      if (!hasRecentPasskey(owner, now())) {
        throw new ApiControlError('recent_passkey_required', 403);
      }
      const result = await options.service.createExport({
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
