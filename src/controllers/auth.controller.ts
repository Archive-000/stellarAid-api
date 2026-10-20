/**
 * Auth controller.
 *
 * Thin HTTP wrappers over the auth service. Uses the repo's typed
 * `validate()` + `getValidated()` pattern and demonstrates the `catchAsync`
 * wrapper; responses use the standard `{ success, data }` envelope and never
 * contain a password hash.
 */

import type { Response } from 'express';

import { catchAsync, getAuthUser, getValidated } from '@/middlewares';
import {
  findOrCreateUserByWalletPublicKey,
  generateNonce,
  linkWalletToUser,
  type NonceChallenge,
  verifySignature,
} from '@/services';
import {
  getCurrentUser,
  loginUser,
  logoutAllSessions,
  logoutSession,
  refreshSession,
  registerUser,
  requestPasswordReset,
  resetPassword,
  type CurrentUserProfile,
  type PublicUser,
} from '@/services';
import type { TokenPair } from '@/services';
import type { ApiResponse } from '@/types';
import type {
  ForgotPasswordSchema,
  LoginSchema,
  LogoutSchema,
  RefreshSchema,
  RegisterSchema,
  ResetPasswordSchema,
  WalletChallengeSchema,
  WalletLinkSchema,
  WalletVerifySchema,
} from '@/validators';

type RegisterInput = RegisterSchema;
type LoginInput = LoginSchema;
type RefreshInput = RefreshSchema;
type ForgotPasswordInput = ForgotPasswordSchema;
type ResetPasswordInput = ResetPasswordSchema;
type WalletChallengeInput = WalletChallengeSchema;
type WalletVerifyInput = WalletVerifySchema;
type WalletLinkInput = WalletLinkSchema;

interface RegisterResult {
  user: PublicUser;
  tokens: TokenPair;
  verificationToken: string;
}

interface SessionResult {
  user: PublicUser;
  tokens: TokenPair;
}

/** POST /api/v1/auth/register */
export const register = catchAsync(async (req, res: Response<ApiResponse<RegisterResult>>) => {
  const { body } = getValidated<RegisterInput, unknown, unknown>(req);
  const result = await registerUser(body);
  res.status(201).json({ success: true, data: result });
});

/** POST /api/v1/auth/login */
export const login = catchAsync(async (req, res: Response<ApiResponse<SessionResult>>) => {
  const { body } = getValidated<LoginInput, unknown, unknown>(req);
  const result = await loginUser(body);
  res.status(200).json({ success: true, data: result });
});

/** POST /api/v1/auth/refresh */
export const refresh = catchAsync(async (req, res: Response<ApiResponse<SessionResult>>) => {
  const { body } = getValidated<RefreshInput, unknown, unknown>(req);
  const result = await refreshSession(body.refreshToken);
  res.status(200).json({ success: true, data: result });
});

/** POST /api/v1/auth/forgot-password */
export const forgotPassword = catchAsync(
  async (req, res: Response<ApiResponse<{ message: string }>>) => {
    const { body } = getValidated<ForgotPasswordInput, unknown, unknown>(req);
    const result = await requestPasswordReset(body.email);
    res.status(200).json({ success: true, data: result });
  },
);

/** POST /api/v1/auth/reset-password */
export const reset = catchAsync(async (req, res: Response<ApiResponse<{ message: string }>>) => {
  const { body } = getValidated<ResetPasswordInput, unknown, unknown>(req);
  const result = await resetPassword(body.token, body.password);
  res.status(200).json({ success: true, data: result });
});

/** GET /api/v1/auth/me */
export const me = catchAsync(async (req, res: Response<ApiResponse<CurrentUserProfile>>) => {
  const { sub } = getAuthUser(req);
  const profile = await getCurrentUser(sub);
  res.status(200).json({ success: true, data: profile });
});

/** POST /api/v1/auth/logout */
export const logout = catchAsync(async (req, res: Response) => {
  const { sub } = getAuthUser(req);
  const { body } = getValidated<LogoutSchema, unknown, unknown>(req);
  await logoutSession(sub, body.refreshToken);
  res.status(204).end();
});

/** POST /api/v1/auth/logout-all */
export const logoutAll = catchAsync(async (req, res: Response) => {
  const { sub } = getAuthUser(req);
  await logoutAllSessions(sub);
  res.status(204).end();
});

/** POST /api/v1/auth/wallet/challenge */
export const walletChallenge = catchAsync(
  async (req, res: Response<ApiResponse<NonceChallenge>>) => {
    const { body } = getValidated<WalletChallengeInput, unknown, unknown>(req);
    const result = await generateNonce(body.publicKey);
    res.status(200).json({ success: true, data: result });
  },
);

/** POST /api/v1/auth/wallet/verify */
export const walletVerify = catchAsync(async (req, res: Response<ApiResponse<SessionResult>>) => {
  const { body } = getValidated<WalletVerifyInput, unknown, unknown>(req);
  await verifySignature(body.publicKey, body.nonce, body.signature);
  const result = await findOrCreateUserByWalletPublicKey(body.publicKey);
  res.status(200).json({ success: true, data: result });
});

/** POST /api/v1/auth/wallet/link */
export const walletLink = catchAsync(async (req, res: Response) => {
  const { sub } = getAuthUser(req);
  const { body } = getValidated<WalletLinkInput, unknown, unknown>(req);
  await verifySignature(body.publicKey, body.nonce, body.signature);
  await linkWalletToUser(sub, body.publicKey);
  res.status(204).end();
});