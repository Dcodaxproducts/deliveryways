import { ExecutionContext, HttpException } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Request, Response } from 'express';
import { ImageUploadAdmissionGuard } from './image-upload-admission.guard';
import { MAX_IMAGE_UPLOAD_BYTES } from './image-processor.service';

interface AdmissionHarness {
  context: ExecutionContext;
  requestEvents: EventEmitter;
  responseEvents: EventEmitter;
  headers: Map<string, string>;
}

function createHarness(
  address: string,
  contentLength?: number,
): AdmissionHarness {
  const requestEvents = new EventEmitter();
  const responseEvents = new EventEmitter();
  const headers = new Map<string, string>();
  const request = {
    headers: contentLength ? { 'content-length': String(contentLength) } : {},
    socket: { remoteAddress: address },
    once: requestEvents.once.bind(requestEvents),
    off: requestEvents.off.bind(requestEvents),
  } as unknown as Request;
  const response = {
    once: responseEvents.once.bind(responseEvents),
    off: responseEvents.off.bind(responseEvents),
    setHeader: (name: string, value: string) => headers.set(name, value),
  } as unknown as Response;
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, requestEvents, responseEvents, headers };
}

describe('ImageUploadAdmissionGuard', () => {
  it('rejects a known oversized request before body interception', () => {
    const guard = new ImageUploadAdmissionGuard();
    const harness = createHarness(
      '203.0.113.10',
      MAX_IMAGE_UPLOAD_BYTES + 64 * 1024 + 1,
    );

    expect(() => guard.canActivate(harness.context)).toThrow(HttpException);
    expect(harness.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect(harness.requestEvents.listenerCount('aborted')).toBe(0);
  });

  it('caps active uploads per admission key before Multer can read a body', () => {
    const guard = new ImageUploadAdmissionGuard();
    const first = createHarness('203.0.113.11');
    const second = createHarness('203.0.113.11');
    const rejected = createHarness('203.0.113.11');

    expect(guard.canActivate(first.context)).toBe(true);
    expect(guard.canActivate(second.context)).toBe(true);
    expect(() => guard.canActivate(rejected.context)).toThrow(HttpException);
    expect(rejected.headers.get('Retry-After')).toBe('1');

    first.responseEvents.emit('finish');
    expect(guard.canActivate(rejected.context)).toBe(true);
    second.responseEvents.emit('close');
    rejected.requestEvents.emit('aborted');
  });

  it('caps process-wide active uploads across distinct edge addresses', () => {
    const guard = new ImageUploadAdmissionGuard();
    const admitted = [1, 2, 3, 4].map((suffix) =>
      createHarness(`198.51.100.${suffix}`),
    );
    for (const harness of admitted) {
      expect(guard.canActivate(harness.context)).toBe(true);
    }

    const rejected = createHarness('198.51.100.5');
    expect(() => guard.canActivate(rejected.context)).toThrow(HttpException);
    expect(rejected.headers.get('Retry-After')).toBe('1');

    admitted.forEach((harness) => harness.responseEvents.emit('finish'));
  });

  it('returns edge-compatible 429 retry metadata for request-rate excess', () => {
    const guard = new ImageUploadAdmissionGuard();
    for (let index = 0; index < 10; index += 1) {
      const harness = createHarness('192.0.2.20');
      expect(guard.canActivate(harness.context)).toBe(true);
      harness.responseEvents.emit('finish');
    }

    const rejected = createHarness('192.0.2.20');
    expect(() => guard.canActivate(rejected.context)).toThrow(HttpException);
    expect(Number(rejected.headers.get('Retry-After'))).toBeGreaterThan(0);
  });
});
