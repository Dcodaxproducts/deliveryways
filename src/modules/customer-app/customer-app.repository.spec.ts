import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database';
import { CustomerAppRepository } from './customer-app.repository';

type FindManyMenuItems = (
  args: Prisma.MenuItemFindManyArgs,
) => Promise<unknown[]>;
type CountMenuItems = (args: Prisma.MenuItemCountArgs) => Promise<number>;
type FindFirstMenuItem = (
  args: Prisma.MenuItemFindFirstArgs,
) => Promise<unknown>;
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

type DetailMenuItemInclude = {
  variationPriceOverrides: {
    select: {
      variation: {
        select: {
          modifierPriceOverrides: {
            where: Prisma.MenuVariationModifierPriceOverrideWhereInput;
          };
        };
      };
    };
  };
  modifierPriceOverrides: {
    select: {
      modifier: {
        select: Record<string, unknown>;
      };
    };
  };
};

describe('CustomerAppRepository', () => {
  it('loads cuisine schedule data without a read transaction or item detail graph', async () => {
    const findMany = jest
      .fn<ReturnType<FindManyCuisines>, Parameters<FindManyCuisines>>()
      .mockResolvedValue([]);
    const count = jest
      .fn<ReturnType<CountCuisines>, Parameters<CountCuisines>>()
      .mockResolvedValue(0);
    const transaction = jest.fn();
    const repository = new CustomerAppRepository({
      cuisine: { findMany, count },
      $transaction: transaction,
    } as unknown as PrismaService);

    await repository.listCuisineCategories(
      {
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        page: 1,
        limit: 8,
        sortBy: 'sortOrder',
        sortOrder: 'ASC',
      },
      { includeItems: true },
    );

    expect(transaction).not.toHaveBeenCalled();
    expect(count).toHaveBeenCalledTimes(1);

    const query = findMany.mock.calls[0]?.[0];
    const serializedQuery = JSON.stringify(query);
    expect(serializedQuery).toContain('restaurantMenu');
    expect(serializedQuery).not.toContain('modifierLinks');
    expect(serializedQuery).not.toContain('variations');
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

  it('loads inherited category modifier groups for public item details', async () => {
    const findFirst = jest
      .fn<ReturnType<FindFirstMenuItem>, Parameters<FindFirstMenuItem>>()
      .mockResolvedValue(null);
    const repository = new CustomerAppRepository({
      menuItem: { findFirst },
    } as unknown as PrismaService);

    await repository.findPublicMenuItemBySlug('item-1', {
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });

    const query = findFirst.mock.calls[0]?.[0];
    const categoryInclude = query?.include?.category;
    const categorySelect =
      typeof categoryInclude === 'object' && categoryInclude !== null
        ? categoryInclude.select
        : undefined;

    const modifierLinks = categorySelect?.modifierLinks;

    expect(modifierLinks).toBeDefined();

    if (typeof modifierLinks !== 'object' || modifierLinks === null) {
      throw new Error('Category modifier links must be included');
    }

    const modifierGroup = modifierLinks.include?.modifierGroup;

    if (typeof modifierGroup !== 'object' || modifierGroup === null) {
      throw new Error('Modifier group details must be included');
    }

    const groupModifierLinks = modifierGroup.include?.modifierLinks;

    if (typeof groupModifierLinks !== 'object' || groupModifierLinks === null) {
      throw new Error('Active modifier details must be included');
    }

    expect(groupModifierLinks.where).toEqual({
      modifier: { deletedAt: null, isActive: true },
    });
  });

  it('bounds public item detail pricing relations to the requested item', async () => {
    const findFirst = jest
      .fn<ReturnType<FindFirstMenuItem>, Parameters<FindFirstMenuItem>>()
      .mockResolvedValue(null);
    const repository = new CustomerAppRepository({
      menuItem: { findFirst },
    } as unknown as PrismaService);

    await repository.findPublicMenuItemBySlug('pizza-salami', {
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });

    const include = findFirst.mock.calls[0]?.[0]
      ?.include as unknown as DetailMenuItemInclude;
    const currentMenuItemWhere = {
      restaurantId: 'restaurant-1',
      deletedAt: null,
      isActive: true,
      OR: [
        { id: 'pizza-salami' },
        {
          slug: {
            equals: 'pizza-salami',
            mode: Prisma.QueryMode.insensitive,
          },
        },
      ],
    };
    const scopedVariationModifierWhere = {
      OR: [{ menuItemId: null }, { menuItem: { is: currentMenuItemWhere } }],
    };

    expect(
      include.variationPriceOverrides.select.variation.select
        .modifierPriceOverrides.where,
    ).toEqual(scopedVariationModifierWhere);
    const modifierSelect =
      include.modifierPriceOverrides.select.modifier.select;
    expect(modifierSelect).not.toHaveProperty('itemPriceOverrides');
    expect(modifierSelect).not.toHaveProperty('variationPriceOverrides');

    const serializedInclude = JSON.stringify(include);
    expect(serializedInclude).not.toContain('"itemPriceOverrides":true');
    expect(serializedInclude).not.toContain('"variationPriceOverrides":true');
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
