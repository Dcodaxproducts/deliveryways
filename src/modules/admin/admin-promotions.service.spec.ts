import { BadRequestException } from '@nestjs/common';
import {
  CouponApplyMode,
  CouponCampaignKind,
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
    expect(result.message).toBe('Deal created successfully');
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
