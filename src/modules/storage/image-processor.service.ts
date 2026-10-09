import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as sharp from 'sharp';

export const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_INPUT_PIXELS = 40_000_000;
export const IMAGE_PROCESSING_TIMEOUT_SECONDS = 10;

export enum ImageAssetType {
  HERO = 'hero',
  CARD = 'card',
  THUMB = 'thumb',
  LOGO = 'logo',
}

interface ImageLimits {
  width: number;
  height: number;
}

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface OptimizedImage {
  buffer: Buffer;
  contentType: 'image/webp';
  extension: '.webp';
  width: number;
  height: number;
  sourceBytes: number;
}

const ASSET_LIMITS: Record<ImageAssetType, ImageLimits> = {
  [ImageAssetType.HERO]: { width: 2400, height: 1600 },
  [ImageAssetType.CARD]: { width: 1600, height: 1600 },
  [ImageAssetType.THUMB]: { width: 640, height: 640 },
  [ImageAssetType.LOGO]: { width: 1200, height: 1200 },
};

const MIME_BY_MAGIC = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
} as const;

type SupportedMagicType = keyof typeof MIME_BY_MAGIC;

@Injectable()
export class ImageProcessorService {
  private activeJobs = 0;
  private readonly waiters: Array<() => void> = [];
  private readonly maxConcurrentJobs = 2;
  private readonly maxQueuedJobs = 20;
  private readonly queueTimeoutMilliseconds = 10_000;

  constructor() {
    sharp.cache(false);
    sharp.concurrency(2);
  }

  async optimize(
    input: Buffer,
    declaredMimeType: string,
    assetType: ImageAssetType = ImageAssetType.CARD,
  ): Promise<OptimizedImage> {
    if (!input.length || input.length > MAX_IMAGE_UPLOAD_BYTES) {
      throw new BadRequestException(
        'Image size must be between 1 byte and 20MB',
      );
    }

    const magicType = this.detectMagicType(input);
    if (!magicType) {
      throw new BadRequestException(
        'Unsupported image bytes. JPEG, PNG, and WebP are supported',
      );
    }
    if (magicType === 'gif') {
      throw new BadRequestException('Animated images are not supported');
    }
    if (MIME_BY_MAGIC[magicType] !== declaredMimeType.toLowerCase()) {
      throw new BadRequestException(
        'Image content does not match its MIME type',
      );
    }

    await this.acquire();
    try {
      return await this.process(input, assetType);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Image is corrupt or cannot be processed');
    } finally {
      this.release();
    }
  }

  private async process(
    input: Buffer,
    assetType: ImageAssetType,
  ): Promise<OptimizedImage> {
    const source = sharp(input, {
      animated: true,
      failOn: 'warning',
      limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
      sequentialRead: true,
    }).timeout({ seconds: IMAGE_PROCESSING_TIMEOUT_SECONDS });
    const metadata = await source.metadata();

    if (!metadata.width || !metadata.height) {
      throw new BadRequestException('Image dimensions could not be read');
    }
    if ((metadata.pages ?? 1) > 1) {
      throw new BadRequestException('Animated images are not supported');
    }
    if (metadata.width * metadata.height > MAX_IMAGE_INPUT_PIXELS) {
      throw new BadRequestException(
        'Image dimensions exceed the 40 megapixel limit',
      );
    }

    const limits = ASSET_LIMITS[assetType];
    const { data, info } = await source
      .rotate()
      .resize({
        width: limits.width,
        height: limits.height,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82, alphaQuality: 90, effort: 4, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      contentType: 'image/webp',
      extension: '.webp',
      width: info.width,
      height: info.height,
      sourceBytes: input.length,
    };
  }

  private detectMagicType(input: Buffer): SupportedMagicType | null {
    if (
      input.length >= 3 &&
      input[0] === 0xff &&
      input[1] === 0xd8 &&
      input[2] === 0xff
    ) {
      return 'jpeg';
    }
    if (
      input.length >= 8 &&
      input
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      return 'png';
    }
    if (
      input.length >= 6 &&
      input.subarray(0, 4).toString('ascii') === 'GIF8'
    ) {
      return 'gif';
    }
    if (
      input.length >= 12 &&
      input.subarray(0, 4).toString('ascii') === 'RIFF' &&
      input.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'webp';
    }
    return null;
  }

  private async acquire(): Promise<void> {
    if (this.activeJobs < this.maxConcurrentJobs) {
      this.activeJobs += 1;
      return;
    }
    if (this.waiters.length >= this.maxQueuedJobs) {
      throw new ServiceUnavailableException(
        'Image processing is busy; retry later',
      );
    }

    await new Promise<void>((resolve, reject) => {
      const waiter = () => {
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(
          new ServiceUnavailableException(
            'Image processing queue timed out; retry later',
          ),
        );
      }, this.queueTimeoutMilliseconds);
      this.waiters.push(waiter);
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.activeJobs -= 1;
  }
}
