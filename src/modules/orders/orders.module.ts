import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ChatModule } from '../chat/chat.module';
import { CouponsModule } from '../coupons/coupons.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoyaltyWalletModule } from '../loyalty-wallet/loyalty-wallet.module';
import { GlobalSettingsModule } from '../global-settings/global-settings.module';
import { StorageModule } from '../storage/storage.module';
import { OrderTrackingGateway } from './order-tracking.gateway';
import { OrderTrackingRealtimeService } from './order-tracking.realtime.service';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';
import { ORDERS_INTEGRATION_PORT } from './orders-integration.port';
import { OrdersIntegrationService } from './orders-integration.service';

@Module({
  imports: [
    ChatModule,
    CouponsModule,
    NotificationsModule,
    LoyaltyWalletModule,
    GlobalSettingsModule,
    StorageModule,
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
    OrdersIntegrationService,
    {
      provide: ORDERS_INTEGRATION_PORT,
      useExisting: OrdersIntegrationService,
    },
    OrdersRepository,
    OrderTrackingRealtimeService,
    OrderTrackingGateway,
  ],
  exports: [OrdersService, ORDERS_INTEGRATION_PORT],
})
export class OrdersModule {}
