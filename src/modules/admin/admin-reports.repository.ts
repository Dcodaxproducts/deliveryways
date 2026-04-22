import { Injectable } from '@nestjs/common';
import {
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../database';
import {
  AdminExportCustomersCsvQueryDto,
  AdminExportMenuCsvQueryDto,
  AdminExportOrdersCsvQueryDto,
  AdminFinancialReportQueryDto,
  AdminOrdersReportQueryDto,
} from './dto';

export interface AdminReportsScope {
  tenantId?: string;
  restaurantId?: string;
  branchId?: string;
}

@Injectable()
export class AdminReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findRestaurantScope(restaurantId: string, tenantId?: string) {
    return this.prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
      },
      select: {
        id: true,
        tenantId: true,
      },
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
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
      },
    });
  }

  async exportMenu(
    scope: AdminReportsScope,
    query: AdminExportMenuCsvQueryDto,
  ) {
    return this.prisma.menuItem.findMany({
      where: {
        deletedAt: null,
        ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.menuId
          ? {
              OR: [
                {
                  menuLinks: {
                    some: {
                      restaurantMenuId: query.menuId,
                      ...(query.includeInactive ? {} : { isActive: true }),
                    },
                  },
                },
                {
                  category: {
                    menuLinks: {
                      some: {
                        restaurantMenuId: query.menuId,
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
        pricingMode: true,
        basePrice: true,
        deliveryPriceAdjustment: true,
        takeawayPriceAdjustment: true,
        depositAmount: true,
        prepTimeMinutes: true,
        isActive: true,
        createdAt: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            variations: {
              where: {
                deletedAt: null,
                ...(query.includeInactive ? {} : { isActive: true }),
              },
              select: { id: true },
            },
          },
        },
        menuLinks: {
          where: query.includeInactive ? undefined : { isActive: true },
          select: { restaurantMenu: { select: { id: true, name: true } } },
        },
        _count: {
          select: {
            modifierLinks: true,
          },
        },
      },
    });
  }

  async exportOrders(
    scope: AdminReportsScope,
    query: AdminExportOrdersCsvQueryDto,
  ) {
    return this.prisma.order.findMany({
      where: this.buildOrderWhere(scope, query),
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        restaurantId: true,
        branchId: true,
        orderType: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        subtotal: true,
        taxAmount: true,
        deliveryFee: true,
        discountAmount: true,
        totalAmount: true,
        orderTime: true,
        createdAt: true,
        branch: { select: { id: true, name: true } },
        customer: {
          select: {
            id: true,
            email: true,
            profile: {
              select: { firstName: true, lastName: true, phone: true },
            },
          },
        },
        coupon: { select: { code: true } },
        deliveryman: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: {
          select: {
            quantity: true,
            lineTotal: true,
            menuItemName: true,
            variationName: true,
          },
        },
      },
    });
  }

  async exportCustomers(
    scope: AdminReportsScope,
    query: AdminExportCustomersCsvQueryDto,
  ) {
    return this.prisma.user.findMany({
      where: {
        role: UserRole.CUSTOMER,
        deletedAt: null,
        ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
        ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
        ...(scope.branchId ? { branchId: scope.branchId } : {}),
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(query.isVerified !== undefined
          ? { isVerified: query.isVerified }
          : {}),
        ...(this.buildDateRange(query.fromDate, query.toDate, 'createdAt') ??
          {}),
        ...(query.search
          ? {
              OR: [
                { email: { contains: query.search, mode: 'insensitive' } },
                {
                  profile: {
                    OR: [
                      {
                        firstName: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                      {
                        lastName: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                      {
                        phone: { contains: query.search, mode: 'insensitive' },
                      },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        email: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        restaurant: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        profile: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        _count: {
          select: {
            customerOrders: true,
            couponUsages: true,
          },
        },
      },
    });
  }

  async getOrdersReport(
    scope: AdminReportsScope,
    query: AdminOrdersReportQueryDto,
  ) {
    const where = this.buildOrderWhere(scope, query);
    const [aggregate, orders, items] = await this.prisma.$transaction([
      this.prisma.order.aggregate({
        where,
        _count: { id: true },
        _sum: { totalAmount: true, deliveryFee: true, discountAmount: true },
        _avg: { totalAmount: true },
      }),
      this.prisma.order.findMany({
        where,
        select: {
          status: true,
          orderType: true,
          paymentStatus: true,
        },
      }),
      this.prisma.orderItem.findMany({
        where: {
          order: where,
        },
        select: {
          menuItemId: true,
          menuItemName: true,
          quantity: true,
          lineTotal: true,
        },
      }),
    ]);

    return {
      totalOrders: aggregate._count.id,
      totalRevenue: Number(aggregate._sum.totalAmount ?? 0),
      averageOrderValue: Number(aggregate._avg.totalAmount ?? 0),
      totalDeliveryFee: Number(aggregate._sum.deliveryFee ?? 0),
      totalDiscount: Number(aggregate._sum.discountAmount ?? 0),
      statusBreakdown: this.countByField(orders, 'status'),
      orderTypeBreakdown: this.countByField(orders, 'orderType'),
      paymentStatusBreakdown: this.countByField(orders, 'paymentStatus'),
      topItems: this.buildTopItems(items),
    };
  }

  async getFinancialReport(
    scope: AdminReportsScope,
    query: AdminFinancialReportQueryDto,
  ) {
    const orderWhere: Prisma.OrderWhereInput = {
      ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(this.buildDateRange(query.fromDate, query.toDate, 'createdAt') ?? {}),
    };
    const paymentWhere: Prisma.PaymentTransactionWhereInput = {
      ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(this.buildDateRange(query.fromDate, query.toDate, 'createdAt') ?? {}),
    };

    const [
      ordersAggregate,
      paidCharges,
      paidRefunds,
      failedPayments,
      paidOrders,
    ] = await this.prisma.$transaction([
      this.prisma.order.aggregate({
        where: orderWhere,
        _count: { id: true },
        _sum: {
          totalAmount: true,
          taxAmount: true,
          deliveryFee: true,
          discountAmount: true,
        },
        _avg: { totalAmount: true },
      }),
      this.prisma.paymentTransaction.aggregate({
        where: {
          ...paymentWhere,
          type: PaymentTransactionType.CHARGE,
          status: PaymentStatus.PAID,
        },
        _sum: { amount: true },
      }),
      this.prisma.paymentTransaction.aggregate({
        where: {
          ...paymentWhere,
          type: PaymentTransactionType.REFUND,
          status: PaymentStatus.PAID,
        },
        _sum: { amount: true },
      }),
      this.prisma.paymentTransaction.count({
        where: {
          ...paymentWhere,
          status: PaymentStatus.FAILED,
        },
      }),
      this.prisma.order.count({
        where: { ...orderWhere, paymentStatus: PaymentStatus.PAID },
      }),
    ]);

    return {
      totalOrders: ordersAggregate._count.id,
      paidOrders,
      grossRevenue: Number(ordersAggregate._sum.totalAmount ?? 0),
      paidRevenue: Number(paidCharges._sum.amount ?? 0),
      refundedAmount: Number(paidRefunds._sum.amount ?? 0),
      failedPayments,
      averageOrderValue: Number(ordersAggregate._avg.totalAmount ?? 0),
      totalTax: Number(ordersAggregate._sum.taxAmount ?? 0),
      totalDeliveryFee: Number(ordersAggregate._sum.deliveryFee ?? 0),
      totalDiscount: Number(ordersAggregate._sum.discountAmount ?? 0),
      netRevenue: Number(
        (
          Number(paidCharges._sum.amount ?? 0) -
          Number(paidRefunds._sum.amount ?? 0)
        ).toFixed(2),
      ),
    };
  }

  private buildOrderWhere(
    scope: AdminReportsScope,
    query: AdminExportOrdersCsvQueryDto,
  ) {
    return {
      ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.orderType ? { orderType: query.orderType } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.kind === 'group-orders'
        ? { sourceGroupOrder: { isNot: null } }
        : query.kind === 'order'
          ? { sourceGroupOrder: { is: null } }
          : {}),
      ...(this.buildDateRange(query.fromDate, query.toDate, 'createdAt') ?? {}),
    } satisfies Prisma.OrderWhereInput;
  }

  private buildDateRange(
    fromDate: string | undefined,
    toDate: string | undefined,
    field: string,
  ) {
    if (!fromDate && !toDate) {
      return undefined;
    }

    return {
      [field]: {
        ...(fromDate ? { gte: new Date(fromDate) } : {}),
        ...(toDate ? { lte: new Date(toDate) } : {}),
      },
    };
  }

  private countByField<T extends Record<string, string>>(
    items: T[],
    field: keyof T,
  ) {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = item[field];
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(counts.entries()).map(([key, count]) => ({
      key,
      count,
    }));
  }

  private buildTopItems(
    items: Array<{
      menuItemId: string;
      menuItemName: string;
      quantity: number;
      lineTotal: Prisma.Decimal;
    }>,
  ) {
    const map = new Map<
      string,
      {
        menuItemId: string;
        menuItemName: string;
        quantity: number;
        revenue: number;
      }
    >();

    for (const item of items) {
      const existing = map.get(item.menuItemId) ?? {
        menuItemId: item.menuItemId,
        menuItemName: item.menuItemName,
        quantity: 0,
        revenue: 0,
      };

      existing.quantity += item.quantity;
      existing.revenue += Number(item.lineTotal);
      map.set(item.menuItemId, existing);
    }

    return Array.from(map.values())
      .sort(
        (left, right) =>
          right.quantity - left.quantity || right.revenue - left.revenue,
      )
      .slice(0, 10);
  }
}
