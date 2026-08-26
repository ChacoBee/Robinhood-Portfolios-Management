import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../db/client';
import type { AlertActionStore } from '../routes/alert-actions';

export function createPostgresAlertActionStore(options: {
  database: DatabaseClient;
  ownerEmail: string;
  now?: () => Date;
}): AlertActionStore {
  const now = options.now ?? (() => new Date());

  async function ownerId(): Promise<string | null> {
    const result = await options.database.query<{ id: string }>(
      'select id from users where lower(email) = lower($1) limit 1',
      [options.ownerEmail],
    );
    return result.rows[0]?.id ?? null;
  }

  return {
    async markRead(alertId) {
      const owner = await ownerId();
      if (!owner) return false;
      const result = await options.database.query<{ id: string }>(
        `update alert_events event
         set read_at = $3::timestamptz
         from alert_rules rule
         where event.id = $1
           and event.rule_id = rule.id
           and rule.user_id = $2
         returning event.id`,
        [alertId, owner, now().toISOString()],
      );
      return result.rows.length === 1;
    },

    async mute(alertId, until) {
      const owner = await ownerId();
      if (!owner) return false;
      const result = await options.database.query<{ id: string }>(
        `update alert_rules rule
         set muted_until = $3::timestamptz
         where rule.user_id = $2
           and rule.id = (
             select event.rule_id
             from alert_events event
             where event.id = $1
           )
         returning rule.id`,
        [alertId, owner, until],
      );
      return result.rows.length === 1;
    },

    async saveRule(input) {
      const owner = await ownerId();
      if (!owner) throw new Error('alert_owner_unavailable');
      const id = randomUUID();
      await options.database.query(
        `insert into alert_rules (
           id, user_id, kind, enabled, threshold, baseline,
           cooldown_seconds, daily_cap
         ) values ($1, $2, $3, true, $4::jsonb, $5, $6, $7)`,
        [
          id,
          owner,
          input.kind,
          JSON.stringify({ value: input.threshold, scopeId: input.scopeId }),
          input.kind.includes('move') || input.kind === 'material_value_change'
            ? 'prior_regular_session_close'
            : null,
          input.cooldownSeconds,
          input.dailyCap,
        ],
      );
      return { id, enabled: true as const };
    },
  };
}
