import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { UsersModule } from '../users/users.module';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardRepository } from './admin-dashboard.repository';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [UsersModule, DatabaseModule],
  controllers: [AdminUsersController, AdminDashboardController],
  providers: [
    AdminUsersService,
    AdminDashboardService,
    AdminDashboardRepository,
  ],
})
export class AdminModule {}
