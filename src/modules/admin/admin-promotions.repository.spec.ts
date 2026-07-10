import { CouponCampaignKind, CouponDiscountType, Prisma } from '@prisma/client';
import {
  AdminPromotionListQuery,
  AdminPromotionScope,
  AdminPromotionsRepository,
} from './admin-promotions.repository';

interface RepositoryWithBuildWhere {
  buildWhere(
    scope: AdminPromotionScope,
    query: AdminPromotionListQuery,
    now: Date,
  ): Prisma.CouponWhereInput;
}

describe('AdminPromotionsRepository', () => {
  it('validates category variations through category links and item price overrides', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'variation-1' });
    const repository = new AdminPromotionsRepository({
      menuItemVariation: { findFirst },
    } as never);

    await repository.findActiveCategoryVariation(
      'restaurant-1',
      'category-1',
      'variation-1',
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'variation-1',
        restaurantId: 'restaurant-1',
        deletedAt: null,
        isActive: true,
        OR: [
          { categoryId: 'category-1' },
          { category: { parentCategoryId: 'category-1' } },
          {
            categoryLinks: {
              some: { categoryId: 'category-1', isActive: true },
            },
          },
          {
            categoryLinks: {
              some: {
                isActive: true,
                category: { parentCategoryId: 'category-1' },
              },
            },
          },
          {
            itemPriceOverrides: {
              some: {
                menuItem: {
                  deletedAt: null,
                  isActive: true,
                  OR: [
                    { categoryId: 'category-1' },
                    { category: { parentCategoryId: 'category-1' } },
                    {
                      categoryLinks: {
                        some: { menuCategoryId: 'category-1' },
                      },
                    },
                    {
                      categoryLinks: {
                        some: {
                          menuCategory: { parentCategoryId: 'category-1' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
  });

  it('includes restaurant-wide gift cards when filtering by branch', () => {
    const repository = new AdminPromotionsRepository(
      {} as never,
    ) as unknown as RepositoryWithBuildWhere;

    const where = repository.buildWhere(
      { tenantId: 'tenant-1', restaurantId: 'restaurant-1' },
      {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        kind: CouponCampaignKind.GIFT_CARD,
      },
      new Date('2026-06-10T00:00:00.000Z'),
    );

    expect(where.restaurantId).toBe('restaurant-1');
    expect(where.kind).toBe(CouponCampaignKind.GIFT_CARD);
    expect(where.AND).toEqual([
      {
        OR: [{ branchId: 'branch-1' }, { branchId: null }],
      },
    ]);
  });

  it('can filter promotion campaigns away from fixed-price deals', () => {
    const repository = new AdminPromotionsRepository(
      {} as never,
    ) as unknown as RepositoryWithBuildWhere;

    const where = repository.buildWhere(
      { tenantId: 'tenant-1', restaurantId: 'restaurant-1' },
      {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        kind: CouponCampaignKind.PROMOTION,
        autoApply: true,
        excludeDiscountType: CouponDiscountType.FIXED_PRICE,
      },
      new Date('2026-06-10T00:00:00.000Z'),
    );

    expect(where.kind).toBe(CouponCampaignKind.PROMOTION);
    expect(where.autoApply).toBe(true);
    expect(where.discountType).toEqual({
      not: CouponDiscountType.FIXED_PRICE,
    });
  });
});
