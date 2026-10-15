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

describe('DATABASE_POOL_SIZE', () => {
  beforeEach(() => {
    process.env = { ...original };
    delete process.env.DATABASE_POOL_SIZE;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it('defaults to 20', async () => {
    expect((await loadEnv()).databasePoolSize).toBe(20);
  });

  it('reads a configured value', async () => {
    expect((await loadEnv({ DATABASE_POOL_SIZE: '5' })).databasePoolSize).toBe(5);
  });

  it.each(['0', '-3', '2.5', 'abc'])('rejects %s', async (value) => {
    await expect(loadEnv({ DATABASE_POOL_SIZE: value })).rejects.toThrow(/DATABASE_POOL_SIZE/);
  });
});
