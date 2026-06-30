import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { OrdersModule } from '../orders/orders.module';
import { StorageModule } from '../storage/storage.module';
import { CouponsModule } from '../coupons/coupons.module';
import { GlobalSettingsModule } from '../global-settings/global-settings.module';
import { CartCleanupService } from './cart-cleanup.service';
import { CartController } from './cart.controller';
import { CartRepository } from './cart.repository';
import { CartService } from './cart.service';

@Module({
  imports: [
    OrdersModule,
    ProfilesModule,
    StorageModule,
    CouponsModule,
    GlobalSettingsModule,
  ],
  controllers: [CartController],
  providers: [CartService, CartCleanupService, CartRepository],
  exports: [CartService],
})
export class CartModule {}
