/**
 * Stellar nonce cleanup queue.
 *
 * A single repeatable job, scheduled to run daily. Degrades to a no-op
 * (with a warning log) when Redis isn't configured.
 */

import { Queue } from 'bullmq';

import { env } from '@/config';
import { logger } from '@/utils';

export const STELLAR_NONCE_CLEANUP_QUEUE_NAME = 'stellar-nonce-cleanup';
const DAILY_JOB_ID = 'stellar-nonce-cleanup-daily';
/** 04:30 every day, after the refresh token cleanup run. */
const DAILY_CRON = '30 4 * * *';

let queue: Queue | undefined;

function getQueue(): Queue | undefined {
  if (env.redisUrl === undefined) {
    return undefined;
  }
  if (queue === undefined) {
    const connection = { url: env.redisUrl, maxRetriesPerRequest: null };
    queue = new Queue(STELLAR_NONCE_CLEANUP_QUEUE_NAME, { connection });
  }
  return queue;
}

/** Registers the daily repeatable job; BullMQ dedupes by `jobId` across restarts. */
export async function scheduleDailyStellarNonceCleanup(): Promise<void> {
  const q = getQueue();
  if (q === undefined) {
    logger.warn('stellar-nonce-cleanup: REDIS_URL not configured, skipping schedule');
    return;
  }
  await q.add('cleanup', {}, { repeat: { pattern: DAILY_CRON }, jobId: DAILY_JOB_ID });
}