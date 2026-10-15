/**
 * Password hashing helpers.
 *
 * bcrypt with a configurable cost factor (`BCRYPT_COST`, default 12). Hashes are one-way and `comparePassword` uses
 * bcrypt's constant-time comparison.
 */

import bcrypt from 'bcrypt';

import { env } from '@/config';

export const BCRYPT_COST = env.bcryptCost;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
