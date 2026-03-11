import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map(
        (
          payload:
            | T
            | { data: T; message?: string; meta?: Record<string, unknown> },
        ) => {
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
