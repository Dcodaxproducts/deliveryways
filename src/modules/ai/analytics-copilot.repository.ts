import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { SUCCESSFUL_ORDER_STATUSES } from '../../common/utils/successful-order-statuses';
import { PrismaService } from '../../database';
import {
  AnalyticsDateRange,
  AnalyticsPeriodSnapshot,
  AnalyticsScope,
} from './domain/analytics-copilot.types';

interface BusyHourRow {
  hour: number;
  orderCount: bigint;
  revenue: Prisma.Decimal | number;
}
const countId = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'number'
    ? value.id
    : 0;

const CONSIDERED_STATUSES: OrderStatus[] = [
  OrderStatus.PLACED,
  ...SUCCESSFUL_ORDER_STATUSES,
  OrderStatus.CANCELLED,
  OrderStatus.REJECTED,
];

@Injectable()
export class AnalyticsCopilotRepository {
  constructor(private readonly prisma: PrismaService) {}
  findRestaurantScope(restaurantId: string, tenantId: string) {
    return this.prisma.restaurant.findFirst({
      where: { id: restaurantId, tenantId, deletedAt: null, isActive: true },
      select: { id: true, tenantId: true },
    });
  }
  findBranchScope(branchId: string, tenantId: string, restaurantId: string) {
    return this.prisma.branch.findFirst({
      where: {
        id: branchId,
        tenantId,
        restaurantId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true, tenantId: true, restaurantId: true },
    });
  }
  async getSnapshot(
    scope: AnalyticsScope,
    range: AnalyticsDateRange,
    timezone: string,
  ): Promise<AnalyticsPeriodSnapshot> {
    const baseWhere: Prisma.OrderWhereInput = {
      tenantId: scope.tenantId,
      restaurantId: scope.restaurantId,
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      createdAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
    };
    const successfulWhere: Prisma.OrderWhereInput = {
      ...baseWhere,
      status: { in: SUCCESSFUL_ORDER_STATUSES },
    };
    const consideredWhere: Prisma.OrderWhereInput = {
      ...baseWhere,
      status: { in: CONSIDERED_STATUSES },
    };
    const branchSql = scope.branchId
      ? Prisma.sql`AND o."branch_id" = ${scope.branchId}`
      : Prisma.empty;
    const statusSql = Prisma.join(
      SUCCESSFUL_ORDER_STATUSES.map((status) => Prisma.sql`${status}`),
    );
    const busyHoursQuery = Prisma.sql`
      SELECT EXTRACT(HOUR FROM o."created_at" AT TIME ZONE ${timezone})::integer AS "hour",
             COUNT(*)::bigint AS "orderCount", COALESCE(SUM(o."total_amount"), 0) AS "revenue"
      FROM "orders" o
      WHERE o."tenant_id" = ${scope.tenantId} AND o."restaurant_id" = ${scope.restaurantId}
        ${branchSql} AND o."created_at" >= ${range.startUtc} AND o."created_at" < ${range.endExclusiveUtc}
        AND o."status"::text IN (${statusSql})
      GROUP BY 1 ORDER BY 1 ASC LIMIT 24
    `;
    const [
      sales,
      statusGroups,
      paymentGroups,
      itemGroups,
      busyHours,
      staffGroups,
    ] = await this.prisma.$transaction([
      this.prisma.order.aggregate({
        where: successfulWhere,
        _count: { id: true },
        _sum: { totalAmount: true },
        _avg: { totalAmount: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: consideredWhere,
        orderBy: { status: 'asc' },
        _count: { id: true },
      }),
      this.prisma.order.groupBy({
        by: ['paymentMethod'],
        where: successfulWhere,
        orderBy: { paymentMethod: 'asc' },
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['menuItemId'],
        where: { order: successfulWhere },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10,
        _sum: { quantity: true, lineTotal: true },
        _max: { menuItemName: true },
      }),
      this.prisma.$queryRaw<BusyHourRow[]>(busyHoursQuery),
      this.prisma.staffActivityLog.groupBy({
        by: ['staffUserId', 'staffName'],
        where: {
          ownerUserId: scope.ownerUserId,
          restaurantId: scope.restaurantId,
          ...(scope.branchId ? { branchId: scope.branchId } : {}),
          occurredAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
        },
        orderBy: { _count: { staffUserId: 'desc' } },
        take: 10,
        _count: { id: true },
      }),
    ]);
    const countFor = (status: OrderStatus) =>
      countId(statusGroups.find((group) => group.status === status)?._count);
    const consideredOrders = statusGroups.reduce(
      (total, group) => total + countId(group._count),
      0,
    );
    const cancelledOrders = countFor(OrderStatus.CANCELLED);
    return {
      sales: {
        successfulOrders: sales._count.id,
        revenue: Number(sales._sum.totalAmount ?? 0),
        averageOrderValue: Number(sales._avg.totalAmount ?? 0),
      },
      cancellations: {
        cancelledOrders,
        consideredOrders,
        rate:
          consideredOrders > 0
            ? Number(((cancelledOrders / consideredOrders) * 100).toFixed(2))
            : 0,
      },
      paymentTypes: paymentGroups.map((group) => ({
        paymentMethod: group.paymentMethod,
        count: countId(group._count),
        revenue: Number(group._sum?.totalAmount ?? 0),
      })),
      popularItems: itemGroups.map((group) => ({
        menuItemId: group.menuItemId,
        name: group._max?.menuItemName ?? '-',
        quantity: Number(group._sum?.quantity ?? 0),
        revenue: Number(group._sum?.lineTotal ?? 0),
      })),
      busyHours: busyHours.map((row) => ({
        hour: Number(row.hour),
        orderCount: Number(row.orderCount),
        revenue: Number(row.revenue),
      })),
      staffPerformance: staffGroups.map((group, index) => ({
        staffRef: 'staff-' + (index + 1),
        displayName: group.staffName,
        activityCount: countId(group._count),
      })),
    };
  }
}
