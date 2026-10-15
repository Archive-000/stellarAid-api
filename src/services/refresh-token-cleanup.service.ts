/**
 * Refresh-token cleanup.
 *
 * Deletes tokens that can never be used again: expired ones immediately, and
 * revoked ones once they are older than the audit retention window
 * (`REVOKED_TOKEN_RETENTION_DAYS`).
 */

import { env } from '@/config';
import { logger } from '@/utils';
import { prisma } from '@/services';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RefreshTokenCleanupStats {
  readonly deleted: number;
}

export async function cleanupRefreshTokens(now: Date = new Date()): Promise<RefreshTokenCleanupStats> {
  const revokedCutoff = new Date(now.getTime() - env.revokedTokenRetentionDays * DAY_MS);

  const { count } = await prisma.refreshToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null, lt: revokedCutoff } }],
    },
  });

  logger.info('refresh-token-cleanup: run complete', { deleted: count });
  return { deleted: count };
}
