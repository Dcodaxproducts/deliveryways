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

type CompactMenuItemInclude = {
  category: {
    select: {
      variations: {
        select: Record<string, boolean>;
      };
    };
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

  it('loads variation summaries without modifier relation graphs', async () => {
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
    expect(include).not.toHaveProperty('modifierLinks');
    expect(include).not.toHaveProperty('modifierPriceOverrides');
  });
});
