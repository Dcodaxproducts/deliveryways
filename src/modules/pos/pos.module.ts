import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { PosController } from './pos.controller';
import { PosRepository } from './pos.repository';
import { PosService } from './pos.service';

@Module({
  imports: [OrdersModule, UsersModule, StorageModule],
  controllers: [PosController],
  providers: [PosService, PosRepository],
  exports: [PosService],
})
export class PosModule {}
