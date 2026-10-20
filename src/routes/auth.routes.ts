/**
 * Auth routes (v1).
 *
 * `createFeatureRouter('auth')` attaches the auth rate limiter (10/min)
 * automatically. Inputs are validated with the repo's `validate()` middleware
 * before they reach the controller.
 *
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a user (with a pending email verification record)
 *       and returns an access/refresh token pair plus the verification token.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/PublicUser'
 *                     tokens:
 *                       $ref: '#/components/schemas/TokenPair'
 *                     verificationToken:
 *                       type: string
 *       409:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: { code: CONFLICT, message: Email already registered }
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 * /api/v1/auth/login:
 *   post:
 *     summary: Log in
 *     description: Exchanges valid credentials for a fresh token pair.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SessionResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: { code: UNAUTHORIZED, message: Invalid email or password }
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Rotate a refresh token
 *     description: Revokes the presented refresh token and issues a new
 *       access/refresh pair (single-use rotation).
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       200:
 *         description: New token pair issued
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SessionResponse'
 *       401:
 *         description: Expired, revoked or unknown refresh token
 *         content:
 *           application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *           example:
 *             success: false
 *             error: { code: UNAUTHORIZED, message: Invalid or expired refresh token }
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 * /api/v1/auth/me:
 *   get:
 *     summary: Current user profile
 *     description: Returns the authenticated user's profile, including role,
 *       emailVerified, linked wallet public keys and the artist profile when
 *       one exists. Never includes the password hash.
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/CurrentUser'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 * /api/v1/auth/logout:
 *   post:
 *     summary: Log out the current session
 *     description: Revokes the given refresh token. Idempotent — revoking an
 *       unknown or already-revoked token still returns 204.
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       204:
 *         description: Logged out
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 * /api/v1/auth/logout-all:
 *   post:
 *     summary: Log out of all sessions
 *     description: Revokes every refresh token belonging to the user.
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       204:
 *         description: All sessions revoked
 *       401:
 *         description: Expired or revoked token
 * /api/v1/auth/forgot-password:
 *   post:
 *     summary: Request a password reset
 *     description: Generates a one-hour reset token and sends a reset link.
 *       The response is identical whether the email exists.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Generic password reset response
 *       422:
 *         description: Validation failed
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: Reset a password
 *     description: Consumes a one-time reset token and revokes all sessions.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Password reset
 *       400:
 *         description: Invalid or expired token
 *       422:
 *         description: Validation failed
 * /api/v1/auth/wallet/challenge:
 *   post:
 *     summary: Request a Stellar wallet authentication challenge
 *     description: Returns a nonce that the wallet must sign. The nonce is bound
 *       to the provided public key and expires after 5 minutes.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WalletChallengeRequest'
 *     responses:
 *       200:
 *         description: Challenge issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/NonceChallengeResponse'
 *       400:
 *         description: Invalid public key
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 * /api/v1/auth/wallet/verify:
 *   post:
 *     summary: Verify a Stellar wallet signature and issue a session
 *     description: Verifies the signature over the challenge nonce. On success,
 *       finds or creates a user for the wallet and returns a standard token pair.
 *       The nonce is consumed and cannot be replayed.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WalletVerifyRequest'
 *     responses:
 *       200:
 *         description: Authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SessionResponse'
 *       401:
 *         description: Invalid signature, expired or replayed nonce
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 * /api/v1/auth/wallet/link:
 *   post:
 *     summary: Link a Stellar wallet to the current authenticated account
 *     description: Verifies a signature over a challenge nonce and links the
 *       wallet to the authenticated user. Requires an active access token.
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WalletLinkRequest'
 *     responses:
 *       204:
 *         description: Wallet linked
 *       401:
 *         description: Invalid signature, expired or replayed nonce
 *       409:
 *         description: Wallet already linked to another account
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 */

import {
  forgotPassword,
  login,
  logout,
  logoutAll,
  me,
  refresh,
  register,
  reset,
  walletChallenge,
  walletLink,
  walletVerify,
} from '@/controllers';
import { authenticate, passwordResetLimiter, validate } from '@/middlewares';
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  walletChallengeSchema,
  walletLinkSchema,
  walletVerifySchema,
} from '@/validators';

import { createFeatureRouter } from './router-factory';

export const authRouter = createFeatureRouter('auth');

authRouter.post('/register', validate({ body: registerSchema }), register);
authRouter.post('/login', validate({ body: loginSchema }), login);
authRouter.post('/refresh', validate({ body: refreshSchema }), refresh);
authRouter.post(
  '/forgot-password',
  passwordResetLimiter,
  validate({ body: forgotPasswordSchema }),
  forgotPassword,
);
authRouter.post(
  '/reset-password',
  passwordResetLimiter,
  validate({ body: resetPasswordSchema }),
  reset,
);
authRouter.get('/me', authenticate, me);
authRouter.post('/logout', authenticate, validate({ body: logoutSchema }), logout);
authRouter.post('/logout-all', authenticate, logoutAll);

/** Wallet authentication endpoints */
authRouter.post(
  '/wallet/challenge',
  validate({ body: walletChallengeSchema }),
  walletChallenge,
);
authRouter.post(
  '/wallet/verify',
  validate({ body: walletVerifySchema }),
  walletVerify,
);
authRouter.post(
  '/wallet/link',
  authenticate,
  validate({ body: walletLinkSchema }),
  walletLink,
);