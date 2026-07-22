import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { GlobalSettingsController } from './global-settings.controller';
import { GlobalSettingsRepository } from './global-settings.repository';
import { GlobalSettingsService } from './global-settings.service';

@Module({
  imports: [StorageModule],
  controllers: [GlobalSettingsController],
  providers: [GlobalSettingsService, GlobalSettingsRepository],
  exports: [GlobalSettingsService],
})
export class GlobalSettingsModule {}
