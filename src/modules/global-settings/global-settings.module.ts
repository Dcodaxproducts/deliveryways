import { Module } from '@nestjs/common';
import { GlobalSettingsController } from './global-settings.controller';
import { GlobalSettingsRepository } from './global-settings.repository';
import { GlobalSettingsService } from './global-settings.service';

@Module({
  controllers: [GlobalSettingsController],
  providers: [GlobalSettingsService, GlobalSettingsRepository],
  exports: [GlobalSettingsService],
})
export class GlobalSettingsModule {}
