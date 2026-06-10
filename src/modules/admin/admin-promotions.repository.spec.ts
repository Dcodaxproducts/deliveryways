import { CouponCampaignKind, Prisma } from '@prisma/client';
import {
  AdminPromotionScope,
  AdminPromotionsRepository,
} from './admin-promotions.repository';
import { AdminListPromotionsQueryDto } from './dto';

interface RepositoryWithBuildWhere {
  buildWhere(
    scope: AdminPromotionScope,
    query: AdminListPromotionsQueryDto,
    now: Date,
  ): Prisma.CouponWhereInput;
}

describe('AdminPromotionsRepository', () => {
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
});
