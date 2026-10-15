/**
 * Refresh-token cleanup worker — processes jobs from the
 * `refresh-token-cleanup` queue. No-op without Redis.
 */

import { Worker } from 'bullmq';

import { env } from '@/config';
import { logger } from '@/utils';

import { cleanupRefreshTokens } from '@/services';
import { REFRESH_TOKEN_CLEANUP_QUEUE_NAME } from '@/queues';

export function startRefreshTokenCleanupWorker(): Worker | undefined {
  if (env.redisUrl === undefined) {
    logger.warn('refresh-token-cleanup: REDIS_URL not configured, worker not started');
    return undefined;
  }

  const connection = { url: env.redisUrl, maxRetriesPerRequest: null };
  const worker = new Worker(
    REFRESH_TOKEN_CLEANUP_QUEUE_NAME,
    async () => {
      await cleanupRefreshTokens();
    },
    { connection },
  );

  worker.on('failed', (job, error) => {
    logger.error('refresh-token-cleanup: job failed', {
      jobId: job?.id,
      message: error.message,
    });
  });

  return worker;
}
