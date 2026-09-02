import { PackagePlansInvoiceAutomationService } from './package-plans-invoice-automation.service';

describe('PackagePlansInvoiceAutomationService', () => {
  it('automates only unified subscription invoices', async () => {
    const packagePlansService = {
      emailDueSubscriptionInvoices: jest
        .fn()
        .mockResolvedValue({ sent: 1, skipped: 0 }),
      emailDuePayoutInvoices: jest.fn(),
    };
    const service = new PackagePlansInvoiceAutomationService(
      packagePlansService as never,
    );

    await service.processInvoiceAutomation();

    expect(
      packagePlansService.emailDueSubscriptionInvoices,
    ).toHaveBeenCalledTimes(1);
    expect(packagePlansService.emailDuePayoutInvoices).not.toHaveBeenCalled();
  });
});
