import { PrismaService } from '../../database';
import { CustomerAppRepository } from './customer-app.repository';

describe('CustomerAppRepository', () => {
  it('keeps category membership and public visibility as required filters', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
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

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
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
        }),
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: findMany.mock.calls[0]?.[0]?.where,
    });
  });

  it('loads variation summaries without modifier relation graphs', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      menuItem: {
        findMany,
        count: jest.fn().mockResolvedValue(0),
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

    const include = findMany.mock.calls[0]?.[0]?.include;

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
