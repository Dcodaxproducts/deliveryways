import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { LoyaltyWalletModule } from '../loyalty-wallet/loyalty-wallet.module';
import { PaymentsModule } from '../payments/payments.module';
import { CustomerAppController } from './customer-app.controller';
import { CustomerAppRepository } from './customer-app.repository';
import { CustomerAppService } from './customer-app.service';
import { PublicContentController } from './public-content.controller';
import { CouponsModule } from '../coupons/coupons.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LocalizationsModule } from '../localizations';

@Module({
  imports: [
    LoyaltyWalletModule,
    PaymentsModule,
    StorageModule,
    CouponsModule,
    NotificationsModule,
    LocalizationsModule,
  ],
  controllers: [CustomerAppController, PublicContentController],
  providers: [CustomerAppRepository, CustomerAppService],
})
export class CustomerAppModule {}
