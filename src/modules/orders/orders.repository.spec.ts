import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { OrdersRepository } from './orders.repository';

type OrderSearchWhere = {
  restaurantId?: string;
  NOT?: {
    paymentMethod: PaymentMethod;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
  };
  OR?: Array<{
    id?: { contains: string; mode: string };
    customer?: {
      is: {
        email?: { contains: string; mode: string };
        profile?: {
          is: {
            AND: Array<{
              OR: Array<{
                firstName?: { contains: string; mode: string };
                lastName?: { contains: string; mode: string };
              }>;
            }>;
          };
        };
      };
    };
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

  it('filters order list search by order id and customer identity', async () => {
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
      search: 'Ali Khan',
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
            id: { contains: 'Ali Khan', mode: 'insensitive' },
          },
          {
            customer: {
              is: {
                email: { contains: 'Ali Khan', mode: 'insensitive' },
              },
            },
          },
          {
            customer: {
              is: {
                profile: {
                  is: {
                    AND: [
                      {
                        OR: [
                          {
                            firstName: {
                              contains: 'Ali',
                              mode: 'insensitive',
                            },
                          },
                          {
                            lastName: {
                              contains: 'Ali',
                              mode: 'insensitive',
                            },
                          },
                        ],
                      },
                      {
                        OR: [
                          {
                            firstName: {
                              contains: 'Khan',
                              mode: 'insensitive',
                            },
                          },
                          {
                            lastName: {
                              contains: 'Khan',
                              mode: 'insensitive',
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        ],
      }),
    );
    expect(countCalls[0][0].where).toEqual(
      expect.objectContaining({
        restaurantId: 'restaurant-1',
        OR: [
          {
            id: { contains: 'Ali Khan', mode: 'insensitive' },
          },
          {
            customer: {
              is: {
                email: { contains: 'Ali Khan', mode: 'insensitive' },
              },
            },
          },
          {
            customer: {
              is: {
                profile: {
                  is: {
                    AND: [
                      {
                        OR: [
                          {
                            firstName: {
                              contains: 'Ali',
                              mode: 'insensitive',
                            },
                          },
                          {
                            lastName: {
                              contains: 'Ali',
                              mode: 'insensitive',
                            },
                          },
                        ],
                      },
                      {
                        OR: [
                          {
                            firstName: {
                              contains: 'Khan',
                              mode: 'insensitive',
                            },
                          },
                          {
                            lastName: {
                              contains: 'Khan',
                              mode: 'insensitive',
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        ],
      }),
    );
  });

  it('excludes unpaid Stripe pending orders when requested', async () => {
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

    await repository.list(
      'restaurant-1',
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as never,
      undefined,
      undefined,
      true,
    );

    const findManyCalls = prisma.order.findMany.mock.calls as Array<
      [OrderFindManyArgs]
    >;
    const countCalls = prisma.order.count.mock.calls as Array<[OrderCountArgs]>;

    expect(findManyCalls[0][0].where?.NOT).toEqual({
      paymentMethod: PaymentMethod.STRIPE,
      status: OrderStatus.PAYMENT_PENDING,
      paymentStatus: PaymentStatus.PENDING,
    });
    expect(countCalls[0][0].where?.NOT).toEqual({
      paymentMethod: PaymentMethod.STRIPE,
      status: OrderStatus.PAYMENT_PENDING,
      paymentStatus: PaymentStatus.PENDING,
    });
  });

  it('keeps unpaid Stripe pending orders visible by default', async () => {
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
    } as never);

    const findManyCalls = prisma.order.findMany.mock.calls as Array<
      [OrderFindManyArgs]
    >;
    const countCalls = prisma.order.count.mock.calls as Array<[OrderCountArgs]>;

    expect(findManyCalls[0][0].where?.NOT).toBeUndefined();
    expect(countCalls[0][0].where?.NOT).toBeUndefined();
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
