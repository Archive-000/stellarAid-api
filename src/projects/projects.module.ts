import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { Project } from './entities/project.entity';
import { Donation } from '../donations/entities/donation.entity';
import { ProjectHistory } from './entities/project-history.entity';
import { ProjectImage } from './entities/project-image.entity';
import { User } from '../users/entities/user.entity';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './providers/projects.service';
import { ImageUploadService } from './services/image-upload.service';
import { FileUploadService } from '../common/services/file-upload.service';
import { SearchService } from './services/search.service';
import { AnalyticsService } from './services/analytics.service';
import { ProjectsGateway } from './gateways/projects.gateway';
import { MailModule } from '../mail/mail.module';
import { DonationsModule } from '../donations/donations.module';
import { getMediaUploadPolicy } from '../common/utils/media-upload-policy';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      Donation,
      ProjectHistory,
      ProjectImage,
      User,
    ]),
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const uploadPolicy = getMediaUploadPolicy((key) =>
          configService.get<string>(key),
        );

        return {
          limits: {
            fileSize: uploadPolicy.maxFileSizeBytes,
            files: 10,
          },
          fileFilter: (_request, file, callback) => {
            if (
              !uploadPolicy.allowedMimeTypes.includes(
                file.mimetype.toLowerCase(),
              )
            ) {
              callback(
                new BadRequestException(
                  `Invalid file type. Allowed types: ${uploadPolicy.allowedMimeTypes.join(', ')}`,
                ),
                false,
              );
              return;
            }

            callback(null, true);
          },
        };
      },
    }),
    MailModule,
    DonationsModule,
  ],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    ImageUploadService,
    FileUploadService,
    SearchService,
    AnalyticsService,
    ProjectsGateway,
  ],
  exports: [
    ProjectsService,
    ImageUploadService,
    SearchService,
    AnalyticsService,
    ProjectsGateway,
  ],
})
export class ProjectsModule {}
