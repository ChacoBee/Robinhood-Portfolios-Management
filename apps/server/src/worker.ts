import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseEnvironment } from './config';
import { createPostgresClient } from './db/client';
import { createRepositories } from './db/repositories';
import type { JobRecord, JobRepository } from './db/jobs';

export interface WorkerDependencies {
  jobs: JobRepository;
  handle: (job: JobRecord) => Promise<void>;
}

export async function runWorkerOnce(
  workerId: string,
  dependencies: WorkerDependencies,
): Promise<boolean> {
  const job = await dependencies.jobs.claimNext(workerId, 90);
  if (!job) return false;

  try {
    await dependencies.handle(job);
    await dependencies.jobs.complete(job.id, workerId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_worker_error';
    await dependencies.jobs.fail(job.id, workerId, message.slice(0, 500));
  }

  return true;
}

export async function startWorker(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const config = parseEnvironment(environment);
  if (config.APP_MODE !== 'connected') {
    throw new Error('The durable worker is available only in connected mode');
  }

  const database = createPostgresClient(config.DATABASE_URL);
  const repositories = createRepositories(database);
  const workerId = `worker-${randomUUID()}`;

  try {
    while (true) {
      const claimed = await runWorkerOnce(workerId, {
        jobs: repositories.jobs,
        async handle(job) {
          if (job.kind !== 'portfolio_refresh') {
            throw new Error(`unsupported_job_kind:${job.kind}`);
          }
          throw new Error('readonly_provider_adapter_not_configured');
        },
      });

      if (!claimed) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
  } finally {
    await database.close();
  }
}

const invokedFile = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (invokedFile === import.meta.url) {
  await startWorker();
}
