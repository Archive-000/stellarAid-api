import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redisMock } = vi.hoisted(() => ({
  redisMock: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    scan: vi.fn(),
  },
}));

vi.mock('./redis.service', () => ({
  tryGetRedisClient: () => redisMock,
}));

import { invalidateNamespace } from './cache.service';

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.del.mockResolvedValue(0);
});

describe('invalidateNamespace (#866)', () => {
  it('uses SCAN (never KEYS) and deletes matched keys in batches', async () => {
    // Two full pages of keys plus a short tail page, to exercise batching.
    const page1 = Array.from({ length: 500 }, (_, i) => `marketplace:key-${i}`);
    const page2 = Array.from({ length: 30 }, (_, i) => `marketplace:key-${500 + i}`);

    redisMock.scan
      .mockResolvedValueOnce(['123', page1])
      .mockResolvedValueOnce(['456', page2])
      .mockResolvedValueOnce(['0', []]);

    await invalidateNamespace('marketplace');

    expect(redisMock.scan).toHaveBeenCalledTimes(3);
    for (const [cursor, ...rest] of redisMock.scan.mock.calls) {
      expect(cursor).toBeDefined();
      expect(rest).toContain('MATCH');
      expect(rest).toContain('marketplace:*');
    }
    // `keys()` must never be used — it blocks Redis on large keyspaces.
    expect(redisMock).not.toHaveProperty('keys');

    // 500 keys from page 1 hit the batch threshold and flush immediately;
    // page 2's 30 keys flush with the trailing remainder.
    expect(redisMock.del).toHaveBeenCalledTimes(2);
    expect(redisMock.del.mock.calls[0]).toHaveLength(500);
    expect(redisMock.del.mock.calls[1]).toHaveLength(30);
  });

  it('issues a single trailing DEL for a small keyspace', async () => {
    redisMock.scan.mockResolvedValueOnce(['0', ['marketplace:a', 'marketplace:b']]);

    await invalidateNamespace('marketplace');

    expect(redisMock.del).toHaveBeenCalledTimes(1);
    expect(redisMock.del).toHaveBeenCalledWith('marketplace:a', 'marketplace:b');
  });

  it('does not call DEL when the namespace has no keys', async () => {
    redisMock.scan.mockResolvedValueOnce(['0', []]);

    await invalidateNamespace('marketplace');

    expect(redisMock.del).not.toHaveBeenCalled();
  });
});
