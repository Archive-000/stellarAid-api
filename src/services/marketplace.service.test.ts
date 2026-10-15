/**
 * Marketplace service logic tests: trending ranking, search ranking,
 * browse-result caching, and price conversion accuracy.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/middlewares';

const { prismaMock, redisMock, tryGetRedisClientMock } = vi.hoisted(() => {
  const prisma = {
    artwork: { findMany: vi.fn() },
    artistProfile: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const redis = {
    get: vi.fn(),
    set: vi.fn(),
    zincrby: vi.fn(),
    zrevrange: vi.fn(),
  };
  return { prismaMock: prisma, redisMock: redis, tryGetRedisClientMock: vi.fn() };
});

vi.mock('@/services', () => ({ prisma: prismaMock }));
vi.mock('./redis.service', () => ({ tryGetRedisClient: tryGetRedisClientMock }));

import { browseArtworks, listTrendingArtworks } from './marketplace.service';
import { convertAmount, getRate, tryConvertAmount } from './price-conversion.service';
import { searchArtworks } from './search.service';

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('trending algorithm', () => {
  it('ranks results by trending score, not database row order', async () => {
    tryGetRedisClientMock.mockReturnValue(redisMock);
    redisMock.zrevrange.mockResolvedValue(['artwork-2', 'artwork-1']);
    prismaMock.artwork.findMany.mockResolvedValue([
      { id: 'artwork-1', title: 'A' },
      { id: 'artwork-2', title: 'B' },
    ]);

    const result = await listTrendingArtworks();

    expect(result.map((artwork) => artwork.id)).toEqual(['artwork-2', 'artwork-1']);
  });

  it('falls back to featured artworks when nothing has a trending score yet', async () => {
    tryGetRedisClientMock.mockReturnValue(redisMock);
    redisMock.zrevrange.mockResolvedValue([]);
    const featured = [{ id: 'artwork-3' }];
    prismaMock.artwork.findMany.mockResolvedValue(featured);

    const result = await listTrendingArtworks();

    expect(result).toEqual(featured);
  });

  it('falls back to featured artworks when redis is not configured', async () => {
    tryGetRedisClientMock.mockReturnValue(undefined);
    const featured = [{ id: 'artwork-4' }];
    prismaMock.artwork.findMany.mockResolvedValue(featured);

    const result = await listTrendingArtworks();

    expect(result).toEqual(featured);
  });
});

describe('search ranking', () => {
  it('preserves the rank order Postgres returns and paginates by offset', async () => {
    tryGetRedisClientMock.mockReturnValue(undefined);
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    const page = await searchArtworks('sunset', {}, 1, 2);

    expect(page.items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(page.page).toBe(1);
    expect(page.limit).toBe(2);
  });

  it('reports the total match count and whether another page exists', async () => {
    tryGetRedisClientMock.mockReturnValue(undefined);
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ count: 5 }])
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);

    const first = await searchArtworks('pagination-first', {}, 1, 2);
    expect(first.total).toBe(5);
    expect(first.hasNext).toBe(true);

    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ count: 5 }])
      .mockResolvedValueOnce([{ id: 'e' }]);

    const last = await searchArtworks('pagination-last', {}, 3, 2);
    expect(last.total).toBe(5);
    expect(last.hasNext).toBe(false);
  });

  it('counts trigram matches when full-text finds nothing', async () => {
    tryGetRedisClientMock.mockReturnValue(undefined);
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ id: 'fuzzy' }]);

    const page = await searchArtworks('sunsett', {}, 1, 20);

    expect(page.items.map((item) => item.id)).toEqual(['fuzzy']);
    expect(page.total).toBe(1);
    expect(page.hasNext).toBe(false);
  });

  it('returns nothing for an empty query, without touching search ranking', async () => {
    tryGetRedisClientMock.mockReturnValue(undefined);
    prismaMock.artwork.findMany.mockResolvedValue([]);

    const page = await searchArtworks('   ', {}, 1, 20);

    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.hasNext).toBe(false);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('browse cache key stability', () => {
  afterEach(() => {
    redisMock.get.mockReset();
  });

  it('produces the same cache key for equivalent filters in a different key order', async () => {
    tryGetRedisClientMock.mockReturnValue(redisMock);
    redisMock.get.mockResolvedValue(JSON.stringify({ items: [], nextCursor: null }));

    await browseArtworks({ category: 'PHOTOGRAPHY', minPrice: 5 }, 'newest', undefined, 20);
    await browseArtworks({ minPrice: 5, category: 'PHOTOGRAPHY' }, 'newest', undefined, 20);

    const [firstKey, secondKey] = redisMock.get.mock.calls.map((call) => call[0]);
    expect(firstKey).toBe(secondKey);
  });

  it('produces different keys for different filters', async () => {
    tryGetRedisClientMock.mockReturnValue(redisMock);
    redisMock.get.mockResolvedValue(JSON.stringify({ items: [], nextCursor: null }));

    await browseArtworks({ minPrice: 5 }, 'newest', undefined, 20);
    await browseArtworks({ minPrice: 6 }, 'newest', undefined, 20);

    expect(redisMock.get.mock.calls[0]![0]).not.toBe(redisMock.get.mock.calls[1]![0]);
  });
});

describe('browse pagination per sort order', () => {
  const rows = (n: number, start = 0) =>
    Array.from({ length: n }, (_, i) => ({ id: `a${start + i}` }));

  beforeEach(() => {
    tryGetRedisClientMock.mockReturnValue(undefined);
  });

  it.each(['newest', 'popular', 'rating'] as const)(
    '%s pages with an id keyset cursor',
    async (sort) => {
      prismaMock.artwork.findMany.mockResolvedValueOnce(rows(3));
      const first = await browseArtworks({}, sort, undefined, 2);
      expect(first.items.map((i) => i.id)).toEqual(['a0', 'a1']);
      expect(first.nextCursor).toBe('a1');

      prismaMock.artwork.findMany.mockResolvedValueOnce(rows(1, 2));
      const second = await browseArtworks({}, sort, first.nextCursor!, 2);
      expect(prismaMock.artwork.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: { id: 'a1' }, skip: 1, take: 3 }),
      );
      expect(second.items.map((i) => i.id)).toEqual(['a2']);
      expect(second.nextCursor).toBeNull();
    },
  );

  it.each(['price_asc', 'price_desc'] as const)(
    '%s pages with an offset cursor over a total order',
    async (sort) => {
      prismaMock.artwork.findMany.mockResolvedValueOnce(rows(3));
      const first = await browseArtworks({}, sort, undefined, 2);
      expect(first.nextCursor).toBe('o:2');
      expect(prismaMock.artwork.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ skip: 0, take: 3 }),
      );

      prismaMock.artwork.findMany.mockResolvedValueOnce(rows(3, 2));
      const second = await browseArtworks({}, sort, first.nextCursor!, 2);
      expect(prismaMock.artwork.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ skip: 2, take: 3 }),
      );
      expect(second.nextCursor).toBe('o:4');

      prismaMock.artwork.findMany.mockResolvedValueOnce(rows(1, 4));
      const third = await browseArtworks({}, sort, second.nextCursor!, 2);
      expect(third.items.map((i) => i.id)).toEqual(['a4']);
      expect(third.nextCursor).toBeNull();
    },
  );

  it('rejects an id cursor for a price sort and an offset cursor for newest', async () => {
    await expect(browseArtworks({}, 'price_asc', 'some-artwork-id', 2)).rejects.toThrow(AppError);
    await expect(browseArtworks({}, 'newest', 'o:2', 2)).rejects.toThrow(AppError);
  });
});

describe('browse caching behavior', () => {
  it('serves a cache hit without querying the database', async () => {
    tryGetRedisClientMock.mockReturnValue(redisMock);
    const cachedPage = { items: [{ id: 'cached' }], nextCursor: null };
    redisMock.get.mockResolvedValue(JSON.stringify(cachedPage));

    const page = await browseArtworks({}, 'newest', undefined, 20);

    expect(page).toEqual(cachedPage);
    expect(prismaMock.artwork.findMany).not.toHaveBeenCalled();
  });

  it('queries the database on a cache miss and writes the result back', async () => {
    tryGetRedisClientMock.mockReturnValue(redisMock);
    redisMock.get.mockResolvedValue(null);
    prismaMock.artwork.findMany.mockResolvedValue([{ id: 'fresh' }]);

    const page = await browseArtworks({}, 'newest', undefined, 20);

    expect(page.items).toEqual([{ id: 'fresh' }]);
    expect(redisMock.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'EX', 30);
  });

  it('bypasses caching entirely when redis is not configured', async () => {
    tryGetRedisClientMock.mockReturnValue(undefined);
    prismaMock.artwork.findMany.mockResolvedValue([]);

    await browseArtworks({}, 'newest', undefined, 20);

    expect(prismaMock.artwork.findMany).toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });
});

describe('verifiedOnly filter with caching (#865)', () => {
  it('restricts results to verified artists and caches under a key that includes verifiedOnly', async () => {
    tryGetRedisClientMock.mockReturnValue(undefined);
    prismaMock.artistProfile.findMany.mockResolvedValue([{ userId: 'artist-a' }]);
    prismaMock.artwork.findMany.mockResolvedValue([{ id: 'art-1', userId: 'artist-a' }]);

    const page = await browseArtworks({ verifiedOnly: true }, 'newest', undefined, 20);

    expect(page.items).toEqual([{ id: 'art-1', userId: 'artist-a' }]);
    expect(prismaMock.artistProfile.findMany).toHaveBeenCalledWith({
      where: { verified: true },
      select: { userId: true },
    });
    expect(prismaMock.artwork.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: { in: ['artist-a'] } }),
      }),
    );
  });

  it('does not look up verified artists when verifiedOnly is absent or false', async () => {
    tryGetRedisClientMock.mockReturnValue(undefined);
    prismaMock.artwork.findMany.mockResolvedValue([]);

    await browseArtworks({}, 'newest', undefined, 20);
    await browseArtworks({ verifiedOnly: false }, 'newest', undefined, 20);

    expect(prismaMock.artistProfile.findMany).not.toHaveBeenCalled();
  });

  it('uses one cache slot for verifiedOnly=false and verifiedOnly absent', async () => {
    tryGetRedisClientMock.mockReturnValue(redisMock);
    redisMock.get.mockResolvedValue(null);
    prismaMock.artwork.findMany.mockResolvedValue([]);

    await browseArtworks({ verifiedOnly: false }, 'newest', undefined, 20);
    const keyWithoutFilter = redisMock.set.mock.calls[0]?.[0];

    await browseArtworks({}, 'newest', undefined, 20);
    const keyAbsent = redisMock.set.mock.calls[1]?.[0];

    expect(keyWithoutFilter).toBe(keyAbsent);
  });

  it('serves a cached verifiedOnly page without re-querying verified artists', async () => {
    tryGetRedisClientMock.mockReturnValue(redisMock);
    const cachedPage = { items: [{ id: 'cached-verified' }], nextCursor: null };
    redisMock.get.mockResolvedValue(JSON.stringify(cachedPage));

    const page = await browseArtworks({ verifiedOnly: true }, 'newest', undefined, 20);

    expect(page).toEqual(cachedPage);
    expect(prismaMock.artistProfile.findMany).not.toHaveBeenCalled();
    expect(prismaMock.artwork.findMany).not.toHaveBeenCalled();
  });

  it('caches the verified-artist id list so repeated misses reuse it', async () => {
    tryGetRedisClientMock.mockReturnValue(redisMock);
    redisMock.get.mockImplementation(async (key: string) =>
      key === 'marketplace:verified-artist-ids' ? JSON.stringify(['artist-a']) : null,
    );
    prismaMock.artwork.findMany.mockResolvedValue([]);

    await browseArtworks({ verifiedOnly: true }, 'newest', undefined, 20);

    expect(prismaMock.artistProfile.findMany).not.toHaveBeenCalled();
    expect(prismaMock.artwork.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: { in: ['artist-a'] } }),
      }),
    );
  });
});

describe('price conversion accuracy', () => {
  it('computes the mid price from the best bid/ask and caches it', async () => {
    tryGetRedisClientMock.mockReturnValue(redisMock);
    redisMock.get.mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bids: [{ price: '0.10' }], asks: [{ price: '0.12' }] }),
    }) as unknown as typeof fetch;

    const rate = await getRate('XLM', 'USDC');

    expect(rate).toBeCloseTo(0.11);
    expect(redisMock.set).toHaveBeenCalled();
  });

  it('serves a cached rate without calling the DEX again', async () => {
    tryGetRedisClientMock.mockReturnValue(redisMock);
    redisMock.get.mockResolvedValue('0.5');
    global.fetch = vi.fn() as unknown as typeof fetch;

    const rate = await getRate('XLM', 'USDC');

    expect(rate).toBe(0.5);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('converts an amount using the resolved rate', async () => {
    tryGetRedisClientMock.mockReturnValue(undefined);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bids: [{ price: '2' }], asks: [{ price: '2' }] }),
    }) as unknown as typeof fetch;

    const result = await convertAmount(10, 'XLM', 'USDC');

    expect(result.rate).toBe(2);
    expect(result.amount).toBe(20);
  });

  it('reports no rate, rather than guessing, for an asset with no configured issuer', async () => {
    tryGetRedisClientMock.mockReturnValue(undefined);
    global.fetch = vi.fn() as unknown as typeof fetch;

    const rate = await getRate('NGNT', 'XLM');

    expect(rate).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects conversion with a clear error when no rate is available', async () => {
    tryGetRedisClientMock.mockReturnValue(undefined);
    global.fetch = vi.fn() as unknown as typeof fetch;

    await expect(convertAmount(10, 'NGNT', 'XLM')).rejects.toThrow(AppError);
  });

  it('tryConvertAmount returns a result when a rate is available', async () => {
    tryGetRedisClientMock.mockReturnValue(undefined);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bids: [{ price: '2' }], asks: [{ price: '2' }] }),
    }) as unknown as typeof fetch;

    await expect(tryConvertAmount(10, 'XLM', 'USDC')).resolves.toMatchObject({
      amount: 20,
      rate: 2,
    });
  });

  it('tryConvertAmount returns null instead of throwing when no rate is available', async () => {
    tryGetRedisClientMock.mockReturnValue(undefined);
    global.fetch = vi.fn() as unknown as typeof fetch;

    await expect(tryConvertAmount(10, 'NGNT', 'XLM')).resolves.toBeNull();
  });
});
