/**
 * Refresh-token cleanup queue.
 *
 * A single repeatable job, scheduled to run daily. Degrades to a no-op
 * (with a warning log) when Redis isn't configured.
 */

import { Queue } from 'bullmq';

import { env } from '@/config';
import { logger } from '@/utils';

export const REFRESH_TOKEN_CLEANUP_QUEUE_NAME = 'refresh-token-cleanup';
const DAILY_JOB_ID = 'refresh-token-cleanup-daily';
/** 04:00 every day, after the media cleanup run. */
const DAILY_CRON = '0 4 * * *';

let queue: Queue | undefined;

function getQueue(): Queue | undefined {
  if (env.redisUrl === undefined) {
    return undefined;
  }
  if (queue === undefined) {
    const connection = { url: env.redisUrl, maxRetriesPerRequest: null };
    queue = new Queue(REFRESH_TOKEN_CLEANUP_QUEUE_NAME, { connection });
  }
  return queue;
}

/** Registers the daily repeatable job; BullMQ dedupes by `jobId` across restarts. */
export async function scheduleDailyRefreshTokenCleanup(): Promise<void> {
  const q = getQueue();
  if (q === undefined) {
    logger.warn('refresh-token-cleanup: REDIS_URL not configured, skipping schedule');
    return;
  }
  await q.add('cleanup', {}, { repeat: { pattern: DAILY_CRON }, jobId: DAILY_JOB_ID });
}
