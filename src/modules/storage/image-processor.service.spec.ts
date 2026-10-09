import { BadRequestException } from '@nestjs/common';
import * as sharp from 'sharp';
import {
  ImageAssetType,
  ImageProcessorService,
} from './image-processor.service';

describe('ImageProcessorService', () => {
  const service = new ImageProcessorService();

  it('auto-orients EXIF JPEG, strips metadata, bounds dimensions, and emits WebP', async () => {
    const fixture = await sharp({
      create: { width: 2600, height: 1400, channels: 3, background: '#d13f2f' },
    })
      .jpeg({ quality: 100 })
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const output = await service.optimize(
      fixture,
      'image/jpeg',
      ImageAssetType.HERO,
    );
    const metadata = await sharp(output.buffer).metadata();

    expect(output.contentType).toBe('image/webp');
    expect(metadata.format).toBe('webp');
    expect(metadata.orientation).toBeUndefined();
    expect(output.width).toBeLessThanOrEqual(2400);
    expect(output.height).toBeLessThanOrEqual(1600);
    expect(output.width).toBeLessThan(output.height);
    expect(output.buffer.length).toBeLessThan(fixture.length);
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

    const output = await service.optimize(
      fixture,
      'image/png',
      ImageAssetType.THUMB,
    );
    const metadata = await sharp(output.buffer).metadata();

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
    const output = await service.optimize(
      fixture,
      'image/jpeg',
      ImageAssetType.HERO,
    );
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
    ['GIF', Buffer.from('GIF89a000000'), 'image/gif'],
  ])('rejects %s input', async (_name, fixture, mimeType) => {
    await expect(service.optimize(fixture, mimeType)).rejects.toThrow(
      BadRequestException,
    );
  });
});
