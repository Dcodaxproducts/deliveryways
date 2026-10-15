import { WinOrderConnectionRepository } from './winorder-connection.repository';

type ConnectionUpdateArgs = {
  where: {
    tenantId: string;
    restaurantId: string;
    branchId: string;
    isEnabled?: boolean;
    lastPollAt?: null;
  };
  data: {
    storeId?: number | null;
    storeName?: string;
    isEnabled?: boolean;
    updatedBy?: string;
    orderExportCutoffAt?: Date;
    username?: string;
    passwordHash?: string;
    credentialVersion?: { increment: number };
  };
};

type ConnectionCreateArgs = {
  data: {
    tenantId: string;
    restaurantId: string;
    branchId: string;
    username: string;
    passwordHash: string;
    storeId: number | null;
    storeName?: string;
    isEnabled: boolean;
    orderExportCutoffAt: Date;
    createdBy: string;
    updatedBy: string;
  };
  select: unknown;
};

describe('WinOrderConnectionRepository', () => {
  const scope = {
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('pins direct enabled creation to an explicit activation cutoff', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T05:50:00.000Z'));
    const create = jest
      .fn<Promise<{ id: string }>, [ConnectionCreateArgs]>()
      .mockResolvedValue({ id: 'connection-1' });
    const repository = new WinOrderConnectionRepository({
      winOrderConnection: { create },
    } as never);

    await repository.create(scope, {
      username: 'wo_user',
      passwordHash: 'stored-hash',
      storeId: null,
      actorId: 'admin-1',
    });

    expect(create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        ...scope,
        isEnabled: true,
        orderExportCutoffAt: new Date('2026-10-15T05:50:00.000Z'),
      }),
    );
  });

  it('moves the export cutoff on the first enablement of an unpolled connection', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T05:55:00.000Z'));
    const updateMany = jest
      .fn<Promise<{ count: number }>, [ConnectionUpdateArgs]>()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const transaction = jest.fn(
      async (
        work: (tx: {
          winOrderConnection: { updateMany: typeof updateMany };
        }) => Promise<unknown>,
      ) => work({ winOrderConnection: { updateMany } }),
    );
    const repository = new WinOrderConnectionRepository({
      $transaction: transaction,
    } as never);

    await repository.update(scope, {
      isEnabled: true,
      storeName: 'Crispy Pizza Solingen',
      actorId: 'admin-1',
    });

    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        ...scope,
        isEnabled: false,
        lastPollAt: null,
      },
      data: {
        orderExportCutoffAt: new Date('2026-10-15T05:55:00.000Z'),
      },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: scope,
      data: {
        storeId: undefined,
        storeName: 'Crispy Pizza Solingen',
        isEnabled: true,
        updatedBy: 'admin-1',
      },
    });
  });

  it('does not move the cutoff for configuration changes or disablement', async () => {
    const updateMany = jest
      .fn<Promise<{ count: number }>, [ConnectionUpdateArgs]>()
      .mockResolvedValue({ count: 1 });
    const transaction = jest.fn();
    const repository = new WinOrderConnectionRepository({
      winOrderConnection: { updateMany },
      $transaction: transaction,
    } as never);

    await repository.update(scope, {
      storeId: 41,
      actorId: 'admin-1',
    });
    await repository.update(scope, {
      isEnabled: false,
      actorId: 'admin-1',
    });

    expect(transaction).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledTimes(2);
    for (const [query] of updateMany.mock.calls) {
      expect(
        Object.prototype.hasOwnProperty.call(query.data, 'orderExportCutoffAt'),
      ).toBe(false);
    }
  });

  it('preserves existing WinOrder and retry history by gating bootstrap on no prior poll', async () => {
    const updateMany = jest
      .fn<Promise<{ count: number }>, [ConnectionUpdateArgs]>()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const transaction = jest.fn(
      async (
        work: (tx: {
          winOrderConnection: { updateMany: typeof updateMany };
        }) => Promise<unknown>,
      ) => work({ winOrderConnection: { updateMany } }),
    );
    const repository = new WinOrderConnectionRepository({
      $transaction: transaction,
    } as never);

    await repository.update(scope, {
      isEnabled: true,
      actorId: 'admin-1',
    });

    expect(updateMany.mock.calls[0][0].where).toEqual({
      ...scope,
      isEnabled: false,
      lastPollAt: null,
    });
    expect(updateMany.mock.calls[1][0].where).toEqual(scope);
  });

  it('keeps bootstrap and enablement scoped to one tenant restaurant and branch', async () => {
    const updateMany = jest
      .fn<Promise<{ count: number }>, [ConnectionUpdateArgs]>()
      .mockResolvedValue({ count: 1 });
    const transaction = jest.fn(
      async (
        work: (tx: {
          winOrderConnection: { updateMany: typeof updateMany };
        }) => Promise<unknown>,
      ) => work({ winOrderConnection: { updateMany } }),
    );
    const repository = new WinOrderConnectionRepository({
      $transaction: transaction,
    } as never);

    await repository.update(scope, {
      isEnabled: true,
      actorId: 'admin-1',
    });

    for (const [query] of updateMany.mock.calls) {
      expect(query.where).toEqual(expect.objectContaining(scope));
    }
  });
  it('moves the export cutoff when credential rotation first enables an unpolled connection', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T06:00:00.000Z'));
    const updateMany = jest
      .fn<Promise<{ count: number }>, [ConnectionUpdateArgs]>()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const transaction = jest.fn(
      async (
        work: (tx: {
          winOrderConnection: { updateMany: typeof updateMany };
        }) => Promise<unknown>,
      ) => work({ winOrderConnection: { updateMany } }),
    );
    const repository = new WinOrderConnectionRepository({
      $transaction: transaction,
    } as never);

    await repository.rotate(scope, {
      username: 'wo_rotated',
      passwordHash: 'rotated-hash',
      actorId: 'admin-1',
    });

    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        ...scope,
        isEnabled: false,
        lastPollAt: null,
      },
      data: {
        orderExportCutoffAt: new Date('2026-10-15T06:00:00.000Z'),
      },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: scope,
      data: {
        username: 'wo_rotated',
        passwordHash: 'rotated-hash',
        credentialVersion: { increment: 1 },
        isEnabled: true,
        updatedBy: 'admin-1',
      },
    });
  });

  it('preserves the cutoff when rotation re-enables a previously polled connection', async () => {
    const updateMany = jest
      .fn<Promise<{ count: number }>, [ConnectionUpdateArgs]>()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const transaction = jest.fn(
      async (
        work: (tx: {
          winOrderConnection: { updateMany: typeof updateMany };
        }) => Promise<unknown>,
      ) => work({ winOrderConnection: { updateMany } }),
    );
    const repository = new WinOrderConnectionRepository({
      $transaction: transaction,
    } as never);

    await repository.rotate(scope, {
      username: 'wo_rotated',
      passwordHash: 'rotated-hash',
      actorId: 'admin-1',
    });

    expect(updateMany.mock.calls[0][0].where).toEqual({
      ...scope,
      isEnabled: false,
      lastPollAt: null,
    });
    expect(updateMany.mock.calls[1][0].data).not.toHaveProperty(
      'orderExportCutoffAt',
    );
  });
});
