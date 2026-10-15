/**
 * Prisma client singleton and connection management.
 *
 * A single PrismaClient is shared across the process. The connection pool is
 * bounded via `connection_limit` in the datasource URL; startup connects
 * eagerly so a missing/unreachable database fails fast instead of surfacing
 * mid-request.
 */

import { PrismaClient } from '@prisma/client';
import { env } from '@/config';
import { logger } from '@/utils';

/** Append Prisma's `connection_limit` (from `DATABASE_POOL_SIZE`) so the pool
 * is bounded per instance. A `connection_limit` already in the URL wins. */
export function buildDatabaseUrl(
  databaseUrl: string = env.databaseUrl,
  poolSize: number = env.databasePoolSize,
): string {
  const url = new URL(databaseUrl);
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', String(poolSize));
  }
  return url.toString();
}

export const prisma = new PrismaClient({
  datasources: { db: { url: buildDatabaseUrl() } },
});

/** Establish the connection pool. Throws when the database is unreachable. */
export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connected');
}

/** Drain and close the connection pool. */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}
