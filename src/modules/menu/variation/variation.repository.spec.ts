import { MenuVariationRepository } from './variation.repository';

describe('MenuVariationRepository', () => {
  it.each([
    ['ASC', [{ sortOrder: 'asc' }, { createdAt: 'desc' }]],
    ['DESC', [{ sortOrder: 'desc' }, { createdAt: 'desc' }]],
  ] as const)(
    'orders menu variations by sortOrder %s',
    async (sortOrder, orderBy) => {
      const findMany = jest.fn().mockResolvedValue([]);
      const count = jest.fn().mockResolvedValue(0);
      const transaction = jest.fn(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      );

      const repository = new MenuVariationRepository({
        menuItemVariation: { findMany, count },
        $transaction: transaction,
      } as never);

      await repository.list('restaurant-1', {
        page: 1,
        limit: 10,
        sortBy: 'sortOrder',
        sortOrder,
      } as never);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy }),
      );
    },
  );

  it('matches categoryId against direct category, category links, and item category links', async () => {
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
      orderBy?: unknown;
      where?: {
        OR?: unknown[];
      };
    };

    expect(findManyArgs.where?.OR).toEqual([
      { categoryId: 'category-1' },
      { categoryLinks: { some: { categoryId: 'category-1' } } },
      {
        itemPriceOverrides: {
          some: {
            menuItem: {
              deletedAt: null,
              isActive: true,
              OR: [
                { categoryId: 'category-1' },
                {
                  categoryLinks: {
                    some: { menuCategoryId: 'category-1' },
                  },
                },
              ],
            },
          },
        },
      },
    ]);
    expect(findManyArgs.orderBy).toEqual([
      { name: 'asc' },
      { createdAt: 'desc' },
    ]);
  });
});
