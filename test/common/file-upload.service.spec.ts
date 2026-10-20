import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { FileUploadService } from 'src/common/services/file-upload.service';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('FileUploadService', () => {
  const send = jest.fn();
  let service: FileUploadService;

  beforeEach(() => {
    send.mockReset();
    (S3Client as jest.Mock).mockImplementation(() => ({ send }));
    const configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const values: Record<string, string> = {
          AWS_REGION: 'us-east-1',
          MEDIA_ALLOWED_MIME_TYPES: 'image/png',
          MEDIA_MAX_FILE_SIZE_BYTES: '1024',
        };
        return values[key] ?? defaultValue;
      }),
      getOrThrow: jest.fn((key: string) => `test-${key}`),
    } as unknown as ConfigService;

    service = new FileUploadService(configService);
  });

  it('rejects unsupported files before sending them to S3', async () => {
    const file = {
      originalname: 'payload.exe',
      mimetype: 'application/x-msdownload',
      size: 100,
    } as Express.Multer.File;

    await expect(service.uploadFile(file, 'project-id')).rejects.toThrow(
      'Invalid file type',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects oversized files before sending them to S3', async () => {
    const file = {
      originalname: 'large.png',
      mimetype: 'image/png',
      size: 1025,
    } as Express.Multer.File;

    await expect(service.uploadFile(file, 'project-id')).rejects.toThrow(
      'File too large',
    );
    expect(send).not.toHaveBeenCalled();
  });
});
