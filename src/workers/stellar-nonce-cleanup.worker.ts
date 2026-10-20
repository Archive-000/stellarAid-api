/**
 * Stellar nonce cleanup worker — processes jobs from the
 * `stellar-nonce-cleanup` queue. No-op without Redis.
 */

import { Worker } from 'bullmq';

import { env } from '@/config';
import { logger } from '@/utils';

import { cleanupStellarNonces } from '@/services';
import { STELLAR_NONCE_CLEANUP_QUEUE_NAME } from '@/queues';

export function startStellarNonceCleanupWorker(): Worker | undefined {
  if (env.redisUrl === undefined) {
    logger.warn('stellar-nonce-cleanup: REDIS_URL not configured, worker not started');
    return undefined;
  }

  const connection = { url: env.redisUrl, maxRetriesPerRequest: null };
  const worker = new Worker(
    STELLAR_NONCE_CLEANUP_QUEUE_NAME,
    async () => {
      await cleanupStellarNonces();
    },
    { connection },
  );

  worker.on('failed', (job, error) => {
    logger.error('stellar-nonce-cleanup: job failed', {
      jobId: job?.id,
      message: error.message,
    });
  });

  return worker;
}