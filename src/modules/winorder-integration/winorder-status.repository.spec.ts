import { WinOrderStatusEventResult } from '@prisma/client';
import { WinOrderStatusRepository } from './winorder-status.repository';

describe('WinOrderStatusRepository', () => {
  const machine = {
    connectionId: 'connection-1',
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
    storeId: 41,
  };
  const input = {
    machine,
    exportId: 'export-1',
    orderId: 'order-1',
    fingerprint: 'fingerprint-1',
    trackingStatus: '2',
    rawPayload: { ordersid: 'order-1', trackingstatus: '2' },
    result: WinOrderStatusEventResult.PROCESSED,
  };

  it('updates a failed event when the callback succeeds on retry', async () => {
    const prisma = {
      winOrderStatusEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn(),
      },
    };
    const repository = new WinOrderStatusRepository(prisma as never);

    await repository.record(input);

    expect(prisma.winOrderStatusEvent.updateMany).toHaveBeenCalledTimes(1);
    const [update] = prisma.winOrderStatusEvent.updateMany.mock
      .calls[0] as unknown as [
      {
        where: {
          connectionId: string;
          fingerprint: string;
          result: WinOrderStatusEventResult;
        };
        data: { result: WinOrderStatusEventResult };
      },
    ];
    expect(update.where).toMatchObject({
      connectionId: 'connection-1',
      fingerprint: 'fingerprint-1',
      result: WinOrderStatusEventResult.FAILED,
    });
    expect(update.data.result).toBe(WinOrderStatusEventResult.PROCESSED);
    expect(prisma.winOrderStatusEvent.createMany).not.toHaveBeenCalled();
  });

  it('creates the first event with duplicate protection', async () => {
    const prisma = {
      winOrderStatusEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new WinOrderStatusRepository(prisma as never);

    await repository.record(input);

    expect(prisma.winOrderStatusEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });
});
