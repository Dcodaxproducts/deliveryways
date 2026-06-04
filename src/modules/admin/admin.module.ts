import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { UsersModule } from '../users/users.module';
import { SystemHealthModule } from '../system-health/system-health.module';
import { MailerModule } from '../mailer/mailer.module';
import { StorageModule } from '../storage/storage.module';
import { AdminDealsController } from './admin-deals.controller';
import { AdminPromotionsController } from './admin-promotions.controller';
import { AdminPromotionsRepository } from './admin-promotions.repository';
import { AdminPromotionsService } from './admin-promotions.service';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsRepository } from './admin-reports.repository';
import { AdminReportsService } from './admin-reports.service';
import { AdminPrintingController } from './admin-printing.controller';
import { AdminPrintingRepository } from './admin-printing.repository';
import { AdminPrintingService } from './admin-printing.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardRepository } from './admin-dashboard.repository';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminImportSamplesController } from './admin-import-samples.controller';
import { AdminImportSamplesService } from './admin-import-samples.service';

@Module({
  imports: [
    UsersModule,
    DatabaseModule,
    SystemHealthModule,
    MailerModule,
    StorageModule,
  ],
  controllers: [
    AdminUsersController,
    AdminDashboardController,
    AdminReportsController,
    AdminDealsController,
    AdminPromotionsController,
    AdminPrintingController,
    AdminImportSamplesController,
  ],
  providers: [
    AdminUsersService,
    AdminDashboardService,
    AdminDashboardRepository,
    AdminReportsService,
    AdminReportsRepository,
    AdminPromotionsService,
    AdminPromotionsRepository,
    AdminPrintingService,
    AdminPrintingRepository,
    AdminImportSamplesService,
  ],
})
export class AdminModule {}
