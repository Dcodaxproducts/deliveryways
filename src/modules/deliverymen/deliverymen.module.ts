import { Module } from '@nestjs/common';
import { AddressesModule } from '../addresses/addresses.module';
import { OrdersModule } from '../orders/orders.module';
import { DeliverymenController } from './deliverymen.controller';
import { DeliverymenRepository } from './deliverymen.repository';
import { DeliverymenService } from './deliverymen.service';

@Module({
  imports: [AddressesModule, OrdersModule],
  controllers: [DeliverymenController],
  providers: [DeliverymenService, DeliverymenRepository],
  exports: [DeliverymenService, DeliverymenRepository],
})
export class DeliverymenModule {}
