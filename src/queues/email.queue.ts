/**
 * Notification email queue.
 *
 * Producer side of the notification → email fan-out (#841). Jobs carry the
 * resolved recipient address and a render-ready payload; the worker
 * (src/workers/email.worker.ts) does the actual SMTP send.
 *
 * Degrades to a no-op (with a warning log) when `REDIS_URL` isn't
 * configured, matching the other queues' fallback behavior.
 */

import { Queue } from 'bullmq';

import { env } from '@/config';
import { logger } from '@/utils';

export const NOTIFICATION_EMAIL_QUEUE_NAME = 'notification-email';

export interface NotificationEmailJobData {
  readonly to: string;
  readonly type: string;
  readonly notificationId: string;
  readonly data: Record<string, unknown>;
}

let queue: Queue<NotificationEmailJobData> | undefined;

function getQueue(): Queue<NotificationEmailJobData> | undefined {
  if (env.redisUrl === undefined) {
    return undefined;
  }
  if (queue === undefined) {
    // BullMQ builds its own client from these options (see media.queue.ts).
    const connection = { url: env.redisUrl, maxRetriesPerRequest: null };
    queue = new Queue<NotificationEmailJobData>(NOTIFICATION_EMAIL_QUEUE_NAME, { connection });
  }
  return queue;
}

/**
 * Enqueues an async notification email. Callers treat this as fire-and-
 * forget: the DB notification is already committed and remains the source
 * of truth whether or not the email eventually sends.
 */
export async function enqueueNotificationEmail(data: NotificationEmailJobData): Promise<void> {
  const q = getQueue();
  if (q === undefined) {
    logger.warn('Notification email queue unavailable (no REDIS_URL); skipping', {
      notificationId: data.notificationId,
    });
    return;
  }
  await q.add('send-notification-email', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
}
