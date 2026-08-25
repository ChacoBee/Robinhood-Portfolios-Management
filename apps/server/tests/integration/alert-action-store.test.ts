import { afterEach, describe, expect, it } from 'vitest';
import { createPostgresAlertActionStore } from '../../src/alerts/postgres-action-store';
import { createTestDatabase } from '../helpers/database';

const closeDatabase: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeDatabase.splice(0).map((close) => close()));
});

describe('durable connected alert actions', () => {
  it('persists rules, read state, and mute state for the configured owner', async () => {
    const database = await createTestDatabase();
    closeDatabase.push(database.close);
    const ownerId = '00000000-0000-4000-8000-000000000801';
    await database.client.query(
      'insert into users (id, email) values ($1, $2)',
      [ownerId, 'alerts-owner@example.test'],
    );
    const store = createPostgresAlertActionStore({
      database: database.client,
      ownerEmail: 'alerts-owner@example.test',
      now: () => new Date('2026-08-25T15:00:00.000Z'),
    });
    const rule = await store.saveRule({
      kind: 'concentration_threshold',
      threshold: '0.25',
      scopeId: null,
      cooldownSeconds: 900,
      dailyCap: 3,
    });
    const alertId = '00000000-0000-4000-8000-000000000802';
    await database.client.query(
      `insert into alert_events (id, rule_id, fingerprint, state, evidence)
       values ($1, $2, $3, 'breach_confirmed', '{}'::jsonb)`,
      [alertId, rule.id, 'synthetic-alert-fingerprint'],
    );

    await expect(store.markRead(alertId)).resolves.toBe(true);
    await expect(
      store.mute(alertId, '2026-08-26T15:00:00.000Z'),
    ).resolves.toBe(true);

    const persisted = await database.client.query<{
      read_at: string | Date | null;
      muted_until: string | Date | null;
      threshold: Record<string, unknown> | string;
    }>(
      `select event.read_at, rule.muted_until, rule.threshold
       from alert_events event
       join alert_rules rule on rule.id = event.rule_id
       where event.id = $1`,
      [alertId],
    );
    expect(persisted.rows[0]?.read_at).not.toBeNull();
    expect(new Date(persisted.rows[0]!.muted_until!).toISOString()).toBe(
      '2026-08-26T15:00:00.000Z',
    );
    const threshold =
      typeof persisted.rows[0]!.threshold === 'string'
        ? JSON.parse(persisted.rows[0]!.threshold)
        : persisted.rows[0]!.threshold;
    expect(threshold).toEqual({ value: '0.25', scopeId: null });
  });

  it('does not mutate an alert outside the configured owner', async () => {
    const database = await createTestDatabase();
    closeDatabase.push(database.close);
    await database.client.query(
      `insert into users (id, email) values
       ('00000000-0000-4000-8000-000000000811', 'owner-a@example.test'),
       ('00000000-0000-4000-8000-000000000812', 'owner-b@example.test')`,
    );
    await database.client.query(
      `insert into alert_rules (
         id, user_id, kind, threshold, cooldown_seconds, daily_cap
       ) values ($1, $2, 'stale_sync', '{}'::jsonb, 900, 3)`,
      [
        '00000000-0000-4000-8000-000000000813',
        '00000000-0000-4000-8000-000000000812',
      ],
    );
    await database.client.query(
      `insert into alert_events (id, rule_id, fingerprint, state, evidence)
       values ($1, $2, 'owner-b-alert', 'breach_confirmed', '{}'::jsonb)`,
      [
        '00000000-0000-4000-8000-000000000814',
        '00000000-0000-4000-8000-000000000813',
      ],
    );
    const store = createPostgresAlertActionStore({
      database: database.client,
      ownerEmail: 'owner-a@example.test',
    });

    await expect(
      store.markRead('00000000-0000-4000-8000-000000000814'),
    ).resolves.toBe(false);
  });
});
