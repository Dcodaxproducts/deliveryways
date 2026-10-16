import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiAnalyticsUsageRepository } from './ai-analytics-usage.repository';

@Injectable()
export class AiAnalyticsUsageCleanupService {
  private readonly logger = new Logger(AiAnalyticsUsageCleanupService.name);
  constructor(private readonly repository: AiAnalyticsUsageRepository) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanup() {
    const deleted = await this.repository.deleteExpired(500);
    if (deleted > 0)
      this.logger.log({
        event: 'ai_analytics_usage_retention_cleanup',
        deleted,
      });
  }
}
