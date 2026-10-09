import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { ImageProcessorService } from './image-processor.service';

@Module({
  controllers: [StorageController],
  providers: [StorageService, ImageProcessorService],
  exports: [StorageService],
})
export class StorageModule {}
