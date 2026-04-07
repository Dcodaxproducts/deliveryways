import { Module } from '@nestjs/common';
import { RequestMetricsInterceptor } from './request-metrics.interceptor';
import { SystemHealthController } from './system-health.controller';
import { SystemHealthMetricsService } from './system-health-metrics.service';
import { SystemHealthRepository } from './system-health.repository';
import { SystemHealthService } from './system-health.service';

@Module({
  controllers: [SystemHealthController],
  providers: [
    SystemHealthService,
    SystemHealthRepository,
    SystemHealthMetricsService,
    RequestMetricsInterceptor,
  ],
  exports: [
    SystemHealthService,
    SystemHealthMetricsService,
    RequestMetricsInterceptor,
  ],
})
export class SystemHealthModule {}
