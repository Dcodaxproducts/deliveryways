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

export interface AdminDashboardTopPerformingRestaurants {
  range: AdminDashboardTopRestaurantsRange;
  items: TopPerformingRestaurantItem[];
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
    const buckets =
      range === 'weekly'
        ? this.buildWeeklyRestaurantTrendBuckets()
        : this.buildDailyRestaurantTrendBuckets();
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

    let cumulativeTotal = countBeforeRange;
    const points = buckets.map((bucket) => {
      const value = restaurantsInRange.filter((restaurant) => {
        const createdAt = restaurant.createdAt;
        return createdAt >= bucket.start && createdAt < bucket.end;
      }).length;

      cumulativeTotal += value;

      return {
        key: bucket.key,
        label: bucket.label,
        value,
        cumulativeTotal,
      };
    });

    return {
      range,
      totalCreatedInRange: points.reduce((sum, point) => sum + point.value, 0),
      points,
    };
  }

  async getTopPerformingRestaurants(
    range: AdminDashboardTopRestaurantsRange = 'all-time',
    limit = 5,
  ): Promise<AdminDashboardTopPerformingRestaurants> {
    const startAt = this.resolveTopRestaurantsStartAt(range);
    const ordersWhere = {
      ...(startAt ? { createdAt: { gte: startAt } } : {}),
    };

    const groupedOrders = await this.prisma.order.groupBy({
      by: ['restaurantId'],
      where: ordersWhere,
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          restaurantId: 'desc',
        },
      },
      take: limit,
    });

    if (!groupedOrders.length) {
      return {
        range,
        items: [],
      };
    }

    const restaurantIds = groupedOrders.map((item) => item.restaurantId);
    const [restaurants, customers] = await this.prisma.$transaction([
      this.prisma.restaurant.findMany({
        where: {
          id: { in: restaurantIds },
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          coverImage: true,
        },
      }),
      this.prisma.user.findMany({
        where: {
          deletedAt: null,
          role: UserRole.CUSTOMER,
          restaurantId: { in: restaurantIds },
        },
        select: {
          restaurantId: true,
        },
      }),
    ]);

    const restaurantMap = new Map(restaurants.map((item) => [item.id, item]));
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

    return {
      range,
      items: groupedOrders
        .map((item, index) => {
          const restaurant = restaurantMap.get(item.restaurantId);
          if (!restaurant) {
            return null;
          }

          return {
            rank: index + 1,
            restaurantId: restaurant.id,
            name: restaurant.name,
            slug: restaurant.slug,
            logoUrl: restaurant.logoUrl,
            coverImage: restaurant.coverImage,
            ordersCount: item._count._all,
            customersCount: customerCountMap.get(restaurant.id) ?? 0,
          };
        })
        .filter((item): item is TopPerformingRestaurantItem => item !== null),
    };
  }

  private buildCounts(total: number, active: number): EntityOverviewCounts {
    return {
      total,
      active,
      inactive: total - active,
    };
  }

  private buildDailyRestaurantTrendBuckets() {
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

  private buildWeeklyRestaurantTrendBuckets() {
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

    return undefined;
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
