import { CouponCampaignKind, CouponDiscountType } from '@prisma/client';
import { CouponsRepository } from './coupons.repository';

describe('CouponsRepository', () => {
  it('excludes fixed-price deals from automatic promotion queries', async () => {
    const findMany = jest.fn<
      Promise<unknown[]>,
      [
        {
          where?: {
            autoApply?: unknown;
            discountType?: unknown;
            kind?: unknown;
          };
        },
      ]
    >();
    const repository = new CouponsRepository({
      coupon: { findMany },
    } as never);

    findMany.mockResolvedValue([]);

    await repository.findAutoApplyPromotions('restaurant-1', 'branch-1');

    const findManyArgs = findMany.mock.calls[0]?.[0];

    expect(findManyArgs?.where?.kind).toBe(CouponCampaignKind.PROMOTION);
    expect(findManyArgs?.where?.autoApply).toBe(true);
    expect(findManyArgs?.where?.discountType).toEqual({
      not: CouponDiscountType.FIXED_PRICE,
    });
  });

  it('lists active fixed-price deals independently from auto promotions', async () => {
    const findMany = jest.fn<
      Promise<unknown[]>,
      [
        {
          where?: {
            autoApply?: unknown;
            discountType?: unknown;
            kind?: unknown;
          };
        },
      ]
    >();
    findMany.mockResolvedValue([]);
    const repository = new CouponsRepository({
      coupon: { findMany },
    } as never);

    await repository.findActiveDeals('restaurant-1', 'branch-1');

    const findManyArgs = findMany.mock.calls[0]?.[0];

    expect(findManyArgs?.where?.kind).toBe(CouponCampaignKind.PROMOTION);
    expect(findManyArgs?.where?.discountType).toBe(
      CouponDiscountType.FIXED_PRICE,
    );
    expect(findManyArgs?.where).not.toHaveProperty('autoApply');
  });

  it('excludes fixed-price deals from coupon list queries', async () => {
    const findMany = jest.fn<
      Promise<unknown[]>,
      [
        {
          where?: {
            autoApply?: unknown;
            discountType?: unknown;
            kind?: unknown;
          };
        },
      ]
    >();
    const count = jest.fn();
    const transaction = jest.fn(async (ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );

    const repository = new CouponsRepository({
      coupon: {
        findMany,
        count,
      },
      $transaction: transaction,
    } as never);

    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await repository.list('restaurant-1', {
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      restaurantId: 'restaurant-1',
    } as never);

    const findManyArgs = findMany.mock.calls[0]?.[0];

    expect(findManyArgs?.where?.kind).toBe(CouponCampaignKind.PROMOTION);
    expect(findManyArgs?.where?.autoApply).toBe(false);
    expect(findManyArgs?.where?.discountType).toEqual({
      not: CouponDiscountType.FIXED_PRICE,
    });
  });
});
