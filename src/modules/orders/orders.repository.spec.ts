import { OrdersRepository } from './orders.repository';

type OrderSearchWhere = {
  restaurantId?: string;
  OR?: Array<{
    id: { contains: string; mode: string };
  }>;
};

type OrderFindManyArgs = {
  where?: OrderSearchWhere;
};

type OrderCountArgs = {
  where?: OrderSearchWhere;
};

type OrderUpdateArgs = {
  where: { id: string };
  data: {
    status?: string;
    orderTime?: Date;
    isScheduled?: boolean;
  };
};

describe('OrdersRepository', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it('filters order list search by order id', async () => {
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([[], 0]),
      order: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    prisma.order.findMany.mockReturnValue('findManyResult');
    prisma.order.count.mockReturnValue('countResult');

    const repository = new OrdersRepository(prisma as never);

    await repository.list('restaurant-1', {
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
      search: 'order-123',
    } as never);

    const findManyCalls = prisma.order.findMany.mock.calls as Array<
      [OrderFindManyArgs]
    >;
    const countCalls = prisma.order.count.mock.calls as Array<[OrderCountArgs]>;

    expect(findManyCalls[0][0].where).toEqual(
      expect.objectContaining({
        restaurantId: 'restaurant-1',
        OR: [
          {
            id: { contains: 'order-123', mode: 'insensitive' },
          },
        ],
      }),
    );
    expect(countCalls[0][0].where).toEqual(
      expect.objectContaining({
        restaurantId: 'restaurant-1',
        OR: [
          {
            id: { contains: 'order-123', mode: 'insensitive' },
          },
        ],
      }),
    );
  });

  it('persists branch-provided order time when updating status', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-24T18:00:00.000Z'));

    const prisma = {
      order: {
        update: jest.fn().mockResolvedValue({ id: 'order-1' }),
      },
    };
    const repository = new OrdersRepository(prisma as never);
    const orderTime = new Date('2026-03-24T19:30:00.000Z');

    await repository.updateStatus('order-1', 'CONFIRMED' as never, orderTime);

    const updateCalls = prisma.order.update.mock.calls as Array<
      [OrderUpdateArgs]
    >;

    expect(updateCalls[0][0]).toMatchObject({
      where: { id: 'order-1' },
      data: {
        status: 'CONFIRMED',
        orderTime,
        isScheduled: true,
      },
    });
  });
});
