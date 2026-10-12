import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../database/database.module';
import { RealtimeAdmissionModule } from '../common/realtime/realtime-admission.module';
import { RealtimeEventsModule } from '../common/realtime/realtime-events.module';
import { ChatModule } from '../modules/chat/public-api';
import { OrdersModule } from '../modules/orders/public-api';
import { ChatGateway } from './gateways/chat.gateway';
import { OrderTrackingGateway } from './gateways/order-tracking.gateway';
import { RealtimeDeliveryService } from './realtime-delivery.service';
import { RealtimeHealthController } from './realtime-health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    DatabaseModule,
    RealtimeAdmissionModule,
    RealtimeEventsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET', 'change-me'),
      }),
    }),
    ChatModule,
    OrdersModule,
  ],
  controllers: [RealtimeHealthController],
  providers: [ChatGateway, OrderTrackingGateway, RealtimeDeliveryService],
})
export class RealtimeAppModule {}
