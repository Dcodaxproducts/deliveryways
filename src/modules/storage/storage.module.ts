import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { ImageProcessorService } from './image-processor.service';
import { ImageUploadAdmissionGuard } from './image-upload-admission.guard';
import { ImageUploadTempCleanupInterceptor } from './image-upload-temp-cleanup.interceptor';

@Module({
  controllers: [StorageController],
  providers: [
    StorageService,
    ImageProcessorService,
    ImageUploadAdmissionGuard,
    ImageUploadTempCleanupInterceptor,
  ],
  exports: [StorageService],
})
export class StorageModule {}
