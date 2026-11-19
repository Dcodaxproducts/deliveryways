import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PackagePlansService } from './package-plans.service';

@Injectable()
export class PackagePlansInvoiceAutomationService {
  private readonly logger = new Logger(
    PackagePlansInvoiceAutomationService.name,
  );

  constructor(private readonly packagePlansService: PackagePlansService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async processInvoiceAutomation() {
    const now = new Date();
    const retries =
      await this.packagePlansService.retryDuePayoutInvoiceEmails(now);
    const payouts = await this.packagePlansService.emailDuePayoutInvoices(now);
    const subscriptions =
      await this.packagePlansService.emailDueSubscriptionInvoices(now);

    if (
      retries.sent > 0 ||
      retries.failed > 0 ||
      retries.unknown > 0 ||
      retries.recovered > 0
    ) {
      this.logger.log(
        `Payout email outbox: sent=${retries.sent}, failed=${retries.failed}, skipped=${retries.skipped}, unknown=${retries.unknown}, recovered=${retries.recovered}`,
      );
    }
    if (payouts.sent > 0) {
      this.logger.log(`Auto payout invoice emails sent: ${payouts.sent}`);
    }
    if (subscriptions.sent > 0) {
      this.logger.log(
        `Auto subscription invoice emails sent: ${subscriptions.sent}`,
      );
    }
  }
}
