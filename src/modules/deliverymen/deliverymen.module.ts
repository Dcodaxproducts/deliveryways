import { Module } from '@nestjs/common';
import { AddressesModule } from '../addresses/addresses.module';
import { OrdersModule } from '../orders/orders.module';
import { StorageModule } from '../storage/storage.module';
import { GlobalSettingsModule } from '../global-settings/global-settings.module';
import { DeliverymenController } from './deliverymen.controller';
import { DeliverymenRepository } from './deliverymen.repository';
import { DeliverymenService } from './deliverymen.service';

@Module({
  imports: [AddressesModule, OrdersModule, StorageModule, GlobalSettingsModule],
  controllers: [DeliverymenController],
  providers: [DeliverymenService, DeliverymenRepository],
  exports: [DeliverymenService, DeliverymenRepository],
})
export class DeliverymenModule {}
