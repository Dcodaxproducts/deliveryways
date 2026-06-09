import { CouponDiscountType } from '@prisma/client';
import { CouponsRepository } from './coupons.repository';

describe('CouponsRepository', () => {
  it('excludes fixed-price deals from coupon list queries', async () => {
    const findMany = jest.fn<
      Promise<unknown[]>,
      [{ where?: { discountType?: unknown } }]
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

    expect(findManyArgs?.where?.discountType).toEqual({
      not: CouponDiscountType.FIXED_PRICE,
    });
  });
});
