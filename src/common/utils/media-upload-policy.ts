import { BadRequestException } from '@nestjs/common';

export interface MediaUploadPolicy {
  allowedMimeTypes: string[];
  maxFileSizeBytes: number;
}

const DEFAULT_ALLOWED_MIME_TYPES = 'image/jpeg,image/png,image/webp';
const DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export function getMediaUploadPolicy(
  getConfig: (key: string) => string | undefined,
): MediaUploadPolicy {
  const allowedMimeTypes = (
    getConfig('MEDIA_ALLOWED_MIME_TYPES') ?? DEFAULT_ALLOWED_MIME_TYPES
  )
    .split(',')
    .map((mimeType) => mimeType.trim().toLowerCase())
    .filter(Boolean);
  const configuredMaxSize = getConfig('MEDIA_MAX_FILE_SIZE_BYTES');
  const maxFileSizeBytes = configuredMaxSize
    ? Number(configuredMaxSize)
    : DEFAULT_MAX_FILE_SIZE_BYTES;

  if (!allowedMimeTypes.length) {
    throw new Error('MEDIA_ALLOWED_MIME_TYPES must include at least one type');
  }
  if (!Number.isSafeInteger(maxFileSizeBytes) || maxFileSizeBytes <= 0) {
    throw new Error('MEDIA_MAX_FILE_SIZE_BYTES must be a positive integer');
  }

  return { allowedMimeTypes, maxFileSizeBytes };
}

export function validateMediaFile(
  file: Pick<Express.Multer.File, 'mimetype' | 'size'>,
  policy: MediaUploadPolicy,
): void {
  if (!policy.allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
    throw new BadRequestException(
      `Invalid file type. Allowed types: ${policy.allowedMimeTypes.join(', ')}`,
    );
  }

  if (file.size > policy.maxFileSizeBytes) {
    throw new BadRequestException(
      `File too large. Maximum size is ${policy.maxFileSizeBytes} bytes`,
    );
  }
}
