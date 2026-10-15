import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyMock, loggerMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/services/token.service', () => ({ verifyAccessToken: verifyMock }));
vi.mock('@/utils/logger', () => ({ logger: loggerMock }));

import { AppError } from './app-error.middleware';
import { getOptionalAuthUser } from './auth.middleware';

const reqWith = (authorization?: string): Request =>
  ({ headers: authorization === undefined ? {} : { authorization } }) as Request;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getOptionalAuthUser', () => {
  it('returns the identity for a valid token', () => {
    verifyMock.mockReturnValue({ sub: 'user-1', role: 'BUYER' });
    expect(getOptionalAuthUser(reqWith('Bearer good'))).toEqual({ sub: 'user-1', role: 'BUYER' });
  });

  it('returns undefined without a header or with a malformed one', () => {
    expect(getOptionalAuthUser(reqWith())).toBeUndefined();
    expect(getOptionalAuthUser(reqWith('Token abc'))).toBeUndefined();
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it.each(['Access token expired', 'Invalid access token'])(
    'treats an unauthorized token error (%s) as anonymous',
    (message) => {
      verifyMock.mockImplementation(() => {
        throw new AppError('UNAUTHORIZED', message);
      });
      expect(getOptionalAuthUser(reqWith('Bearer bad'))).toBeUndefined();
      expect(loggerMock.error).not.toHaveBeenCalled();
    },
  );

  it('propagates and logs configuration errors instead of masking them', () => {
    const configError = new AppError('INTERNAL_ERROR', 'JWT secret is not configured');
    verifyMock.mockImplementation(() => {
      throw configError;
    });
    expect(() => getOptionalAuthUser(reqWith('Bearer anything'))).toThrow(configError);
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
  });

  it('propagates unexpected non-AppError failures', () => {
    verifyMock.mockImplementation(() => {
      throw new TypeError('boom');
    });
    expect(() => getOptionalAuthUser(reqWith('Bearer anything'))).toThrow(TypeError);
  });
});
