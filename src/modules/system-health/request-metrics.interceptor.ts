import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { SystemHealthMetricsService } from './system-health-metrics.service';

@Injectable()
export class RequestMetricsInterceptor implements NestInterceptor {
  constructor(
    private readonly systemHealthMetricsService: SystemHealthMetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<{
      method: string;
      originalUrl?: string;
      route?: { path?: string };
      baseUrl?: string;
    }>();
    const response = context
      .switchToHttp()
      .getResponse<{ statusCode: number }>();
    const startedAt = Date.now();

    return next.handle().pipe(
      finalize(() => {
        const rawPath = request.route?.path
          ? `${request.baseUrl ?? ''}${request.route.path}`
          : (request.originalUrl ?? '').split('?')[0];

        if (rawPath.startsWith('/api/v1/admin/system-health')) {
          return;
        }

        this.systemHealthMetricsService.recordRequest({
          method: request.method,
          path: rawPath || 'unknown',
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
          success: response.statusCode < 400,
        });
      }),
    );
  }
}
