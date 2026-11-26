import { UnauthorizedException } from '@nestjs/common';
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
      connections,
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

  it.each([
    ['1', 'CONFIRMED'],
    ['2', 'PREPARING'],
    ['3', 'PREPARING'],
    ['4', 'PREPARING'],
    ['5', 'OUT_FOR_DELIVERY'],
    ['6', 'COMPLETED'],
    ['7', 'REJECTED'],
    ['10', 'CANCELLED'],
  ])('maps WinOrder status %s to %s', async (trackingstatus, status) => {
    const { service, orders, connections } = makeService();

    await service.process(machine, undefined, undefined, {
      ordersid: 'order-1',
      trackingstatus,
      deliver_minutes: 25,
    });

    expect(connections.authenticate).not.toHaveBeenCalled();
    expect(orders.applyStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        status,
        estimatedPreparationMinutes: 25,
      }),
    );
  });

  it('rejects an incomplete duplicate credential pair', async () => {
    const { service } = makeService();

    await expect(
      service.process(machine, 'wo_user', undefined, {
        ordersid: 'order-1',
        trackingstatus: '1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns processed duplicate callbacks without repeating side effects', async () => {
    const { service, orders, repository } = makeService();
    repository.findEvent.mockResolvedValue({
      id: 'event-1',
      result: WinOrderStatusEventResult.PROCESSED,
    });

    await service.process(machine, 'wo_user', 'secret', {
      ordersid: 'order-1',
      trackingstatus: '6',
    });

    expect(repository.findExport).not.toHaveBeenCalled();
    expect(orders.applyStatus).not.toHaveBeenCalled();
  });

  it('replays a previously failed callback and records the successful retry', async () => {
    const { service, orders, repository } = makeService();
    repository.findEvent.mockResolvedValue({
      id: 'event-1',
      result: WinOrderStatusEventResult.FAILED,
    });

    await service.process(machine, undefined, undefined, {
      ordersid: 'order-1',
      trackingstatus: '2',
    });

    expect(orders.applyStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PREPARING' }),
    );
    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({ result: WinOrderStatusEventResult.PROCESSED }),
    );
  });
});
