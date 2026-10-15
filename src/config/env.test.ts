import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const original = { ...process.env };

async function loadEnv(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return (await import('./env')).env;
}

describe('LOG_STACK_TRACES_IN_PRODUCTION', () => {
  beforeEach(() => {
    process.env = { ...original };
    delete process.env.LOG_STACK_TRACES_IN_PRODUCTION;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it('defaults to false', async () => {
    expect((await loadEnv()).logStackTracesInProduction).toBe(false);
  });

  it('parses "true" and "false" explicitly', async () => {
    expect((await loadEnv({ LOG_STACK_TRACES_IN_PRODUCTION: 'true' })).logStackTracesInProduction).toBe(true);
    expect((await loadEnv({ LOG_STACK_TRACES_IN_PRODUCTION: 'false' })).logStackTracesInProduction).toBe(false);
  });

  it('rejects other values', async () => {
    await expect(loadEnv({ LOG_STACK_TRACES_IN_PRODUCTION: 'yes' })).rejects.toThrow(
      /LOG_STACK_TRACES_IN_PRODUCTION/,
    );
  });
});
