import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { DeliverymenController } from './deliverymen.controller';
import { DeliverymenRepository } from './deliverymen.repository';
import { DeliverymenService } from './deliverymen.service';

@Module({
  imports: [OrdersModule],
  controllers: [DeliverymenController],
  providers: [DeliverymenService, DeliverymenRepository],
})
export class DeliverymenModule {}
