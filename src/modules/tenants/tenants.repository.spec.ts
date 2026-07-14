import { TenantsRepository } from './tenants.repository';

describe('TenantsRepository', () => {
  const makePrisma = () => {
    const transaction = jest.fn((queries: unknown[]) => Promise.resolve(queries));
    const prisma = {
      $transaction: transaction,
      tenant: {
        findMany: jest.fn().mockReturnValue([]),
        count: jest.fn().mockReturnValue(0),
      },
    };

    return { prisma, transaction };
  };

  const makeTransaction = () => {
    const calls: string[] = [];
    const modelMocks = new Map<string, Record<string, jest.Mock>>();

    const tx = new Proxy(
      {},
      {
        get: (_target, modelName: string) => {
          if (!modelMocks.has(modelName)) {
            modelMocks.set(modelName, {
              delete: jest.fn(() => {
                calls.push(`${modelName}.delete`);
                return Promise.resolve({ id: 'tenant-1' });
              }),
              deleteMany: jest.fn(() => {
                calls.push(`${modelName}.deleteMany`);
                return Promise.resolve({ count: 1 });
              }),
              update: jest.fn(() => {
                calls.push(`${modelName}.update`);
                return Promise.resolve({ id: 'tenant-1' });
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

  it('lists only visible active business-admin-owned tenants by default', async () => {
    const { prisma, transaction } = makePrisma();
    const repository = new TenantsRepository(prisma as never);

    await repository.list({
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    });

    const expectedWhere = {
      deletedAt: null,
      isActive: true,
      owner: {
        role: 'BUSINESS_ADMIN',
        deletedAt: null,
        isActive: true,
      },
    };

    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(prisma.tenant.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('keeps business-admin owner role filter when deleted or inactive records are included', async () => {
    const { prisma } = makePrisma();
    const repository = new TenantsRepository(prisma as never);

    await repository.list(
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
      true,
      true,
    );

    const expectedWhere = {
      owner: {
        role: 'BUSINESS_ADMIN',
      },
    };

    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(prisma.tenant.count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it('deletes tenant-owned relation tables before deleting tenant/user/restaurant rows', async () => {
    const repository = new TenantsRepository({} as never);
    const { tx, calls, modelMocks } = makeTransaction();

    await repository.forceDeleteWithRelations('tenant-1', tx);

    expect(modelMocks.get('pushDeviceToken')?.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
    });
    expect(
      modelMocks.get('contactSubmission')?.deleteMany,
    ).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
    expect(
      modelMocks.get('entityTranslation')?.deleteMany,
    ).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
    expect(modelMocks.get('generatedInvoice')?.deleteMany).toHaveBeenCalledWith(
      { where: { tenantId: 'tenant-1' } },
    );
    expect(
      modelMocks.get('subscriptionDeduction')?.deleteMany,
    ).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });

    expect(calls.indexOf('pushDeviceToken.deleteMany')).toBeLessThan(
      calls.indexOf('user.deleteMany'),
    );
    expect(calls.indexOf('contactSubmission.deleteMany')).toBeLessThan(
      calls.indexOf('user.deleteMany'),
    );
    expect(calls.indexOf('entityTranslation.deleteMany')).toBeLessThan(
      calls.indexOf('restaurant.deleteMany'),
    );
    expect(calls.indexOf('subscriptionDeduction.deleteMany')).toBeLessThan(
      calls.indexOf('tenantSubscription.deleteMany'),
    );
    expect(calls.at(-1)).toBe('tenant.delete');
  });
});
