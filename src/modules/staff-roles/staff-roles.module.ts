import { Module } from '@nestjs/common';
import { PermissionModulesModule } from '../permission-modules/permission-modules.module';
import { StaffRolesController } from './staff-roles.controller';
import { StaffRolesRepository } from './staff-roles.repository';
import { StaffRolesService } from './staff-roles.service';

@Module({
  imports: [PermissionModulesModule],
  controllers: [StaffRolesController],
  providers: [StaffRolesService, StaffRolesRepository],
  exports: [StaffRolesService, StaffRolesRepository],
})
export class StaffRolesModule {}
