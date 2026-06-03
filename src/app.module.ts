import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { BranchesModule } from './modules/branches/branches.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { MailerModule } from './modules/mailer/mailer.module';
import { UsersModule } from './modules/users/users.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { DevTestingModule } from './modules/dev-testing/dev-testing.module';
import { MenuModule } from './modules/menu/menu.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DeliverymenModule } from './modules/deliverymen/deliverymen.module';
import { StorageModule } from './modules/storage/storage.module';
import { CartModule } from './modules/cart/cart.module';
import { CustomerAppModule } from './modules/customer-app/customer-app.module';
import { AdminModule } from './modules/admin/admin.module';
import { StaffRolesModule } from './modules/staff-roles/staff-roles.module';
import { StaffManagementModule } from './modules/staff-management/staff-management.module';
import { ChatModule } from './modules/chat/chat.module';
import { GroupOrdersModule } from './modules/group-orders/group-orders.module';
import { PosModule } from './modules/pos/pos.module';
import { GlobalSettingsModule } from './modules/global-settings/global-settings.module';
import { LoyaltyWalletModule } from './modules/loyalty-wallet/loyalty-wallet.module';
import { SystemHealthModule } from './modules/system-health/system-health.module';
import { PackagePlansModule } from './modules/package-plans/package-plans.module';
import { LocalizationsModule } from './modules/localizations';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
  VerifiedUserGuard,
} from './common/guards';
import { TenantDiscoveryMiddleware } from './common/middleware/tenant-discovery.middleware';
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
      },
    }),

    ScheduleModule.forRoot(),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('THROTTLE_TTL', 60) * 1000,
          limit: configService.get<number>('THROTTLE_LIMIT', 100),
        },
      ],
    }),

    DatabaseModule,
    MailerModule,
    UsersModule,
    ProfilesModule,
    AuthModule,
    DevTestingModule,
    TenantsModule,
    RestaurantsModule,
    BranchesModule,
    AddressesModule,
    MenuModule,
    InventoryModule,
    CouponsModule,
    OrdersModule,
    PaymentsModule,
    NotificationsModule,
    DeliverymenModule,
    StorageModule,
    CartModule,
    CustomerAppModule,
    AdminModule,
    StaffRolesModule,
    StaffManagementModule,
    ChatModule,
    GroupOrdersModule,
    PosModule,
    GlobalSettingsModule,
    LoyaltyWalletModule,
    SystemHealthModule,
    PackagePlansModule,
    LocalizationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: VerifiedUserGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantAccessGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantDiscoveryMiddleware).forRoutes({
      path: '*',
      method: RequestMethod.ALL,
    });
  }
}
