import { Module } from '@nestjs/common';
import { StaffRolesController } from './staff-roles.controller';
import { StaffRolesRepository } from './staff-roles.repository';
import { StaffRolesService } from './staff-roles.service';

@Module({
  controllers: [StaffRolesController],
  providers: [StaffRolesService, StaffRolesRepository],
  exports: [StaffRolesService, StaffRolesRepository],
})
export class StaffRolesModule {}
