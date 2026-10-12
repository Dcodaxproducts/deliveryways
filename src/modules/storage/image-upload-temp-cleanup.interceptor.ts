import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, finalize } from 'rxjs';
import { removeImageTempFile } from './image-upload-temp.storage';

@Injectable()
export class ImageUploadTempCleanupInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const cleanup = (): void => {
      void removeImageTempFile(request.file?.path);
    };

    request.once('aborted', cleanup);
    response.once('close', cleanup);

    return next.handle().pipe(
      finalize(() => {
        request.off('aborted', cleanup);
        response.off('close', cleanup);
        cleanup();
      }),
    );
  }
}
