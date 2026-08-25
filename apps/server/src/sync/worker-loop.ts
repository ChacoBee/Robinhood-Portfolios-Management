import { setTimeout as delay } from 'node:timers/promises';
import type { RefreshService } from './refresh-service';

export interface WorkerLoopOptions {
  workerId: string;
  idleDelayMs?: number;
  signal?: AbortSignal;
}

export async function runRefreshWorkerLoop(
  service: RefreshService,
  options: WorkerLoopOptions,
): Promise<void> {
  const idleDelayMs = options.idleDelayMs ?? 2_000;

  while (!options.signal?.aborted) {
    const result = await service.runNext(options.workerId);
    if (result.state === 'idle') {
      await delay(idleDelayMs, undefined, { signal: options.signal });
    }
  }
}
