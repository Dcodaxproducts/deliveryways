import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantsRepository } from './tenants.repository';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantsRepository],
  exports: [TenantsService],
})
export class TenantsModule {}
