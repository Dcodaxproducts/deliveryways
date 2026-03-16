import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { AuthUserContext } from '../../common/decorators';
import { CreatePresignedUploadUrlDto } from './dto';

interface S3Config {
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  bucket?: string;
  publicBaseUrl?: string;
  presignedUploadExpirySeconds: number;
}

@Injectable()
export class StorageService {
  constructor(private readonly configService: ConfigService) {}

  async createPresignedUploadUrl(
    user: AuthUserContext,
    dto: CreatePresignedUploadUrlDto,
  ) {
    if (!dto.contentType.toLowerCase().startsWith('image/')) {
      throw new BadRequestException('Only image uploads are supported');
    }

    const s3Config = this.getS3Config();
    const bucket = s3Config.bucket;

    if (!bucket || !s3Config.region) {
      throw new InternalServerErrorException(
        'S3 bucket configuration is incomplete',
      );
    }

    const key = this.buildObjectKey(user, dto.fileName, dto.folder);
    const client = this.createS3Client(s3Config);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: dto.contentType,
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: s3Config.presignedUploadExpirySeconds,
    });

    return {
      method: 'PUT',
      uploadUrl,
      key,
      fileUrl: this.buildFileUrl(bucket, s3Config.region, key),
      expiresIn: s3Config.presignedUploadExpirySeconds,
      headers: {
        'Content-Type': dto.contentType,
      },
    };
  }

  private getS3Config(): S3Config {
    return {
      accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
      region: this.configService.get<string>('AWS_REGION'),
      bucket: this.configService.get<string>('AWS_BUCKET_NAME'),
      publicBaseUrl: this.configService.get<string>('AWS_PUBLIC_BASE_URL'),
      presignedUploadExpirySeconds: this.configService.get<number>(
        'AWS_PRESIGNED_UPLOAD_EXPIRY_SECONDS',
        300,
      ),
    };
  }

  private createS3Client(config: S3Config) {
    if (!config.accessKeyId || !config.secretAccessKey || !config.region) {
      throw new InternalServerErrorException(
        'S3 credentials are not configured',
      );
    }

    return new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  private buildObjectKey(
    user: AuthUserContext,
    fileName: string,
    folder?: string,
  ) {
    const safeFileName = this.sanitizeFileName(fileName);
    const extension = extname(safeFileName);
    const baseName = safeFileName.slice(
      0,
      safeFileName.length - extension.length,
    );
    const normalizedBaseName = this.slugify(baseName) || 'file';
    const date = new Date().toISOString().slice(0, 10);
    const baseFolder = folder
      ? folder
          .split('/')
          .map((part) => this.slugify(part))
          .filter(Boolean)
          .join('/')
      : 'uploads';
    const scopeParts = [user.tid, user.rid, user.bid, user.uid]
      .filter((value): value is string => Boolean(value))
      .map((value) => this.slugify(value))
      .filter(Boolean);

    return [
      baseFolder,
      ...scopeParts,
      date,
      `${randomUUID()}-${normalizedBaseName}${extension.toLowerCase()}`,
    ].join('/');
  }

  private buildFileUrl(bucket: string, region: string, key: string) {
    const publicBaseUrl = this.configService.get<string>('AWS_PUBLIC_BASE_URL');
    const normalizedKey = key.split('/').map(encodeURIComponent).join('/');

    if (publicBaseUrl) {
      return `${publicBaseUrl.replace(/\/+$/, '')}/${normalizedKey}`;
    }

    return `https://${bucket}.s3.${region}.amazonaws.com/${normalizedKey}`;
  }

  private sanitizeFileName(fileName: string) {
    const trimmed = fileName.trim();

    if (!trimmed) {
      throw new BadRequestException('fileName is required');
    }

    return trimmed.replace(/\\/g, '/').split('/').pop() ?? trimmed;
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
