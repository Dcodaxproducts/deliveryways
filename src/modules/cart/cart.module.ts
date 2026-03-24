import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { OrdersModule } from '../orders/orders.module';
import { CartController } from './cart.controller';
import { CartRepository } from './cart.repository';
import { CartService } from './cart.service';

@Module({
  imports: [OrdersModule, ProfilesModule],
  controllers: [CartController],
  providers: [CartService, CartRepository],
  exports: [CartService],
})
export class CartModule {}
