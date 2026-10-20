/**
 * Stellar nonce cleanup.
 *
 * Deletes expired (and optionally consumed) `StellarNonce` rows to prevent
 * unbounded table growth. Only nonces past their `expiresAt` are deleted —
 * unexpired nonces are never removed, preserving replay protection.
 */

import { logger } from '@/utils';
import { prisma } from '@/services';

export interface StellarNonceCleanupStats {
  readonly deleted: number;
}

export async function cleanupStellarNonces(now: Date = new Date()): Promise<StellarNonceCleanupStats> {
  const { count } = await prisma.stellarNonce.deleteMany({
    where: {
      expiresAt: { lt: now },
    },
  });

  logger.info('stellar-nonce-cleanup: run complete', { deleted: count });
  return { deleted: count };
}