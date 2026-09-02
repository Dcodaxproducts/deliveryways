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
    const subscriptions =
      await this.packagePlansService.emailDueSubscriptionInvoices(now);

    if (subscriptions.sent > 0) {
      this.logger.log(
        `Auto subscription invoice emails sent: ${subscriptions.sent}`,
      );
    }
  }
}
