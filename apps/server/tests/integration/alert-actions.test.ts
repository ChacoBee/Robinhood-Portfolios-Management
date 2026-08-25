import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerAlertActionRoutes } from '../../src/routes/alert-actions';

describe('alert action routes', () => {
  it('supports factual Demo inbox actions and bounded snooze', async () => {
    const app = Fastify();
    registerAlertActionRoutes(app, {
      mode: 'demo',
      now: () => new Date('2026-08-25T12:00:00.000Z'),
    });

    const read = await app.inject({ method: 'POST', url: '/v1/alerts/alert-concentration/read' });
    expect(read.statusCode).toBe(200);
    expect(read.json().data.state).toBe('read');

    const mute = await app.inject({
      method: 'POST',
      url: '/v1/alerts/alert-concentration/mute',
      payload: { until: '2026-08-26T12:00:00.000Z' },
    });
    expect(mute.statusCode).toBe(200);
    expect(mute.json().data.state).toBe('muted');

    const excessive = await app.inject({
      method: 'POST',
      url: '/v1/alerts/alert-concentration/mute',
      payload: { until: '2026-10-26T12:00:00.000Z' },
    });
    expect(excessive.statusCode).toBe(400);
    await app.close();
  });

  it('validates rule types and remains unavailable when connected persistence is absent', async () => {
    const demo = Fastify();
    registerAlertActionRoutes(demo, { mode: 'demo' });
    const created = await demo.inject({
      method: 'POST',
      url: '/v1/alert-rules',
      payload: {
        kind: 'concentration_threshold',
        threshold: '0.3',
        scopeId: null,
        cooldownSeconds: 3600,
        dailyCap: 3,
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().data).toMatchObject({ enabled: true });
    await demo.close();

    const connected = Fastify();
    registerAlertActionRoutes(connected, { mode: 'connected' });
    const unavailable = await connected.inject({
      method: 'POST',
      url: '/v1/alerts/alert-concentration/read',
    });
    expect(unavailable.statusCode).toBe(503);
    await connected.close();
  });
});
