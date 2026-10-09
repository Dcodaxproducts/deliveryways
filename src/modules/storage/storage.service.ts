import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
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
  UploadImageDto,
} from './dto';
import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_FILE_SIZE_MB,
} from './storage.constants';
import {
  ImageProcessorService,
  UploadedImageFile,
} from './image-processor.service';

const LEGACY_IMAGE_PRESIGNED_SUNSET = new Date('2027-01-31T00:00:00.000Z');

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
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client | null = null;
  private s3ClientSignature = '';

  constructor(
    private readonly configService: ConfigService,
    private readonly imageProcessorService: ImageProcessorService,
  ) {}

  async resolveMediaUrlsDeep<T>(value: T): Promise<T> {
    const cache = new Map<string, Promise<string | null>>();

    const visit = async (input: unknown): Promise<unknown> => {
      if (Array.isArray(input)) {
        return Promise.all(input.map((item) => visit(item)));
      }

      if (!this.isPlainObject(input)) {
        return input;
      }

      const entries = await Promise.all(
        Object.entries(input).map(
          async ([key, nestedValue]) =>
            [
              key,
              this.isMediaField(key)
                ? await this.resolveMediaFieldValue(nestedValue, cache)
                : await visit(nestedValue),
            ] as const,
        ),
      );

      return Object.fromEntries(entries);
    };

    return (await visit(value)) as T;
  }

  async resolveViewUrl(fileUrl: string | null | undefined, expiresIn?: number) {
    if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.trim()) {
      return null;
    }

    const normalizedFileUrl = fileUrl.trim();
    const s3Config = this.getS3Config();

    try {
      const bucket = s3Config.bucket;
      if (!bucket || !s3Config.region) {
        return normalizedFileUrl;
      }

      const key = this.resolveObjectKey(undefined, normalizedFileUrl, s3Config);
      const client = this.createS3Client(s3Config);
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      return await getSignedUrl(client, command, {
        expiresIn: expiresIn ?? s3Config.presignedUploadExpirySeconds,
      });
    } catch {
      return normalizedFileUrl;
    }
  }

  async resolveTrustedPublicViewUrl(
    fileUrl: string | null | undefined,
    tenantId: string,
    restaurantId: string,
    expiresIn?: number,
  ): Promise<string | null> {
    if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.trim()) {
      return null;
    }

    const s3Config = this.getS3Config();
    if (!s3Config.bucket || !s3Config.region) {
      return null;
    }

    try {
      const key = this.resolveObjectKey(undefined, fileUrl.trim(), s3Config);
      const segments = key.split('/');
      const requiredPrefix = [
        StorageFolderEnum.UPLOADS,
        this.slugify(tenantId),
        this.slugify(restaurantId),
      ].join('/');
      if (
        !key.startsWith(`${requiredPrefix}/`) ||
        segments.some((segment) => segment === '.' || segment === '..')
      ) {
        return null;
      }

      const client = this.createS3Client(s3Config);
      return await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: s3Config.bucket, Key: key }),
        { expiresIn: expiresIn ?? s3Config.presignedUploadExpirySeconds },
      );
    } catch {
      return null;
    }
  }

  async createPresignedUploadUrl(
    user: AuthUserContext | undefined,
    dto: CreatePresignedUploadUrlDto,
  ) {
    if (
      !Number.isInteger(dto.fileSize) ||
      dto.fileSize < 1 ||
      dto.fileSize > MAX_UPLOAD_FILE_SIZE_BYTES
    ) {
      throw new BadRequestException(
        `File size must be less than or equal to ${MAX_UPLOAD_FILE_SIZE_MB}MB`,
      );
    }

    const normalizedContentType = dto.contentType.toLowerCase();
    const isLegacyImageUpload = normalizedContentType.startsWith('image/');
    if (isLegacyImageUpload && Date.now() >= LEGACY_IMAGE_PRESIGNED_SUNSET.getTime()) {
      throw new BadRequestException(
        'Image presigning has been retired; use /storage/upload-image',
      );
    }
    if (!isLegacyImageUpload && normalizedContentType !== 'application/pdf') {
      throw new BadRequestException('Only image and PDF uploads are supported');
    }
    if (isLegacyImageUpload) {
      this.logger.warn(
        JSON.stringify({
          event: 'legacy_image_presigned_upload_issued',
          authenticated: Boolean(user),
          role: user?.role ?? 'public-registration',
          sunsetAt: LEGACY_IMAGE_PRESIGNED_SUNSET.toISOString(),
          replacement: '/storage/upload-image',
        }),
      );
    }

    const folder = StorageFolderEnum.UPLOADS;
    const uploadTarget = this.resolveUploadTarget(
      dto.fileName,
      normalizedContentType,
    );

    if (user) {
      this.ensureFolderAccess(user, folder);
    }

    const s3Config = this.getS3Config();
    const bucket = s3Config.bucket;

    if (!bucket || !s3Config.region) {
      throw new InternalServerErrorException(
        'S3 bucket configuration is incomplete',
      );
    }

    const key = user
      ? this.buildObjectKey(user, uploadTarget.fileName, folder)
      : this.buildPublicRegistrationObjectKey(uploadTarget.fileName, folder);
    const client = this.createS3Client(s3Config);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: uploadTarget.contentType,
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
        'Content-Type': uploadTarget.contentType,
      },
      ...(isLegacyImageUpload
        ? {
            deprecated: true,
            sunsetAt: LEGACY_IMAGE_PRESIGNED_SUNSET.toISOString(),
            replacementEndpoint: '/storage/upload-image',
          }
        : {}),
    };
  }

  async uploadImage(
    user: AuthUserContext | undefined,
    file: UploadedImageFile | undefined,
    dto: UploadImageDto,
  ) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    const folder = StorageFolderEnum.UPLOADS;
    if (user) {
      this.ensureFolderAccess(user, folder);
    }

    const optimized = await this.imageProcessorService.optimize(
      file.buffer,
      file.mimetype,
      dto.assetType,
    );
    const s3Config = this.getS3Config();
    const bucket = s3Config.bucket;
    if (!bucket || !s3Config.region) {
      throw new InternalServerErrorException(
        'S3 bucket configuration is incomplete',
      );
    }

    const optimizedFileName = this.withExtension(
      file.originalname,
      optimized.extension,
    );
    const key = user
      ? this.buildObjectKey(user, optimizedFileName, folder)
      : this.buildPublicRegistrationObjectKey(optimizedFileName, folder);
    const client = this.createS3Client(s3Config);

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: optimized.buffer,
        ContentLength: optimized.buffer.length,
        ContentType: optimized.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
        ContentDisposition: 'inline',
        Metadata: {
          width: String(optimized.width),
          height: String(optimized.height),
          'source-bytes': String(optimized.sourceBytes),
        },
      }),
    );

    if (dto.replaceFileUrl) {
      if (!user) {
        await this.deleteKey(client, bucket, key);
        throw new ForbiddenException(
          'Authentication is required to replace an image',
        );
      }
      try {
        const oldKey = this.resolveObjectKey(
          undefined,
          dto.replaceFileUrl,
          s3Config,
        );
        this.ensureObjectAccess(user, oldKey);
        if (oldKey !== key) {
          await this.deleteKey(client, bucket, oldKey);
        }
      } catch (error: unknown) {
        await this.deleteKey(client, bucket, key);
        throw error;
      }
    }

    return {
      capability: 'optimized-image-v1',
      key,
      fileUrl: this.buildFileUrl(bucket, s3Config.region, key),
      contentType: optimized.contentType,
      width: optimized.width,
      height: optimized.height,
      sourceBytes: optimized.sourceBytes,
      bytes: optimized.buffer.length,
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

    const signature = [
      config.accessKeyId,
      config.secretAccessKey,
      config.region,
    ].join('\0');

    if (this.s3Client && this.s3ClientSignature === signature) {
      return this.s3Client;
    }

    this.s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.s3ClientSignature = signature;

    return this.s3Client;
  }

  private resolveUploadTarget(fileName: string, contentType: string) {
    if (!contentType.startsWith('image/')) {
      return { fileName, contentType };
    }

    const safeFileName = this.sanitizeFileName(fileName);
    const extension = extname(safeFileName);
    const baseName = extension
      ? safeFileName.slice(0, safeFileName.length - extension.length)
      : safeFileName;

    return {
      fileName: `${baseName || 'file'}.webp`,
      contentType: 'image/webp',
    };
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

  private buildPublicRegistrationObjectKey(
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

    return [
      folder,
      'public',
      'tenant-registration',
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

  private async resolveMediaFieldValue(
    value: unknown,
    cache: Map<string, Promise<string | null>>,
  ) {
    if (typeof value !== 'string') {
      return value;
    }

    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return value;
    }

    if (cache.has(normalizedValue)) {
      return (await cache.get(normalizedValue)) ?? value;
    }

    const resolvedPromise = this.resolveViewUrl(normalizedValue);
    cache.set(normalizedValue, resolvedPromise);
    const resolved = await resolvedPromise;
    return resolved;
  }

  private isMediaField(key: string) {
    return (
      key === 'avatarUrl' ||
      key === 'imageUrl' ||
      key === 'thumbnailUrl' ||
      key === 'allergenPdfUrl' ||
      key === 'logoUrl' ||
      key === 'coverImage'
    );
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
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
      return this.normalizeObjectKey(fileUrl);
    }

    const pathname = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));

    if (!pathname) {
      throw new BadRequestException('Invalid fileUrl path');
    }

    const publicBaseUrl = config.publicBaseUrl?.replace(/\/+$/, '');
    if (publicBaseUrl) {
      const parsedPublicBaseUrl = new URL(publicBaseUrl);
      const basePath = parsedPublicBaseUrl.pathname
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
      const hasExpectedPath =
        !basePath ||
        pathname === basePath ||
        pathname.startsWith(`${basePath}/`);

      if (parsedUrl.origin === parsedPublicBaseUrl.origin && hasExpectedPath) {
        return this.normalizeObjectKey(pathname.slice(basePath.length));
      }
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
          StorageFolderEnum.UPLOADS,
          StorageFolderEnum.MENU_ITEMS,
          StorageFolderEnum.RESTAURANT_LOGOS,
          StorageFolderEnum.BRANCH_COVERS,
          StorageFolderEnum.AVATARS,
        ];
      case UserRoleEnum.BRANCH_ADMIN:
        return [StorageFolderEnum.UPLOADS, StorageFolderEnum.AVATARS];
      case UserRoleEnum.STAFF:
        return [
          StorageFolderEnum.UPLOADS,
          StorageFolderEnum.MENU_ITEMS,
          StorageFolderEnum.AVATARS,
        ];
      case 'DELIVERYMAN':
        return [StorageFolderEnum.UPLOADS, StorageFolderEnum.AVATARS];
      case UserRoleEnum.CUSTOMER:
        return [StorageFolderEnum.UPLOADS, StorageFolderEnum.AVATARS];
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

    if (
      user.role === UserRoleEnum.CUSTOMER ||
      user.role === UserRoleEnum.STAFF
    ) {
      if (user.bid) {
        scopeParts.push(this.slugify(user.bid));
      }

      scopeParts.push(this.slugify(user.uid));
    }

    if (user.role === 'DELIVERYMAN') {
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

  private withExtension(fileName: string, extension: string): string {
    const safeFileName = this.sanitizeFileName(fileName);
    const currentExtension = extname(safeFileName);
    const baseName = currentExtension
      ? safeFileName.slice(0, -currentExtension.length)
      : safeFileName;
    return `${baseName || 'image'}${extension}`;
  }

  private async deleteKey(client: S3Client, bucket: string, key: string) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
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
