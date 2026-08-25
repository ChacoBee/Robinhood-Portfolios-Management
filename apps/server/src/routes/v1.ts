import { createHash } from 'node:crypto';
import type { ApiEnvelope, PerformanceRange } from '@aurum/domain';
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { z } from 'zod';
import {
  publicErrorMessage,
  ReadModelSourceError,
  type PublicApiErrorCode,
} from '../read-models/errors';
import { assertPublicPayloadSafe } from '../read-models/privacy';
import type { PortfolioReadModelSource } from '../read-models/source';

const PerformanceQuerySchema = z
  .object({
    range: z.enum(['1W', '1M', '3M', 'YTD', '1Y', 'ALL']).default('1M'),
  })
  .strict();

const ResourceParamsSchema = z.object({
  id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
});
const EmptyObjectSchema = z.object({}).strict();

export interface PublicApiErrorEnvelope {
  error: {
    code: PublicApiErrorCode;
    message: string;
  };
  requestId: string;
  generatedAt: string;
}

function etagFor(data: unknown): string {
  return `"${createHash('sha256').update(JSON.stringify(data)).digest('hex')}"`;
}

function requestIdOf(request: FastifyRequest): string {
  return String(request.id);
}

async function sendData<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  data: T,
  now: () => Date,
  cacheable = true,
): Promise<ApiEnvelope<T> | void> {
  assertPublicPayloadSafe(data);
  if (cacheable) {
    const etag = etagFor(data);
    void reply.header('etag', etag);
    void reply.header('cache-control', 'private, no-cache');
    if (request.headers['if-none-match'] === etag) {
      return reply.code(304).send();
    }
  } else {
    void reply.header('cache-control', 'no-store');
  }

  return {
    data,
    requestId: requestIdOf(request),
    generatedAt: now().toISOString(),
  };
}

function assertNoQuery(request: FastifyRequest): void {
  if (!EmptyObjectSchema.safeParse(request.query).success) {
    throw new ReadModelSourceError('invalid_request', 400);
  }
}

function assertEmptyBody(request: FastifyRequest): void {
  if (request.body !== undefined && !EmptyObjectSchema.safeParse(request.body).success) {
    throw new ReadModelSourceError('invalid_request', 400);
  }
}

function parseParams(request: FastifyRequest): { id: string } {
  const parsed = ResourceParamsSchema.safeParse(request.params);
  if (!parsed.success) {
    throw new ReadModelSourceError('invalid_request', 400);
  }
  return parsed.data;
}

function parsePerformanceRange(request: FastifyRequest): PerformanceRange {
  const parsed = PerformanceQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    throw new ReadModelSourceError('invalid_request', 400);
  }
  return parsed.data.range;
}

function missing(): never {
  throw new ReadModelSourceError('not_found', 404);
}

export function apiErrorEnvelope(
  code: PublicApiErrorCode,
  requestId: string,
  now: () => Date,
): PublicApiErrorEnvelope {
  return {
    error: { code, message: publicErrorMessage(code) },
    requestId,
    generatedAt: now().toISOString(),
  };
}

export function registerV1Routes(
  app: FastifyInstance,
  source: PortfolioReadModelSource,
  now: () => Date = () => new Date(),
): void {
  app.get('/v1/dashboard', async (request, reply) => {
    assertNoQuery(request);
    return sendData(request, reply, await source.getDashboard(), now);
  });

  app.get('/v1/accounts', async (request, reply) => {
    assertNoQuery(request);
    return sendData(request, reply, await source.listAccounts(), now);
  });

  app.get('/v1/accounts/:id', async (request, reply) => {
    assertNoQuery(request);
    const data = await source.getAccount(parseParams(request).id);
    return sendData(request, reply, data ?? missing(), now);
  });

  app.get('/v1/holdings', async (request, reply) => {
    assertNoQuery(request);
    return sendData(request, reply, await source.listHoldings(), now);
  });

  app.get('/v1/holdings/:id', async (request, reply) => {
    assertNoQuery(request);
    const data = await source.getHolding(parseParams(request).id);
    return sendData(request, reply, data ?? missing(), now);
  });

  app.get('/v1/performance', async (request, reply) =>
    sendData(
      request,
      reply,
      await source.getPerformance(parsePerformanceRange(request)),
      now,
    ),
  );

  app.get('/v1/analytics', async (request, reply) => {
    assertNoQuery(request);
    return sendData(request, reply, await source.getAnalytics(), now);
  });

  app.get('/v1/activity/reconciliation', async (request, reply) => {
    assertNoQuery(request);
    return sendData(request, reply, await source.getReconciliation(), now);
  });

  app.get('/v1/activity', async (request, reply) => {
    assertNoQuery(request);
    return sendData(request, reply, await source.getActivity(), now);
  });

  app.get('/v1/alerts', async (request, reply) => {
    assertNoQuery(request);
    return sendData(request, reply, await source.getAlerts(), now);
  });

  app.post('/v1/refresh', async (request, reply) => {
    assertNoQuery(request);
    assertEmptyBody(request);
    return sendData(request, reply, await source.requestRefresh(), now, false);
  });

  app.get('/v1/health', async (request, reply) => {
    assertNoQuery(request);
    return sendData(request, reply, await source.getHealth(), now);
  });
}
