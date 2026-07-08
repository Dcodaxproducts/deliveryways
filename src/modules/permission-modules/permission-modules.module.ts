import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { PermissionModulesController } from './permission-modules.controller';
import { PermissionModulesRepository } from './permission-modules.repository';
import { PermissionModulesService } from './permission-modules.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PermissionModulesController],
  providers: [PermissionModulesService, PermissionModulesRepository],
  exports: [PermissionModulesService],
})
export class PermissionModulesModule {}
