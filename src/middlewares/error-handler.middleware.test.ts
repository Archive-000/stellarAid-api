import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envMock, loggerMock } = vi.hoisted(() => ({
  envMock: { isProduction: false, logStackTracesInProduction: false },
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/config', () => ({ env: envMock }));
vi.mock('@/utils', () => ({ logger: loggerMock }));

import { AppError } from './app-error.middleware';
import { errorHandler } from './error-handler.middleware';

function run(err: unknown): void {
  const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() };
  errorHandler(err, { id: 'req-1' } as Request, res as unknown as Response, vi.fn() as NextFunction);
}

function loggedStack(): unknown {
  return loggerMock.error.mock.calls[0]![1].stack;
}

function failingError(): Error {
  const error = new Error('db down postgresql://admin:hunter2@db.internal:5432/app');
  error.stack = `Error: db down postgresql://admin:hunter2@db.internal:5432/app\n    at query (/app/src/db.ts:1:1)`;
  return error;
}

beforeEach(() => {
  vi.clearAllMocks();
  envMock.isProduction = false;
  envMock.logStackTracesInProduction = false;
});

describe('errorHandler stack trace logging', () => {
  it('logs the full stack outside production', () => {
    run(failingError());
    expect(loggedStack()).toContain('at query');
  });

  it('omits the stack in production by default', () => {
    envMock.isProduction = true;
    run(failingError());
    expect(loggedStack()).toBeUndefined();
  });

  it('logs a redacted stack in production when enabled', () => {
    envMock.isProduction = true;
    envMock.logStackTracesInProduction = true;
    run(failingError());

    const stack = loggedStack() as string;
    expect(stack).toContain('at query');
    expect(stack).not.toContain('hunter2');
    expect(stack).not.toContain('admin:');
  });

  it('applies the same policy to AppError 5xx responses', () => {
    envMock.isProduction = true;
    envMock.logStackTracesInProduction = true;
    const error = new AppError('INTERNAL_ERROR', 'boom password=abc123');
    run(error);

    const stack = loggedStack() as string;
    expect(stack).toBeDefined();
    expect(stack).not.toContain('abc123');
  });

  it('does not log a stack for 4xx AppErrors', () => {
    run(new AppError('NOT_FOUND', 'missing'));
    expect(loggerMock.error).not.toHaveBeenCalled();
  });
});
