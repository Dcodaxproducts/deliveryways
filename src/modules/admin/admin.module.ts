import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { UsersModule } from '../users/users.module';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsRepository } from './admin-reports.repository';
import { AdminReportsService } from './admin-reports.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardRepository } from './admin-dashboard.repository';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [UsersModule, DatabaseModule],
  controllers: [
    AdminUsersController,
    AdminDashboardController,
    AdminReportsController,
  ],
  providers: [
    AdminUsersService,
    AdminDashboardService,
    AdminDashboardRepository,
    AdminReportsService,
    AdminReportsRepository,
  ],
})
export class AdminModule {}
