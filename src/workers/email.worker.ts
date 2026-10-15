/**
 * Notification email worker — processes jobs from the `notification-email`
 * queue (#841).
 *
 * Renders a plain-text summary of the notification and sends it over SMTP
 * via Nodemailer. Degrades to a no-op (with a warning log) when Redis or
 * SMTP isn't configured, matching the queue's own fallback.
 */

import { Worker, type Job } from 'bullmq';
import nodemailer from 'nodemailer';

import { env } from '@/config';
import { logger } from '@/utils';

import {
  NOTIFICATION_EMAIL_QUEUE_NAME,
  type NotificationEmailJobData,
} from '../queues/email.queue';

type Transporter = ReturnType<typeof nodemailer.createTransport>;

let transporter: Transporter | undefined;

function getTransporter(): Transporter | undefined {
  if (env.smtp === undefined) {
    return undefined;
  }
  if (transporter === undefined) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      auth: env.smtp.user !== undefined && env.smtp.pass !== undefined
        ? { user: env.smtp.user, pass: env.smtp.pass }
        : undefined,
    });
  }
  return transporter;
}

const SUBJECT_BY_TYPE: Record<string, string> = {
  ORDER_UPDATE: 'Your order was updated',
  COMMISSION_UPDATE: 'Your commission was updated',
  MESSAGE: 'You have a new message',
  REVIEW: 'You have a new review',
  SYSTEM: 'Platform notification',
};

function renderPlain(job: NotificationEmailJobData): string {
  const subject = SUBJECT_BY_TYPE[job.type] ?? 'Platform notification';
  const details = Object.entries(job.data)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('\n');
  return `${subject}\n\n${details}\n\nYou can also view this in the app under Notifications.`;
}

async function sendNotificationEmail(job: Job<NotificationEmailJobData>): Promise<void> {
  const transport = getTransporter();
  if (transport === undefined) {
    logger.warn('notification-email: SMTP not configured; skipping send', {
      notificationId: job.data.notificationId,
    });
    return;
  }
  const subject = SUBJECT_BY_TYPE[job.data.type] ?? 'Platform notification';
  await transport.sendMail({
    from: env.smtp?.user ?? 'no-reply@lumora.app',
    to: job.data.to,
    subject,
    text: renderPlain(job.data),
  });
  logger.info('notification-email: sent', { notificationId: job.data.notificationId });
}

/** Started from `src/index.ts` alongside the HTTP server. No-op without `REDIS_URL`. */
export function startEmailWorker(): Worker<NotificationEmailJobData> | undefined {
  if (env.redisUrl === undefined) {
    logger.warn('notification-email: REDIS_URL not configured, worker not started');
    return undefined;
  }

  const connection = { url: env.redisUrl, maxRetriesPerRequest: null };
  const worker = new Worker<NotificationEmailJobData>(
    NOTIFICATION_EMAIL_QUEUE_NAME,
    sendNotificationEmail,
    { connection },
  );

  worker.on('failed', (job, err) => {
    logger.error('notification-email: job failed', {
      notificationId: job?.data.notificationId,
      message: err.message,
    });
  });

  return worker;
}
