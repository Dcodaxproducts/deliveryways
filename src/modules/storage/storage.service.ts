import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import {
  CreatePresignedUploadUrlDto,
  CreatePresignedViewUrlDto,
  DeleteStoredFileDto,
  StorageFolderEnum,
} from './dto';

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

    this.ensureFolderAccess(user, dto.folder);

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

  async createPresignedViewUrl(
    user: AuthUserContext,
    dto: CreatePresignedViewUrlDto,
  ) {
    const s3Config = this.getS3Config();
    const bucket = s3Config.bucket;

    if (!bucket || !s3Config.region) {
      throw new InternalServerErrorException(
        'S3 bucket configuration is incomplete',
      );
    }

    const key = this.resolveObjectKey(dto.key, dto.fileUrl, s3Config);
    this.ensureObjectAccess(user, key);

    const client = this.createS3Client(s3Config);
    const expiresIn = dto.expiresIn ?? s3Config.presignedUploadExpirySeconds;
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const viewUrl = await getSignedUrl(client, command, {
      expiresIn,
    });

    return {
      method: 'GET',
      url: viewUrl,
      key,
      fileUrl: this.buildFileUrl(bucket, s3Config.region, key),
      expiresIn,
    };
  }

  async deleteObject(user: AuthUserContext, dto: DeleteStoredFileDto) {
    const s3Config = this.getS3Config();
    const bucket = s3Config.bucket;

    if (!bucket || !s3Config.region) {
      throw new InternalServerErrorException(
        'S3 bucket configuration is incomplete',
      );
    }

    const key = this.resolveObjectKey(dto.key, dto.fileUrl, s3Config);
    this.ensureObjectAccess(user, key);

    const client = this.createS3Client(s3Config);
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    return {
      data: {
        key,
        fileUrl: this.buildFileUrl(bucket, s3Config.region, key),
      },
      message: 'File deleted successfully',
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
    folder: StorageFolderEnum,
  ) {
    const safeFileName = this.sanitizeFileName(fileName);
    const extension = extname(safeFileName);
    const baseName = safeFileName.slice(
      0,
      safeFileName.length - extension.length,
    );
    const normalizedBaseName = this.slugify(baseName) || 'file';
    const date = new Date().toISOString().slice(0, 10);
    const scopeParts = [user.tid, user.rid, user.bid, user.uid]
      .filter((value): value is string => Boolean(value))
      .map((value) => this.slugify(value))
      .filter(Boolean);

    return [
      folder,
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

  private resolveObjectKey(
    key: string | undefined,
    fileUrl: string | undefined,
    config: S3Config,
  ) {
    const normalizedKey = key?.trim();
    if (normalizedKey) {
      return this.normalizeObjectKey(normalizedKey);
    }

    const normalizedFileUrl = fileUrl?.trim();
    if (!normalizedFileUrl) {
      throw new BadRequestException('Either key or fileUrl is required');
    }

    return this.extractKeyFromFileUrl(normalizedFileUrl, config);
  }

  private extractKeyFromFileUrl(fileUrl: string, config: S3Config) {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(fileUrl);
    } catch {
      throw new BadRequestException('fileUrl must be a valid URL');
    }

    const pathname = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));

    if (!pathname) {
      throw new BadRequestException('Invalid fileUrl path');
    }

    const publicBaseUrl = config.publicBaseUrl?.replace(/\/+$/, '');
    if (publicBaseUrl && fileUrl.startsWith(publicBaseUrl)) {
      return this.normalizeObjectKey(pathname);
    }

    if (!config.bucket || !config.region) {
      throw new InternalServerErrorException(
        'S3 bucket configuration is incomplete',
      );
    }

    const expectedHosts = new Set([
      `${config.bucket}.s3.${config.region}.amazonaws.com`,
      `${config.bucket}.s3.amazonaws.com`,
    ]);

    if (!expectedHosts.has(parsedUrl.host)) {
      throw new BadRequestException('fileUrl does not belong to configured S3');
    }

    return this.normalizeObjectKey(pathname);
  }

  private normalizeObjectKey(key: string) {
    return key
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join('/');
  }

  private ensureObjectAccess(user: AuthUserContext, key: string) {
    const [folder, ...rest] = key.split('/');

    if (!folder || !rest.length) {
      throw new BadRequestException('Invalid storage key');
    }

    if (
      !Object.values(StorageFolderEnum).includes(folder as StorageFolderEnum)
    ) {
      throw new ForbiddenException('Folder is not allowed');
    }

    this.ensureFolderAccess(user, folder as StorageFolderEnum);

    const requiredPrefix = this.getRequiredScopePrefix(
      user,
      folder as StorageFolderEnum,
    );
    if (requiredPrefix && !key.startsWith(requiredPrefix)) {
      throw new ForbiddenException('Cross-scope storage access denied');
    }
  }

  private ensureFolderAccess(user: AuthUserContext, folder: StorageFolderEnum) {
    const allowedFolders = this.getAllowedFolders(user);

    if (!allowedFolders.includes(folder)) {
      throw new ForbiddenException(`Uploads to ${folder} are not allowed`);
    }
  }

  private getAllowedFolders(user: AuthUserContext): StorageFolderEnum[] {
    switch (user.role) {
      case UserRoleEnum.SUPER_ADMIN:
      case UserRoleEnum.BUSINESS_ADMIN:
        return [
          StorageFolderEnum.MENU_ITEMS,
          StorageFolderEnum.RESTAURANT_LOGOS,
          StorageFolderEnum.BRANCH_COVERS,
          StorageFolderEnum.AVATARS,
        ];
      case UserRoleEnum.BRANCH_ADMIN:
        return [StorageFolderEnum.AVATARS];
      case UserRoleEnum.CUSTOMER:
        return [StorageFolderEnum.AVATARS];
      default:
        return [];
    }
  }

  private getRequiredScopePrefix(
    user: AuthUserContext,
    folder: StorageFolderEnum,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return `${folder}/`;
    }

    const scopeParts: string[] = [];

    if (user.tid) {
      scopeParts.push(this.slugify(user.tid));
    }

    if (user.rid) {
      scopeParts.push(this.slugify(user.rid));
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN && user.bid) {
      scopeParts.push(this.slugify(user.bid));
    }

    if (user.role === UserRoleEnum.CUSTOMER) {
      if (user.bid) {
        scopeParts.push(this.slugify(user.bid));
      }

      scopeParts.push(this.slugify(user.uid));
    }

    return `${folder}/${scopeParts.join('/')}/`;
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
