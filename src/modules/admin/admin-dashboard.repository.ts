import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database';
import {
  AdminDashboardTopRestaurantsRange,
  AdminDashboardTrendRange,
} from './dto';

interface EntityOverviewCounts {
  total: number;
  active: number;
  inactive: number;
}

interface AdminDashboardTrendPoint {
  key: string;
  label: string;
  value: number;
  cumulativeTotal: number;
}

interface AdminDashboardStatusBreakdownItem {
  status: string;
  count: number;
}

interface AdminDashboardAlertItem {
  key: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  count: number;
}

interface AdminDashboardRecentActivityItem {
  id: string;
  type: 'ORDER' | 'PAYMENT' | 'RESTAURANT' | 'CUSTOMER';
  title: string;
  description: string;
  occurredAt: Date;
  entityId: string;
  entityType: 'order' | 'payment' | 'restaurant' | 'customer';
}

interface TopPerformingRestaurantItem {
  rank: number;
  restaurantId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  coverImage: string | null;
  ordersCount: number;
  customersCount: number;
}

export interface AdminDashboardOverview {
  tenants: EntityOverviewCounts;
  restaurants: EntityOverviewCounts;
  branches: EntityOverviewCounts;
  customers: EntityOverviewCounts;
}

export interface AdminDashboardRestaurantTrend {
  range: AdminDashboardTrendRange;
  totalCreatedInRange: number;
  points: AdminDashboardTrendPoint[];
}

export interface AdminDashboardOrdersTrend {
  range: AdminDashboardTrendRange;
  totalOrdersInRange: number;
  points: AdminDashboardTrendPoint[];
}

export interface AdminDashboardRevenueTrend {
  range: AdminDashboardTrendRange;
  totalRevenueInRange: number;
  currency: string;
  points: AdminDashboardTrendPoint[];
}

export interface AdminDashboardOrdersStats {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  statusBreakdown: AdminDashboardStatusBreakdownItem[];
  paymentStatusBreakdown: AdminDashboardStatusBreakdownItem[];
}

export interface AdminDashboardCustomersStats {
  totalCustomers: number;
  activeCustomers: number;
  inactiveCustomers: number;
  newCustomersLast30Days: number;
}

export interface AdminDashboardSystemAlerts {
  items: AdminDashboardAlertItem[];
}

export interface AdminDashboardRecentActivity {
  items: AdminDashboardRecentActivityItem[];
}

export interface AdminDashboardTopPerformingRestaurants {
  range: AdminDashboardTopRestaurantsRange;
  items: TopPerformingRestaurantItem[];
}

export interface AdminDashboardScope {
  tenantId?: string;
  restaurantId?: string;
  branchId?: string;
}

@Injectable()
export class AdminDashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(): Promise<AdminDashboardOverview> {
    const [
      totalTenants,
      activeTenants,
      totalRestaurants,
      activeRestaurants,
      totalBranches,
      activeBranches,
      totalCustomers,
      activeCustomers,
    ] = await this.prisma.$transaction([
      this.prisma.tenant.count({ where: { deletedAt: null } }),
      this.prisma.tenant.count({
        where: { deletedAt: null, isActive: true },
      }),
      this.prisma.restaurant.count({ where: { deletedAt: null } }),
      this.prisma.restaurant.count({
        where: { deletedAt: null, isActive: true },
      }),
      this.prisma.branch.count({ where: { deletedAt: null } }),
      this.prisma.branch.count({
        where: { deletedAt: null, isActive: true },
      }),
      this.prisma.user.count({
        where: { deletedAt: null, role: UserRole.CUSTOMER },
      }),
      this.prisma.user.count({
        where: {
          deletedAt: null,
          role: UserRole.CUSTOMER,
          isActive: true,
        },
      }),
    ]);

    return {
      tenants: this.buildCounts(totalTenants, activeTenants),
      restaurants: this.buildCounts(totalRestaurants, activeRestaurants),
      branches: this.buildCounts(totalBranches, activeBranches),
      customers: this.buildCounts(totalCustomers, activeCustomers),
    };
  }

  async getRestaurantTrend(
    range: AdminDashboardTrendRange = 'daily',
  ): Promise<AdminDashboardRestaurantTrend> {
    const buckets = this.buildTrendBuckets(range);
    const startAt = buckets[0]?.start ?? new Date();

    const [countBeforeRange, restaurantsInRange] =
      await this.prisma.$transaction([
        this.prisma.restaurant.count({
          where: {
            deletedAt: null,
            createdAt: { lt: startAt },
          },
        }),
        this.prisma.restaurant.findMany({
          where: {
            deletedAt: null,
            createdAt: { gte: startAt },
          },
          select: {
            createdAt: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        }),
      ]);

    const points = this.buildTrendPoints(
      buckets,
      countBeforeRange,
      restaurantsInRange.map((restaurant) => restaurant.createdAt),
    );

    return {
      range,
      totalCreatedInRange: points.reduce((sum, point) => sum + point.value, 0),
      points,
    };
  }

  async getOrdersTrend(
    scope: AdminDashboardScope,
    range: AdminDashboardTrendRange = 'daily',
  ): Promise<AdminDashboardOrdersTrend> {
    const buckets = this.buildTrendBuckets(range);
    const startAt = buckets[0]?.start ?? new Date();
    const where = this.buildOrderWhere(scope);

    const [countBeforeRange, ordersInRange] = await this.prisma.$transaction([
      this.prisma.order.count({
        where: {
          ...where,
          createdAt: { lt: startAt },
        },
      }),
      this.prisma.order.findMany({
        where: {
          ...where,
          createdAt: { gte: startAt },
        },
        select: {
          createdAt: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      }),
    ]);

    const points = this.buildTrendPoints(
      buckets,
      countBeforeRange,
      ordersInRange.map((order) => order.createdAt),
    );

    return {
      range,
      totalOrdersInRange: points.reduce((sum, point) => sum + point.value, 0),
      points,
    };
  }

  async getRevenueTrend(
    scope: AdminDashboardScope,
    range: AdminDashboardTrendRange = 'daily',
  ): Promise<AdminDashboardRevenueTrend> {
    const buckets = this.buildTrendBuckets(range);
    const startAt = buckets[0]?.start ?? new Date();
    const where = {
      ...this.buildPaymentTransactionWhere(scope),
      type: 'CHARGE' as const,
      status: 'PAID' as const,
    };

    const transactions = await this.prisma.paymentTransaction.findMany({
      where: {
        ...where,
        createdAt: { gte: startAt },
      },
      select: {
        amount: true,
        currency: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    let cumulativeTotal = 0;
    const points = buckets.map((bucket) => {
      const value = transactions
        .filter(
          (transaction) =>
            transaction.createdAt >= bucket.start &&
            transaction.createdAt < bucket.end,
        )
        .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

      cumulativeTotal += value;

      return {
        key: bucket.key,
        label: bucket.label,
        value: Number(value.toFixed(2)),
        cumulativeTotal: Number(cumulativeTotal.toFixed(2)),
      };
    });

    return {
      range,
      totalRevenueInRange: Number(
        points.reduce((sum, point) => sum + point.value, 0).toFixed(2),
      ),
      currency: transactions[0]?.currency ?? 'PKR',
      points,
    };
  }

  async getOrdersStats(
    scope: AdminDashboardScope,
  ): Promise<AdminDashboardOrdersStats> {
    const where = this.buildOrderWhere(scope);
    const [totalOrders, revenueAggregate, orders] =
      await this.prisma.$transaction([
        this.prisma.order.count({ where }),
        this.prisma.order.aggregate({
          where,
          _sum: { totalAmount: true },
          _avg: { totalAmount: true },
        }),
        this.prisma.order.findMany({
          where,
          select: {
            status: true,
            paymentStatus: true,
          },
        }),
      ]);

    const statusMap = orders.reduce<Map<string, number>>((acc, order) => {
      acc.set(order.status, (acc.get(order.status) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());

    const paymentStatusMap = orders.reduce<Map<string, number>>((acc, order) => {
      acc.set(order.paymentStatus, (acc.get(order.paymentStatus) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());

    return {
      totalOrders,
      totalRevenue: Number(revenueAggregate._sum.totalAmount ?? 0),
      averageOrderValue: Number(revenueAggregate._avg.totalAmount ?? 0),
      statusBreakdown: Array.from(statusMap.entries()).map(([status, count]) => ({
        status,
        count,
      })),
      paymentStatusBreakdown: Array.from(paymentStatusMap.entries()).map(
        ([status, count]) => ({
          status,
          count,
        }),
      ),
    };
  }

  async getCustomersStats(
    scope: AdminDashboardScope,
  ): Promise<AdminDashboardCustomersStats> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const where = {
      deletedAt: null,
      role: UserRole.CUSTOMER,
      ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
    };

    const [totalCustomers, activeCustomers, newCustomersLast30Days] =
      await this.prisma.$transaction([
        this.prisma.user.count({ where }),
        this.prisma.user.count({ where: { ...where, isActive: true } }),
        this.prisma.user.count({
          where: {
            ...where,
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
      ]);

    return {
      totalCustomers,
      activeCustomers,
      inactiveCustomers: totalCustomers - activeCustomers,
      newCustomersLast30Days,
    };
  }

  async getSystemAlerts(
    scope: AdminDashboardScope,
  ): Promise<AdminDashboardSystemAlerts> {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [failedPayments, failedNotifications, inactiveRestaurants, inactiveBranches] =
      await this.prisma.$transaction([
        this.prisma.paymentTransaction.count({
          where: {
            ...this.buildPaymentTransactionWhere(scope),
            status: 'FAILED',
            createdAt: { gte: last24Hours },
          },
        }),
        this.prisma.notification.count({
          where: {
            ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
            ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
            ...(scope.branchId ? { branchId: scope.branchId } : {}),
            status: 'FAILED',
            createdAt: { gte: last24Hours },
          },
        }),
        this.prisma.restaurant.count({
          where: {
            deletedAt: null,
            isActive: false,
            ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
            ...(scope.restaurantId ? { id: scope.restaurantId } : {}),
          },
        }),
        this.prisma.branch.count({
          where: {
            deletedAt: null,
            isActive: false,
            ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
            ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
            ...(scope.branchId ? { id: scope.branchId } : {}),
          },
        }),
      ]);

    const items: AdminDashboardAlertItem[] = [];

    if (failedPayments > 0) {
      items.push({
        key: 'failed-payments',
        severity: failedPayments >= 10 ? 'critical' : 'warning',
        title: 'Failed payments detected',
        message: `${failedPayments} payment attempts failed in the last 24 hours`,
        count: failedPayments,
      });
    }

    if (failedNotifications > 0) {
      items.push({
        key: 'failed-notifications',
        severity: failedNotifications >= 10 ? 'critical' : 'warning',
        title: 'Failed notifications detected',
        message: `${failedNotifications} notifications failed in the last 24 hours`,
        count: failedNotifications,
      });
    }

    if (inactiveRestaurants > 0) {
      items.push({
        key: 'inactive-restaurants',
        severity: 'info',
        title: 'Inactive restaurants present',
        message: `${inactiveRestaurants} restaurants are currently inactive`,
        count: inactiveRestaurants,
      });
    }

    if (inactiveBranches > 0) {
      items.push({
        key: 'inactive-branches',
        severity: 'info',
        title: 'Inactive branches present',
        message: `${inactiveBranches} branches are currently inactive`,
        count: inactiveBranches,
      });
    }

    return {
      items,
    };
  }

  async getRecentActivity(
    scope: AdminDashboardScope,
    limit = 10,
  ): Promise<AdminDashboardRecentActivity> {
    const [orders, payments, restaurants, customers] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: this.buildOrderWhere(scope),
        select: {
          id: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.paymentTransaction.findMany({
        where: this.buildPaymentTransactionWhere(scope),
        select: {
          id: true,
          status: true,
          type: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.restaurant.findMany({
        where: {
          deletedAt: null,
          ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
          ...(scope.restaurantId ? { id: scope.restaurantId } : {}),
        },
        select: {
          id: true,
          name: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.user.findMany({
        where: {
          deletedAt: null,
          role: UserRole.CUSTOMER,
          ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
          ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
          ...(scope.branchId ? { branchId: scope.branchId } : {}),
        },
        select: {
          id: true,
          email: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    const items: AdminDashboardRecentActivityItem[] = [
      ...orders.map((order) => ({
        id: `order-${order.id}`,
        type: 'ORDER' as const,
        title: 'New order activity',
        description: `Order ${order.id} is currently ${order.status}`,
        occurredAt: order.createdAt,
        entityId: order.id,
        entityType: 'order' as const,
      })),
      ...payments.map((payment) => ({
        id: `payment-${payment.id}`,
        type: 'PAYMENT' as const,
        title: 'Payment activity',
        description: `${payment.type} payment ${payment.id} is ${payment.status}`,
        occurredAt: payment.createdAt,
        entityId: payment.id,
        entityType: 'payment' as const,
      })),
      ...restaurants.map((restaurant) => ({
        id: `restaurant-${restaurant.id}`,
        type: 'RESTAURANT' as const,
        title: 'Restaurant onboarded',
        description: `${restaurant.name} was added to the platform`,
        occurredAt: restaurant.createdAt,
        entityId: restaurant.id,
        entityType: 'restaurant' as const,
      })),
      ...customers.map((customer) => ({
        id: `customer-${customer.id}`,
        type: 'CUSTOMER' as const,
        title: 'Customer signup',
        description: `${customer.email} joined the platform`,
        occurredAt: customer.createdAt,
        entityId: customer.id,
        entityType: 'customer' as const,
      })),
    ]
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
      .slice(0, limit);

    return { items };
  }

  async getTopPerformingRestaurants(
    scope: AdminDashboardScope,
    range: AdminDashboardTopRestaurantsRange = 'all-time',
    limit = 5,
  ): Promise<AdminDashboardTopPerformingRestaurants> {
    const startAt = this.resolveTopRestaurantsStartAt(range);
    const restaurantWhere = {
      ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      ...(scope.restaurantId ? { id: scope.restaurantId } : {}),
      deletedAt: null,
    };
    const ordersWhere = {
      ...this.buildOrderWhere(scope),
      ...(startAt ? { createdAt: { gte: startAt } } : {}),
    };

    const [restaurants, orders, customers] = await this.prisma.$transaction([
      this.prisma.restaurant.findMany({
        where: restaurantWhere,
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          coverImage: true,
        },
      }),
      this.prisma.order.findMany({
        where: ordersWhere,
        select: {
          restaurantId: true,
        },
      }),
      this.prisma.user.findMany({
        where: {
          deletedAt: null,
          role: UserRole.CUSTOMER,
          ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
          ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
        },
        select: {
          restaurantId: true,
        },
      }),
    ]);

    const orderCountMap = orders.reduce<Map<string, number>>((acc, item) => {
      acc.set(item.restaurantId, (acc.get(item.restaurantId) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
    const customerCountMap = customers.reduce<Map<string, number>>(
      (acc, item) => {
        if (!item.restaurantId) {
          return acc;
        }

        acc.set(item.restaurantId, (acc.get(item.restaurantId) ?? 0) + 1);
        return acc;
      },
      new Map<string, number>(),
    );

    const items = restaurants
      .map((restaurant) => ({
        restaurantId: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        logoUrl: restaurant.logoUrl,
        coverImage: restaurant.coverImage,
        ordersCount: orderCountMap.get(restaurant.id) ?? 0,
        customersCount: customerCountMap.get(restaurant.id) ?? 0,
      }))
      .sort((left, right) => {
        if (right.ordersCount !== left.ordersCount) {
          return right.ordersCount - left.ordersCount;
        }

        if (right.customersCount !== left.customersCount) {
          return right.customersCount - left.customersCount;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, limit)
      .map((item, index) => ({
        rank: index + 1,
        ...item,
      }));

    return {
      range,
      items,
    };
  }

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

  private buildCounts(total: number, active: number): EntityOverviewCounts {
    return {
      total,
      active,
      inactive: total - active,
    };
  }

  private buildTrendBuckets(range: AdminDashboardTrendRange) {
    if (range === 'weekly') {
      return this.buildWeeklyTrendBuckets();
    }

    if (range === 'monthly') {
      return this.buildMonthlyTrendBuckets();
    }

    return this.buildDailyTrendBuckets();
  }

  private buildTrendPoints(
    buckets: Array<{ key: string; label: string; start: Date; end: Date }>,
    countBeforeRange: number,
    values: Date[],
  ) {
    let cumulativeTotal = countBeforeRange;

    return buckets.map((bucket) => {
      const value = values.filter(
        (createdAt) => createdAt >= bucket.start && createdAt < bucket.end,
      ).length;

      cumulativeTotal += value;

      return {
        key: bucket.key,
        label: bucket.label,
        value,
        cumulativeTotal,
      };
    });
  }

  private buildDailyTrendBuckets() {
    const today = this.startOfUtcDay(new Date());

    return Array.from({ length: 7 }, (_, index) => {
      const start = new Date(today);
      start.setUTCDate(today.getUTCDate() - (6 - index));

      const end = new Date(start);
      end.setUTCDate(start.getUTCDate() + 1);

      return {
        key: this.toDateKey(start),
        label: start.toLocaleDateString('en-US', {
          weekday: 'short',
          timeZone: 'UTC',
        }),
        start,
        end,
      };
    });
  }

  private buildWeeklyTrendBuckets() {
    const today = this.startOfUtcDay(new Date());
    const currentWeekStart = new Date(today);
    currentWeekStart.setUTCDate(
      today.getUTCDate() - this.normalizeWeekday(today.getUTCDay()),
    );

    return Array.from({ length: 8 }, (_, index) => {
      const start = new Date(currentWeekStart);
      start.setUTCDate(currentWeekStart.getUTCDate() - 7 * (7 - index));

      const end = new Date(start);
      end.setUTCDate(start.getUTCDate() + 7);

      const endLabelDate = new Date(end);
      endLabelDate.setUTCDate(end.getUTCDate() - 1);

      return {
        key: `${this.toDateKey(start)}_${this.toDateKey(endLabelDate)}`,
        label: `${start.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        })} - ${endLabelDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        })}`,
        start,
        end,
      };
    });
  }

  private buildMonthlyTrendBuckets() {
    const today = this.startOfUtcDay(new Date());

    return Array.from({ length: 12 }, (_, index) => {
      const start = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (11 - index), 1),
      );
      const end = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
      );

      return {
        key: `${start.getUTCFullYear()}-${String(
          start.getUTCMonth() + 1,
        ).padStart(2, '0')}`,
        label: start.toLocaleDateString('en-US', {
          month: 'short',
          timeZone: 'UTC',
        }),
        start,
        end,
      };
    });
  }

  private resolveTopRestaurantsStartAt(
    range: AdminDashboardTopRestaurantsRange,
  ) {
    const now = this.startOfUtcDay(new Date());

    if (range === 'daily') {
      const start = new Date(now);
      start.setUTCDate(now.getUTCDate() - 6);
      return start;
    }

    if (range === 'weekly') {
      const start = new Date(now);
      start.setUTCDate(now.getUTCDate() - 27);
      return start;
    }

    if (range === 'monthly') {
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1),
      );
    }

    return undefined;
  }

  private buildOrderWhere(scope: AdminDashboardScope) {
    return {
      ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
    };
  }

  private buildPaymentTransactionWhere(scope: AdminDashboardScope) {
    return {
      ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
    };
  }

  private startOfUtcDay(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private toDateKey(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private normalizeWeekday(day: number) {
    return day === 0 ? 6 : day - 1;
  }
}
