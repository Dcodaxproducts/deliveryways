import { BadRequestException } from '@nestjs/common';
import {
  CouponApplyMode,
  CouponAudience,
  CouponCampaignKind,
  CouponDealSelectionMode,
  CouponDiscountType,
  CouponStatus,
  Prisma,
} from '@prisma/client';
import { CouponsService, CouponValidationInput } from './coupons.service';
import { CouponsRepository } from './coupons.repository';

describe('CouponsService', () => {
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
    audience: CouponAudience.BOTH,
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
    dealSelectionMode: null,
    dealRequiredQuantity: null,
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
      update: jest.fn(),
      list: jest.fn(),
      findByCode: jest.fn(),
      findByCodeOrId: jest.fn(),
      findById: jest.fn(),
      countCustomerUsage: jest.fn().mockResolvedValue(0),
      findAutoApplyPromotions: jest.fn(),
      findActiveHappyHours: jest.fn(),
      findActivePromotionById: jest.fn(),
      findTenantRestaurants: jest.fn(),
      findRestaurantInTenant: jest.fn(),
      findBranchScope: jest.fn(),
      findActiveScopeMenuItem: jest.fn(),
      findActiveScopeCategory: jest.fn(),
    };

    service = new CouponsService(repository as unknown as CouponsRepository);
  });

  it('creates coupon for the only tenant restaurant when business admin has no restaurant context', async () => {
    repository.findTenantRestaurants!.mockResolvedValue([{ id: 'rid-1' }]);
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

  it('creates coupon by deriving restaurantId from branchId for business admin without restaurant context', async () => {
    repository.findBranchScope!.mockResolvedValue({
      id: 'bid-1',
      tenantId: 'tid-1',
      restaurantId: 'rid-1',
    });
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
        branchId: 'bid-1',
        discountType: CouponDiscountType.PERCENTAGE,
        discountValue: 20,
        startsAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-12-31T23:59:59.000Z',
      },
    );

    expect(repository.findBranchScope).toHaveBeenCalledWith(
      'bid-1',
      'tid-1',
      undefined,
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant: { connect: { id: 'tid-1' } },
        restaurant: { connect: { id: 'rid-1' } },
        branch: { connect: { id: 'bid-1' } },
        code: 'SAVE20',
      }),
    );
  });

  it('still requires restaurantId when business admin tenant has multiple restaurants and no restaurant context', async () => {
    repository.findTenantRestaurants!.mockResolvedValue([
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

  it('rejects a registered-only coupon for a guest customer', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({ audience: CouponAudience.REGISTERED }),
    );

    await expect(
      service.validateForCheckout({
        ...baseInput,
        customerIsGuest: true,
      }),
    ).rejects.toThrow('Coupon is not available for this customer');
  });

  it('filters guest-only promotions out for registered customers', async () => {
    repository.findAutoApplyPromotions!.mockResolvedValue([
      makeCoupon({ id: 'guest', audience: CouponAudience.GUEST }),
      makeCoupon({ id: 'both', audience: CouponAudience.BOTH }),
    ]);

    const promotions = await service.getActiveAutoApplyPromotions(
      'rid-1',
      'bid-1',
      false,
    );

    expect(promotions.map((promotion) => promotion.id)).toEqual(['both']);
  });

  it('excludes fixed-price deals from coupons list', async () => {
    const mockItem = makeCoupon();
    repository.list!.mockResolvedValue({
      items: [mockItem],
      total: 1,
    });

    const result = await service.list(
      {
        uid: 'admin-1',
        role: 'SUPER_ADMIN',
      } as never,
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        restaurantId: 'rid-1',
      },
    );

    expect(repository.list).toHaveBeenCalledWith('rid-1', expect.any(Object));
    expect(result.data).toEqual([mockItem]);
    expect(result.meta.total).toBe(1);
  });

  it('sets coupon status using body restaurant scope and coupon id fallback', async () => {
    repository.findByCodeOrId!.mockResolvedValue(makeCoupon({ id: 'cpn-1' }));
    repository.update!.mockResolvedValue(
      makeCoupon({
        id: 'cpn-1',
        status: CouponStatus.SUSPENDED,
        isActive: false,
      }),
    );

    const result = await service.setStatus(
      {
        uid: 'admin-1',
        role: 'SUPER_ADMIN',
      } as never,
      'cpn-1',
      {
        restaurantId: 'rid-1',
        status: CouponStatus.SUSPENDED,
      },
    );

    expect(repository.findByCodeOrId).toHaveBeenCalledWith('rid-1', 'cpn-1');
    expect(repository.update).toHaveBeenCalledWith('cpn-1', {
      status: CouponStatus.SUSPENDED,
      isActive: false,
    });
    expect(result.message).toBe('Coupon suspended successfully');
  });

  it('sets coupon status using snake-case restaurant scope', async () => {
    repository.findByCodeOrId!.mockResolvedValue(makeCoupon({ id: 'cpn-1' }));
    repository.update!.mockResolvedValue(
      makeCoupon({
        id: 'cpn-1',
        status: CouponStatus.ACTIVE,
        isActive: true,
      }),
    );

    const result = await service.setStatus(
      {
        uid: 'admin-1',
        role: 'SUPER_ADMIN',
      } as never,
      'cpn-1',
      {
        restaurant_id: 'rid-1',
        status: CouponStatus.ACTIVE,
      },
    );

    expect(repository.findByCodeOrId).toHaveBeenCalledWith('rid-1', 'cpn-1');
    expect(repository.update).toHaveBeenCalledWith('cpn-1', {
      status: CouponStatus.ACTIVE,
      isActive: true,
    });
    expect(result.message).toBe('Coupon activated successfully');
  });

  it('updates coupon status while accepting restaurant scope from coupons list payloads', async () => {
    repository.findById = jest.fn().mockResolvedValue(makeCoupon());
    repository.update!.mockResolvedValue(
      makeCoupon({
        status: CouponStatus.SUSPENDED,
        isActive: false,
      }),
    );

    const result = await service.update(
      {
        uid: 'admin-1',
        role: 'SUPER_ADMIN',
      } as never,
      'cpn-1',
      {
        restaurantId: 'rid-1',
        status: CouponStatus.SUSPENDED,
        isActive: false,
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'cpn-1',
      expect.objectContaining({
        status: CouponStatus.SUSPENDED,
        isActive: false,
      }),
    );
    expect(result.message).toBe('Coupon updated successfully');
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

  it('applies scoped flat category discounts once per eligible item quantity', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({
        applyMode: CouponApplyMode.SCOPED_ITEMS,
        discountType: CouponDiscountType.FLAT,
        discountValue: new Prisma.Decimal(5),
        maxDiscountAmount: null,
        minOrderAmount: null,
        scopeCategories: [{ menuCategory: { id: 'cat-1' } }],
      }),
    );

    const result = await service.validateForCheckout({
      ...baseInput,
      subtotal: 50,
      lineItems: [
        {
          menuItemId: 'mi-1',
          categoryId: 'cat-1',
          categoryIds: ['cat-1'],
          quantity: 2,
          lineTotal: 20,
        },
        {
          menuItemId: 'mi-2',
          categoryId: 'cat-1',
          categoryIds: ['cat-1'],
          quantity: 1,
          lineTotal: 10,
        },
        {
          menuItemId: 'mi-3',
          categoryId: 'cat-2',
          categoryIds: ['cat-2'],
          quantity: 1,
          lineTotal: 20,
        },
      ],
    });

    expect(Number(result.discountAmount)).toBe(15);
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

  it('does not apply scoped fixed promotions to explicit deal lines', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({
        applyMode: CouponApplyMode.SCOPED_ITEMS,
        discountType: CouponDiscountType.FIXED_PRICE,
        discountValue: new Prisma.Decimal(20),
        maxDiscountAmount: null,
        minOrderAmount: null,
        scopeMenuItems: [
          { menuItem: { id: 'mi-1' } },
          { menuItem: { id: 'mi-2' } },
        ],
      }),
    );

    await expect(
      service.validateForCheckout({
        ...baseInput,
        lineItems: [
          {
            menuItemId: 'mi-1',
            categoryId: 'cat-1',
            dealId: 'deal-1',
            lineTotal: 57.14,
          },
          {
            menuItemId: 'mi-2',
            categoryId: 'cat-2',
            dealId: 'deal-1',
            lineTotal: 14.29,
          },
          {
            menuItemId: 'mi-3',
            categoryId: 'cat-2',
            lineTotal: 37,
          },
        ],
      }),
    ).rejects.toThrow('Coupon eligible subtotal must be greater than zero');
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

  it('accepts explicit multi-item fixed deal members', async () => {
    repository.findActivePromotionById!.mockResolvedValue(
      makeCoupon({
        id: 'deal-1',
        autoApply: true,
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

    await expect(
      service.isActiveFixedPriceDealItem('rid-1', 'bid-1', 'deal-1', 'mi-1'),
    ).resolves.toBe(true);
  });

  it('accepts explicit single-item ready-made fixed deals', async () => {
    repository.findActivePromotionById!.mockResolvedValue(
      makeCoupon({
        id: 'deal-1',
        autoApply: true,
        applyMode: CouponApplyMode.SCOPED_ITEMS,
        discountType: CouponDiscountType.FIXED_PRICE,
        discountValue: new Prisma.Decimal(499),
        maxDiscountAmount: null,
        minOrderAmount: null,
        scopeMenuItems: [{ menuItem: { id: 'mi-1' } }],
      }),
    );

    await expect(
      service.isActiveFixedPriceDealItem('rid-1', 'bid-1', 'deal-1', 'mi-1'),
    ).resolves.toBe(true);
  });

  it('accepts explicit ready-made fixed deals even when they are not auto-applied', async () => {
    repository.findActivePromotionById!.mockResolvedValue(
      makeCoupon({
        id: 'deal-1',
        autoApply: false,
        applyMode: CouponApplyMode.SCOPED_ITEMS,
        discountType: CouponDiscountType.FIXED_PRICE,
        discountValue: new Prisma.Decimal(499),
        maxDiscountAmount: null,
        minOrderAmount: null,
        scopeMenuItems: [{ menuItem: { id: 'mi-1' } }],
      }),
    );

    await expect(
      service.isActiveFixedPriceDealItem('rid-1', 'bid-1', 'deal-1', 'mi-1'),
    ).resolves.toBe(true);
  });

  it('uses category rule items when a flexible deal also has the legacy single category scope', async () => {
    repository.findActivePromotionById!.mockResolvedValue(
      makeCoupon({
        id: 'deal-1',
        applyMode: CouponApplyMode.SCOPED_ITEMS,
        discountType: CouponDiscountType.FIXED_PRICE,
        discountValue: new Prisma.Decimal(999),
        maxDiscountAmount: null,
        minOrderAmount: null,
        scopeCategoryId: 'cat-1',
        dealSelectionMode: CouponDealSelectionMode.FLEXIBLE_ITEMS,
        dealRequiredQuantity: 1,
        scopeCategories: [
          {
            itemLimit: 1,
            forcedVariationId: 'var-large',
            menuCategory: {
              id: 'cat-1',
              variations: [{ id: 'var-large' }],
              items: [{ id: 'mi-1' }],
            },
          },
        ],
      }),
    );

    await expect(
      service.getActiveFixedPriceDealItemOptions(
        'rid-1',
        'bid-1',
        'deal-1',
        'mi-1',
      ),
    ).resolves.toEqual({
      dealId: 'deal-1',
      forcedVariationId: 'var-large',
    });
  });

  it('does not treat category deal item as eligible when forced variation is unavailable', async () => {
    repository.findActivePromotionById!.mockResolvedValue(
      makeCoupon({
        id: 'deal-1',
        applyMode: CouponApplyMode.SCOPED_ITEMS,
        discountType: CouponDiscountType.FIXED_PRICE,
        discountValue: new Prisma.Decimal(999),
        maxDiscountAmount: null,
        minOrderAmount: null,
        dealSelectionMode: CouponDealSelectionMode.FLEXIBLE_ITEMS,
        dealRequiredQuantity: 1,
        scopeCategories: [
          {
            itemLimit: 1,
            forcedVariationId: 'var-large',
            menuCategory: {
              id: 'cat-1',
              items: [{ id: 'mi-1', variationPriceOverrides: [] }],
            },
          },
        ],
      }),
    );

    await expect(
      service.getActiveFixedPriceDealItemOptions(
        'rid-1',
        'bid-1',
        'deal-1',
        'mi-1',
      ),
    ).resolves.toBeNull();
    await expect(
      service.isActiveFixedPriceDealItem('rid-1', 'bid-1', 'deal-1', 'mi-1'),
    ).resolves.toBe(false);
  });

  it('prices the highest eligible items for flexible any-N fixed deals', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({
        applyMode: CouponApplyMode.SCOPED_ITEMS,
        discountType: CouponDiscountType.FIXED_PRICE,
        discountValue: new Prisma.Decimal(899),
        maxDiscountAmount: null,
        minOrderAmount: null,
        dealSelectionMode: CouponDealSelectionMode.FLEXIBLE_ITEMS,
        dealRequiredQuantity: 2,
        scopeCategories: [{ menuCategory: { id: 'cat-1' } }],
      }),
    );

    const result = await service.validateForCheckout({
      ...baseInput,
      lineItems: [
        {
          menuItemId: 'mi-1',
          categoryId: 'cat-1',
          categoryIds: ['cat-1'],
          quantity: 1,
          unitPrice: 700,
          lineTotal: 700,
        },
        {
          menuItemId: 'mi-2',
          categoryId: 'cat-1',
          categoryIds: ['cat-1'],
          quantity: 1,
          unitPrice: 500,
          lineTotal: 500,
        },
        {
          menuItemId: 'mi-3',
          categoryId: 'cat-1',
          categoryIds: ['cat-1'],
          quantity: 1,
          unitPrice: 300,
          lineTotal: 300,
        },
      ],
    });

    expect(Number(result.eligibleSubtotal)).toBe(1200);
    expect(Number(result.discountAmount)).toBe(301);
  });

  it('rejects flexible fixed deals without enough eligible items', async () => {
    repository.findByCode!.mockResolvedValue(
      makeCoupon({
        applyMode: CouponApplyMode.SCOPED_ITEMS,
        discountType: CouponDiscountType.FIXED_PRICE,
        discountValue: new Prisma.Decimal(899),
        maxDiscountAmount: null,
        minOrderAmount: null,
        dealSelectionMode: CouponDealSelectionMode.FLEXIBLE_ITEMS,
        dealRequiredQuantity: 3,
        scopeMenuItems: [{ menuItem: { id: 'mi-1' } }],
      }),
    );

    await expect(
      service.validateForCheckout({
        ...baseInput,
        lineItems: [
          {
            menuItemId: 'mi-1',
            categoryId: 'cat-1',
            quantity: 2,
            unitPrice: 500,
            lineTotal: 1000,
          },
        ],
      }),
    ).rejects.toThrow('Flexible deal requires at least 3 eligible item(s)');
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

  it('treats midnight expiry as valid until the end of that date', async () => {
    const originalDate = global.Date;

    class MockDate extends Date {
      constructor(...args: ConstructorParameters<DateConstructor>) {
        if (args.length) {
          super(...args);
          return;
        }

        super('2026-06-10T05:40:07.763Z');
      }

      static now() {
        return new originalDate('2026-06-10T05:40:07.763Z').getTime();
      }
    }

    global.Date = MockDate as DateConstructor;

    try {
      repository.findByCode!.mockResolvedValue(
        makeCoupon({
          startsAt: new Date('2026-06-01T00:00:00.000Z'),
          expiresAt: new Date('2026-06-10T00:00:00.000Z'),
        }),
      );

      const result = await service.validateForCheckout(baseInput);

      expect(result.coupon.code).toBe('SAVE20');
    } finally {
      global.Date = originalDate;
    }
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

  it('includes active happy hours when selecting the best auto discount', async () => {
    repository.findAutoApplyPromotions!.mockResolvedValue([
      makeCoupon({
        id: 'promotion-1',
        code: 'PROMO10',
        autoApply: true,
        discountType: CouponDiscountType.FLAT,
        discountValue: new Prisma.Decimal(10),
        minOrderAmount: new Prisma.Decimal(0),
      }),
    ]);
    repository.findActiveHappyHours!.mockResolvedValue([
      makeCoupon({
        id: 'happy-hour-1',
        code: 'HAPPY25',
        kind: CouponCampaignKind.HAPPY_HOUR,
        autoApply: true,
        discountType: CouponDiscountType.FLAT,
        discountValue: new Prisma.Decimal(25),
        minOrderAmount: new Prisma.Decimal(0),
      }),
    ]);

    const input = {
      restaurantId: baseInput.restaurantId,
      branchId: baseInput.branchId,
      customerId: baseInput.customerId,
      subtotal: baseInput.subtotal,
      menuItemIds: baseInput.menuItemIds,
      categoryIds: baseInput.categoryIds,
    };
    const result = await service.findBestAutoApplyPromotion(input);

    expect(repository.findAutoApplyPromotions).toHaveBeenCalledWith(
      'rid-1',
      'bid-1',
    );
    expect(repository.findActiveHappyHours).toHaveBeenCalledWith(
      'rid-1',
      'bid-1',
    );
    expect(result?.coupon.id).toBe('happy-hour-1');
    expect(Number(result?.discountAmount)).toBe(25);
  });

  it('auto-applies category happy hours below min order to match item previews', async () => {
    repository.findAutoApplyPromotions!.mockResolvedValue([]);
    repository.findActiveHappyHours!.mockResolvedValue([
      makeCoupon({
        id: 'happy-category-1',
        code: 'HAPPYPIZZA10',
        kind: CouponCampaignKind.HAPPY_HOUR,
        autoApply: true,
        applyMode: CouponApplyMode.SCOPED_ITEMS,
        discountType: CouponDiscountType.PERCENTAGE,
        discountValue: new Prisma.Decimal(10),
        minOrderAmount: new Prisma.Decimal(50),
        maxDiscountAmount: null,
        scopeCategoryId: 'cat-pizza',
      }),
    ]);

    const result = await service.findBestAutoApplyPromotion({
      restaurantId: baseInput.restaurantId,
      branchId: baseInput.branchId,
      customerId: baseInput.customerId,
      subtotal: 10,
      menuItemIds: ['cmq857knc005xl6ilp5grymkz'],
      categoryIds: ['cat-pizza'],
      lineItems: [
        {
          menuItemId: 'cmq857knc005xl6ilp5grymkz',
          categoryId: 'cat-pizza',
          categoryIds: ['cat-pizza'],
          quantity: 1,
          unitPrice: 10,
          lineTotal: 10,
        },
      ],
    });

    expect(result?.coupon.id).toBe('happy-category-1');
    expect(Number(result?.discountAmount)).toBe(1);
    expect(Number(result?.eligibleSubtotal)).toBe(10);
  });

  it('ignores zero-discount auto fixed-price promotions', async () => {
    repository.findAutoApplyPromotions!.mockResolvedValue([
      makeCoupon({
        id: 'promotion-1',
        code: 'SINGLE1390',
        title: '222. Single Angebot',
        autoApply: true,
        applyMode: CouponApplyMode.SCOPED_ITEMS,
        discountType: CouponDiscountType.FIXED_PRICE,
        discountValue: new Prisma.Decimal(13.9),
        minOrderAmount: new Prisma.Decimal(0),
        maxDiscountAmount: null,
        scopeMenuItems: [{ menuItem: { id: 'mi-1' } }],
        dealSelectionMode: CouponDealSelectionMode.FLEXIBLE_ITEMS,
        dealRequiredQuantity: 1,
      }),
    ]);
    repository.findActiveHappyHours!.mockResolvedValue([]);

    const result = await service.findBestAutoApplyPromotion({
      restaurantId: baseInput.restaurantId,
      branchId: baseInput.branchId,
      customerId: baseInput.customerId,
      subtotal: 10,
      menuItemIds: ['mi-1'],
      categoryIds: ['cat-1'],
      lineItems: [
        {
          menuItemId: 'mi-1',
          categoryId: 'cat-1',
          categoryIds: ['cat-1'],
          quantity: 1,
          unitPrice: 10,
          lineTotal: 10,
        },
      ],
    });

    expect(result).toBeNull();
  });

  it('returns only currently scheduled active happy hours', async () => {
    const originalDate = global.Date;

    class MockDate extends Date {
      constructor(...args: ConstructorParameters<DateConstructor>) {
        if (args.length) {
          super(...args);
          return;
        }

        super('2026-04-22T15:00:00.000Z');
      }

      static now() {
        return new originalDate('2026-04-22T15:00:00.000Z').getTime();
      }
    }

    global.Date = MockDate as DateConstructor;
    repository.findActiveHappyHours!.mockResolvedValue([
      makeCoupon({
        id: 'happy-active',
        activeDays: [3],
        dailyStartTime: '14:00',
        dailyEndTime: '17:00',
      }),
      makeCoupon({
        id: 'happy-inactive',
        activeDays: [3],
        dailyStartTime: '18:00',
        dailyEndTime: '20:00',
      }),
    ]);

    const result = await service.getActiveHappyHours('rid-1', 'bid-1');

    expect(repository.findActiveHappyHours).toHaveBeenCalledWith(
      'rid-1',
      'bid-1',
    );
    expect(result.map((coupon) => coupon.id)).toEqual(['happy-active']);

    global.Date = originalDate;
  });

  it('stops a happy hour exactly at its configured end time', async () => {
    const originalDate = global.Date;

    class MockDate extends Date {
      constructor(...args: ConstructorParameters<DateConstructor>) {
        if (args.length) {
          super(...args);
          return;
        }

        super('2026-04-22T17:00:00.000Z');
      }

      static now() {
        return new originalDate('2026-04-22T17:00:00.000Z').getTime();
      }
    }

    global.Date = MockDate as DateConstructor;
    repository.findActiveHappyHours!.mockResolvedValue([
      makeCoupon({
        id: 'happy-ended',
        activeDays: [3],
        dailyStartTime: '14:00',
        dailyEndTime: '17:00',
      }),
    ]);

    await expect(
      service.getActiveHappyHours('rid-1', 'bid-1'),
    ).resolves.toEqual([]);

    global.Date = originalDate;
  });

  it('soft deletes a coupon after validating restaurant access', async () => {
    let capturedUpdate: unknown;
    repository.findById!.mockResolvedValue(makeCoupon());
    repository.findRestaurantInTenant!.mockResolvedValue({ id: 'rid-1' });
    repository.update!.mockImplementation((_id: string, input: unknown) => {
      capturedUpdate = input;
      return Promise.resolve({ id: 'cpn-1' });
    });

    const result = await service.remove(
      {
        uid: 'admin-1',
        tid: 'tid-1',
        rid: 'rid-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      'cpn-1',
    );

    expect(repository.update).toHaveBeenCalledWith('cpn-1', capturedUpdate);
    expect(capturedUpdate).not.toBeNull();
    expect(typeof capturedUpdate).toBe('object');
    const updateInput = capturedUpdate as Record<string, unknown>;
    expect(updateInput.isActive).toBe(false);
    expect(updateInput.status).toBe(CouponStatus.SUSPENDED);
    expect(updateInput.deletedAt).toBeInstanceOf(Date);
    expect(result.data).toEqual({ id: 'cpn-1' });
  });
});
