import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { StorageModule } from '../storage/storage.module';
import { GroupOrdersController } from './group-orders.controller';
import { GroupOrdersRepository } from './group-orders.repository';
import { GroupOrdersService } from './group-orders.service';

@Module({
  imports: [OrdersModule, StorageModule],
  controllers: [GroupOrdersController],
  providers: [GroupOrdersService, GroupOrdersRepository],
  exports: [GroupOrdersService],
})
export class GroupOrdersModule {}
