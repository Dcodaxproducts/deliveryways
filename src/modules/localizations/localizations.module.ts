import { Module } from '@nestjs/common';
import { LocalizationsController } from './localizations.controller';
import { LocalizationsRepository } from './localizations.repository';
import { LocalizationsService } from './localizations.service';

@Module({
  controllers: [LocalizationsController],
  providers: [LocalizationsService, LocalizationsRepository],
  exports: [LocalizationsService],
})
export class LocalizationsModule {}
