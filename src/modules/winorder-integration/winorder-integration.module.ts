import { Module } from '@nestjs/common';
import { MenuModule } from '../menu';
import { OrdersModule } from '../orders';
import { WinOrderAdminController } from './winorder-admin.controller';
import { WinOrderBasicAuthGuard } from './winorder-basic-auth.guard';
import { WinOrderConnectionRepository } from './winorder-connection.repository';
import { WinOrderConnectionService } from './winorder-connection.service';

@Module({
  imports: [OrdersModule, MenuModule],
  controllers: [WinOrderAdminController],
  providers: [
    WinOrderConnectionRepository,
    WinOrderConnectionService,
    WinOrderBasicAuthGuard,
  ],
  exports: [WinOrderConnectionService, WinOrderBasicAuthGuard],
})
export class WinOrderIntegrationModule {}
