import {
  CouponCampaignKind,
  CouponDiscountType,
  CouponStatus,
  CouponDealSelectionMode,
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

  it('paginates deal discovery in deterministic bounded batches', async () => {
    const firstPage = Array.from({ length: 101 }, (_, index) => ({
      id: `deal-${String(index + 1).padStart(3, '0')}`,
      title: `Deal ${index + 1}`,
      discountValue: new Prisma.Decimal(10),
      dealSelectionMode: CouponDealSelectionMode.FIXED_ITEMS,
    }));
    const secondPage = [
      {
        id: 'deal-101',
        title: 'Deal 101',
        discountValue: new Prisma.Decimal(10),
        dealSelectionMode: CouponDealSelectionMode.FIXED_ITEMS,
      },
    ];
    const findMany = jest
      .fn<Promise<typeof firstPage>, [Prisma.CouponFindManyArgs]>()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);
    const repository = new MenuIntegrationCatalogRepository({
      coupon: { findMany },
    } as never);

    const result = await repository.listDeals({
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });

    expect(result).toHaveLength(101);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        take: 101,
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        take: 101,
        cursor: { id: 'deal-100' },
        skip: 1,
      }),
    );
  });

  it('fails closed when deterministic deal discovery exceeds 500 rows', async () => {
    const findMany = jest.fn<
      Promise<
        Array<{
          id: string;
          title: string;
          discountValue: Prisma.Decimal;
          dealSelectionMode: CouponDealSelectionMode;
        }>
      >,
      [Prisma.CouponFindManyArgs]
    >();
    for (let page = 0; page < 5; page += 1) {
      findMany.mockResolvedValueOnce(
        Array.from({ length: 101 }, (_, index) => ({
          id: `deal-${page}-${index}`,
          title: `Deal ${page}-${index}`,
          discountValue: new Prisma.Decimal(10),
          dealSelectionMode: CouponDealSelectionMode.FIXED_ITEMS,
        })),
      );
    }
    const repository = new MenuIntegrationCatalogRepository({
      coupon: { findMany },
    } as never);

    await expect(
      repository.listDeals({
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      }),
    ).rejects.toThrow('WinOrder deal discovery limit exceeded');
    expect(findMany).toHaveBeenCalledTimes(5);
    for (let call = 1; call <= 5; call += 1) {
      expect(findMany).toHaveBeenNthCalledWith(
        call,
        expect.objectContaining({ take: 101 }),
      );
    }
  });
});
