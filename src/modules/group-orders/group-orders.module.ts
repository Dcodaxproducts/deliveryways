import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { StorageModule } from '../storage/storage.module';
import { GroupOrdersController } from './group-orders.controller';
import { GroupOrdersRepository } from './group-orders.repository';
import { GroupOrdersService } from './group-orders.service';

@Module({
  imports: [OrdersModule, StorageModule, NotificationsModule],
  controllers: [GroupOrdersController],
  providers: [GroupOrdersService, GroupOrdersRepository],
  exports: [GroupOrdersService],
})
export class GroupOrdersModule {}
