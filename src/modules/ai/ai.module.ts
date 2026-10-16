import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GlobalSettingsModule } from '../global-settings/global-settings.module';
import { AiAnalyticsUsageCleanupService } from './ai-analytics-usage-cleanup.service';
import { AiAnalyticsUsageRepository } from './ai-analytics-usage.repository';
import { AnalyticsCopilotController } from './analytics-copilot.controller';
import { AnalyticsCopilotRepository } from './analytics-copilot.repository';
import { AnalyticsCopilotService } from './analytics-copilot.service';
import { AnalyticsDateRangeService } from './analytics-date-range.service';
import { AI_TEXT_PROVIDER } from './domain/analytics-copilot.types';
import { DisabledAiTextProvider } from './providers/disabled-ai-text.provider';
import { OpenAiResponsesProvider } from './providers/openai-responses.provider';

@Module({
  imports: [GlobalSettingsModule],
  controllers: [AnalyticsCopilotController],
  providers: [
    AnalyticsCopilotService,
    AnalyticsCopilotRepository,
    AnalyticsDateRangeService,
    AiAnalyticsUsageRepository,
    AiAnalyticsUsageCleanupService,
    {
      provide: AI_TEXT_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        configService.get<string>('ai.analyticsCopilot.provider', 'openai') ===
        'disabled'
          ? new DisabledAiTextProvider()
          : new OpenAiResponsesProvider(configService),
    },
  ],
})
export class AiModule {}
