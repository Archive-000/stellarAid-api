/**
 * Environment configuration.
 *
 * The single place that reads `process.env`. Values are parsed and validated
 * once at startup with Zod so a bad configuration fails fast with a clear
 * message instead of surfacing as a runtime surprise.
 */

import { z } from 'zod';

const DEFAULT_PORT = 3000;
const MIN_SECRET_LENGTH = 16;
const DEFAULT_ACCESS_TOKEN_TTL = '15m';
const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 7;

const PORT_ERROR = 'PORT must be an integer between 0 and 65535.';

/** 5% platform fee, expressed in basis points (1/100 of a percent). */
const DEFAULT_PLATFORM_FEE_BPS = 500;

/** How many times a client may send a commission back for changes before the
 * artist's submissions can no longer be rejected (#823). */
const DEFAULT_MAX_COMMISSION_REVISIONS = 3;

/** Circle's well-known USDC issuer on the Stellar public network. */
const DEFAULT_USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

/** Default Prisma connection pool size per instance (#887). */
const DEFAULT_DATABASE_POOL_SIZE = 20;
/** Days a revoked refresh token is kept for audit before the cleanup job deletes it (#899). */
const DEFAULT_REVOKED_TOKEN_RETENTION_DAYS = 30;
/** bcrypt cost bounds and defaults (#880). Tests use the minimum for speed. */
const DEFAULT_BCRYPT_COST = 12;
const TEST_BCRYPT_COST = 4;
const MIN_BCRYPT_COST = 10;
const MAX_BCRYPT_COST = 15;

/** How long a signed payment-intent transaction stays valid, in seconds. */
const DEFAULT_PAYMENT_INTENT_TTL_SECONDS = 300;

/** Ed25519 public keys (account addresses) are always `G` + 55 base32 chars. */
const STELLAR_ACCOUNT_RE = /^G[A-Z2-7]{55}$/;

/** Treat empty strings as "not provided" so `.env` keys can be left blank. */
function emptyToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value;
}

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1)).optional();
const optionalUrl = z
  .preprocess(emptyToUndefined, z.string().url('must be a valid URL'))
  .optional();
const optionalPort = z
  .preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(1, 'must be a port between 1 and 65535.')
      .max(65535, 'must be a port between 1 and 65535.'),
  )
  .optional();
const optionalStellarAccount = z
  .preprocess(
    emptyToUndefined,
    z.string().regex(STELLAR_ACCOUNT_RE, 'must be a Stellar account address'),
  )
  .optional();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce
    .number({ error: PORT_ERROR })
    .int(PORT_ERROR)
    .min(0, PORT_ERROR)
    .max(65535, PORT_ERROR)
    .default(DEFAULT_PORT),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required (postgresql://user:pass@host:5432/db).'),
  DATABASE_POOL_SIZE: z.coerce
    .number({ error: 'DATABASE_POOL_SIZE must be a positive integer.' })
    .int('DATABASE_POOL_SIZE must be a positive integer.')
    .positive('DATABASE_POOL_SIZE must be a positive integer.')
    .default(DEFAULT_DATABASE_POOL_SIZE),
  REDIS_URL: optionalUrl.refine(
    (v) => v === undefined || v.startsWith('redis://') || v.startsWith('rediss://'),
    {
      error: 'REDIS_URL must use the redis:// or rediss:// scheme.',
    },
  ),
  JWT_SECRET: z
    .string({ error: 'JWT_SECRET is required.' })
    .min(MIN_SECRET_LENGTH, `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`),
  JWT_REFRESH_SECRET: z
    .string({ error: 'JWT_REFRESH_SECRET is required.' })
    .min(MIN_SECRET_LENGTH, `JWT_REFRESH_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`),
  BCRYPT_COST: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int(`BCRYPT_COST must be an integer between ${MIN_BCRYPT_COST} and ${MAX_BCRYPT_COST}.`)
      .min(MIN_BCRYPT_COST, `BCRYPT_COST must be at least ${MIN_BCRYPT_COST}.`)
      .max(MAX_BCRYPT_COST, `BCRYPT_COST must be at most ${MAX_BCRYPT_COST}.`),
  ).optional(),
  ACCESS_TOKEN_TTL: z.string().min(1).default(DEFAULT_ACCESS_TOKEN_TTL),
  REFRESH_TOKEN_TTL_DAYS: z.coerce
    .number()
    .int()
    .positive('REFRESH_TOKEN_TTL_DAYS must be a positive integer.')
    .default(DEFAULT_REFRESH_TOKEN_TTL_DAYS),
  REVOKED_TOKEN_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .min(0, 'REVOKED_TOKEN_RETENTION_DAYS cannot be negative.')
    .default(DEFAULT_REVOKED_TOKEN_RETENTION_DAYS),
  S3_BUCKET: optionalString,
  S3_REGION: optionalString,
  /** Whether `confirmMediaUpload` HEAD-checks the object in S3 before
   * enqueueing image processing (#873). Defaults to on in production, off
   * elsewhere; set `true`/`false` to override explicitly. */
  VERIFY_S3_UPLOAD: z
    .preprocess(emptyToUndefined, z.enum(['true', 'false']).transform((v) => v === 'true'))
    .optional(),
  STELLAR_NETWORK: z.enum(['testnet', 'public']).default('testnet'),
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10000).default(DEFAULT_PLATFORM_FEE_BPS),
  MAX_COMMISSION_REVISIONS: z.coerce
    .number()
    .int()
    .min(0, 'MAX_COMMISSION_REVISIONS cannot be negative.')
    .max(50, 'MAX_COMMISSION_REVISIONS must be 50 or fewer.')
    .default(DEFAULT_MAX_COMMISSION_REVISIONS),
  USDC_ASSET_ISSUER: optionalStellarAccount,
  EURC_ASSET_ISSUER: optionalStellarAccount,
  NGNT_ASSET_ISSUER: optionalStellarAccount,
  STELLAR_HORIZON_URL: optionalUrl,
  STELLAR_ESCROW_ADDRESS: optionalStellarAccount,
  STELLAR_PLATFORM_FEE_ADDRESS: optionalStellarAccount,
  PAYMENT_INTENT_TTL_SECONDS: z.coerce
    .number()
    .int('PAYMENT_INTENT_TTL_SECONDS must be a whole number of seconds.')
    .min(30, 'PAYMENT_INTENT_TTL_SECONDS must be at least 30 seconds.')
    .max(3600, 'PAYMENT_INTENT_TTL_SECONDS must be at most 3600 seconds.')
    .default(DEFAULT_PAYMENT_INTENT_TTL_SECONDS),
  SMTP_HOST: optionalString,
  SMTP_PORT: optionalPort,
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  CORS_ORIGIN: optionalString,
}).superRefine((value, ctx) => {
  // Fail fast in production rather than on the first order paid in a
  // non-native asset: EURC and NGNT have no safe default issuer (#882).
  if (value.NODE_ENV !== 'production') return;
  for (const key of ['EURC_ASSET_ISSUER', 'NGNT_ASSET_ISSUER'] as const) {
    if (value[key] === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} is required in production so ${key.slice(0, 4)} payments can be built.`,
      });
    }
  }
});

export type NodeEnv = 'development' | 'production' | 'test';

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly pass: string;
}

export interface AppEnv {
  readonly nodeEnv: NodeEnv;
  readonly isDevelopment: boolean;
  readonly isProduction: boolean;
  readonly isTest: boolean;
  readonly port: number;
  readonly databaseUrl: string;
  /** Prisma connection pool size per instance (`connection_limit`). */
  readonly databasePoolSize: number;
  readonly redisUrl: string | undefined;
  readonly jwtSecret: string;
  readonly jwtRefreshSecret: string;
  /** bcrypt cost factor for password hashing (default 12; 4 under NODE_ENV=test). */
  readonly bcryptCost: number;
  /** JWT access-token lifetime, as accepted by `jsonwebtoken` (e.g. '15m'). */
  readonly accessTokenTtl: string;
  /** Refresh-token lifetime in days; stored hashed and revocable. */
  readonly refreshTokenTtlDays: number;
  /** Days revoked refresh tokens are retained for audit before cleanup. */
  readonly revokedTokenRetentionDays: number;
  readonly s3Bucket: string | undefined;
  readonly s3Region: string | undefined;
  /** Explicit `VERIFY_S3_UPLOAD` override, or undefined to use the
   * production-default policy (#873). */
  readonly verifyS3Upload: boolean | undefined;
  readonly stellarNetwork: 'testnet' | 'public';
  /** Platform fee in basis points (500 = 5%), applied to order amounts. */
  readonly platformFeeBps: number;
  /** Cap on commission revision requests before a submission can no longer be
   * sent back for changes. */
  readonly maxCommissionRevisions: number;
  /** Known issuer accounts for DEX price lookups. USDC defaults to Circle's
   * public-network issuer; EURC/NGNT have no safe default and are undefined
   * unless explicitly configured. */
  readonly priceAssetIssuers: {
    readonly USDC: string;
    readonly EURC: string | undefined;
    readonly NGNT: string | undefined;
  };
  /** Horizon base URL override; the payment service picks the network default
   * (`horizon-testnet.stellar.org` / `horizon.stellar.org`) when unset. */
  readonly stellarHorizonUrl: string | undefined;
  /** Custodial escrow account that order payments are sent to. When unset,
   * payments go straight to the seller's linked wallet. */
  readonly stellarEscrowAddress: string | undefined;
  /** Account that receives the platform fee when no escrow account is used. */
  readonly stellarPlatformFeeAddress: string | undefined;
  /** Lifetime of a signed payment-intent transaction, in seconds. */
  readonly paymentIntentTtlSeconds: number;
  /** Present only when SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS are all set. */
  readonly smtp: SmtpConfig | undefined;
  /** Comma-separated allowed CORS origins, or undefined to reflect the request origin. */
  readonly corsOrigins: string[] | undefined;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

function loadEnv(): AppEnv {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${formatIssues(parsed.error)}`);
  }

  const raw = parsed.data;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = raw;
  const smtp: SmtpConfig | undefined =
    SMTP_HOST !== undefined &&
    SMTP_PORT !== undefined &&
    SMTP_USER !== undefined &&
    SMTP_PASS !== undefined
      ? { host: SMTP_HOST, port: SMTP_PORT, user: SMTP_USER, pass: SMTP_PASS }
      : undefined;

  return {
    nodeEnv: raw.NODE_ENV,
    isDevelopment: raw.NODE_ENV === 'development',
    isProduction: raw.NODE_ENV === 'production',
    isTest: raw.NODE_ENV === 'test',
    port: raw.PORT,
    databaseUrl: raw.DATABASE_URL,
    databasePoolSize: raw.DATABASE_POOL_SIZE,
    redisUrl: raw.REDIS_URL,
    jwtSecret: raw.JWT_SECRET,
    jwtRefreshSecret: raw.JWT_REFRESH_SECRET,
    bcryptCost:
      raw.BCRYPT_COST ?? (raw.NODE_ENV === 'test' ? TEST_BCRYPT_COST : DEFAULT_BCRYPT_COST),
    accessTokenTtl: raw.ACCESS_TOKEN_TTL,
    refreshTokenTtlDays: raw.REFRESH_TOKEN_TTL_DAYS,
    revokedTokenRetentionDays: raw.REVOKED_TOKEN_RETENTION_DAYS,
    s3Bucket: raw.S3_BUCKET,
    s3Region: raw.S3_REGION,
    verifyS3Upload: raw.VERIFY_S3_UPLOAD,
    stellarNetwork: raw.STELLAR_NETWORK,
    platformFeeBps: raw.PLATFORM_FEE_BPS,
    maxCommissionRevisions: raw.MAX_COMMISSION_REVISIONS,
    priceAssetIssuers: {
      USDC: raw.USDC_ASSET_ISSUER ?? DEFAULT_USDC_ISSUER,
      EURC: raw.EURC_ASSET_ISSUER,
      NGNT: raw.NGNT_ASSET_ISSUER,
    },
    stellarHorizonUrl: raw.STELLAR_HORIZON_URL,
    stellarEscrowAddress: raw.STELLAR_ESCROW_ADDRESS,
    stellarPlatformFeeAddress: raw.STELLAR_PLATFORM_FEE_ADDRESS,
    paymentIntentTtlSeconds: raw.PAYMENT_INTENT_TTL_SECONDS,
    smtp,
    corsOrigins: raw.CORS_ORIGIN
      ? raw.CORS_ORIGIN.split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      : undefined,
  };
}

export const env: AppEnv = loadEnv();
