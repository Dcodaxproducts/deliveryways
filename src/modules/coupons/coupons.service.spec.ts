import { BadRequestException } from '@nestjs/common';
import {
  CouponApplyMode,
  CouponDiscountType,
  CouponStatus,
  Prisma,
} from '@prisma/client';
import { CouponsService, CouponValidationInput } from './coupons.service';
import { CouponsRepository } from './coupons.repository';

describe('CouponsService', () => {
  let service: CouponsService;
  let repository: Partial<Record<keyof CouponsRepository, jest.Mock>>;
  let prisma: {
    restaurant: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
  };

  const makeCoupon = (overrides: Record<string, unknown> = {}) => ({
    id: 'cpn-1',
    tenantId: 'tid-1',
    restaurantId: 'rid-1',
    branchId: null,
    code: 'SAVE20',
    title: '20% Off',
    description: null,
    status: CouponStatus.ACTIVE,
    applyMode: CouponApplyMode.SCOPED_ITEMS,
    autoApply: false,
    discountType: CouponDiscountType.PERCENTAGE,
    discountValue: new Prisma.Decimal(20),
    maxDiscountAmount: new Prisma.Decimal(100),
    minOrderAmount: new Prisma.Decimal(500),
    maxUses: 100,
    maxUsesPerCustomer: 3,
    usedCount: 0,
    startsAt: new Date('2026-01-01'),
    expiresAt: new Date('2026-12-31'),
    activeDays: null,
    dailyStartTime: null,
    dailyEndTime: null,
    scopeMenuItemId: null,
    scopeCategoryId: null,
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const baseInput: CouponValidationInput = {
    restaurantId: 'rid-1',
    branchId: 'bid-1',
    customerId: 'cust-1',
    code: 'SAVE20',
    subtotal: 1000,
    menuItemIds: ['mi-1', 'mi-2'],
    categoryIds: ['cat-1', 'cat-2'],
  };

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findByCode: jest.fn(),
      countCustomerUsage: jest.fn().mockResolvedValue(0),
    };
    prisma = {
      restaurant: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    service = new CouponsService(
      repository as unknown as CouponsRepository,
      prisma as never,
    );
  });

  it('creates coupon for the only tenant restaurant when business admin has no restaurant context', async () => {
    prisma.restaurant.findMany.mockResolvedValue([{ id: 'rid-1' }]);
    repository.create!.mockResolvedValue({ id: 'coupon-1' });

    await service.create(
      {
        uid: 'admin-1',
        tid: 'tid-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      {
        code: 'SAVE20',
        title: 'Save 20',
        discountType: CouponDiscountType.PERCENTAGE,
        discountValue: 20,
        startsAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-12-31T23:59:59.000Z',
      },
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant: { connect: { id: 'tid-1' } },
        restaurant: { connect: { id: 'rid-1' } },
        code: 'SAVE20',
      }),
    );
  });

  it('still requires restaurantId when business admin tenant has multiple restaurants and no restaurant context', async () => {
    prisma.restaurant.findMany.mockResolvedValue([
      { id: 'rid-1' },
      { id: 'rid-2' },
    ]);

    await expect(
      service.create(
        {
          uid: 'admin-1',
          tid: 'tid-1',
          role: 'BUSINESS_ADMIN',
        } as never,
        {
          code: 'SAVE20',
          title: 'Save 20',
          discountType: CouponDiscountType.PERCENTAGE,
          discountValue: 20,
          startsAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-12-31T23:59:59.000Z',
        },
      ),
    ).rejects.toThrow('restaurantId is required');
  });

  it('returns correct percentage discount capped by maxDiscountAmount', async () => {
    repository.findByCode!.mockResolvedValue(makeCoupon());

    const result = await service.validateForCheckout(baseInput);

    expect(Number(result.discountAmount)).toBe(100);
  });

  it('returns uncapped percentage discount when maxDiscountAmount absent', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({ maxDiscountAmount: null }),
    );

    const result = await service.validateForCheckout(baseInput);

    expect(Number(result.discountAmount)).toBe(200);
  });

  it('returns flat discount amount', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({
        discountType: CouponDiscountType.FLAT,
        discountValue: new Prisma.Decimal(150),
        maxDiscountAmount: null,
      }),
    );

    const result = await service.validateForCheckout(baseInput);

    expect(Number(result.discountAmount)).toBe(150);
  });

  it('caps flat discount at subtotal', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({
        discountType: CouponDiscountType.FLAT,
        discountValue: new Prisma.Decimal(2000),
        maxDiscountAmount: null,
        minOrderAmount: null,
      }),
    );

    const result = await service.validateForCheckout({
      ...baseInput,
      subtotal: 500,
    });

    expect(Number(result.discountAmount)).toBe(500);
  });

  it('prices all scoped menu items at a fixed promotion price', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({
        applyMode: CouponApplyMode.SCOPED_ITEMS,
        discountType: CouponDiscountType.FIXED_PRICE,
        discountValue: new Prisma.Decimal(799),
        maxDiscountAmount: null,
        minOrderAmount: null,
        scopeMenuItems: [
          { menuItem: { id: 'mi-1' } },
          { menuItem: { id: 'mi-2' } },
        ],
      }),
    );

    const result = await service.validateForCheckout({
      ...baseInput,
      lineItems: [
        {
          menuItemId: 'mi-1',
          categoryId: 'cat-1',
          lineTotal: 600,
        },
        {
          menuItemId: 'mi-2',
          categoryId: 'cat-2',
          lineTotal: 500,
        },
      ],
    });

    expect(Number(result.eligibleSubtotal)).toBe(1100);
    expect(Number(result.discountAmount)).toBe(301);
  });

  it('requires every scoped menu item for fixed price promotions', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({
        applyMode: CouponApplyMode.SCOPED_ITEMS,
        discountType: CouponDiscountType.FIXED_PRICE,
        discountValue: new Prisma.Decimal(799),
        maxDiscountAmount: null,
        minOrderAmount: null,
        scopeMenuItems: [
          { menuItem: { id: 'mi-1' } },
          { menuItem: { id: 'mi-999' } },
        ],
      }),
    );

    await expect(service.validateForCheckout(baseInput)).rejects.toThrow(
      'Fixed price promotion requires all scoped menu items',
    );
  });

  it('throws when coupon not found', async () => {
    repository.findByCode!.mockResolvedValue(null);

    await expect(service.validateForCheckout(baseInput)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws when coupon is inactive', async () => {
    repository.findByCode!.mockResolvedValue(makeCoupon({ isActive: false }));

    await expect(service.validateForCheckout(baseInput)).rejects.toThrow(
      'Coupon is not active',
    );
  });

  it('throws when coupon is suspended', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({ status: CouponStatus.SUSPENDED }),
    );

    await expect(service.validateForCheckout(baseInput)).rejects.toThrow(
      'Coupon is not active',
    );
  });

  it('throws when coupon validity window expired', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({
        startsAt: new Date('2024-01-01'),
        expiresAt: new Date('2024-12-31'),
      }),
    );

    await expect(service.validateForCheckout(baseInput)).rejects.toThrow(
      'Coupon is not valid at this time',
    );
  });

  it('throws when branch scope mismatch', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({ branchId: 'other-branch' }),
    );

    await expect(service.validateForCheckout(baseInput)).rejects.toThrow(
      'Coupon is not valid for this branch',
    );
  });

  it('throws when global usage limit reached', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({ maxUses: 10, usedCount: 10 }),
    );

    await expect(service.validateForCheckout(baseInput)).rejects.toThrow(
      'Coupon usage limit reached',
    );
  });

  it('throws when per-customer usage limit reached', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({ maxUsesPerCustomer: 2 }),
    );
    repository.countCustomerUsage!.mockResolvedValue(2);

    await expect(service.validateForCheckout(baseInput)).rejects.toThrow(
      'Coupon per-customer limit reached',
    );
  });

  it('throws when subtotal below minOrderAmount', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({ minOrderAmount: new Prisma.Decimal(2000) }),
    );

    await expect(service.validateForCheckout(baseInput)).rejects.toThrow(
      'Order subtotal does not meet coupon minimum amount',
    );
  });

  it('throws when menu item scope mismatch', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({ scopeMenuItemId: 'mi-999' }),
    );

    await expect(service.validateForCheckout(baseInput)).rejects.toThrow(
      'Coupon is not applicable to selected items',
    );
  });

  it('throws when category scope mismatch', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({ scopeCategoryId: 'cat-999' }),
    );

    await expect(service.validateForCheckout(baseInput)).rejects.toThrow(
      'Coupon is not applicable to selected categories',
    );
  });

  it('throws when happy hour daily window is not active', async () => {
    const originalDate = global.Date;

    class MockDate extends Date {
      constructor(...args: ConstructorParameters<DateConstructor>) {
        if (args.length) {
          super(...args);
          return;
        }

        super('2026-04-22T10:00:00.000Z');
      }

      static now() {
        return new originalDate('2026-04-22T10:00:00.000Z').getTime();
      }
    }

    global.Date = MockDate as DateConstructor;

    repository.findByCode!.mockResolvedValue(
      makeCoupon({
        activeDays: [2],
        dailyStartTime: '14:00',
        dailyEndTime: '17:00',
      }),
    );

    await expect(service.validateForCheckout(baseInput)).rejects.toThrow(
      'Coupon is not valid at this time',
    );

    global.Date = originalDate;
  });
});
