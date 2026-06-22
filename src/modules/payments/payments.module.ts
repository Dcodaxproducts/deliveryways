import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoyaltyWalletModule } from '../loyalty-wallet/loyalty-wallet.module';
import { GlobalSettingsModule } from '../global-settings/global-settings.module';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import { StripePaymentsService } from './stripe-payments.service';

@Module({
  imports: [NotificationsModule, LoyaltyWalletModule, GlobalSettingsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository, StripePaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
