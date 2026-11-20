import { AdminReportsController } from './admin-reports.controller';

describe('AdminReportsController', () => {
  it('forwards bounded multi-kind generated invoice queries to the service', async () => {
    const response = {
      data: [],
      meta: { nextCursor: null, hasMore: false, limit: 50 },
    };
    const service = {
      listGeneratedInvoices: jest.fn().mockResolvedValue(response),
    };
    const controller = new AdminReportsController(service as never);
    const user = { uid: 'admin-1', role: 'SUPER_ADMIN' } as never;
    const query = {
      kinds: ['SUBSCRIPTION', 'WEEKLY_PAYOUT'],
      cursor: 'invoice-1',
      limit: 50,
    } as never;

    await expect(controller.listGeneratedInvoices(user, query)).resolves.toBe(
      response,
    );
    expect(service.listGeneratedInvoices).toHaveBeenCalledWith(user, query);
  });
});
