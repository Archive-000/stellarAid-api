/**
 * Generic Redis cache-aside helper, shared by every read-heavy endpoint
 * that needs caching (artwork listings, category lists, trending,
 * recommended, artist profiles).
 *
 * Degrades to calling `fetcher` directly (no caching, no error) when Redis
 * isn't configured — the same fallback convention as the rest of this
 * codebase's optional-Redis features.
 */

import { tryGetRedisClient } from './redis.service';

export interface CacheMetrics {
  hits: number;
  misses: number;
}

const metrics = new Map<string, CacheMetrics>();

function metricsFor(namespace: string): CacheMetrics {
  let entry = metrics.get(namespace);
  if (entry === undefined) {
    entry = { hits: 0, misses: 0 };
    metrics.set(namespace, entry);
  }
  return entry;
}

/** Hit/miss counters recorded so far, per cache namespace. Read by a
 * metrics/health endpoint or logged periodically — see `logCacheMetrics`. */
export function getCacheMetrics(): ReadonlyMap<string, Readonly<CacheMetrics>> {
  return metrics;
}

/** Logs current hit rates per namespace (console — this codebase has no
 * dedicated structured logger). Call periodically (e.g. from a scheduled
 * job) or on demand; it's side-effect-free otherwise. */
export function logCacheMetrics(): void {
  for (const [namespace, { hits, misses }] of metrics) {
    const total = hits + misses;
    const hitRate = total === 0 ? 0 : Math.round((hits / total) * 100);
    console.log(`[cache] ${namespace}: ${hits} hits, ${misses} misses (${hitRate}% hit rate)`);
  }
}

function namespaceOf(key: string): string {
  return key.split(':')[0] ?? key;
}

/**
 * Cache-aside read: serve `key` from Redis if present, otherwise call
 * `fetcher`, cache its result for `ttlSeconds`, and return it.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const redis = tryGetRedisClient();
  if (redis === undefined) {
    return fetcher();
  }

  const namespace = namespaceOf(key);
  const hit = await redis.get(key);
  if (hit !== null) {
    metricsFor(namespace).hits += 1;
    return JSON.parse(hit) as T;
  }

  metricsFor(namespace).misses += 1;
  const value = await fetcher();
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  return value;
}

/**
 * Deletes specific cache keys (as opposed to a whole namespace). No-op when
 * Redis isn't configured — same degradation as `cached`/`invalidateNamespace`.
 */
export async function invalidateKeys(...keys: string[]): Promise<void> {
  const redis = tryGetRedisClient();
  if (redis === undefined || keys.length === 0) {
    return;
  }
  await redis.del(...keys);
}

/** How many keys `invalidateNamespace` buffers per `DEL` pipeline batch.
 * Keeps memory bounded on large namespaces while still round-tripping far
 * fewer times than deleting keys one by one (#866). */
const INVALIDATE_BATCH_SIZE = 500;

/** `SCAN` cursor used to start/continue an iteration; `0` means "done". */
const SCAN_CURSOR_START = '0';

/**
 * Invalidates every cached key under `namespace` (keys are always written
 * as `<namespace>:...`). Called after mutations that would otherwise leave
 * a cached read stale until its TTL expires — see `saves.service` and
 * `trending.service` for callers.
 *
 * Iterates with cursor-based `SCAN` (never the O(N) blocking `KEYS`
 * command) and deletes matched keys in pipelined `DEL` batches of
 * `INVALIDATE_BATCH_SIZE`, so invalidation stays safe on production
 * keyspaces of any size without blocking Redis (#866).
 */
export async function invalidateNamespace(namespace: string): Promise<void> {
  const redis = tryGetRedisClient();
  if (redis === undefined) {
    return;
  }

  const pattern = `${namespace}:*`;
  let cursor = SCAN_CURSOR_START;
  let batch: string[] = [];

  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      INVALIDATE_BATCH_SIZE,
    );
    cursor = nextCursor;
    batch.push(...keys);

    if (batch.length >= INVALIDATE_BATCH_SIZE) {
      await redis.del(...batch);
      batch = [];
    }
  } while (cursor !== SCAN_CURSOR_START);

  if (batch.length > 0) {
    await redis.del(...batch);
  }
}
