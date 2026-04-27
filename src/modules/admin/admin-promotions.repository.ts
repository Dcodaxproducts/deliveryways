import { Injectable } from '@nestjs/common';
import { CouponCampaignKind, CouponStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database';
import { AdminListPromotionsQueryDto } from './dto';

export interface AdminPromotionScope {
  tenantId?: string;
  restaurantId?: string;
  branchId?: string;
}

@Injectable()
export class AdminPromotionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findRestaurantScope(restaurantId: string, tenantId?: string) {
    return this.prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true, tenantId: true },
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

  create(data: Prisma.CouponCreateInput) {
    return this.prisma.coupon.create({
      data,
      include: this.includeConfig,
    });
  }

  update(id: string, data: Prisma.CouponUpdateInput) {
    return this.prisma.coupon.update({
      where: { id },
      data,
      include: this.includeConfig,
    });
  }

  findById(id: string) {
    return this.prisma.coupon.findFirst({
      where: { id, deletedAt: null },
      include: this.includeConfig,
    });
  }

  async list(scope: AdminPromotionScope, query: AdminListPromotionsQueryDto) {
    const now = new Date();
    const where = this.buildWhere(scope, query, now);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
        include: this.includeConfig,
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return { items, total };
  }

  async getOverview(scope: AdminPromotionScope) {
    const now = new Date();
    const baseWhere: Prisma.CouponWhereInput = {
      deletedAt: null,
      ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
    };
    const activeWhere: Prisma.CouponWhereInput = {
      status: CouponStatus.ACTIVE,
      isActive: true,
      startsAt: { lte: now },
      expiresAt: { gte: now },
    };
    const scheduledWhere: Prisma.CouponWhereInput = {
      isActive: true,
      startsAt: { gt: now },
    };
    const expiredWhere: Prisma.CouponWhereInput = {
      expiresAt: { lt: now },
    };
    const promotionWhere: Prisma.CouponWhereInput = {
      ...baseWhere,
      kind: CouponCampaignKind.PROMOTION,
    };
    const couponOrderWhere: Prisma.OrderWhereInput = {
      ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      couponId: { not: null },
      coupon: { deletedAt: null },
    };

    const [
      activePromotions,
      scheduledPromotions,
      expiredPromotions,
      totalCoupons,
      activeCoupons,
      scheduledCoupons,
      expiredCoupons,
      couponRedemptions,
      couponOrderTotals,
      activeHappyHours,
    ] = await this.prisma.$transaction([
      this.prisma.coupon.count({
        where: { ...promotionWhere, ...activeWhere },
      }),
      this.prisma.coupon.count({
        where: { ...promotionWhere, ...scheduledWhere },
      }),
      this.prisma.coupon.count({
        where: { ...promotionWhere, ...expiredWhere },
      }),
      this.prisma.coupon.count({ where: baseWhere }),
      this.prisma.coupon.count({ where: { ...baseWhere, ...activeWhere } }),
      this.prisma.coupon.count({ where: { ...baseWhere, ...scheduledWhere } }),
      this.prisma.coupon.count({ where: { ...baseWhere, ...expiredWhere } }),
      this.prisma.couponUsage.count({
        where: {
          coupon: baseWhere,
        },
      }),
      this.prisma.order.aggregate({
        where: couponOrderWhere,
        _count: { _all: true },
        _sum: {
          totalAmount: true,
          discountAmount: true,
        },
      }),
      this.prisma.coupon.count({
        where: {
          ...baseWhere,
          ...activeWhere,
          kind: CouponCampaignKind.HAPPY_HOUR,
        },
      }),
    ]);

    return {
      activePromotions,
      scheduledPromotions,
      expiredPromotions,
      promoDrivenOrders: couponOrderTotals._count._all,
      promoDrivenRevenue: Number(couponOrderTotals._sum.totalAmount ?? 0),
      activeHappyHours,
      totalCoupons,
      activeCoupons,
      scheduledCoupons,
      expiredCoupons,
      couponRedemptions,
      couponDrivenOrders: couponOrderTotals._count._all,
      couponDrivenRevenue: Number(couponOrderTotals._sum.totalAmount ?? 0),
      couponDiscountGiven: Number(couponOrderTotals._sum.discountAmount ?? 0),
    };
  }

  async getPromotionStats(scope: AdminPromotionScope, id: string) {
    const coupon = await this.prisma.coupon.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
        ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
        ...(scope.branchId ? { branchId: scope.branchId } : {}),
      },
      include: {
        ...this.includeConfig,
        usages: {
          select: {
            customerId: true,
            createdAt: true,
            order: {
              select: {
                totalAmount: true,
                discountAmount: true,
              },
            },
          },
        },
      },
    });

    if (!coupon) {
      return null;
    }

    const uniqueCustomers = new Set(
      coupon.usages.map((usage) => usage.customerId),
    );
    const orders = coupon.usages.filter((usage) => usage.order);

    return {
      coupon,
      usageCount: coupon.usages.length,
      uniqueCustomers: uniqueCustomers.size,
      orderCount: orders.length,
      totalRevenue: orders.reduce(
        (sum, usage) => sum + Number(usage.order?.totalAmount ?? 0),
        0,
      ),
      totalDiscount: orders.reduce(
        (sum, usage) => sum + Number(usage.order?.discountAmount ?? 0),
        0,
      ),
      lastUsedAt: coupon.usages[0]?.createdAt ?? null,
    };
  }

  private buildWhere(
    scope: AdminPromotionScope,
    query: AdminListPromotionsQueryDto,
    now: Date,
  ) {
    return {
      deletedAt: null,
      ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.lifecycle === 'active'
        ? {
            status: CouponStatus.ACTIVE,
            isActive: true,
            startsAt: { lte: now },
            expiresAt: { gte: now },
          }
        : {}),
      ...(query.lifecycle === 'scheduled'
        ? {
            isActive: true,
            startsAt: { gt: now },
          }
        : {}),
      ...(query.lifecycle === 'expired'
        ? {
            expiresAt: { lt: now },
          }
        : {}),
      ...(query.lifecycle === 'inactive'
        ? {
            OR: [{ isActive: false }, { status: CouponStatus.SUSPENDED }],
          }
        : {}),
    } satisfies Prisma.CouponWhereInput;
  }

  private readonly includeConfig = {
    branch: {
      select: { id: true, name: true },
    },
    restaurant: {
      select: { id: true, name: true },
    },
    scopeMenuItem: {
      select: { id: true, name: true },
    },
    scopeCategory: {
      select: { id: true, name: true },
    },
  } satisfies Prisma.CouponInclude;
}
