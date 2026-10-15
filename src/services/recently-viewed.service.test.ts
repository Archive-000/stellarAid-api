import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redisMock, tryGetRedisClientMock, loggerMock, recordTrendingSignalMock } = vi.hoisted(() => ({
  redisMock: { set: vi.fn(), zadd: vi.fn(), zremrangebyrank: vi.fn() },
  tryGetRedisClientMock: vi.fn(),
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  recordTrendingSignalMock: vi.fn(),
}));

vi.mock('@/services', () => ({ prisma: {} }));
vi.mock('@/utils/logger', () => ({ logger: loggerMock }));
vi.mock('./redis.service', () => ({ tryGetRedisClient: tryGetRedisClientMock }));
vi.mock('./trending.service', () => ({ recordTrendingSignal: recordTrendingSignalMock }));

import { getViewRecordingMetrics, recordArtworkViewSafely } from './recently-viewed.service';

const metrics = () => ({ ...getViewRecordingMetrics() });

beforeEach(() => {
  vi.clearAllMocks();
  recordTrendingSignalMock.mockResolvedValue(undefined);
});

describe('recordArtworkViewSafely', () => {
  it('counts a recorded view', async () => {
    tryGetRedisClientMock.mockReturnValue(redisMock);
    redisMock.set.mockResolvedValue('OK');
    const before = metrics();

    await recordArtworkViewSafely('user-1', 'art-1');

    expect(metrics().recorded).toBe(before.recorded + 1);
  });

  it('counts a debounced or unconfigured view as skipped, not failed', async () => {
    tryGetRedisClientMock.mockReturnValue(undefined);
    const before = metrics();

    await recordArtworkViewSafely('user-1', 'art-1');

    expect(metrics().skipped).toBe(before.skipped + 1);
    expect(metrics().failed).toBe(before.failed);
  });

  it('logs and counts a Redis failure without rejecting', async () => {
    tryGetRedisClientMock.mockReturnValue(redisMock);
    redisMock.set.mockRejectedValue(new Error('redis down'));
    const before = metrics();

    await expect(recordArtworkViewSafely('user-1', 'art-1')).resolves.toBeUndefined();

    expect(metrics().failed).toBe(before.failed + 1);
    expect(loggerMock.debug).toHaveBeenCalledWith(
      'artwork view recording failed',
      expect.objectContaining({ artworkId: 'art-1', message: 'redis down' }),
    );
  });
});
