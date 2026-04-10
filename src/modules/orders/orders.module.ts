import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ChatModule } from '../chat/chat.module';
import { CouponsModule } from '../coupons/coupons.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoyaltyWalletModule } from '../loyalty-wallet/loyalty-wallet.module';
import { OrderTrackingGateway } from './order-tracking.gateway';
import { OrderTrackingRealtimeService } from './order-tracking.realtime.service';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    ChatModule,
    CouponsModule,
    NotificationsModule,
    LoyaltyWalletModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET', 'change-me'),
      }),
    }),
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrdersRepository,
    OrderTrackingRealtimeService,
    OrderTrackingGateway,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
