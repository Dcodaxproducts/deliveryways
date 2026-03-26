import { Module } from '@nestjs/common';
import { StaffRolesModule } from '../staff-roles/staff-roles.module';
import { StaffManagementController } from './staff-management.controller';
import { StaffManagementRepository } from './staff-management.repository';
import { StaffManagementService } from './staff-management.service';

@Module({
  imports: [StaffRolesModule],
  controllers: [StaffManagementController],
  providers: [StaffManagementService, StaffManagementRepository],
  exports: [StaffManagementService, StaffManagementRepository],
})
export class StaffManagementModule {}
