import { BadRequestException } from '@nestjs/common';
import { CouponDiscountType, CouponStatus, Prisma } from '@prisma/client';
import { CouponsService, CouponValidationInput } from './coupons.service';
import { CouponsRepository } from './coupons.repository';

describe('CouponsService - validateForCheckout', () => {
  let service: CouponsService;
  let repository: Partial<Record<keyof CouponsRepository, jest.Mock>>;

  const makeCoupon = (overrides: Record<string, unknown> = {}) => ({
    id: 'cpn-1',
    tenantId: 'tid-1',
    restaurantId: 'rid-1',
    branchId: null,
    code: 'SAVE20',
    title: '20% Off',
    description: null,
    status: CouponStatus.ACTIVE,
    discountType: CouponDiscountType.PERCENTAGE,
    discountValue: new Prisma.Decimal(20),
    maxDiscountAmount: new Prisma.Decimal(100),
    minOrderAmount: new Prisma.Decimal(500),
    maxUses: 100,
    maxUsesPerCustomer: 3,
    usedCount: 0,
    startsAt: new Date('2026-01-01'),
    expiresAt: new Date('2026-12-31'),
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
      findByCode: jest.fn(),
      countCustomerUsage: jest.fn().mockResolvedValue(0),
    };

    service = new CouponsService(
      repository as unknown as CouponsRepository,
      {} as never,
    );
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
});
