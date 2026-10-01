import { BadRequestException } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sharp = require('sharp');
import { ImageOptimizerService } from './image-optimizer.service';
import { MAX_UPLOAD_FILE_SIZE_BYTES } from './storage.constants';

describe('ImageOptimizerService', () => {
  const service = new ImageOptimizerService();

  it('validates actual pixels and emits metadata-free bounded WebP', async () => {
    const source = await sharp({
      create: { width: 3200, height: 1600, channels: 4, background: '#dc2626' },
    })
      .png()
      .withMetadata({ orientation: 1 })
      .toBuffer();
    const output = await service.optimize(source);
    const metadata = await sharp(output.buffer).metadata();
    expect(output.contentType).toBe('image/webp');
    expect(output.width).toBe(2048);
    expect(output.height).toBe(1024);
    expect(metadata.format).toBe('webp');
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });

  it('rejects corrupt data even if a client claimed it was an image', async () => {
    await expect(
      service.optimize(Buffer.from('not an image')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversized payloads before decoding', async () => {
    await expect(
      service.optimize(Buffer.alloc(MAX_UPLOAD_FILE_SIZE_BYTES + 1)),
    ).rejects.toThrow('exceeds 20MB');
  });
});
