/**
 * Rate limiting middleware.
 *
 * Protects public endpoints from abuse. When `REDIS_URL` is set, a single
 * Redis-backed store is shared by every limiter so limits are enforced
 * consistently across multiple instances. Without Redis, each limiter gets
 * its own *isolated* in-memory `MemoryStore` — limits are still enforced
 * per instance, but they are neither shared between limiters nor between
 * processes, and they reset whenever the process restarts. That
 * dev-vs-prod difference is intentional (express-rate-limit forbids
 * sharing one store instance across limiters), but it means a multi-instance
 * deployment without Redis will apply the configured limit once per
 * instance rather than globally.
 *
 * Limits:
 * - Global: 100 requests/minute against every route.
 * - Auth:   10 requests/minute.
 * - Password reset: 3 requests/minute.
 *
 * Rate-limit headers (`RateLimit-Limit`, `RateLimit-Remaining`,
 * `RateLimit-Reset`) are present on every response, and over-limit requests
 * get `429` with a `Retry-After` header.
 *
 * Store: each limiter owns its own MemoryStore instance (express-rate-limit
 * forbids sharing one store across limiters — ERR_ERL_STORE_REUSE). When
 * `REDIS_URL` is set, all limiters instead share a single Redis-backed
 * store so limits are consistent across instances.
 */

import { Redis } from 'ioredis';
import rateLimit, {
  ipKeyGenerator,
  MemoryStore,
  type Options,
  type RateLimitRequestHandler,
} from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { env } from '@/config';
import { logger } from '@/utils';

let redisClient: Redis | undefined;
let redisStore: RedisStore | undefined;
/** One-shot warning so operators learn about the in-memory fallback at boot
 * rather than from surprising per-instance limit behaviour later (#870). */
let warnedAboutMemoryFallback = false;

function getRedisStore(): RedisStore | undefined {
  if (env.redisUrl === undefined) {
    if (!warnedAboutMemoryFallback && !env.isTest) {
      warnedAboutMemoryFallback = true;
      logger.warn(
        'Rate limiting: REDIS_URL is not configured — each limiter is using an isolated ' +
          'in-memory MemoryStore. Limits apply per process and reset on restart; ' +
          'multi-instance deployments will not share limits. Configure REDIS_URL for ' +
          'production.',
      );
    }
    return undefined;
  }
  if (redisStore === undefined) {
    redisClient = new Redis(env.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
    const sendCommand = (...args: string[]): Promise<RedisReply> => {
      const command = args[0] ?? '';
      const rest = args.slice(1);
      return redisClient!.call(command, ...rest) as Promise<RedisReply>;
    };
    redisStore = new RedisStore({ sendCommand });
    redisClient.on('error', (error) => {
      logger.warn('Redis store unavailable, falling back to isolated per-limiter memory store', {
        message: error.message,
      });
    });
  }
  return redisStore;
}

function createRateLimiter(options: {
  name: string;
  windowMs: number;
  limit: number;
  message: string;
}): RateLimitRequestHandler {
  const base: Partial<Options> = {
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown'),
    handler: (_req, res) => {
      const retryAfter = Math.ceil(options.windowMs / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: options.message },
      });
    },
    skip: (_req) => _req.method === 'OPTIONS' || _req.path === '/api/docs',
  };
  // Each limiter needs its own store: express-rate-limit refuses to share a
  // Store instance across limiters (ERR_ERL_STORE_REUSE). When no Redis is
  // configured this falls back to a fresh, *isolated* per-limiter
  // MemoryStore — limits are enforced per process only and are not shared
  // between limiters or instances (#870).
  const store = getRedisStore() ?? new MemoryStore();
  return rateLimit({ ...base, store });
}

const ONE_MINUTE = 60 * 1000;

/** 100 requests/minute across the whole API. */
export const globalLimiter: RateLimitRequestHandler = createRateLimiter({
  name: 'global',
  windowMs: ONE_MINUTE,
  limit: 100,
  message: 'Too many requests. Please try again later.',
});

/** 10 requests/minute on authentication endpoints. */
export const authLimiter: RateLimitRequestHandler = createRateLimiter({
  name: 'auth',
  windowMs: ONE_MINUTE,
  limit: 10,
  message: 'Too many authentication attempts. Please try again later.',
});

/** 3 requests/minute on password reset. */
export const passwordResetLimiter: RateLimitRequestHandler = createRateLimiter({
  name: 'password-reset',
  windowMs: ONE_MINUTE,
  limit: 3,
  message: 'Too many password reset attempts. Please try again later.',
});

/** 30 requests/minute on analytics event ingestion (batches, not single events). */
export const analyticsLimiter: RateLimitRequestHandler = createRateLimiter({
  name: 'analytics',
  windowMs: ONE_MINUTE,
  limit: 30,
  message: 'Too many analytics requests. Please try again later.',
});
