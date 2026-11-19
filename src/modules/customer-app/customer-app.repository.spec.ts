import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database';
import { CustomerAppRepository } from './customer-app.repository';

type FindManyMenuItems = (
  args: Prisma.MenuItemFindManyArgs,
) => Promise<unknown[]>;
type CountMenuItems = (args: Prisma.MenuItemCountArgs) => Promise<number>;
type FindManyMenuCategories = (
  args: Prisma.MenuCategoryFindManyArgs,
) => Promise<unknown[]>;
type CountMenuCategories = (
  args: Prisma.MenuCategoryCountArgs,
) => Promise<number>;
type FindManyCuisines = (
  args: Prisma.CuisineFindManyArgs,
) => Promise<unknown[]>;
type CountCuisines = (args: Prisma.CuisineCountArgs) => Promise<number>;
type FindFirstRestaurant = (
  args: Prisma.RestaurantFindFirstArgs,
) => Promise<unknown>;

type CompactMenuItemInclude = {
  category: {
    select: {
      variations: {
        select: Record<string, boolean>;
      };
      _count: {
        select: Record<string, boolean>;
      };
    };
  };
  _count: {
    select: Record<string, boolean>;
  };
  variationPriceOverrides: {
    select: {
      variation: {
        select: Record<string, boolean>;
      };
    };
  };
};

describe('CustomerAppRepository', () => {
  it('canonicalizes apex and www custom domains to the same verified restaurant', async () => {
    const findFirst = jest
      .fn<ReturnType<FindFirstRestaurant>, Parameters<FindFirstRestaurant>>()
      .mockResolvedValue({ id: 'restaurant-1' });
    const repository = new CustomerAppRepository({
      restaurant: { findFirst },
    } as unknown as PrismaService);

    await repository.findRestaurantDomainContext('pizzeriafourstar.de');

    expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({
      customDomainVerifiedAt: { not: null },
      OR: [
        {
          customDomain: {
            equals: 'pizzeriafourstar.de',
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          customDomain: {
            equals: 'www.pizzeriafourstar.de',
            mode: Prisma.QueryMode.insensitive,
          },
        },
      ],
    });
  });

  it('uses the schema-backed dietary flag for public split-pizza queries', async () => {
    const findMany = jest
      .fn<ReturnType<FindManyMenuItems>, Parameters<FindManyMenuItems>>()
      .mockResolvedValue([]);
    const count = jest
      .fn<ReturnType<CountMenuItems>, Parameters<CountMenuItems>>()
      .mockResolvedValue(0);
    const repository = new CustomerAppRepository({
      menuItem: { findMany, count },
    } as unknown as PrismaService);

    await repository.listPublicMenuItems({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      supportsSplitPizza: true,
      page: 1,
      limit: 50,
      sortBy: 'sortOrder',
      sortOrder: 'ASC',
    });

    const where = findMany.mock.calls[0]?.[0]?.where;
    expect(where).toEqual(
      expect.objectContaining({
        dietaryFlags: {
          array_contains: ['__SPLIT_PIZZA_ENABLED__'],
        },
      }),
    );
    expect(where).not.toHaveProperty('supportsSplitPizza');
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('keeps cuisine listing fixed-query and schedule-aware without hydrating item links', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-16T00:30:00.000Z'));
    const findMany = jest
      .fn<ReturnType<FindManyCuisines>, Parameters<FindManyCuisines>>()
      .mockResolvedValue([
        {
          id: 'cuisine-1',
          name: 'Night food',
          _count: { itemLinks: 37 },
        },
      ]);
    const count = jest
      .fn<ReturnType<CountCuisines>, Parameters<CountCuisines>>()
      .mockResolvedValue(1);
    const findMenus = jest.fn().mockResolvedValue([
      {
        id: 'overnight-menu',
        isTimed: true,
        timingConfig: {
          timezone: 'UTC',
          windows: [{ day: 'SUNDAY', start: '23:00', end: '01:00' }],
        },
      },
    ]);
    const queryRaw = jest
      .fn()
      .mockResolvedValue([
        { cuisineId: 'cuisine-1', categoryId: 'category-1' },
      ]);
    const repository = new CustomerAppRepository({
      restaurantMenu: { findMany: findMenus },
      cuisine: { findMany, count },
      $queryRaw: queryRaw,
    } as unknown as PrismaService);

    const result = await repository.listCuisineCategories({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      page: 1,
      limit: 8,
      sortBy: 'sortOrder',
      sortOrder: 'ASC',
    });

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        categoryIds: ['category-1'],
        _count: { items: 37 },
      }),
    );
    expect(findMenus).toHaveBeenCalledWith(
      expect.objectContaining({ take: 501 }),
    );
    const cuisineQuery = findMany.mock.calls[0]?.[0];
    expect(Object.keys(cuisineQuery?.include ?? {})).toEqual(['_count']);
    expect(JSON.stringify(cuisineQuery)).toContain('overnight-menu');
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(1);
    expect(
      findMenus.mock.calls.length +
        findMany.mock.calls.length +
        count.mock.calls.length +
        queryRaw.mock.calls.length,
    ).toBe(4);
    jest.useRealTimers();
  });

  it('fails closed on a per-cuisine category overflow and keeps scope in the detail query', async () => {
    const findMany = jest
      .fn<ReturnType<FindManyCuisines>, Parameters<FindManyCuisines>>()
      .mockResolvedValue([
        {
          id: 'cuisine-1',
          name: 'Cuisine',
          _count: { itemLinks: 1 },
        },
      ]);
    const queryRaw = jest
      .fn<
        Promise<
          Array<{
            cuisineId: string;
            categoryId: string;
            rowNumber: bigint;
          }>
        >,
        [Prisma.Sql]
      >()
      .mockResolvedValue([
        {
          cuisineId: 'cuisine-1',
          categoryId: 'category-201',
          rowNumber: 201n,
        },
      ]);
    const repository = new CustomerAppRepository({
      restaurantMenu: { findMany: jest.fn().mockResolvedValue([]) },
      cuisine: { findMany, count: jest.fn().mockResolvedValue(1) },
      $queryRaw: queryRaw,
    } as unknown as PrismaService);

    await expect(
      repository.listCuisineCategories(
        {
          restaurantId: 'restaurant-1',
          branchId: 'branch-1',
          page: 1,
          limit: 8,
          sortBy: 'sortOrder',
          sortOrder: 'ASC',
        },
        { categoryIds: ['promotion-category'] },
      ),
    ).rejects.toThrow('Cuisine category detail limit exceeded');

    const cuisineQuery = findMany.mock.calls[0]?.[0];
    expect(JSON.stringify(cuisineQuery?.include)).toContain(
      'promotion-category',
    );
    const sqlQuery = queryRaw.mock.calls[0]?.[0] as unknown as {
      strings: string[];
      values: unknown[];
    };
    const sql = sqlQuery.strings.join(' ');
    expect(sql).toContain('ROW_NUMBER() OVER');
    expect(sqlQuery.values).toContain('promotion-category');
    expect(sql).toContain('restaurant_menu_items');
  });

  it('counts only active, non-deleted restaurant branches', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const repository = new CustomerAppRepository({
      branch: { count },
    } as unknown as PrismaService);

    await expect(repository.countActiveBranches('restaurant-1')).resolves.toBe(
      1,
    );
    expect(count).toHaveBeenCalledWith({
      where: {
        restaurantId: 'restaurant-1',
        deletedAt: null,
        isActive: true,
      },
    });
  });

  it('hydrates Pizzeria-sized item details with fixed ID-scoped queries', async () => {
    const variation = (index: number) => ({
      id: `variation-${index}`,
      name: `Variation ${index}`,
      description: null,
      price: new Prisma.Decimal(index + 1),
      sortOrder: index,
      isDefault: index === 0,
      isActive: true,
    });
    const group = (index: number) => ({
      id: `group-${index}`,
      name: `Group ${index}`,
      description: null,
      minSelect: 0,
      maxSelect: 12,
      includedSelect: 0,
      isRequired: false,
      sortOrder: index,
      isActive: true,
    });
    const categoryVariationLinks = Array.from({ length: 40 }, (_, index) => ({
      sortOrder: index,
      isDefault: index === 0,
      isActive: true,
      variation: variation(index),
    }));
    const categoryModifierLinks = Array.from({ length: 18 }, (_, index) => ({
      id: `category-group-${index}`,
      sortOrder: index,
      selectionType: 'MULTIPLE' as const,
      minSelect: 0,
      maxSelect: 12,
      modifierGroup: group(index),
    }));
    const groupModifierLinks = Array.from({ length: 216 }, (_, index) => ({
      id: `group-modifier-${index}`,
      modifierGroupId: `group-${Math.floor(index / 12)}`,
      modifierId: `modifier-${index}`,
      sortOrder: index % 12,
    }));
    const findFirst = jest.fn().mockResolvedValue({
      id: 'item-1',
      categoryId: 'category-1',
      category: { id: 'category-1', name: 'Pizza', imageUrl: null },
    });
    const variationPriceOverrides = jest.fn().mockResolvedValue([]);
    const variationLinks = jest.fn().mockResolvedValue(categoryVariationLinks);
    const itemModifierLinks = jest.fn().mockResolvedValue([]);
    const categoryModifierGroups = jest
      .fn()
      .mockResolvedValue(categoryModifierLinks);
    const directModifierOverrides = jest.fn().mockResolvedValue([]);
    const categoryVariations = jest.fn().mockResolvedValue([]);
    const modifierLinks = jest.fn().mockResolvedValue(groupModifierLinks);
    const variationModifierOverrides = jest.fn().mockResolvedValue([
      {
        id: 'variation-modifier-override-1',
        menuItemId: 'item-1',
        variationId: 'variation-0',
        modifierId: 'modifier-0',
        priceDelta: new Prisma.Decimal(2),
      },
    ]);
    const modifiers = jest.fn().mockResolvedValue(
      groupModifierLinks.map((link) => ({
        id: link.modifierId,
        name: link.modifierId,
        priceDelta: new Prisma.Decimal(1),
        sortOrder: link.sortOrder,
        isActive: true,
      })),
    );
    const repository = new CustomerAppRepository({
      menuItem: { findFirst },
      menuItemVariationPriceOverride: { findMany: variationPriceOverrides },
      menuCategoryVariation: { findMany: variationLinks },
      menuItemModifierGroup: { findMany: itemModifierLinks },
      menuCategoryModifierGroup: { findMany: categoryModifierGroups },
      menuItemModifierPriceOverride: { findMany: directModifierOverrides },
      menuItemVariation: { findMany: categoryVariations },
      modifierGroupModifier: { findMany: modifierLinks },
      menuVariationModifierPriceOverride: {
        findMany: variationModifierOverrides,
      },
      modifier: { findMany: modifiers },
    } as unknown as PrismaService);

    const result = await repository.findPublicMenuItemBySlug('pizza-salami', {
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });

    expect(result?.category.variationLinks).toHaveLength(40);
    expect(result?.category.modifierLinks).toHaveLength(18);
    expect(categoryVariations).not.toHaveBeenCalled();
    expect(JSON.stringify(findFirst.mock.calls)).not.toContain('variations');
    expect(variationPriceOverrides).toHaveBeenCalledWith(
      expect.objectContaining({ where: { menuItemId: 'item-1' } }),
    );
    expect(JSON.stringify(modifiers.mock.calls)).toContain(
      '"restaurantId":"restaurant-1"',
    );
    expect(JSON.stringify(modifiers.mock.calls)).not.toContain(
      'itemPriceOverrides',
    );
    expect(JSON.stringify(variationModifierOverrides.mock.calls)).toContain(
      '"OR":[{"menuItemId":"item-1"},{"menuItemId":null}]',
    );
    expect(JSON.stringify(variationModifierOverrides.mock.calls)).toContain(
      '"id":true',
    );
    expect(JSON.stringify(result)).toContain(
      '"id":"variation-modifier-override-1"',
    );
    expect(JSON.stringify(result)).not.toContain('itemPriceOverrides');
    expect(
      [
        findFirst,
        variationPriceOverrides,
        variationLinks,
        itemModifierLinks,
        categoryModifierGroups,
        directModifierOverrides,
        modifierLinks,
        variationModifierOverrides,
        modifiers,
      ].reduce((total, query) => total + query.mock.calls.length, 0),
    ).toBe(9);
  });

  it('uses at most ten scoped queries for legacy categories without variation links', async () => {
    const variations = Array.from({ length: 40 }, (_, index) => ({
      id: `legacy-variation-${index}`,
      name: `Legacy variation ${index}`,
      description: null,
      price: new Prisma.Decimal(index + 1),
      sortOrder: index,
      isDefault: index === 0,
      isActive: true,
    }));
    const findFirst = jest.fn().mockResolvedValue({
      id: 'legacy-item-1',
      categoryId: 'legacy-category-1',
      category: { id: 'legacy-category-1', name: 'Legacy', imageUrl: null },
    });
    const variationPriceOverrides = jest.fn().mockResolvedValue([]);
    const variationLinks = jest.fn().mockResolvedValue([]);
    const itemModifierLinks = jest.fn().mockResolvedValue([]);
    const categoryModifierGroups = jest.fn().mockResolvedValue([
      {
        id: 'category-group-link-1',
        sortOrder: 0,
        selectionType: 'MULTIPLE',
        minSelect: 0,
        maxSelect: 1,
        modifierGroup: {
          id: 'group-1',
          name: 'Extras',
          description: null,
          minSelect: 0,
          maxSelect: 1,
          includedSelect: 0,
          isRequired: false,
          sortOrder: 0,
          isActive: true,
        },
      },
    ]);
    const directModifierOverrides = jest.fn().mockResolvedValue([]);
    const categoryVariations = jest.fn().mockResolvedValue(variations);
    const modifierLinks = jest.fn().mockResolvedValue([
      {
        id: 'group-modifier-link-1',
        modifierGroupId: 'group-1',
        modifierId: 'modifier-1',
        sortOrder: 0,
      },
    ]);
    const variationModifierOverrides = jest.fn().mockResolvedValue([]);
    const modifiers = jest.fn().mockResolvedValue([
      {
        id: 'modifier-1',
        name: 'Extra',
        priceDelta: new Prisma.Decimal(1),
        sortOrder: 0,
        isActive: true,
      },
    ]);
    const repository = new CustomerAppRepository({
      menuItem: { findFirst },
      menuItemVariationPriceOverride: { findMany: variationPriceOverrides },
      menuCategoryVariation: { findMany: variationLinks },
      menuItemModifierGroup: { findMany: itemModifierLinks },
      menuCategoryModifierGroup: { findMany: categoryModifierGroups },
      menuItemModifierPriceOverride: { findMany: directModifierOverrides },
      menuItemVariation: { findMany: categoryVariations },
      modifierGroupModifier: { findMany: modifierLinks },
      menuVariationModifierPriceOverride: {
        findMany: variationModifierOverrides,
      },
      modifier: { findMany: modifiers },
    } as unknown as PrismaService);

    const result = await repository.findPublicMenuItemBySlug('legacy-item', {
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });

    expect(result?.category.variationLinks).toHaveLength(0);
    expect(result?.category.variations).toHaveLength(40);
    expect(categoryVariations).toHaveBeenCalledTimes(1);
    expect(
      [
        findFirst,
        variationPriceOverrides,
        variationLinks,
        itemModifierLinks,
        categoryModifierGroups,
        directModifierOverrides,
        categoryVariations,
        modifierLinks,
        variationModifierOverrides,
        modifiers,
      ].reduce((total, query) => total + query.mock.calls.length, 0),
    ).toBe(10);
  });

  it('keeps newly created categories after older categories with equal sort order', async () => {
    const findMany = jest
      .fn<
        ReturnType<FindManyMenuCategories>,
        Parameters<FindManyMenuCategories>
      >()
      .mockResolvedValue([]);
    const count = jest
      .fn<ReturnType<CountMenuCategories>, Parameters<CountMenuCategories>>()
      .mockResolvedValue(0);
    const repository = new CustomerAppRepository({
      menuCategory: { findMany, count },
    } as unknown as PrismaService);

    await repository.listMenuCategories({
      restaurantId: 'restaurant-1',
      page: 1,
      limit: 20,
      sortBy: 'sortOrder',
      sortOrder: 'ASC',
    });

    expect(findMany.mock.calls[0]?.[0]?.orderBy).toEqual([
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
      { name: 'asc' },
    ]);
  });

  it('orders storefront categories oldest first when requested', async () => {
    const findMany = jest
      .fn<
        ReturnType<FindManyMenuCategories>,
        Parameters<FindManyMenuCategories>
      >()
      .mockResolvedValue([]);
    const repository = new CustomerAppRepository({
      menuCategory: {
        findMany,
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaService);

    await repository.listMenuCategories({
      restaurantId: 'restaurant-1',
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'ASC',
    });

    expect(findMany.mock.calls[0]?.[0]?.orderBy).toEqual([
      { createdAt: 'asc' },
      { name: 'asc' },
    ]);
  });

  it('keeps category membership and public visibility as required filters', async () => {
    const findMany = jest
      .fn<ReturnType<FindManyMenuItems>, Parameters<FindManyMenuItems>>()
      .mockResolvedValue([]);
    const count = jest
      .fn<ReturnType<CountMenuItems>, Parameters<CountMenuItems>>()
      .mockResolvedValue(0);
    const prisma = {
      menuItem: {
        findMany,
        count,
      },
    };
    const repository = new CustomerAppRepository(
      prisma as unknown as PrismaService,
    );

    await repository.listPublicMenuItems({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      categoryId: 'category-1',
      page: 1,
      limit: 12,
      sortBy: 'sortOrder',
      sortOrder: 'ASC',
    });

    const query = findMany.mock.calls[0]?.[0];
    expect(query?.where?.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            { categoryId: 'category-1' },
            {
              categoryLinks: {
                some: { menuCategoryId: 'category-1' },
              },
            },
          ],
        },
      ]),
    );
    expect(count).toHaveBeenCalledWith({
      where: query?.where,
    });
    expect(query?.orderBy).toEqual([
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
      { name: 'asc' },
    ]);
  });

  it('orders storefront items oldest first when requested', async () => {
    const findMany = jest
      .fn<ReturnType<FindManyMenuItems>, Parameters<FindManyMenuItems>>()
      .mockResolvedValue([]);
    const repository = new CustomerAppRepository({
      menuItem: {
        findMany,
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaService);

    await repository.listPublicMenuItems({
      restaurantId: 'restaurant-1',
      page: 1,
      limit: 12,
      sortBy: 'createdAt',
      sortOrder: 'ASC',
    });

    expect(findMany.mock.calls[0]?.[0]?.orderBy).toEqual([
      { createdAt: 'asc' },
      { name: 'asc' },
    ]);
  });

  it('loads lightweight customization signals without modifier relation graphs', async () => {
    const findMany = jest
      .fn<ReturnType<FindManyMenuItems>, Parameters<FindManyMenuItems>>()
      .mockResolvedValue([]);
    const prisma = {
      menuItem: {
        findMany,
        count: jest
          .fn<ReturnType<CountMenuItems>, Parameters<CountMenuItems>>()
          .mockResolvedValue(0),
      },
    };
    const repository = new CustomerAppRepository(
      prisma as unknown as PrismaService,
    );

    await repository.listPublicMenuItems({
      restaurantId: 'restaurant-1',
      page: 1,
      limit: 12,
      sortBy: 'sortOrder',
      sortOrder: 'ASC',
    });

    const include = findMany.mock.calls[0]?.[0]
      ?.include as unknown as CompactMenuItemInclude;

    expect(include.category.select.variations.select).toEqual(
      expect.objectContaining({
        id: true,
        name: true,
        price: true,
        isDefault: true,
      }),
    );
    expect(include.variationPriceOverrides.select.variation.select).toEqual(
      expect.objectContaining({
        id: true,
        name: true,
        price: true,
      }),
    );
    expect(include.category.select._count).toEqual({
      select: { modifierLinks: true },
    });
    expect(include._count).toEqual({
      select: {
        modifierLinks: true,
        modifierPriceOverrides: true,
      },
    });
  });
});
