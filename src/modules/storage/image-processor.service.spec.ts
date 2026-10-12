import { BadRequestException } from '@nestjs/common';
import { writeFile } from 'fs/promises';
import * as sharp from 'sharp';
import {
  ImageAssetType,
  ImageProcessorService,
  MAX_IMAGE_UPLOAD_BYTES,
} from './image-processor.service';
import {
  createImageTempPath,
  ensureImageUploadTempDirectory,
  removeImageTempFile,
} from './image-upload-temp.storage';

describe('ImageProcessorService', () => {
  const service = new ImageProcessorService();
  const createdPaths = new Set<string>();

  const writeFixture = async (fixture: Buffer): Promise<string> => {
    await ensureImageUploadTempDirectory();
    const path = createImageTempPath();
    await writeFile(path, fixture, { mode: 0o600 });
    createdPaths.add(path);
    return path;
  };

  afterEach(async () => {
    await Promise.all(
      [...createdPaths].map((path) => removeImageTempFile(path)),
    );
    createdPaths.clear();
  });

  it('auto-orients EXIF JPEG, strips metadata, bounds dimensions, and emits WebP', async () => {
    const fixture = await sharp({
      create: { width: 2600, height: 1400, channels: 3, background: '#d13f2f' },
    })
      .jpeg({ quality: 100 })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const inputPath = await writeFixture(fixture);

    const output = await service.optimize(
      inputPath,
      'image/jpeg',
      ImageAssetType.HERO,
    );
    createdPaths.add(output.path);
    const metadata = await sharp(output.path).metadata();

    expect(output.contentType).toBe('image/webp');
    expect(metadata.format).toBe('webp');
    expect(metadata.orientation).toBeUndefined();
    expect(output.width).toBeLessThanOrEqual(2400);
    expect(output.height).toBeLessThanOrEqual(1600);
    expect(output.width).toBeLessThan(output.height);
    expect(output.bytes).toBeLessThan(fixture.length);
  });

  it('bounds oversized PNG thumbnails and preserves alpha', async () => {
    const fixture = await sharp({
      create: {
        width: 1600,
        height: 800,
        channels: 4,
        background: { r: 20, g: 80, b: 160, alpha: 0.35 },
      },
    })
      .png()
      .toBuffer();
    const inputPath = await writeFixture(fixture);

    const output = await service.optimize(
      inputPath,
      'image/png',
      ImageAssetType.THUMB,
    );
    createdPaths.add(output.path);
    const metadata = await sharp(output.path).metadata();

    expect(output.width).toBe(640);
    expect(output.height).toBe(320);
    expect(metadata.hasAlpha).toBe(true);
  });

  it('does not upscale a small image', async () => {
    const fixture = await sharp({
      create: { width: 120, height: 80, channels: 3, background: '#334455' },
    })
      .jpeg()
      .toBuffer();
    const inputPath = await writeFixture(fixture);
    const output = await service.optimize(
      inputPath,
      'image/jpeg',
      ImageAssetType.HERO,
    );
    createdPaths.add(output.path);
    expect(output.width).toBe(120);
    expect(output.height).toBe(80);
  });

  it.each([
    ['spoofed MIME', Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/png'],
    ['corrupt JPEG', Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'],
    [
      'SVG',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      'image/svg+xml',
    ],
    ['GIF animation', Buffer.from('GIF89a000000'), 'image/gif'],
  ])('rejects %s input', async (_name, fixture, mimeType) => {
    const inputPath = await writeFixture(fixture);
    await expect(service.optimize(inputPath, mimeType)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a file larger than 20MB without loading it into memory', async () => {
    const path = await writeFixture(Buffer.from([0xff, 0xd8, 0xff]));
    const handle = await import('fs/promises');
    await handle.truncate(path, MAX_IMAGE_UPLOAD_BYTES + 1);
    await expect(service.optimize(path, 'image/jpeg')).rejects.toThrow(
      'Image size must be between 1 byte and 20MB',
    );
  });
});
