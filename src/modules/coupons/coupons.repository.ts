import { Injectable } from '@nestjs/common';
import {
  Coupon,
  CouponApplyMode,
  CouponCampaignKind,
  CouponDiscountType,
  CouponStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';
import { ListCouponsDto } from './dto';

@Injectable()
export class CouponsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.CouponCreateInput, tx?: PrismaTx): Promise<Coupon> {
    return this.client(tx).coupon.create({ data });
  }

  async findById(id: string): Promise<Coupon | null> {
    return this.prisma.coupon.findUnique({ where: { id } });
  }

  async findByCode(restaurantId: string, code: string): Promise<Coupon | null> {
    return this.prisma.coupon.findFirst({
      where: {
        restaurantId,
        code,
        deletedAt: null,
      },
    });
  }

  async findByCodeOrId(
    restaurantId: string,
    codeOrId: string,
  ): Promise<Coupon | null> {
    const trimmedCodeOrId = codeOrId.trim();

    return this.prisma.coupon.findFirst({
      where: {
        restaurantId,
        deletedAt: null,
        OR: [{ code: trimmedCodeOrId.toUpperCase() }, { id: trimmedCodeOrId }],
      },
    });
  }

  async findAutoApplyPromotions(restaurantId: string, branchId?: string) {
    const now = new Date();

    return this.prisma.coupon.findMany({
      where: {
        restaurantId,
        kind: CouponCampaignKind.PROMOTION,
        autoApply: true,
        deletedAt: null,
        isActive: true,
        status: CouponStatus.ACTIVE,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
        ],
        OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])],
      },
      include: this.includeConfig,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async findActiveCustomerCoupons(restaurantId: string, branchId?: string) {
    const now = new Date();

    const coupons = await this.prisma.coupon.findMany({
      where: {
        restaurantId,
        kind: CouponCampaignKind.PROMOTION,
        autoApply: false,
        discountType: {
          not: CouponDiscountType.FIXED_PRICE,
        },
        deletedAt: null,
        isActive: true,
        status: CouponStatus.ACTIVE,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
        ],
        OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])],
      },
      include: this.includeConfig,
      orderBy: [{ createdAt: 'desc' }],
    });

    return coupons.filter((coupon) => {
      if (coupon.maxUses === null) {
        return true;
      }

      return coupon.usedCount < coupon.maxUses;
    });
  }

  async findActiveHappyHours(restaurantId: string, branchId?: string) {
    const now = new Date();

    return this.prisma.coupon.findMany({
      where: {
        restaurantId,
        kind: CouponCampaignKind.HAPPY_HOUR,
        autoApply: true,
        deletedAt: null,
        isActive: true,
        status: CouponStatus.ACTIVE,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
        ],
        OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])],
      },
      include: this.includeConfig,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async findActivePromotionById(
    restaurantId: string,
    branchId: string | undefined,
    promotionId: string,
  ) {
    const now = new Date();

    return this.prisma.coupon.findFirst({
      where: {
        id: promotionId,
        restaurantId,
        kind: CouponCampaignKind.PROMOTION,
        deletedAt: null,
        isActive: true,
        status: CouponStatus.ACTIVE,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
        ],
        OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])],
      },
      include: this.includeConfig,
    });
  }

  async findActivePromotionsForMenuItem(
    restaurantId: string,
    branchId: string | undefined,
    menuItemId: string,
  ) {
    const now = new Date();

    return this.prisma.coupon.findMany({
      where: {
        restaurantId,
        kind: CouponCampaignKind.PROMOTION,
        applyMode: CouponApplyMode.SCOPED_ITEMS,
        discountType: CouponDiscountType.FIXED_PRICE,
        deletedAt: null,
        isActive: true,
        status: CouponStatus.ACTIVE,
        AND: [
          {
            OR: [
              { scopeMenuItemId: menuItemId },
              { scopeMenuItems: { some: { menuItemId } } },
            ],
          },
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
        ],
        OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])],
      },
      include: this.includeConfig,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async list(restaurantId: string | undefined, query: ListCouponsDto) {
    const where: Prisma.CouponWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
      kind: CouponCampaignKind.PROMOTION,
      autoApply: false,
      discountType: {
        not: CouponDiscountType.FIXED_PRICE,
      },
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
        include: this.includeConfig,
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return { items, total };
  }

  async update(id: string, data: Prisma.CouponUpdateInput, tx?: PrismaTx) {
    return this.client(tx).coupon.update({
      where: { id },
      data,
      include: this.includeConfig,
    });
  }

  async countCustomerUsage(
    couponId: string,
    customerId: string,
  ): Promise<number> {
    return this.prisma.couponUsage.count({
      where: {
        couponId,
        customerId,
      },
    });
  }

  findTenantRestaurants(tenantId: string) {
    return this.prisma.restaurant.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true },
      take: 2,
    });
  }

  findRestaurantInTenant(tenantId: string, restaurantId: string) {
    return this.prisma.restaurant.findFirst({
      where: { id: restaurantId, tenantId, deletedAt: null },
      select: { id: true },
    });
  }

  findBranchScope(branchId: string, tenantId?: string, restaurantId?: string) {
    return this.prisma.branch.findFirst({
      where: {
        id: branchId,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
        ...(restaurantId ? { restaurantId } : {}),
      },
      select: { id: true, tenantId: true, restaurantId: true },
    });
  }

  findActiveScopeMenuItem(restaurantId: string, menuItemId: string) {
    return this.prisma.menuItem.findFirst({
      where: {
        id: menuItemId,
        restaurantId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
  }

  findActiveScopeCategory(restaurantId: string, categoryId: string) {
    return this.prisma.menuCategory.findFirst({
      where: {
        id: categoryId,
        restaurantId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
  }

  private readonly includeConfig = {
    branch: {
      select: { id: true, name: true, logoUrl: true, coverImage: true },
    },
    restaurant: {
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        coverImage: true,
      },
    },
    scopeMenuItem: {
      select: {
        id: true,
        name: true,
        slug: true,
        imageUrl: true,
        basePrice: true,
      },
    },
    scopeCategory: { select: { id: true, name: true, imageUrl: true } },
    scopeMenuItems: {
      select: {
        menuItem: {
          select: {
            id: true,
            name: true,
            slug: true,
            imageUrl: true,
            basePrice: true,
          },
        },
      },
    },
    scopeCategories: {
      select: {
        itemLimit: true,
        forcedVariationId: true,
        forcedVariation: { select: { id: true, name: true } },
        menuCategory: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            items: {
              where: { deletedAt: null, isActive: true },
              select: { id: true },
            },
          },
        },
      },
    },
  } satisfies Prisma.CouponInclude;

  async incrementUsage(
    couponId: string,
    customerId: string,
    orderId: string,
    tx: PrismaTx,
  ) {
    await tx.couponUsage.create({
      data: {
        couponId,
        customerId,
        orderId,
      },
    });

    await tx.coupon.update({
      where: { id: couponId },
      data: { usedCount: { increment: 1 } },
    });
  }
}
