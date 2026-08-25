import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from './client';
import type { SafeRefreshFailureCode } from '../sync/failure-codes';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface EnqueueJobInput {
  userId: string;
  kind: string;
  key: string;
  payload: Record<string, unknown>;
  availableAt?: string;
}

export interface JobRecord {
  id: string;
  userId: string;
  kind: string;
  key: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  availableAt: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  attemptCount: number;
  lastError: string | null;
}

export interface JobRepository {
  enqueueUnique(input: EnqueueJobInput): Promise<JobRecord>;
  claimNext(workerId: string, leaseSeconds?: number): Promise<JobRecord | null>;
  renewLease(
    jobId: string,
    workerId: string,
    leaseSeconds?: number,
  ): Promise<boolean>;
  complete(jobId: string, workerId: string): Promise<boolean>;
  fail(
    jobId: string,
    workerId: string,
    error: SafeRefreshFailureCode,
  ): Promise<boolean>;
}

interface JobRow {
  id: string;
  user_id: string;
  kind: string;
  dedupe_key: string;
  payload: Record<string, unknown> | string;
  status: JobStatus;
  available_at: string | Date;
  lease_owner: string | null;
  lease_expires_at: string | Date | null;
  attempt_count: number;
  last_error: string | null;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    key: row.dedupe_key,
    payload:
      typeof row.payload === 'string'
        ? (JSON.parse(row.payload) as Record<string, unknown>)
        : row.payload,
    status: row.status,
    availableAt: iso(row.available_at),
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at === null ? null : iso(row.lease_expires_at),
    attemptCount: Number(row.attempt_count),
    lastError: row.last_error,
  };
}

export function createJobRepository(database: DatabaseClient): JobRepository {
  return {
    async enqueueUnique(input) {
      const result = await database.query<JobRow>(
        `insert into jobs (
           id, user_id, kind, dedupe_key, payload, status, available_at
         ) values ($1, $2, $3, $4, $5::jsonb, 'queued', coalesce($6::timestamptz, now()))
         on conflict (dedupe_key) do update set
           status = case
             when jobs.status in ('completed', 'failed') then 'queued'
             else jobs.status
           end,
           payload = case
             when jobs.status in ('completed', 'failed') then excluded.payload
             else jobs.payload
           end,
           available_at = case
             when jobs.status in ('completed', 'failed') then excluded.available_at
             else jobs.available_at
           end,
           lease_owner = case
             when jobs.status in ('completed', 'failed') then null
             else jobs.lease_owner
           end,
           lease_expires_at = case
             when jobs.status in ('completed', 'failed') then null
             else jobs.lease_expires_at
           end,
           completed_at = case
             when jobs.status in ('completed', 'failed') then null
             else jobs.completed_at
           end,
           last_error = case
             when jobs.status in ('completed', 'failed') then null
             else jobs.last_error
           end,
           updated_at = now()
         returning *`,
        [
          randomUUID(),
          input.userId,
          input.kind,
          input.key,
          JSON.stringify(input.payload),
          input.availableAt ?? null,
        ],
      );

      const row = result.rows[0];
      if (!row) throw new Error('Failed to enqueue job');
      return mapJob(row);
    },

    async claimNext(workerId, leaseSeconds = 60) {
      const result = await database.query<JobRow>(
        `with candidate as (
           select id
           from jobs
           where (
             status = 'queued' and available_at <= now()
           ) or (
             status = 'running' and lease_expires_at <= now()
           )
           order by available_at asc, created_at asc
           for update skip locked
           limit 1
         )
         update jobs
         set status = 'running',
             lease_owner = $1,
             lease_expires_at = now() + ($2 * interval '1 second'),
             attempt_count = attempt_count + 1,
             updated_at = now()
         from candidate
         where jobs.id = candidate.id
         returning jobs.*`,
        [workerId, leaseSeconds],
      );

      return result.rows[0] ? mapJob(result.rows[0]) : null;
    },

    async complete(jobId, workerId) {
      const result = await database.query<{ id: string }>(
        `update jobs
         set status = 'completed',
             completed_at = now(),
             lease_owner = null,
             lease_expires_at = null,
             updated_at = now()
         where id = $1 and status = 'running' and lease_owner = $2
         returning id`,
        [jobId, workerId],
      );
      return result.rows.length === 1;
    },

    async renewLease(jobId, workerId, leaseSeconds = 60) {
      const result = await database.query<{ id: string }>(
        `update jobs
         set lease_expires_at = now() + ($3 * interval '1 second'),
             updated_at = now()
         where id = $1
           and status = 'running'
           and lease_owner = $2
           and lease_expires_at > now()
         returning id`,
        [jobId, workerId, leaseSeconds],
      );
      return result.rows.length === 1;
    },

    async fail(jobId, workerId, error) {
      const result = await database.query<{ id: string }>(
        `update jobs
         set status = 'failed',
             last_error = $3,
             lease_owner = null,
             lease_expires_at = null,
             updated_at = now()
         where id = $1 and status = 'running' and lease_owner = $2
         returning id`,
        [jobId, workerId, error],
      );
      return result.rows.length === 1;
    },
  };
}
