import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Request, Response } from 'express';
import { MAX_IMAGE_UPLOAD_BYTES } from './image-processor.service';

const RATE_WINDOW_MILLISECONDS = 60_000;
const RATE_LIMIT_PER_KEY = 10;
const GLOBAL_RATE_LIMIT = 60;
const MAX_ACTIVE_PER_KEY = 2;
const MAX_ACTIVE_UPLOADS = 4;
const MAX_RATE_KEYS = 20_000;

interface RateWindow {
  count: number;
  resetAt: number;
}

@Injectable()
export class ImageUploadAdmissionGuard implements CanActivate {
  private readonly rateWindows = new Map<string, RateWindow>();
  private readonly activeByKey = new Map<string, number>();
  private globalRateWindow: RateWindow = { count: 0, resetAt: 0 };
  private activeUploads = 0;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    this.rejectKnownOversizeBody(request, response);

    const now = Date.now();
    const key = this.createAdmissionKey(request);
    this.pruneExpiredRateWindows(now);
    this.consumeGlobalRate(now, response);
    this.consumeKeyRate(key, now, response);

    const activeForKey = this.activeByKey.get(key) ?? 0;
    if (
      this.activeUploads >= MAX_ACTIVE_UPLOADS ||
      activeForKey >= MAX_ACTIVE_PER_KEY
    ) {
      this.reject(response, 1, 'Image upload capacity is busy; retry later');
    }

    this.activeUploads += 1;
    this.activeByKey.set(key, activeForKey + 1);
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      response.off('finish', release);
      response.off('close', release);
      request.off('aborted', release);
      this.activeUploads = Math.max(0, this.activeUploads - 1);
      const remaining = (this.activeByKey.get(key) ?? 1) - 1;
      if (remaining > 0) this.activeByKey.set(key, remaining);
      else this.activeByKey.delete(key);
    };
    response.once('finish', release);
    response.once('close', release);
    request.once('aborted', release);
    return true;
  }

  private rejectKnownOversizeBody(request: Request, response: Response): void {
    const contentLength = request.headers['content-length'];
    if (!contentLength) return;
    const bodyBytes = Number(contentLength);
    if (
      Number.isFinite(bodyBytes) &&
      bodyBytes > MAX_IMAGE_UPLOAD_BYTES + 64 * 1024
    ) {
      this.reject(response, 60, 'Image upload exceeds the 20MB limit');
    }
  }

  private consumeGlobalRate(now: number, response: Response): void {
    if (this.globalRateWindow.resetAt <= now) {
      this.globalRateWindow = {
        count: 0,
        resetAt: now + RATE_WINDOW_MILLISECONDS,
      };
    }
    if (this.globalRateWindow.count >= GLOBAL_RATE_LIMIT) {
      this.reject(
        response,
        this.retryAfterSeconds(this.globalRateWindow.resetAt, now),
        'Image upload rate limit exceeded',
      );
    }
    this.globalRateWindow.count += 1;
  }

  private consumeKeyRate(key: string, now: number, response: Response): void {
    let window = this.rateWindows.get(key);
    if (!window) {
      if (this.rateWindows.size >= MAX_RATE_KEYS) {
        this.reject(
          response,
          60,
          'Image upload admission is busy; retry later',
        );
      }
      window = { count: 0, resetAt: now + RATE_WINDOW_MILLISECONDS };
      this.rateWindows.set(key, window);
    }
    if (window.count >= RATE_LIMIT_PER_KEY) {
      this.reject(
        response,
        this.retryAfterSeconds(window.resetAt, now),
        'Image upload rate limit exceeded',
      );
    }
    window.count += 1;
  }

  private createAdmissionKey(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const edgeAddress = forwardedValue
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .at(-1);
    const address = edgeAddress || request.socket.remoteAddress || 'unknown';
    return createHash('sha256').update(address).digest('base64url');
  }

  private pruneExpiredRateWindows(now: number): void {
    for (const [key, window] of this.rateWindows) {
      if (window.resetAt <= now) this.rateWindows.delete(key);
    }
  }

  private retryAfterSeconds(resetAt: number, now: number): number {
    return Math.max(1, Math.ceil((resetAt - now) / 1000));
  }

  private reject(
    response: Response,
    retryAfterSeconds: number,
    message: string,
  ): never {
    response.setHeader('Retry-After', String(retryAfterSeconds));
    throw new HttpException(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, message },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
