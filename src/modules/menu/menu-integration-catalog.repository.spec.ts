import {
  CouponCampaignKind,
  CouponDiscountType,
  CouponStatus,
  Prisma,
} from '@prisma/client';
import { MenuIntegrationCatalogRepository } from './menu-integration-catalog.repository';

describe('MenuIntegrationCatalogRepository', () => {
  it('bounds deal discovery to the tenant, restaurant, and selected branch', async () => {
    const findMany = jest.fn<Promise<never[]>, [Prisma.CouponFindManyArgs]>();
    findMany.mockResolvedValue([]);
    const prisma = {
      coupon: { findMany },
    };
    const repository = new MenuIntegrationCatalogRepository(prisma as never);

    await repository.listDeals({
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });

    const [query] = findMany.mock.calls[0];
    expect(query.where).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        kind: CouponCampaignKind.PROMOTION,
        discountType: CouponDiscountType.FIXED_PRICE,
        status: CouponStatus.ACTIVE,
        OR: [{ branchId: null }, { branchId: 'branch-1' }],
      }),
    );
  });
});
