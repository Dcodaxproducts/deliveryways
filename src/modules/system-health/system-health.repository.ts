import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database';

@Injectable()
export class SystemHealthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async pingDatabase() {
    const startedAt = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'up' as const,
        latencyMs: Date.now() - startedAt,
      };
    } catch {
      return {
        status: 'down' as const,
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  async getPlatformSummary() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      tenants,
      restaurants,
      branches,
      customers,
      ordersTotal,
      ordersToday,
      failedPayments,
      failedNotifications,
    ] = await this.prisma.$transaction([
      this.prisma.tenant.count({ where: { deletedAt: null } }),
      this.prisma.restaurant.count({ where: { deletedAt: null } }),
      this.prisma.branch.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, role: 'CUSTOMER' } }),
      this.prisma.order.count(),
      this.prisma.order.count({
        where: {
          createdAt: { gte: startOfToday },
        },
      }),
      this.prisma.paymentTransaction.count({
        where: {
          status: 'FAILED',
        },
      }),
      this.prisma.notification.count({
        where: {
          status: 'FAILED',
        },
      }),
    ]);

    return {
      tenants,
      restaurants,
      branches,
      customers,
      ordersTotal,
      ordersToday,
      failedPayments,
      failedNotifications,
    };
  }
}
