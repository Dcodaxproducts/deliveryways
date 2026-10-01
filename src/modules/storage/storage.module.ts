import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { ImageOptimizerService } from './image-optimizer.service';

@Module({
  controllers: [StorageController],
  providers: [StorageService, ImageOptimizerService],
  exports: [StorageService],
})
export class StorageModule {}
