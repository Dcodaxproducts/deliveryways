import { BadRequestException } from '@nestjs/common';
import { CouponCampaignKind, CouponDiscountType, CouponStatus, Prisma } from '@prisma/client';
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
    createdAt: new Date('2026-04-22T00:00:00.000Z'),
    updatedAt: new Date('2026-04-22T00:00:00.000Z'),
    ...overrides,
  });

  it('creates happy hour using token restaurant scope for business admin', async () => {
    const repository = {
      create: jest.fn().mockResolvedValue(makeCoupon()),
    };
    const prisma = {
      menuItem: { findFirst: jest.fn().mockResolvedValue(null) },
      menuCategory: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new AdminPromotionsService(repository as never, prisma as never);

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
    const service = new AdminPromotionsService({} as never, {} as never);

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

  it('lists branch admin promotions locked to token branch', async () => {
    const repository = {
      list: jest.fn().mockResolvedValue({ items: [makeCoupon()], total: 1 }),
    };
    const service = new AdminPromotionsService(repository as never, {} as never);

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
