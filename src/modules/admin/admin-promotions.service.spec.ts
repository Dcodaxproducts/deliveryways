import { BadRequestException } from '@nestjs/common';
import {
  CouponApplyMode,
  CouponCampaignKind,
  CouponDealSelectionMode,
  CouponDiscountType,
  CouponStatus,
  Prisma,
} from '@prisma/client';
import { AdminPromotionsService } from './admin-promotions.service';

describe('AdminPromotionsService', () => {
  const makeCoupon = (overrides: Record<string, unknown> = {}) => ({
    id: 'promo-1',
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: null,
    code: 'HAPPY50',
    title: 'Happy Hour',
    description: null,
    imageUrl: null,
    kind: CouponCampaignKind.HAPPY_HOUR,
    status: CouponStatus.ACTIVE,
    applyMode: CouponApplyMode.SCOPED_ITEMS,
    autoApply: true,
    discountType: CouponDiscountType.PERCENTAGE,
    discountValue: new Prisma.Decimal(50),
    maxDiscountAmount: null,
    minOrderAmount: null,
    maxUses: null,
    maxUsesPerCustomer: null,
    usedCount: 0,
    startsAt: new Date('2026-04-22T00:00:00.000Z'),
    expiresAt: new Date('2026-05-22T00:00:00.000Z'),
    activeDays: [1, 2, 3, 4, 5],
    dailyStartTime: '14:00',
    dailyEndTime: '17:00',
    dealSelectionMode: null,
    dealRequiredQuantity: null,
    scopeMenuItemId: null,
    scopeCategoryId: null,
    isActive: true,
    deletedAt: null,
    branch: null,
    restaurant: { id: 'restaurant-1', name: 'Demo' },
    scopeMenuItem: null,
    scopeCategory: null,
    scopeMenuItems: [],
    scopeCategories: [],
    createdAt: new Date('2026-04-22T00:00:00.000Z'),
    updatedAt: new Date('2026-04-22T00:00:00.000Z'),
    ...overrides,
  });

  it('creates happy hour using token restaurant scope for business admin', async () => {
    const repository = {
      create: jest.fn().mockResolvedValue(makeCoupon()),
    };
    const service = new AdminPromotionsService(repository as never);

    const result = await service.createHappyHour(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      {
        code: 'happy50',
        title: 'Happy Hour',
        discountType: 'PERCENTAGE',
        discountValue: 50,
        startsAt: '2026-04-22T00:00:00.000Z',
        expiresAt: '2026-05-22T00:00:00.000Z',
        activeDays: [1, 2, 3, 4, 5],
        dailyStartTime: '14:00',
        dailyEndTime: '17:00',
      },
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'HAPPY50',
        kind: CouponCampaignKind.HAPPY_HOUR,
        activeDays: [1, 2, 3, 4, 5],
        dailyStartTime: '14:00',
        dailyEndTime: '17:00',
      }),
    );
    expect(result.message).toBe('Happy hour created successfully');
  });

  it('rejects invalid happy hour time format', async () => {
    const service = new AdminPromotionsService({} as never);

    await expect(
      service.createHappyHour(
        {
          uid: 'business-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: 'BUSINESS_ADMIN',
        } as never,
        {
          code: 'happy50',
          title: 'Happy Hour',
          discountType: 'PERCENTAGE',
          discountValue: 50,
          startsAt: '2026-04-22T00:00:00.000Z',
          expiresAt: '2026-05-22T00:00:00.000Z',
          activeDays: [1, 2, 3],
          dailyStartTime: '25:00',
          dailyEndTime: '17:00',
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates fixed price promotion for multiple scoped menu items', async () => {
    const repository = {
      countActiveMenuItems: jest.fn().mockResolvedValue(2),
      countActiveMenuCategories: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(
        makeCoupon({
          kind: CouponCampaignKind.PROMOTION,
          discountType: CouponDiscountType.FIXED_PRICE,
          discountValue: new Prisma.Decimal(999),
          scopeMenuItems: [
            { menuItem: { id: 'item-1', name: 'Pizza' } },
            { menuItem: { id: 'item-2', name: 'Drink' } },
          ],
        }),
      ),
    };
    const service = new AdminPromotionsService(repository as never);

    await service.createPromotion(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      {
        title: 'Combo Deal',
        discountType: 'FIXED_PRICE',
        discountValue: 999,
        startsAt: '2026-04-22T00:00:00.000Z',
        expiresAt: '2026-05-22T00:00:00.000Z',
        scopeMenuItemIds: ['item-1', 'item-2'],
      },
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        applyMode: CouponApplyMode.SCOPED_ITEMS,
        discountType: CouponDiscountType.FIXED_PRICE,
        discountValue: new Prisma.Decimal(999),
        scopeMenuItems: {
          create: [
            { menuItem: { connect: { id: 'item-1' } } },
            { menuItem: { connect: { id: 'item-2' } } },
          ],
        },
      }),
    );
  });

  it('creates a deal as a fixed price scoped item promotion', async () => {
    let createdDealCode = '';
    const repository = {
      countActiveMenuItems: jest.fn().mockResolvedValue(2),
      countActiveMenuCategories: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockImplementation((input: Prisma.CouponCreateInput) => {
          createdDealCode = input.code;

          return Promise.resolve(
            makeCoupon({
              code: input.code,
              imageUrl:
                typeof input.imageUrl === 'string' ? input.imageUrl : null,
              kind: CouponCampaignKind.PROMOTION,
              discountType: CouponDiscountType.FIXED_PRICE,
              discountValue: new Prisma.Decimal(1299),
              scopeMenuItems: [
                { menuItem: { id: 'item-1', name: 'Pizza' } },
                { menuItem: { id: 'item-2', name: 'Drink' } },
              ],
            }),
          );
        }),
    };
    const service = new AdminPromotionsService(repository as never);

    const result = await service.createDeal(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      {
        title: 'Family Deal',
        thumbnailUrl: 'https://cdn.example.com/family-deal.jpg',
        discountValue: 1299,
        startsAt: '2026-04-22T00:00:00.000Z',
        expiresAt: '2026-05-22T00:00:00.000Z',
        scopeMenuItemIds: ['item-1', 'item-2'],
        autoApply: false,
      } as never,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: CouponCampaignKind.PROMOTION,
        applyMode: CouponApplyMode.SCOPED_ITEMS,
        autoApply: true,
        imageUrl: 'https://cdn.example.com/family-deal.jpg',
        discountType: CouponDiscountType.FIXED_PRICE,
        discountValue: new Prisma.Decimal(1299),
        scopeMenuItems: {
          create: [
            { menuItem: { connect: { id: 'item-1' } } },
            { menuItem: { connect: { id: 'item-2' } } },
          ],
        },
      }),
    );
    expect(createdDealCode).toMatch(/^DEAL-/);
    expect(result.data).toEqual(
      expect.objectContaining({
        imageUrl: 'https://cdn.example.com/family-deal.jpg',
        thumbnailUrl: 'https://cdn.example.com/family-deal.jpg',
      }),
    );
    expect(result.message).toBe('Deal created successfully');
  });

  it('keeps deal start and expiry dates empty when omitted', async () => {
    const createInputs: Prisma.CouponCreateInput[] = [];
    const repository = {
      countActiveMenuItems: jest.fn().mockResolvedValue(2),
      countActiveMenuCategories: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockImplementation((input: Prisma.CouponCreateInput) => {
          createInputs.push(input);

          return Promise.resolve(
            makeCoupon({
              kind: CouponCampaignKind.PROMOTION,
              discountType: CouponDiscountType.FIXED_PRICE,
              startsAt: input.startsAt as Date | null,
              expiresAt: input.expiresAt as Date | null,
              scopeMenuItems: [
                { menuItem: { id: 'item-1', name: 'Pizza' } },
                { menuItem: { id: 'item-2', name: 'Drink' } },
              ],
            }),
          );
        }),
    };
    const service = new AdminPromotionsService(repository as never);

    await service.createDeal(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      {
        title: 'Always On Deal',
        discountValue: 1299,
        scopeMenuItemIds: ['item-1', 'item-2'],
      },
    );

    const createInput = createInputs[0];

    if (!createInput) {
      throw new Error('Expected create input');
    }

    expect(createInput.startsAt).toBeNull();
    expect(createInput.expiresAt).toBeNull();
  });

  it('keeps deal start and expiry dates empty when null is sent on edit', async () => {
    const existingDeal = makeCoupon({
      kind: CouponCampaignKind.PROMOTION,
      discountType: CouponDiscountType.FIXED_PRICE,
      discountValue: new Prisma.Decimal(1299),
      dealSelectionMode: CouponDealSelectionMode.FIXED_ITEMS,
      scopeMenuItems: [
        { menuItem: { id: 'item-1', name: 'Pizza' } },
        { menuItem: { id: 'item-2', name: 'Drink' } },
      ],
    });
    const repository = {
      findById: jest.fn().mockResolvedValue(existingDeal),
      countActiveMenuItems: jest.fn().mockResolvedValue(2),
      countActiveMenuCategories: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue(
        makeCoupon({
          ...existingDeal,
          startsAt: null,
          expiresAt: null,
        }),
      ),
    };
    const service = new AdminPromotionsService(repository as never);

    await service.updateDeal(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      'promo-1',
      {
        startsAt: null,
        expiresAt: null,
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'promo-1',
      expect.objectContaining({
        startsAt: null,
        expiresAt: null,
      }),
    );
  });

  it('replaces fixed deal scoped items when an admin edits the deal', async () => {
    const existingDeal = makeCoupon({
      kind: CouponCampaignKind.PROMOTION,
      discountType: CouponDiscountType.FIXED_PRICE,
      discountValue: new Prisma.Decimal(1299),
      dealSelectionMode: CouponDealSelectionMode.FIXED_ITEMS,
      scopeMenuItems: [
        { menuItem: { id: 'item-1', name: 'Pizza' } },
        { menuItem: { id: 'item-2', name: 'Drink' } },
      ],
    });
    const repository = {
      findById: jest.fn().mockResolvedValue(existingDeal),
      countActiveMenuItems: jest.fn().mockResolvedValue(3),
      countActiveMenuCategories: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue(
        makeCoupon({
          ...existingDeal,
          scopeMenuItems: [
            { menuItem: { id: 'item-1', name: 'Pizza' } },
            { menuItem: { id: 'item-2', name: 'Drink' } },
            { menuItem: { id: 'item-3', name: 'Fries' } },
          ],
        }),
      ),
    };
    const service = new AdminPromotionsService(repository as never);

    await service.updateDeal(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      'promo-1',
      {
        scopeMenuItemIds: ['item-1', 'item-2', 'item-3'],
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'promo-1',
      expect.objectContaining({
        scopeMenuItems: {
          deleteMany: {},
          create: [
            { menuItem: { connect: { id: 'item-1' } } },
            { menuItem: { connect: { id: 'item-2' } } },
            { menuItem: { connect: { id: 'item-3' } } },
          ],
        },
      }),
    );
  });

  it('returns signed image urls when creating gift cards', async () => {
    const repository = {
      create: jest.fn().mockResolvedValue(
        makeCoupon({
          code: 'GIFT-1234',
          imageUrl: 'uploads/gift-cards/gift-card.png',
          kind: CouponCampaignKind.GIFT_CARD,
          applyMode: CouponApplyMode.ORDER_TOTAL,
          autoApply: false,
          discountType: CouponDiscountType.FLAT,
          discountValue: new Prisma.Decimal(1000),
        }),
      ),
    };
    const storageService = {
      resolveMediaUrlsDeep: jest.fn().mockImplementation((data) =>
        Promise.resolve({
          ...(data as Record<string, unknown>),
          imageUrl: 'https://signed.example.com/gift-card.png',
          thumbnailUrl: 'https://signed.example.com/gift-card.png',
        }),
      ),
    };
    const service = new AdminPromotionsService(
      repository as never,
      storageService as never,
    );

    const result = await service.createGiftCard(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      {
        title: 'Gift Card',
        imageUrl: 'uploads/gift-cards/gift-card.png',
        amount: 1000,
        startsAt: '2026-04-22T00:00:00.000Z',
        expiresAt: '2026-05-22T00:00:00.000Z',
      },
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: 'uploads/gift-cards/gift-card.png',
        kind: CouponCampaignKind.GIFT_CARD,
        discountValue: new Prisma.Decimal(1000),
      }),
    );
    expect(storageService.resolveMediaUrlsDeep).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: 'uploads/gift-cards/gift-card.png',
        thumbnailUrl: 'uploads/gift-cards/gift-card.png',
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        imageUrl: 'https://signed.example.com/gift-card.png',
        thumbnailUrl: 'https://signed.example.com/gift-card.png',
      }),
    );
  });

  it('creates a flexible any-N deal from scoped categories', async () => {
    const repository = {
      countActiveMenuItems: jest.fn().mockResolvedValue(0),
      countActiveMenuCategories: jest.fn().mockResolvedValue(2),
      findActiveCategoryVariation: jest.fn().mockResolvedValue({ id: 'var-1' }),
      create: jest.fn().mockResolvedValue(
        makeCoupon({
          kind: CouponCampaignKind.PROMOTION,
          discountType: CouponDiscountType.FIXED_PRICE,
          discountValue: new Prisma.Decimal(1499),
          dealSelectionMode: CouponDealSelectionMode.FLEXIBLE_ITEMS,
          dealRequiredQuantity: 2,
          scopeCategories: [
            {
              itemLimit: 1,
              forcedVariationId: 'var-1',
              forcedVariation: { id: 'var-1', name: 'Large' },
              menuCategory: { id: 'cat-1', name: 'Pizza' },
            },
            {
              itemLimit: 1,
              forcedVariationId: null,
              forcedVariation: null,
              menuCategory: { id: 'cat-2', name: 'Burgers' },
            },
          ],
        }),
      ),
    };
    const service = new AdminPromotionsService(repository as never);

    const result = await service.createDeal(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      {
        title: 'Any 2 Deal',
        discountValue: 1499,
        startsAt: '2026-04-22T00:00:00.000Z',
        expiresAt: '2026-05-22T00:00:00.000Z',
        scopeCategories: [
          { menuCategoryId: 'cat-1', itemLimit: 1, variationId: 'var-1' },
          { menuCategoryId: 'cat-2', itemLimit: 1 },
        ],
        dealSelectionMode: CouponDealSelectionMode.FLEXIBLE_ITEMS,
      },
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        dealSelectionMode: CouponDealSelectionMode.FLEXIBLE_ITEMS,
        dealRequiredQuantity: 2,
        scopeCategories: {
          create: [
            {
              menuCategory: { connect: { id: 'cat-1' } },
              itemLimit: 1,
              forcedVariation: { connect: { id: 'var-1' } },
            },
            {
              menuCategory: { connect: { id: 'cat-2' } },
              itemLimit: 1,
            },
          ],
        },
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        dealSelectionMode: CouponDealSelectionMode.FLEXIBLE_ITEMS,
        dealRequiredQuantity: 2,
      }),
    );
  });

  it('rejects flexible deals without required quantity', async () => {
    const repository = {
      countActiveMenuItems: jest.fn().mockResolvedValue(2),
      countActiveMenuCategories: jest.fn().mockResolvedValue(0),
    };
    const service = new AdminPromotionsService(repository as never);

    await expect(
      service.createDeal(
        {
          uid: 'business-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: 'BUSINESS_ADMIN',
        } as never,
        {
          title: 'Any 2 Deal',
          discountValue: 999,
          startsAt: '2026-04-22T00:00:00.000Z',
          expiresAt: '2026-05-22T00:00:00.000Z',
          scopeMenuItemIds: ['item-1', 'item-2'],
          dealSelectionMode: CouponDealSelectionMode.FLEXIBLE_ITEMS,
        },
      ),
    ).rejects.toThrow('Flexible deals require dealRequiredQuantity');
  });

  it('rejects fixed price promotion with fewer than two scoped menu items', async () => {
    const repository = {
      countActiveMenuItems: jest.fn().mockResolvedValue(1),
      countActiveMenuCategories: jest.fn().mockResolvedValue(0),
    };
    const service = new AdminPromotionsService(repository as never);

    await expect(
      service.createPromotion(
        {
          uid: 'business-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: 'BUSINESS_ADMIN',
        } as never,
        {
          title: 'Combo Deal',
          discountType: 'FIXED_PRICE',
          discountValue: 999,
          startsAt: '2026-04-22T00:00:00.000Z',
          expiresAt: '2026-05-22T00:00:00.000Z',
          scopeMenuItemIds: ['item-1'],
        },
      ),
    ).rejects.toThrow('Fixed price promotions require at least two menu items');
  });

  it('lists only fixed price promotions as deals', async () => {
    const repository = {
      list: jest.fn().mockResolvedValue({
        items: [
          makeCoupon({
            kind: CouponCampaignKind.PROMOTION,
            discountType: CouponDiscountType.FIXED_PRICE,
          }),
        ],
        total: 1,
      }),
    };
    const service = new AdminPromotionsService(repository as never);

    const result = await service.listDeals(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'DESC' },
    );

    expect(repository.list).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', restaurantId: 'restaurant-1' },
      expect.objectContaining({
        kind: CouponCampaignKind.PROMOTION,
        discountType: CouponDiscountType.FIXED_PRICE,
      }),
    );
    expect(result.message).toBe('Deals fetched successfully');
  });

  it('passes campaign-only filters for promotion lists', async () => {
    const repository = {
      list: jest.fn().mockResolvedValue({
        items: [
          makeCoupon({
            kind: CouponCampaignKind.PROMOTION,
            autoApply: true,
            discountType: CouponDiscountType.PERCENTAGE,
          }),
        ],
        total: 1,
      }),
    };
    const service = new AdminPromotionsService(repository as never);

    await service.list(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'DESC' },
      CouponCampaignKind.PROMOTION,
      {
        autoApply: true,
        excludeDiscountType: CouponDiscountType.FIXED_PRICE,
      },
    );

    expect(repository.list).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', restaurantId: 'restaurant-1' },
      expect.objectContaining({
        kind: CouponCampaignKind.PROMOTION,
        autoApply: true,
        excludeDiscountType: CouponDiscountType.FIXED_PRICE,
      }),
    );
  });

  it('lists branch admin promotions locked to token branch', async () => {
    const repository = {
      list: jest.fn().mockResolvedValue({ items: [makeCoupon()], total: 1 }),
    };
    const service = new AdminPromotionsService(repository as never);

    const result = await service.list(
      {
        uid: 'branch-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: 'BRANCH_ADMIN',
      } as never,
      { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'DESC' },
      CouponCampaignKind.HAPPY_HOUR,
    );

    expect(repository.list).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      expect.objectContaining({ kind: CouponCampaignKind.HAPPY_HOUR }),
    );
    expect(result.data).toHaveLength(1);
  });
});
