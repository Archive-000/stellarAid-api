/**
 * JWT access + opaque refresh token lifecycle.
 *
 * - Access tokens: signed JWTs, short-lived (`env.accessTokenTtl`).
 * - Refresh tokens: opaque random values whose SHA-256 is stored in the DB so
 *   they can be revoked, rotated and reuse-blocked. They expire after
 *   `env.refreshTokenTtlDays`.
 */

import { createHash, randomBytes } from 'node:crypto';

import jwt, { JsonWebTokenError, TokenExpiredError, type SignOptions } from 'jsonwebtoken';

import { env } from '@/config';
import { AppError } from '@/middlewares';
import { prisma } from '@/services';
import type { Role } from '@prisma/client';

export interface AccessTokenPayload {
  readonly sub: string;
  readonly role: Role;
}

export interface RefreshTokenPair {
  readonly refreshToken: string;
  readonly refreshTokenId: string;
  readonly refreshTokenExpiresAt: Date;
}

export interface TokenPair extends RefreshTokenPair {
  readonly accessToken: string;
  readonly accessTokenExpiresIn: string;
}

export interface UserIdentity {
  readonly id: string;
  readonly role: Role;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function generateAccessToken(user: UserIdentity): Promise<string> {
  // jsonwebtoken throws synchronously on invalid options; surface as AppError.
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: env.accessTokenTtl as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  // A missing signing key is a deployment problem, not a bad token: fail loudly
  // (500) instead of letting jsonwebtoken report it as a JsonWebTokenError,
  // which callers would treat as "unauthenticated".
  if (!env.jwtSecret) {
    throw new AppError('INTERNAL_ERROR', 'JWT secret is not configured');
  }
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string') {
      throw new AppError('UNAUTHORIZED', 'Invalid access token');
    }
    return {
      sub: String(decoded.sub),
      role: decoded.role as Role,
    };
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      throw new AppError('UNAUTHORIZED', 'Access token expired');
    }
    if (err instanceof JsonWebTokenError) {
      throw new AppError('UNAUTHORIZED', 'Invalid access token');
    }
    throw err;
  }
}

async function issueRefreshToken(userId: string): Promise<RefreshTokenPair> {
  const rawToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
  const record = await prisma.refreshToken.create({
    data: { userId, token: hashToken(rawToken), expiresAt },
  });
  return { refreshToken: rawToken, refreshTokenId: record.id, refreshTokenExpiresAt: expiresAt };
}

export async function generateRefreshToken(user: UserIdentity): Promise<RefreshTokenPair> {
  return issueRefreshToken(user.id);
}

export async function verifyRefreshToken(
  rawToken: string,
): Promise<{ refreshTokenId: string; sub: string }> {
  const record = await prisma.refreshToken.findUnique({
    where: { token: hashToken(rawToken) },
  });
  if (record === null || record.revokedAt !== null || record.expiresAt <= new Date()) {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired refresh token');
  }
  return { refreshTokenId: record.id, sub: record.userId };
}

export async function revokeRefreshToken(tokenId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { id: tokenId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revoke a raw refresh token only if it belongs to `userId`; no-op otherwise. */
export async function revokeRefreshTokenByValue(userId: string, rawToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { token: hashToken(rawToken), userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Issue a full access + refresh pair for a user (refresh rotation-friendly). */
export async function issueTokenPair(user: UserIdentity): Promise<TokenPair> {
  const [accessToken, refresh] = await Promise.all([
    generateAccessToken(user),
    issueRefreshToken(user.id),
  ]);
  return {
    accessToken,
    accessTokenExpiresIn: env.accessTokenTtl,
    refreshToken: refresh.refreshToken,
    refreshTokenId: refresh.refreshTokenId,
    refreshTokenExpiresAt: refresh.refreshTokenExpiresAt,
  };
}
