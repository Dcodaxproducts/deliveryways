import { UsersRepository } from './users.repository';

describe('UsersRepository', () => {
  it('finds POS customers by customer ID or order ID', async () => {
    type FindManyArgs = {
      where: {
        OR?: unknown[];
      };
    };
    const findMany = jest.fn((args: FindManyArgs): Promise<unknown[]> => {
      void args;
      return Promise.resolve([]);
    });
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      user: { findMany, count },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const repository = new UsersRepository(prisma as never);

    await repository.listCustomers('tenant-1', {
      page: 1,
      limit: 20,
      search: 'lookup-123',
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    } as never);

    const query = findMany.mock.calls[0]?.[0];

    expect(query?.where.OR?.[0]).toEqual({
      id: {
        contains: 'lookup-123',
        mode: 'insensitive',
      },
    });
    expect(query?.where.OR?.[3]).toEqual({
      customerOrders: {
        some: {
          id: {
            contains: 'lookup-123',
            mode: 'insensitive',
          },
        },
      },
    });
  });

  it('filters registered POS customers before pagination', async () => {
    type FindManyArgs = {
      where: {
        isGuest?: boolean;
        AND?: unknown[];
      };
    };
    const findMany = jest.fn((args: FindManyArgs): Promise<unknown[]> => {
      void args;
      return Promise.resolve([]);
    });
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      user: { findMany, count },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const repository = new UsersRepository(prisma as never);

    await repository.listCustomers('tenant-1', {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
      isGuest: false,
    });

    expect(findMany.mock.calls[0]?.[0].where.AND).toContainEqual({
      isGuest: false,
    });
  });

  it('excludes orderless guest profiles from both rows and count', async () => {
    type QueryArgs = {
      where: Record<string, unknown>;
      skip?: number;
      take?: number;
    };
    const findMany = jest.fn((args: QueryArgs) => {
      void args;
      return Promise.resolve([]);
    });
    const count = jest.fn((args: QueryArgs) => {
      void args;
      return Promise.resolve(0);
    });
    const prisma = {
      user: { findMany, count },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const repository = new UsersRepository(prisma as never);

    await repository.listCustomers('tenant-1', {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    });

    const expectedEligibility = {
      OR: [
        { isGuest: false },
        {
          isGuest: true,
          AND: [
            {
              OR: [
                { branchId: { not: null } },
                { customerOrders: { some: {} } },
              ],
            },
          ],
        },
      ],
    };
    expect(findMany.mock.calls[0]?.[0].where.AND).toContainEqual(
      expectedEligibility,
    );
    expect(count.mock.calls[0]?.[0].where.AND).toContainEqual(
      expectedEligibility,
    );
  });

  it('includes POS walk-in guest identities before their first order', async () => {
    type QueryArgs = { where: Record<string, unknown> };
    const findMany = jest.fn((args: QueryArgs) => {
      void args;
      return Promise.resolve([]);
    });
    const count = jest.fn((args: QueryArgs) => {
      void args;
      return Promise.resolve(0);
    });
    const prisma = {
      user: { findMany, count },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const repository = new UsersRepository(prisma as never);

    await repository.listCustomers('tenant-1', {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
      isGuest: true,
    });

    const expectedGuestIdentity = {
      isGuest: true,
      AND: [
        {
          OR: [{ branchId: { not: null } }, { customerOrders: { some: {} } }],
        },
      ],
    };
    expect(findMany.mock.calls[0]?.[0].where.AND).toContainEqual(
      expectedGuestIdentity,
    );
    expect(count.mock.calls[0]?.[0].where.AND).toContainEqual(
      expectedGuestIdentity,
    );
  });

  it('applies branch membership or branch-order scope to list, count, and detail queries', async () => {
    type QueryArgs = { where: { AND?: unknown[]; OR?: unknown[] } };
    const findMany = jest.fn((args: QueryArgs) => {
      void args;
      return Promise.resolve([]);
    });
    const count = jest.fn((args: QueryArgs) => {
      void args;
      return Promise.resolve(0);
    });
    const findFirst = jest.fn((args: QueryArgs) => {
      void args;
      return Promise.resolve(null);
    });
    const prisma = {
      user: { findMany, count, findFirst },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const repository = new UsersRepository(prisma as never);

    await repository.listCustomers('tenant-1', {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
      branchId: 'branch-1',
    });
    await repository.findCustomerById('customer-1', {
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });

    const branchScope = {
      OR: [
        { branchId: 'branch-1' },
        { customerOrders: { some: { branchId: 'branch-1' } } },
      ],
    };
    expect(findMany.mock.calls[0]?.[0].where.AND).toContainEqual(branchScope);
    expect(count.mock.calls[0]?.[0].where.AND).toContainEqual(branchScope);
    expect(findFirst.mock.calls[0]?.[0].where).toEqual(
      expect.objectContaining(branchScope),
    );
  });

  it('applies account and inclusive creation-date filters before pagination', async () => {
    type QueryArgs = {
      where: Record<string, unknown>;
      skip?: number;
      take?: number;
    };
    const findMany = jest.fn((args: QueryArgs) => {
      void args;
      return Promise.resolve([]);
    });
    const count = jest.fn((args: QueryArgs) => {
      void args;
      return Promise.resolve(0);
    });
    const prisma = {
      user: { findMany, count },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const repository = new UsersRepository(prisma as never);

    await repository.listCustomers('tenant-1', {
      page: 2,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
      isActive: false,
      isVerified: true,
      fromDate: '2026-11-01',
      toDate: '2026-11-16',
    });

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      skip: 10,
      take: 10,
      where: {
        isActive: false,
        isVerified: true,
        createdAt: {
          gte: new Date('2026-11-01T00:00:00.000Z'),
          lte: new Date('2026-11-16T23:59:59.999Z'),
        },
      },
    });
  });

  it('uses the exact sanitized list predicate for stats and pagination', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-26T12:00:00.000Z'));

    type QueryArgs = {
      where: Record<string, unknown>;
      skip?: number;
      take?: number;
    };
    const findMany = jest.fn((args: QueryArgs) => {
      void args;
      return Promise.resolve(
        Array.from({ length: 10 }, (_, index) => ({
          id: `customer-${index + 1}`,
        })),
      );
    });
    const count = jest
      .fn<Promise<number>, [QueryArgs]>()
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3);
    const prisma = {
      user: { findMany, count },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const repository = new UsersRepository(prisma as never);

    const result = await repository.listCustomers(
      'tenant-1',
      {
        page: 2,
        limit: 10,
        search: 'guest@example.com',
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        isGuest: true,
        isVerified: false,
        fromDate: '2026-10-01',
        toDate: '2026-11-26',
      },
      true,
    );

    const listWhere = findMany.mock.calls[0]?.[0].where;
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 10, take: 10 });
    expect(listWhere).toMatchObject({
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isVerified: false,
      createdAt: {
        gte: new Date('2026-10-01T00:00:00.000Z'),
        lte: new Date('2026-11-26T23:59:59.999Z'),
      },
    });
    expect(listWhere).not.toHaveProperty('deletedAt');
    expect(count.mock.calls[0]?.[0].where).toEqual(listWhere);
    expect(count.mock.calls[1]?.[0].where).toEqual({
      AND: [listWhere, { isActive: true }],
    });
    expect(count.mock.calls[2]?.[0].where).toEqual({
      AND: [listWhere, { isActive: false }],
    });
    expect(count.mock.calls[3]?.[0].where).toEqual({
      AND: [
        listWhere,
        { createdAt: { gte: new Date('2026-10-27T12:00:00.000Z') } },
      ],
    });
    expect(result).toMatchObject({
      total: 10,
      stats: {
        totalCustomers: 10,
        activeCustomers: 6,
        inactiveCustomers: 4,
        newCustomersLast30Days: 3,
      },
    });

    jest.useRealTimers();
  });

  it('keeps active and inactive cards inside an explicit active filter', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest
      .fn()
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1);
    const prisma = {
      user: { findMany, count },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const repository = new UsersRepository(prisma as never);

    const result = await repository.listCustomers('tenant-1', {
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
      isActive: false,
    });

    expect(result.stats).toMatchObject({
      totalCustomers: 4,
      activeCustomers: 0,
      inactiveCustomers: 4,
    });
    expect(count).toHaveBeenNthCalledWith(2, {
      where: {
        AND: [expect.objectContaining({ isActive: false }), { isActive: true }],
      },
    });
  });

  const makeTransaction = () => {
    const calls: string[] = [];
    const modelMocks = new Map<string, Record<string, jest.Mock>>();

    const tx = new Proxy(
      {},
      {
        get: (_target, modelName: string) => {
          if (!modelMocks.has(modelName)) {
            modelMocks.set(modelName, {
              findMany: jest.fn(() => {
                calls.push(`${modelName}.findMany`);

                if (modelName === 'user') {
                  return Promise.resolve([{ id: 'customer-1' }]);
                }

                if (modelName === 'order') {
                  return Promise.resolve([{ id: 'order-1' }]);
                }

                if (modelName === 'groupOrderSession') {
                  return Promise.resolve([{ id: 'group-order-1' }]);
                }

                if (modelName === 'staffRole') {
                  return Promise.resolve([{ id: 'staff-role-1' }]);
                }

                if (modelName === 'staffUser') {
                  return Promise.resolve([{ id: 'staff-user-1' }]);
                }

                return Promise.resolve([]);
              }),
              deleteMany: jest.fn(() => {
                calls.push(`${modelName}.deleteMany`);
                return Promise.resolve({ count: 1 });
              }),
              updateMany: jest.fn(() => {
                calls.push(`${modelName}.updateMany`);
                return Promise.resolve({ count: 1 });
              }),
            });
          }

          return modelMocks.get(modelName);
        },
      },
    ) as never;

    return { tx, calls, modelMocks };
  };

  it('removes customer relations before hard-deleting the user', async () => {
    const { tx, calls, modelMocks } = makeTransaction();
    const prisma = {
      $transaction: jest.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const repository = new UsersRepository(prisma as never);

    const result = await repository.forceDeleteUsersByEmails([
      'customer@example.com',
    ]);

    expect(modelMocks.get('user')?.findMany).toHaveBeenCalledWith({
      where: { email: { in: ['customer@example.com'] } },
      select: { id: true },
    });
    expect(modelMocks.get('generatedInvoice')?.updateMany).toHaveBeenCalledWith(
      {
        where: {
          OR: [
            { customerId: { in: ['customer-1'] } },
            { orderId: { in: ['order-1'] } },
          ],
        },
        data: {
          customerId: null,
          orderId: null,
        },
      },
    );
    expect(modelMocks.get('profile')?.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ['customer-1'] } },
    });
    expect(modelMocks.get('address')?.deleteMany).toHaveBeenCalledWith({
      where: {
        referenceId: { in: ['customer-1'] },
        refType: 'USER',
      },
    });
    expect(calls.indexOf('orderItem.deleteMany')).toBeLessThan(
      calls.indexOf('order.deleteMany'),
    );
    expect(calls.indexOf('order.deleteMany')).toBeLessThan(
      calls.indexOf('user.deleteMany'),
    );
    expect(calls.at(-1)).toBe('user.deleteMany');
    expect(result).toEqual({ count: 1 });
  });

  it('returns without touching relations when no email matches', async () => {
    const { tx, modelMocks } = makeTransaction();
    const userModel = (
      tx as unknown as {
        user: { findMany: jest.Mock };
      }
    ).user;
    userModel.findMany.mockResolvedValueOnce([]);
    const prisma = {
      $transaction: jest.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const repository = new UsersRepository(prisma as never);

    await expect(
      repository.forceDeleteUsersByEmails(['missing@example.com']),
    ).resolves.toEqual({ count: 0 });
    expect(modelMocks.has('order')).toBe(false);
    expect(modelMocks.get('user')?.deleteMany).not.toHaveBeenCalled();
  });
});
