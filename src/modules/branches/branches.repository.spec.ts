import { BranchesRepository } from './branches.repository';

describe('BranchesRepository', () => {
  it('scopes assignment reads through tenant, restaurant, branch and active menu state', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new BranchesRepository({
      branchMenuAssignment: { findMany },
    } as never);

    await repository.listMenuAssignments({
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          branchId: 'branch-1',
          isActive: true,
          branch: { isActive: true, deletedAt: null },
          restaurantMenu: { isActive: true, deletedAt: null },
        },
      }),
    );
  });

  it('switches the restaurant default branch in one transaction', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn().mockResolvedValue({
      id: 'branch-2',
      restaurantId: 'restaurant-1',
      isMain: true,
    });
    const transactionClient = {
      branch: { updateMany, update },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof transactionClient) => Promise<unknown>) =>
          callback(transactionClient),
      ),
    };
    const repository = new BranchesRepository(prisma as never);

    const result = await repository.setDefault('branch-2', 'restaurant-1');

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        restaurantId: 'restaurant-1',
        isMain: true,
        deletedAt: null,
      },
      data: { isMain: false },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'branch-2' },
      data: { isMain: true },
    });
    expect(result).toEqual(
      expect.objectContaining({ id: 'branch-2', isMain: true }),
    );
  });
});
