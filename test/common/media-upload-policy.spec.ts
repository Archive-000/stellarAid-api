import {
  getMediaUploadPolicy,
  validateMediaFile,
} from 'src/common/utils/media-upload-policy';

describe('media upload policy', () => {
  it('uses the configured MIME types and maximum file size', () => {
    const policy = getMediaUploadPolicy(
      (key) =>
        ({
          MEDIA_ALLOWED_MIME_TYPES: 'image/png, application/pdf',
          MEDIA_MAX_FILE_SIZE_BYTES: '2048',
        })[key],
    );

    expect(policy).toEqual({
      allowedMimeTypes: ['image/png', 'application/pdf'],
      maxFileSizeBytes: 2048,
    });
    expect(() =>
      validateMediaFile({ mimetype: 'image/png', size: 2048 }, policy),
    ).not.toThrow();
  });

  it('rejects MIME types outside the configured allowlist', () => {
    const policy = getMediaUploadPolicy(() => undefined);

    expect(() =>
      validateMediaFile(
        { mimetype: 'application/x-msdownload', size: 100 },
        policy,
      ),
    ).toThrow('Invalid file type');
  });

  it('rejects files larger than the configured maximum', () => {
    const policy = getMediaUploadPolicy((key) =>
      key === 'MEDIA_MAX_FILE_SIZE_BYTES' ? '1024' : undefined,
    );

    expect(() =>
      validateMediaFile({ mimetype: 'image/jpeg', size: 1025 }, policy),
    ).toThrow('File too large');
  });

  it('rejects invalid configuration', () => {
    expect(() =>
      getMediaUploadPolicy((key) =>
        key === 'MEDIA_MAX_FILE_SIZE_BYTES' ? '0' : undefined,
      ),
    ).toThrow('MEDIA_MAX_FILE_SIZE_BYTES must be a positive integer');
  });
});
