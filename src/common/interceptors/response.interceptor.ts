import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces';
import { RAW_RESPONSE_METADATA_KEY } from '../decorators';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T> | StreamableFile | T
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | StreamableFile | T> {
    const rawResponse =
      Reflect.getMetadata(RAW_RESPONSE_METADATA_KEY, context.getHandler()) ===
        true ||
      Reflect.getMetadata(RAW_RESPONSE_METADATA_KEY, context.getClass()) ===
        true;

    if (rawResponse) {
      return next.handle() as Observable<T>;
    }

    return next.handle().pipe(
      map(
        (
          payload:
            | T
            | { data: T; message?: string; meta?: Record<string, unknown> },
        ) => {
          if (payload instanceof StreamableFile) {
            return payload;
          }

          if (
            typeof payload === 'object' &&
            payload !== null &&
            'data' in payload
          ) {
            const typedPayload = payload as {
              data: T;
              message?: string;
              meta?: Record<string, unknown>;
            };

            return {
              success: true as const,
              data: typedPayload.data,
              message: typedPayload.message ?? 'Request successful',
              meta: typedPayload.meta,
            };
          }

          return {
            success: true as const,
            data: payload,
            message: 'Request successful',
          };
        },
      ),
    );
  }
}
