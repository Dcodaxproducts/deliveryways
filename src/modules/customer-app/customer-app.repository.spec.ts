import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database';
import { CustomerAppRepository } from './customer-app.repository';

type FindManyMenuItems = (
  args: Prisma.MenuItemFindManyArgs,
) => Promise<unknown[]>;
type CountMenuItems = (args: Prisma.MenuItemCountArgs) => Promise<number>;

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
