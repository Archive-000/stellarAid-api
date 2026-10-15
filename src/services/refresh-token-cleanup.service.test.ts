import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, envMock } = vi.hoisted(() => ({
  prismaMock: { refreshToken: { deleteMany: vi.fn() } },
  envMock: { revokedTokenRetentionDays: 30 },
}));

vi.mock('@/config', () => ({ env: envMock }));
vi.mock('@/services', () => ({ prisma: prismaMock }));
vi.mock('@/utils', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { cleanupRefreshTokens } from './refresh-token-cleanup.service';

const NOW = new Date('2026-09-30T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  envMock.revokedTokenRetentionDays = 30;
  prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 7 });
});

describe('cleanupRefreshTokens', () => {
  it('deletes expired tokens and revoked tokens past the retention window', async () => {
    const stats = await cleanupRefreshTokens(NOW);

    expect(stats).toEqual({ deleted: 7 });
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { expiresAt: { lt: NOW } },
          { revokedAt: { not: null, lt: new Date(NOW.getTime() - 30 * DAY_MS) } },
        ],
      },
    });
  });

  it('honours a configured retention period', async () => {
    envMock.revokedTokenRetentionDays = 90;

    await cleanupRefreshTokens(NOW);

    const { where } = prismaMock.refreshToken.deleteMany.mock.calls[0]![0];
    expect(where.OR[1].revokedAt.lt).toEqual(new Date(NOW.getTime() - 90 * DAY_MS));
  });
});
