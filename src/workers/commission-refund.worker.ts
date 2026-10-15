/**
 * Commission refunds worker — processes jobs from the `commission-refunds`
 * queue (#874).
 *
 * Degrades to a no-op (with a warning log) when Redis isn't configured,
 * matching the queue's own fallback.
 */

import { Worker, type Job } from 'bullmq';

import { env } from '@/config';
import { processCommissionRefund } from '@/services/commission-refund.service';
import { logger } from '@/utils';

import {
  COMMISSION_REFUNDS_QUEUE_NAME,
  type CommissionRefundJobData,
} from '../queues/commission-refunds.queue';

let worker: Worker<CommissionRefundJobData> | undefined;

/** Started from `src/index.ts` alongside the HTTP server. No-op without `REDIS_URL`. */
export function startCommissionRefundWorker(): Worker<CommissionRefundJobData> | undefined {
  if (env.redisUrl === undefined) {
    logger.warn('commission-refunds: REDIS_URL not configured, worker not started');
    return undefined;
  }

  const connection = { url: env.redisUrl, maxRetriesPerRequest: null };
  worker = new Worker<CommissionRefundJobData>(
    COMMISSION_REFUNDS_QUEUE_NAME,
    async (job: Job<CommissionRefundJobData>) => {
      await processCommissionRefund(job.data.commissionId);
    },
    { connection },
  );

  worker.on('failed', (job, error) => {
    logger.error('commission-refunds: job failed', {
      commissionId: job?.data.commissionId,
      message: error.message,
    });
  });

  return worker;
}
