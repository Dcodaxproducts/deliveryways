import { BadRequestException, Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sharp = require('sharp');
import { MAX_UPLOAD_FILE_SIZE_BYTES } from './storage.constants';

const MAX_IMAGE_DIMENSION = 12_000;
const OUTPUT_IMAGE_DIMENSION = 2_048;
const SUPPORTED_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif']);

export type OptimizedImage = {
  buffer: Buffer;
  width: number;
  height: number;
  contentType: 'image/webp';
};

@Injectable()
export class ImageOptimizerService {
  async optimize(input: Buffer): Promise<OptimizedImage> {
    if (input.length < 1 || input.length > MAX_UPLOAD_FILE_SIZE_BYTES) {
      throw new BadRequestException('Image size is invalid or exceeds 20MB');
    }

    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(input, { failOn: 'error' }).metadata();
    } catch {
      throw new BadRequestException('Image file is corrupt or unsupported');
    }

    if (
      !metadata.format ||
      !SUPPORTED_IMAGE_FORMATS.has(metadata.format) ||
      !metadata.width ||
      !metadata.height
    ) {
      throw new BadRequestException('Image file is corrupt or unsupported');
    }

    if (
      metadata.width > MAX_IMAGE_DIMENSION ||
      metadata.height > MAX_IMAGE_DIMENSION
    ) {
      throw new BadRequestException(
        'Image dimensions must not exceed 12000×12000 pixels',
      );
    }

    const result = await sharp(input, { failOn: 'error' })
      .rotate()
      .resize({
        width: OUTPUT_IMAGE_DIMENSION,
        height: OUTPUT_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: result.data,
      width: result.info.width,
      height: result.info.height,
      contentType: 'image/webp',
    };
  }
}
