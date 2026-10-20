/**
 * Auth request schemas.
 */

import { z } from 'zod';
import { emailSchema } from './common.schemas';

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128)
    .regex(/[a-z]/, 'Password must contain a lowercase letter.')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter.'),
  role: z.enum(['USER', 'ARTIST']).default('USER'),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.').max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().trim().min(1, 'refreshToken is required.'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'token is required.'),
  password: registerSchema.shape.password,
});

export const logoutSchema = z.object({
  refreshToken: z.string().trim().min(1, 'refreshToken is required.'),
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(1, 'token is required.'),
});

/** Stellar wallet public key (Ed25519, base32-encoded, starts with 'G'). */
const stellarPublicKeySchema = z
  .string()
  .trim()
  .regex(/^G[A-Z0-9]{55}$/, 'Must be a valid Stellar public key (Ed25519, starts with G).');

/** Hex-encoded 32-byte nonce. */
const nonceSchema = z.string().trim().regex(/^[0-9a-f]{64}$/i, 'Nonce must be a 64-character hex string.');

/** Base64-encoded Ed25519 signature. */
const signatureSchema = z
  .string()
  .trim()
  .min(1, 'Signature is required.')
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Signature must be base64-encoded.');

export const walletChallengeSchema = z.object({
  publicKey: stellarPublicKeySchema,
});

export const walletVerifySchema = z.object({
  publicKey: stellarPublicKeySchema,
  nonce: nonceSchema,
  signature: signatureSchema,
});

export const walletLinkSchema = z.object({
  publicKey: stellarPublicKeySchema,
  signature: signatureSchema,
  nonce: nonceSchema,
});

export type RegisterSchema = z.infer<typeof registerSchema>;
export type LoginSchema = z.infer<typeof loginSchema>;
export type RefreshSchema = z.infer<typeof refreshSchema>;
export type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>;
export type LogoutSchema = z.infer<typeof logoutSchema>;
export type VerifyEmailSchema = z.infer<typeof verifyEmailSchema>;
export type WalletChallengeSchema = z.infer<typeof walletChallengeSchema>;
export type WalletVerifySchema = z.infer<typeof walletVerifySchema>;
export type WalletLinkSchema = z.infer<typeof walletLinkSchema>;
