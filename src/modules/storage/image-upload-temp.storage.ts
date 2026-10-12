import { randomUUID } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, open, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { Request } from 'express';
import { StorageEngine } from 'multer';

export const IMAGE_UPLOAD_TEMP_DIRECTORY = join(
  tmpdir(),
  'deliveryways-image-uploads',
);

export interface DiskUploadedImageFile {
  destination: string;
  filename: string;
  mimetype: string;
  originalname: string;
  path: string;
  size: number;
}

export async function ensureImageUploadTempDirectory(): Promise<void> {
  await mkdir(IMAGE_UPLOAD_TEMP_DIRECTORY, { recursive: true, mode: 0o700 });
}

export function createImageTempPath(): string {
  return join(IMAGE_UPLOAD_TEMP_DIRECTORY, randomUUID());
}

export async function removeImageTempFile(
  path: string | undefined,
): Promise<void> {
  if (
    !path ||
    dirname(resolve(path)) !== resolve(IMAGE_UPLOAD_TEMP_DIRECTORY)
  ) {
    return;
  }
  await rm(path, { force: true });
}

export async function readImageMagic(path: string): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function getImageTempFileSize(path: string): Promise<number> {
  return (await stat(path)).size;
}

export function createImageTempReadStream(path: string) {
  return createReadStream(path);
}

export class ImageUploadTempStorage implements StorageEngine {
  _handleFile(
    request: Request,
    file: Express.Multer.File,
    callback: (error?: unknown, info?: Partial<Express.Multer.File>) => void,
  ): void {
    void this.handleFile(request, file, callback);
  }

  private async handleFile(
    request: Request,
    file: Express.Multer.File,
    callback: (error?: unknown, info?: Partial<Express.Multer.File>) => void,
  ): Promise<void> {
    const path = createImageTempPath();
    const onAborted = (): void => {
      file.stream.destroy(new Error('Upload aborted'));
      void removeImageTempFile(path);
    };

    request.once('aborted', onAborted);
    try {
      await ensureImageUploadTempDirectory();
      await pipeline(
        file.stream,
        createWriteStream(path, { flags: 'wx', mode: 0o600 }),
      );
      const size = await getImageTempFileSize(path);
      callback(undefined, {
        destination: IMAGE_UPLOAD_TEMP_DIRECTORY,
        filename: path.slice(IMAGE_UPLOAD_TEMP_DIRECTORY.length + 1),
        path,
        size,
      });
    } catch (error: unknown) {
      await removeImageTempFile(path);
      callback(error);
    } finally {
      request.off('aborted', onAborted);
    }
  }

  _removeFile(
    request: Request,
    file: Express.Multer.File,
    callback: (error: Error | null) => void,
  ): void {
    void this.removeFile(request, file, callback);
  }

  private async removeFile(
    _request: Request,
    file: Express.Multer.File,
    callback: (error: Error | null) => void,
  ): Promise<void> {
    try {
      await removeImageTempFile(file.path);
      callback(null);
    } catch (error: unknown) {
      callback(error instanceof Error ? error : new Error('Cleanup failed'));
    }
  }
}

export function imageUploadFileFilter(
  _request: Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
): void {
  callback(
    null,
    ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
      file.mimetype.toLowerCase(),
    ),
  );
}
