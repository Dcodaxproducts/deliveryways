import { WinOrderStatusEventResult } from '@prisma/client';
import { WinOrderStatusService } from './winorder-status.service';

describe('WinOrderStatusService', () => {
  const machine = {
    connectionId: 'connection-1',
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
    storeId: 41,
  };

  const makeService = () => {
    const orders = { applyStatus: jest.fn() };
    const connections = { authenticate: jest.fn().mockResolvedValue(machine) };
    const repository = {
      findEvent: jest.fn().mockResolvedValue(null),
      findExport: jest.fn().mockResolvedValue({ id: 'export-1' }),
      record: jest.fn(),
      acknowledge: jest.fn(),
      recordConnectionError: jest.fn(),
    };
    return {
      service: new WinOrderStatusService(
        orders as never,
        connections as never,
        repository as never,
      ),
      orders,
      repository,
    };
  };

  it('acknowledges status zero without mutating order lifecycle', async () => {
    const { service, orders, repository } = makeService();
    await service.process(machine, 'wo_user', 'secret', {
      ordersid: 'order-1',
      trackingstatus: '0',
    });

    expect(repository.acknowledge).toHaveBeenCalledWith(machine, 'export-1');
    expect(orders.applyStatus).not.toHaveBeenCalled();
    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({ result: WinOrderStatusEventResult.PROCESSED }),
    );
  });

  it('maps status six to order-type-aware completion', async () => {
    const { service, orders } = makeService();
    await service.process(machine, 'wo_user', 'secret', {
      ordersid: 'order-1',
      trackingstatus: '6',
      deliver_minutes: 25,
    });

    expect(orders.applyStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        status: 'COMPLETED',
        estimatedPreparationMinutes: 25,
      }),
    );
  });

  it('returns duplicate callbacks without repeating side effects', async () => {
    const { service, orders, repository } = makeService();
    repository.findEvent.mockResolvedValue({ id: 'event-1' });

    await service.process(machine, 'wo_user', 'secret', {
      ordersid: 'order-1',
      trackingstatus: '6',
    });

    expect(repository.findExport).not.toHaveBeenCalled();
    expect(orders.applyStatus).not.toHaveBeenCalled();
  });
});
