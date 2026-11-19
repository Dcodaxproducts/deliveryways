import { PackagePlansInvoiceAutomationService } from './package-plans-invoice-automation.service';

describe('PackagePlansInvoiceAutomationService', () => {
  it('runs payout recovery, due payouts, and subscription invoices', async () => {
    const packagePlansService = {
      emailDueSubscriptionInvoices: jest
        .fn()
        .mockResolvedValue({ sent: 1, skipped: 0 }),
      retryDuePayoutInvoiceEmails: jest
        .fn()
        .mockResolvedValue({ sent: 0, failed: 0, skipped: 0 }),
      emailDuePayoutInvoices: jest
        .fn()
        .mockResolvedValue({ sent: 0, skipped: 0 }),
    };
    const service = new PackagePlansInvoiceAutomationService(
      packagePlansService as never,
    );

    await service.processInvoiceAutomation();

    expect(
      packagePlansService.emailDueSubscriptionInvoices,
    ).toHaveBeenCalledTimes(1);
    expect(
      packagePlansService.retryDuePayoutInvoiceEmails,
    ).toHaveBeenCalledTimes(1);
    expect(packagePlansService.emailDuePayoutInvoices).toHaveBeenCalledTimes(1);
  });
});
