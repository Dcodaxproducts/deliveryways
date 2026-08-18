import { Prisma } from '@prisma/client';

import { MenuItemRepository } from './item.repository';

interface MenuItemTransactionMock {
  menuItem: {
    findMany: jest.Mock;
    update: jest.Mock;
  };
}

interface MenuItemListIncludeShape {
  variationModifierPriceOverrides: boolean;
  variationPriceOverrides: {
    include: {
      variation: {
        include: { modifierPriceOverrides: unknown };
      };
    };
  };
  category: {
    select: {
      variations: { include: { modifierPriceOverrides: unknown } };
      variationLinks: {
        include: {
          variation: {
            include: { modifierPriceOverrides: unknown };
          };
        };
      };
    };
  };
}

describe('MenuItemRepository', () => {
  const createRepository = () => {
    const findMany: jest.Mock<
      Promise<unknown[]>,
      [Prisma.MenuItemFindManyArgs]
    > = jest
      .fn<Promise<unknown[]>, [Prisma.MenuItemFindManyArgs]>()
      .mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      menuItem: { findMany, count, update },
      $transaction: jest.fn(
        (
          operation:
            | Array<Promise<unknown>>
            | ((tx: MenuItemTransactionMock) => Promise<unknown>),
        ) =>
          typeof operation === 'function'
            ? operation({ menuItem: { findMany, update } })
            : Promise.all(operation),
      ),
    };

    return {
      repository: new MenuItemRepository(prisma as never),
      findMany,
      update,
    };
  };

  it.each([
    ['ASC', [{ sortOrder: 'asc' }, { createdAt: 'desc' }]],
    ['DESC', [{ sortOrder: 'desc' }, { createdAt: 'desc' }]],
  ] as const)(
    'orders menu items by sortOrder %s',
    async (sortOrder, orderBy) => {
      const { repository, findMany } = createRepository();

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

  it('loads shared and item-scoped variation modifier prices separately', async () => {
    const { repository, findMany } = createRepository();

    await repository.list('restaurant-1', {
      page: 1,
      limit: 10,
      sortBy: 'sortOrder',
      sortOrder: 'ASC',
    } as never);

    const sharedModifierPriceOverrides = { where: { menuItemId: null } };
    const include = findMany.mock.calls[0][0]
      .include as unknown as MenuItemListIncludeShape;

    expect(include.variationModifierPriceOverrides).toBe(true);
    expect(
      include.variationPriceOverrides.include.variation.include
        .modifierPriceOverrides,
    ).toEqual(sharedModifierPriceOverrides);
    expect(
      include.category.select.variations.include.modifierPriceOverrides,
    ).toEqual(sharedModifierPriceOverrides);
    expect(
      include.category.select.variationLinks.include.variation.include
        .modifierPriceOverrides,
    ).toEqual(sharedModifierPriceOverrides);
  });

  it('puts the submitted category order first and normalizes legacy ties', async () => {
    const { repository, findMany, update } = createRepository();
    findMany.mockResolvedValue([
      { id: 'legacy-zero-1' },
      { id: 'item-2' },
      { id: 'legacy-zero-2' },
      { id: 'item-1' },
    ]);

    await repository.reorderRestaurantItems(
      'restaurant-1',
      [
        { id: 'item-1', sortOrder: 2 },
        { id: 'item-2', sortOrder: 1 },
      ],
      'category-1',
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        restaurantId: 'restaurant-1',
        deletedAt: null,
        OR: [
          { categoryId: 'category-1' },
          {
            categoryLinks: {
              some: { menuCategoryId: 'category-1' },
            },
          },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: 'item-2' },
      data: { sortOrder: 1 },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: 'item-1' },
      data: { sortOrder: 2 },
    });
    expect(update).toHaveBeenNthCalledWith(3, {
      where: { id: 'legacy-zero-1' },
      data: { sortOrder: 3 },
    });
    expect(update).toHaveBeenNthCalledWith(4, {
      where: { id: 'legacy-zero-2' },
      data: { sortOrder: 4 },
    });
  });
});
