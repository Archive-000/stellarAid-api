import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { File } from 'buffer';
import {
  getMediaUploadPolicy,
  validateMediaFile,
} from '../utils/media-upload-policy';
import { MediaUploadPolicy } from '../utils/media-upload-policy';

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private readonly s3Client: S3Client;
  private readonly uploadPolicy: MediaUploadPolicy;

  constructor(private configService: ConfigService) {
    this.uploadPolicy = getMediaUploadPolicy((key) =>
      this.configService.get<string>(key),
    );
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });
  }

  async uploadFile(
    file: Express.Multer.File,
    projectId: string,
  ): Promise<string> {
    validateMediaFile(file, this.uploadPolicy);

    const fileExtension = file.originalname.split('.').pop();
    const fileName = `${randomUUID()}.${fileExtension}`;
    const key = `projects/${projectId}/images/${fileName}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.configService.getOrThrow<string>('AWS_S3_BUCKET'),
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ACL: 'public-read',
        }),
      );

      const publicUrl = `https://${this.configService.getOrThrow<string>('AWS_S3_BUCKET')}.s3.${this.configService.get<string>('AWS_REGION', 'us-east-1')}.amazonaws.com/${key}`;

      this.logger.log(`File uploaded successfully: ${fileName}`);
      return publicUrl;
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`);
      throw error;
    }
  }

  async deleteFile(imageUrl: string): Promise<void> {
    try {
      const url = new URL(imageUrl);
      const key = url.pathname.substring(1); // Remove leading '/'

      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.configService.getOrThrow<string>('AWS_S3_BUCKET'),
          Key: key,
        }),
      );

      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`);
      throw error;
    }
  }

  generatePresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    return getSignedUrl(
      this.s3Client,
      new PutObjectCommand({
        Bucket: this.configService.getOrThrow<string>('AWS_S3_BUCKET'),
        Key: key,
      }),
      { expiresIn },
    );
  }
}
