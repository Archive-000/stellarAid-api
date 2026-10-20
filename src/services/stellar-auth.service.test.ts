import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/middlewares';

const { prismaMock, sdkMock } = vi.hoisted(() => {
  const verify = vi.fn();
  return {
    prismaMock: {
      stellarNonce: {
        create: vi.fn(),
        findUnique: vi.fn(),
        updateMany: vi.fn(),
      },
    },
    sdkMock: {
      verify,
      fromPublicKey: vi.fn(() => ({ verify })),
      isValidEd25519PublicKey: vi.fn(),
    },
  };
});

vi.mock('@/services', () => ({ prisma: prismaMock }));
vi.mock('@stellar/stellar-sdk', () => ({
  Keypair: { fromPublicKey: sdkMock.fromPublicKey },
  StrKey: { isValidEd25519PublicKey: sdkMock.isValidEd25519PublicKey },
}));

import { generateNonce, NONCE_TTL_MS, verifySignature } from './stellar-auth.service';

const PUBLIC_KEY = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const OTHER_KEY = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ';
const NONCE = 'a'.repeat(64);
const SIGNATURE = Buffer.from('signature').toString('base64');

function nonceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'nonce-1',
    publicKey: PUBLIC_KEY,
    nonce: NONCE,
    expiresAt: new Date(Date.now() + 60_000),
    consumed: false,
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sdkMock.isValidEd25519PublicKey.mockReturnValue(true);
  sdkMock.verify.mockReturnValue(true);
  prismaMock.stellarNonce.create.mockResolvedValue({});
  prismaMock.stellarNonce.findUnique.mockResolvedValue(nonceRecord());
  prismaMock.stellarNonce.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('generateNonce', () => {
  it('returns a random 32-byte hex nonce and persists it for the key', async () => {
    const { nonce } = await generateNonce(PUBLIC_KEY);
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(prismaMock.stellarNonce.create).toHaveBeenCalledWith({
      data: { publicKey: PUBLIC_KEY, nonce, expiresAt: expect.any(Date) },
    });
  });

  it('expires after NONCE_TTL_MS', async () => {
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    const { expiresAt } = await generateNonce(PUBLIC_KEY);
    expect(expiresAt.getTime()).toBe(Date.now() + NONCE_TTL_MS);
  });

  it('produces a different nonce on each call', async () => {
    const [a, b] = await Promise.all([generateNonce(PUBLIC_KEY), generateNonce(PUBLIC_KEY)]);
    expect(a.nonce).not.toBe(b.nonce);
  });

  it('rejects an invalid public key without touching the database', async () => {
    sdkMock.isValidEd25519PublicKey.mockReturnValue(false);
    await expect(generateNonce('not-a-key')).rejects.toThrow('Invalid Stellar public key');
    expect(prismaMock.stellarNonce.create).not.toHaveBeenCalled();
  });
});

describe('verifySignature', () => {
  it('verifies the signature over the nonce with the SDK and consumes the nonce', async () => {
    await expect(verifySignature(PUBLIC_KEY, NONCE, SIGNATURE)).resolves.not.toThrow();

    expect(sdkMock.fromPublicKey).toHaveBeenCalledWith(PUBLIC_KEY);
    const [data, sig] = sdkMock.verify.mock.calls[0]!;
    expect(Buffer.from(data).toString('utf8')).toBe(NONCE);
    expect(Buffer.from(sig).toString('base64')).toBe(SIGNATURE);
    expect(prismaMock.stellarNonce.updateMany).toHaveBeenCalledWith({
      where: { id: 'nonce-1', consumed: false },
      data: { consumed: true },
    });
  });

  it('rejects a bad signature and leaves the nonce unconsumed', async () => {
    sdkMock.verify.mockReturnValue(false);
    await expect(verifySignature(PUBLIC_KEY, NONCE, SIGNATURE)).rejects.toThrow(
      'Invalid signature',
    );
    expect(prismaMock.stellarNonce.updateMany).not.toHaveBeenCalled();
  });

  it('treats an SDK exception (e.g. malformed signature) as invalid', async () => {
    sdkMock.verify.mockImplementation(() => {
      throw new Error('bad signature length');
    });
    await expect(verifySignature(PUBLIC_KEY, NONCE, 'garbage')).rejects.toThrow(
      'Invalid signature',
    );
  });

  it('rejects an unknown nonce', async () => {
    prismaMock.stellarNonce.findUnique.mockResolvedValue(null);
    await expect(verifySignature(PUBLIC_KEY, NONCE, SIGNATURE)).rejects.toThrow(
      'Invalid or expired nonce',
    );
    expect(sdkMock.verify).not.toHaveBeenCalled();
  });

  it('rejects an expired nonce', async () => {
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    prismaMock.stellarNonce.findUnique.mockResolvedValue(
      nonceRecord({ expiresAt: new Date(Date.now() + NONCE_TTL_MS) }),
    );
    vi.advanceTimersByTime(NONCE_TTL_MS);
    await expect(verifySignature(PUBLIC_KEY, NONCE, SIGNATURE)).rejects.toThrow(
      'Invalid or expired nonce',
    );
  });

  it('rejects an already consumed nonce (replay)', async () => {
    prismaMock.stellarNonce.findUnique.mockResolvedValue(nonceRecord({ consumed: true }));
    await expect(verifySignature(PUBLIC_KEY, NONCE, SIGNATURE)).rejects.toThrow(AppError);
  });

  it('rejects a nonce issued to a different public key', async () => {
    prismaMock.stellarNonce.findUnique.mockResolvedValue(nonceRecord({ publicKey: OTHER_KEY }));
    await expect(verifySignature(PUBLIC_KEY, NONCE, SIGNATURE)).rejects.toThrow(AppError);
  });

  it('rejects when a concurrent request consumed the nonce first', async () => {
    prismaMock.stellarNonce.updateMany.mockResolvedValue({ count: 0 });
    await expect(verifySignature(PUBLIC_KEY, NONCE, SIGNATURE)).rejects.toThrow(
      'Invalid or expired nonce',
    );
  });

  it('rejects an invalid public key', async () => {
    sdkMock.isValidEd25519PublicKey.mockReturnValue(false);
    await expect(verifySignature('bad', NONCE, SIGNATURE)).rejects.toThrow(
      'Invalid Stellar public key',
    );
  });
});