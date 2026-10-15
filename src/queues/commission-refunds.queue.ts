/**
 * Commission refunds queue (#874).
 *
 * Producer side of the cancellation-refund pipeline: one job per refunded
 * commission, enqueued from inside `cancelCommission`'s transaction via
 * `scheduleCommissionRefund`. Degrades to a no-op (with a warning log) when
 * `REDIS_URL` isn't configured, matching the other queues.
 */

import { Queue } from 'bullmq';

import { env } from '@/config';
import { logger } from '@/utils';

export const COMMISSION_REFUNDS_QUEUE_NAME = 'commission-refunds';

export interface CommissionRefundJobData {
  readonly commissionId: string;
  readonly refundId: string;
}

let queue: Queue<CommissionRefundJobData> | undefined;

function getQueue(): Queue<CommissionRefundJobData> | undefined {
  if (env.redisUrl === undefined) {
    return undefined;
  }
  if (queue === undefined) {
    // BullMQ builds its own client from these options (see media.queue.ts).
    const connection = { url: env.redisUrl, maxRetriesPerRequest: null };
    queue = new Queue<CommissionRefundJobData>(COMMISSION_REFUNDS_QUEUE_NAME, { connection });
  }
  return queue;
}

/** Enqueues background processing for one commission's refund. */
export async function enqueueCommissionRefund(data: CommissionRefundJobData): Promise<void> {
  const q = getQueue();
  if (q === undefined) {
    logger.warn('commission-refunds: REDIS_URL not configured, skipping enqueue', {
      commissionId: data.commissionId,
    });
    return;
  }
  await q.add('process-commission-refund', data, {
    // Deterministic dedupe: one in-flight job per commission. Combined with
    // the PENDING → PROCESSING claim this keeps retries idempotent (#874).
    jobId: `commission-refund-${data.commissionId}`,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
}
