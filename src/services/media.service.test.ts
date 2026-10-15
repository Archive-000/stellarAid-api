import { beforeEach, describe, expect, it, vi } from 'vitest';

const MEDIA_ID = 'media-1';
const USER_ID = 'user-1';

const { prismaMock, envMock, enqueueMock, objectExistsMock } = vi.hoisted(() => ({
  prismaMock: {
    media: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    artworkMedia: { create: vi.fn() },
    portfolioMedia: { create: vi.fn() },
  },
  envMock: {
    s3Bucket: 'test-bucket',
    s3Region: 'us-east-1',
    isProduction: false,
    verifyS3Upload: undefined as boolean | undefined,
  },
  enqueueMock: vi.fn(),
  objectExistsMock: vi.fn(),
}));

vi.mock('@/config', () => ({ env: envMock }));
vi.mock('@/services', () => ({ prisma: prismaMock }));
vi.mock('@/queues', () => ({ enqueueImageProcessing: enqueueMock }));
vi.mock('./s3.service', () => ({
  buildObjectKey: vi.fn(),
  buildPublicUrl: vi.fn((key: string) => `https://cdn/${key}`),
  createPresignedUploadUrl: vi.fn(),
  objectExists: objectExistsMock,
}));

import { confirmMediaUpload } from './media.service';

function makeMedia(overrides: Record<string, unknown> = {}) {
  return {
    id: MEDIA_ID,
    userId: USER_ID,
    type: 'IMAGE',
    variantOfId: null,
    bucket: 'test-bucket',
    key: 'images/user-1/file.jpg',
    mimeType: 'image/jpeg',
    size: BigInt(1024),
    width: null,
    height: null,
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  envMock.isProduction = false;
  envMock.verifyS3Upload = undefined;
  prismaMock.media.findUnique.mockResolvedValue(makeMedia());
  prismaMock.media.findMany.mockResolvedValue([]);
  enqueueMock.mockResolvedValue(undefined);
  objectExistsMock.mockResolvedValue(true);
});

describe('confirmMediaUpload S3 verification (#873)', () => {
  it('verifies the object exists before enqueueing when enabled', async () => {
    envMock.verifyS3Upload = true;

    await confirmMediaUpload(USER_ID, MEDIA_ID);

    expect(objectExistsMock).toHaveBeenCalledWith('images/user-1/file.jpg');
    expect(enqueueMock).toHaveBeenCalledWith(MEDIA_ID);
  });

  it('returns a clear error and skips enqueueing when the object is missing', async () => {
    envMock.verifyS3Upload = true;
    objectExistsMock.mockResolvedValue(false);

    await expect(confirmMediaUpload(USER_ID, MEDIA_ID)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
    });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('defaults to verifying in production without an explicit override', async () => {
    envMock.isProduction = true;

    await confirmMediaUpload(USER_ID, MEDIA_ID);

    expect(objectExistsMock).toHaveBeenCalled();
    expect(enqueueMock).toHaveBeenCalledWith(MEDIA_ID);
  });

  it('defaults to skipping verification outside production', async () => {
    await confirmMediaUpload(USER_ID, MEDIA_ID);

    expect(objectExistsMock).not.toHaveBeenCalled();
    expect(enqueueMock).toHaveBeenCalledWith(MEDIA_ID);
  });

  it('fails open on unexpected S3 errors rather than blocking confirm', async () => {
    envMock.verifyS3Upload = true;
    objectExistsMock.mockRejectedValue(new Error('S3 500'));

    await confirmMediaUpload(USER_ID, MEDIA_ID);

    expect(enqueueMock).toHaveBeenCalledWith(MEDIA_ID);
  });

  it('never verifies or enqueues for non-image media', async () => {
    envMock.verifyS3Upload = true;
    prismaMock.media.findUnique.mockResolvedValue(makeMedia({ type: 'DIGITAL_FILE' }));

    await confirmMediaUpload(USER_ID, MEDIA_ID);

    expect(objectExistsMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('rejects confirmation for media the user does not own', async () => {
    await expect(confirmMediaUpload('someone-else', MEDIA_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});
