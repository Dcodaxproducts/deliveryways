import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoyaltyWalletModule } from '../loyalty-wallet/loyalty-wallet.module';
import { GlobalSettingsModule } from '../global-settings/global-settings.module';
import { MailerModule } from '../mailer/mailer.module';
import { PackagePlansModule } from '../package-plans/package-plans.module';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import { StripePaymentsService } from './stripe-payments.service';
import { PaypalPayoutsService } from './paypal-payouts.service';
import { PayoutCredentialsService } from './payout-credentials.service';

@Module({
  imports: [
    NotificationsModule,
    LoyaltyWalletModule,
    GlobalSettingsModule,
    MailerModule,
    PackagePlansModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsRepository,
    StripePaymentsService,
    PaypalPayoutsService,
    PayoutCredentialsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
