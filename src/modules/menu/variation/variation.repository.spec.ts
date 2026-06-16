import { MenuVariationRepository } from './variation.repository';

describe('MenuVariationRepository', () => {
  it('matches categoryId against direct legacy category and category links', async () => {
    const findMany = jest.fn<Promise<unknown[]>, [{ where?: unknown }]>();
    const count = jest.fn<Promise<number>, [{ where?: unknown }]>();
    const transaction = jest.fn(async (ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );

    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    const repository = new MenuVariationRepository({
      menuItemVariation: {
        findMany,
        count,
      },
      $transaction: transaction,
    } as never);

    await repository.list('restaurant-1', {
      restaurantId: 'restaurant-1',
      categoryId: 'category-1',
      page: 1,
      limit: 50,
      sortBy: 'name',
      sortOrder: 'ASC',
      isActive: true,
    });

    const findManyArgs = findMany.mock.calls[0]?.[0] as {
      where?: {
        OR?: unknown[];
      };
    };

    expect(findManyArgs.where?.OR).toEqual([
      { categoryId: 'category-1' },
      { categoryLinks: { some: { categoryId: 'category-1' } } },
    ]);
  });
});
