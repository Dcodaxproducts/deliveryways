import { Prisma } from '@prisma/client';
import { RestaurantMenuRepository } from './restaurant-menu.repository';

describe('RestaurantMenuRepository', () => {
  const makeHydrationPrisma = () => {
    const timestamp = new Date('2026-10-07T00:00:00.000Z');
    const menu = {
      id: 'menu-1',
      restaurantId: 'restaurant-1',
      name: 'Dinner',
      slug: 'dinner',
      description: null,
      isTimed: false,
      timingConfig: null,
      sortOrder: 1,
      isActive: true,
      deletedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      _count: { items: 1, categories: 1 },
    };
    const menuItem = {
      id: 'item-1',
      restaurantId: 'restaurant-1',
      categoryId: 'category-1',
      name: 'Pizza',
      slug: 'pizza',
      basePrice: new Prisma.Decimal(10),
      dietaryFlags: ['__SPLIT_PIZZA_ENABLED__'],
      isActive: true,
      deletedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const relevantVariationOverride = {
      id: 'variation-price-1',
      menuItemId: 'item-1',
      variationId: 'variation-1',
      price: new Prisma.Decimal(12),
      pickupPrice: new Prisma.Decimal(11),
      displayText: 'from 12',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const variation = {
      id: 'variation-1',
      restaurantId: 'restaurant-1',
      categoryId: 'category-1',
      name: 'Large',
      price: new Prisma.Decimal(15),
      sortOrder: 1,
      isDefault: true,
      isActive: true,
      deletedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      itemPriceOverrides: [relevantVariationOverride],
    };
    const modifier = {
      id: 'modifier-1',
      restaurantId: 'restaurant-1',
      categoryId: 'modifier-category-1',
      name: 'Cheese',
      priceDelta: new Prisma.Decimal(2),
      sortOrder: 1,
      isActive: true,
      deletedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      itemPriceOverrides: [
        {
          id: 'modifier-price-1',
          menuItemId: 'item-1',
          modifierId: 'modifier-1',
          priceDelta: new Prisma.Decimal(3),
          isRequired: false,
        },
      ],
      variationPriceOverrides: [
        {
          id: 'variation-modifier-price-1',
          menuItemId: 'item-1',
          variationId: 'variation-1',
          modifierId: 'modifier-1',
          priceDelta: new Prisma.Decimal(4),
        },
      ],
    };
    const modifierGroupLink = {
      id: 'item-modifier-link-1',
      menuItemId: 'item-1',
      modifierGroupId: 'modifier-group-1',
      sortOrder: 1,
      selectionType: 'SINGLE',
      minSelect: 0,
      maxSelect: 1,
      modifierGroup: {
        id: 'modifier-group-1',
        restaurantId: 'restaurant-1',
        name: 'Extras',
        description: null,
        minSelect: 0,
        maxSelect: 1,
        includedSelect: 0,
        isRequired: false,
        sortOrder: 1,
        isActive: true,
        deletedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        modifierLinks: [
          {
            id: 'group-modifier-link-1',
            modifierGroupId: 'modifier-group-1',
            modifierId: 'modifier-1',
            sortOrder: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
            modifier,
          },
        ],
      },
    };

    const prisma = {
      $transaction: jest.fn(),
      restaurantMenu: {
        findUnique: jest.fn().mockResolvedValue(menu),
        findMany: jest.fn().mockResolvedValue([menu]),
        count: jest.fn().mockResolvedValue(1),
      },
      restaurantMenuItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'menu-item-link-1',
            restaurantMenuId: 'menu-1',
            menuItemId: 'item-1',
            sortOrder: 1,
            isActive: true,
            createdAt: timestamp,
            updatedAt: timestamp,
            menuItem,
          },
        ]),
      },
      restaurantMenuCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'menu-category-link-1',
            restaurantMenuId: 'menu-1',
            menuCategoryId: 'category-1',
            sortOrder: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
            menuCategory: {
              id: 'category-1',
              name: 'Pizzas',
              slug: 'pizzas',
              imageUrl: null,
              isActive: true,
            },
          },
        ]),
      },
      menuCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'category-1',
            name: 'Pizzas',
            slug: 'pizzas',
            imageUrl: null,
            items: [{ id: 'item-1', name: 'Pizza', slug: 'pizza' }],
            variations: [variation],
            variationLinks: [],
          },
        ]),
      },
      menuItemVariationPriceOverride: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ ...relevantVariationOverride, variation }]),
      },
      menuCategoryModifierGroup: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      menuItemModifierGroup: {
        findMany: jest.fn().mockResolvedValue([modifierGroupLink]),
      },
      menuItemModifierPriceOverride: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'modifier-price-1',
            menuItemId: 'item-1',
            modifierId: 'modifier-1',
            priceDelta: new Prisma.Decimal(3),
            isRequired: false,
            modifier,
          },
        ]),
      },
    };

    return { prisma, menu };
  };

  it('hydrates list with bounded override queries instead of a heavy transaction', async () => {
    const { prisma } = makeHydrationPrisma();
    const repository = new RestaurantMenuRepository(prisma as never);

    const result = await repository.list('restaurant-1', {
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    } as never);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.restaurantMenu.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.restaurantMenu.count).toHaveBeenCalledTimes(1);
    expect(prisma.restaurantMenuItem.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.restaurantMenuCategory.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.menuCategory.findMany).toHaveBeenCalledTimes(1);
    expect(
      prisma.menuItemVariationPriceOverride.findMany,
    ).toHaveBeenCalledTimes(1);
    expect(prisma.menuCategoryModifierGroup.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.menuItemModifierGroup.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.menuItemModifierPriceOverride.findMany).toHaveBeenCalledTimes(
      1,
    );

    const categoryCalls = prisma.menuCategory.findMany.mock
      .calls as unknown[][];
    expect(categoryCalls[0][0]).toMatchObject({
      where: { id: { in: ['category-1'] } },
      select: {
        variations: {
          include: {
            itemPriceOverrides: {
              where: { menuItemId: { in: ['item-1'] } },
            },
          },
        },
        variationLinks: {
          include: {
            variation: {
              include: {
                itemPriceOverrides: {
                  where: { menuItemId: { in: ['item-1'] } },
                },
              },
            },
          },
        },
      },
    });
    const variationOverrideCalls = prisma.menuItemVariationPriceOverride
      .findMany.mock.calls as unknown[][];
    expect(variationOverrideCalls[0][0]).toMatchObject({
      where: { menuItemId: { in: ['item-1'] } },
    });

    const modifierCalls = prisma.menuItemModifierGroup.findMany.mock
      .calls as unknown[][];
    expect(modifierCalls[0][0]).toMatchObject({
      include: {
        modifierGroup: {
          include: {
            modifierLinks: {
              include: {
                modifier: {
                  include: {
                    itemPriceOverrides: {
                      where: { menuItemId: { in: ['item-1'] } },
                    },
                    variationPriceOverrides: {
                      where: {
                        variationId: { in: ['variation-1'] },
                        OR: [
                          { menuItemId: null },
                          { menuItemId: { in: ['item-1'] } },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // These bounded clauses keep a tenant's 425k-style unrelated override rows out
    // of every hydration query rather than materializing and filtering them in V8.
    expect(result.total).toBe(1);
    expect(result.items[0].items[0].menuItem.id).toBe('item-1');
    expect(result.items[0].items[0].menuItem.category.id).toBe('category-1');
    expect(
      result.items[0].items[0].menuItem.variationPriceOverrides[0].variation.id,
    ).toBe('variation-1');
    expect(
      result.items[0].items[0].menuItem.variationPriceOverrides[0].price.toString(),
    ).toBe('12');
    expect(
      result.items[0].items[0].menuItem.modifierPriceOverrides[0].priceDelta.toString(),
    ).toBe('3');
    expect(
      result.items[0].items[0].menuItem.modifierLinks[0].modifierGroup.modifierLinks[0].modifier.variationPriceOverrides[0].priceDelta.toString(),
    ).toBe('4');
    expect(result.items[0].categories[0].menuCategory.id).toBe('category-1');
  });

  it('preserves findById inactive relation semantics while bounding overrides', async () => {
    const { prisma } = makeHydrationPrisma();
    const repository = new RestaurantMenuRepository(prisma as never);

    const result = await repository.findById('menu-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    const itemCalls = prisma.restaurantMenuItem.findMany.mock
      .calls as unknown[][];
    expect(itemCalls[0][0]).toMatchObject({
      where: {
        restaurantMenuId: { in: ['menu-1'] },
        menuItem: { deletedAt: null },
      },
    });
    const categoryModifierCalls = prisma.menuCategoryModifierGroup.findMany.mock
      .calls as unknown[][];
    expect(categoryModifierCalls[0][0]).toMatchObject({
      include: {
        modifierGroup: {
          include: {
            modifierLinks: {
              include: {
                modifier: {
                  include: {
                    itemPriceOverrides: {
                      where: { menuItemId: { in: ['item-1'] } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(result?.id).toBe('menu-1');
    expect(result?.items[0].id).toBe('menu-item-link-1');
    expect(result?.categories[0].id).toBe('menu-category-link-1');
  });

  it('filters deleted menu item and category targets from menu link lists', async () => {
    const prisma = {
      restaurantMenuItem: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      restaurantMenuCategory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const repository = new RestaurantMenuRepository(prisma as never);

    await repository.listMenuItemLinks('menu-1');
    await repository.listMenuCategoryLinks('menu-1');
    await repository.listMenuCategories('menu-1');

    expect(prisma.restaurantMenuItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { restaurantMenuId: 'menu-1', menuItem: { deletedAt: null } },
      }),
    );
    expect(prisma.restaurantMenuCategory.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          restaurantMenuId: 'menu-1',
          menuCategory: { deletedAt: null },
        },
      }),
    );
    expect(prisma.restaurantMenuCategory.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          restaurantMenuId: 'menu-1',
          menuCategory: { deletedAt: null },
        },
      }),
    );
  });

  it('exposes modifier groups with item and variation price overrides in listMenuItems', async () => {
    const prisma = {
      menuItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'item-1',
            categoryId: 'category-1',
            name: 'Pizza',
            slug: 'pizza',
            description: 'desc',
            imageUrl: 'image',
            sku: 'SKU-1',
            basePrice: new Prisma.Decimal(0),
            depositAmount: new Prisma.Decimal(0),
            prepTimeMinutes: 20,
            isActive: true,
            category: {
              id: 'category-1',
              name: 'Pizza',
              slug: 'pizza',
              imageUrl: 'category-image',
              variations: [],
              modifierLinks: [
                {
                  sortOrder: 1,
                  modifierGroup: {
                    id: 'group-category',
                    name: 'Category Group',
                    description: 'category group',
                    minSelect: 0,
                    maxSelect: 2,
                    isRequired: false,
                    modifierLinks: [
                      {
                        sortOrder: 1,
                        modifier: {
                          id: 'modifier-category',
                          name: 'Extra Cheese',
                          description: 'extra cheese',
                          priceDelta: new Prisma.Decimal(100),
                          itemPriceOverrides: [
                            {
                              menuItemId: 'item-1',
                              priceDelta: new Prisma.Decimal(150),
                            },
                          ],
                          variationPriceOverrides: [
                            {
                              variationId: 'variation-1',
                              priceDelta: new Prisma.Decimal(175),
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
            menuLinks: [
              {
                id: 'menu-link-1',
                sortOrder: 1,
                isActive: true,
              },
            ],
            modifierLinks: [
              {
                sortOrder: 2,
                modifierGroup: {
                  id: 'group-item',
                  name: 'Item Group',
                  description: 'item group',
                  minSelect: 1,
                  maxSelect: 1,
                  isRequired: true,
                  modifierLinks: [
                    {
                      sortOrder: 1,
                      modifier: {
                        id: 'modifier-item',
                        name: 'Stuffed Crust',
                        description: 'stuffed crust',
                        priceDelta: new Prisma.Decimal(200),
                        itemPriceOverrides: [
                          {
                            menuItemId: 'item-1',
                            priceDelta: new Prisma.Decimal(250),
                          },
                        ],
                        variationPriceOverrides: [
                          {
                            variationId: 'variation-2',
                            priceDelta: new Prisma.Decimal(300),
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      restaurantMenuCategory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };

    const repository = new RestaurantMenuRepository(prisma as never);

    const result = await repository.listMenuItems('menu-1', {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    } as never);

    expect('modifierGroups' in result.items[0]).toBe(false);
  });
});
