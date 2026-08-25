import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ReadModelSourceError } from '../read-models/errors';

const IdParams = z.object({ id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/) });
const SnoozeBody = z.object({ until: z.string().datetime({ offset: true }) }).strict();
const RuleBody = z
  .object({
    kind: z.enum([
      'data_health_failure',
      'stale_sync',
      'portfolio_percentage_move',
      'holding_percentage_move',
      'concentration_threshold',
      'cash_threshold',
      'material_value_change',
    ]),
    threshold: z.string().regex(/^\d+(?:\.\d+)?$/),
    scopeId: z.string().min(1).max(128).nullable(),
    cooldownSeconds: z.number().int().min(300).max(604_800),
    dailyCap: z.number().int().min(1).max(24),
  })
  .strict();

export interface AlertActionStore {
  markRead(alertId: string): Promise<boolean>;
  mute(alertId: string, until: string | null): Promise<boolean>;
  saveRule(input: z.infer<typeof RuleBody>): Promise<{ id: string; enabled: true }>;
}

export class MemoryDemoAlertActionStore implements AlertActionStore {
  readonly states = new Map<string, { read: boolean; mutedUntil: string | null }>([
    ['alert-concentration', { read: false, mutedUntil: null }],
    ['alert-quote-stale', { read: true, mutedUntil: null }],
  ]);
  readonly rules = new Map<string, z.infer<typeof RuleBody>>();

  async markRead(alertId: string): Promise<boolean> {
    const state = this.states.get(alertId);
    if (!state) return false;
    state.read = true;
    return true;
  }

  async mute(alertId: string, until: string | null): Promise<boolean> {
    const state = this.states.get(alertId);
    if (!state) return false;
    state.mutedUntil = until;
    return true;
  }

  async saveRule(input: z.infer<typeof RuleBody>) {
    const id = `rule_${randomUUID()}`;
    this.rules.set(id, input);
    return { id, enabled: true as const };
  }
}

function envelope<T>(request: FastifyRequest, data: T) {
  return { data, requestId: String(request.id), generatedAt: new Date().toISOString() };
}

function notFound(): never {
  throw new ReadModelSourceError('not_found', 404);
}

function invalid(): never {
  throw new ReadModelSourceError('invalid_request', 400);
}

export function registerAlertActionRoutes(
  app: FastifyInstance,
  options: {
    mode: 'demo' | 'connected';
    store?: AlertActionStore;
    assertMutationAuthorized?: (request: FastifyRequest) => Promise<void>;
    now?: () => Date;
  },
): void {
  const store = options.store ?? (options.mode === 'demo' ? new MemoryDemoAlertActionStore() : null);
  const now = options.now ?? (() => new Date());
  const authorize = async (request: FastifyRequest) => {
    if (options.mode === 'connected' && !options.assertMutationAuthorized) {
      throw new ReadModelSourceError('source_unavailable', 503);
    }
    await options.assertMutationAuthorized?.(request);
    if (!store) throw new ReadModelSourceError('source_unavailable', 503);
    return store;
  };

  app.post('/v1/alerts/:id/read', async (request) => {
    const activeStore = await authorize(request);
    const params = IdParams.safeParse(request.params);
    if (!params.success) return invalid();
    if (!(await activeStore.markRead(params.data.id))) return notFound();
    return envelope(request, { alertId: params.data.id, state: 'read' as const });
  });

  app.post('/v1/alerts/:id/mute', async (request) => {
    const activeStore = await authorize(request);
    const params = IdParams.safeParse(request.params);
    const body = SnoozeBody.safeParse(request.body);
    if (!params.success || !body.success) return invalid();
    const until = new Date(body.data.until);
    const maximum = new Date(now().valueOf() + 30 * 24 * 60 * 60 * 1_000);
    if (until <= now() || until > maximum) return invalid();
    if (!(await activeStore.mute(params.data.id, until.toISOString()))) return notFound();
    return envelope(request, {
      alertId: params.data.id,
      state: 'muted' as const,
      mutedUntil: until.toISOString(),
    });
  });

  app.delete('/v1/alerts/:id/mute', async (request) => {
    const activeStore = await authorize(request);
    const params = IdParams.safeParse(request.params);
    if (!params.success) return invalid();
    if (!(await activeStore.mute(params.data.id, null))) return notFound();
    return envelope(request, { alertId: params.data.id, state: 'active' as const });
  });

  app.post('/v1/alert-rules', async (request) => {
    const activeStore = await authorize(request);
    const body = RuleBody.safeParse(request.body);
    if (!body.success) return invalid();
    return envelope(request, await activeStore.saveRule(body.data));
  });
}
