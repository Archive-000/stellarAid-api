import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    stellarNonce: {
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@/services', () => ({ prisma: prismaMock }));
vi.mock('@/utils', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { cleanupStellarNonces } from './stellar-nonce-cleanup.service';

const NOW = new Date('2026-09-30T00:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.stellarNonce.deleteMany.mockResolvedValue({ count: 5 });
});

describe('cleanupStellarNonces', () => {
  it('deletes only expired nonces', async () => {
    const stats = await cleanupStellarNonces(NOW);

    expect(stats).toEqual({ deleted: 5 });
    expect(prismaMock.stellarNonce.deleteMany).toHaveBeenCalledWith({
      where: {
        expiresAt: { lt: NOW },
      },
    });
  });

  it('uses provided clock for deterministic testing', async () => {
    const customNow = new Date('2026-01-01T12:00:00.000Z');
    await cleanupStellarNonces(customNow);

    expect(prismaMock.stellarNonce.deleteMany).toHaveBeenCalledWith({
      where: {
        expiresAt: { lt: customNow },
      },
    });
  });
});