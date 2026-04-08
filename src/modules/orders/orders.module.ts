import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { CouponsModule } from '../coupons/coupons.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoyaltyWalletModule } from '../loyalty-wallet/loyalty-wallet.module';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [ChatModule, CouponsModule, NotificationsModule, LoyaltyWalletModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
  exports: [OrdersService],
})
export class OrdersModule {}
