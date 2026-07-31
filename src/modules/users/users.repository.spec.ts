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

    expect(findMany.mock.calls[0]?.[0].where.isGuest).toBe(false);
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
