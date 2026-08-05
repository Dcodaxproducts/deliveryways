import { Module } from '@nestjs/common';
import { MenuModule } from '../menu';
import { OrdersModule } from '../orders';
import { WinOrderAdminController } from './winorder-admin.controller';
import { WinOrderBasicAuthGuard } from './winorder-basic-auth.guard';
import { WinOrderConnectionRepository } from './winorder-connection.repository';
import { WinOrderConnectionService } from './winorder-connection.service';
import { WinOrderMappingRepository } from './winorder-mapping.repository';
import { WinOrderMappingService } from './winorder-mapping.service';
import { WinOrderExportRepository } from './winorder-export.repository';
import { WinOrderMachineController } from './winorder-machine.controller';
import { WinOrderPollingService } from './winorder-polling.service';
import { WinOrderStatusRepository } from './winorder-status.repository';
import { WinOrderStatusService } from './winorder-status.service';
import { WinOrderHealthRepository } from './winorder-health.repository';
import { WinOrderHealthService } from './winorder-health.service';

@Module({
  imports: [OrdersModule, MenuModule],
  controllers: [WinOrderAdminController, WinOrderMachineController],
  providers: [
    WinOrderConnectionRepository,
    WinOrderConnectionService,
    WinOrderBasicAuthGuard,
    WinOrderMappingRepository,
    WinOrderMappingService,
    WinOrderExportRepository,
    WinOrderPollingService,
    WinOrderStatusRepository,
    WinOrderStatusService,
    WinOrderHealthRepository,
    WinOrderHealthService,
  ],
  exports: [WinOrderConnectionService, WinOrderBasicAuthGuard],
})
export class WinOrderIntegrationModule {}
