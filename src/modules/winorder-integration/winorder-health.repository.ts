import { Injectable } from '@nestjs/common';
import { WinOrderExportState } from '@prisma/client';
import { PrismaService } from '../../database';
import { WinOrderConnectionScope } from './winorder-connection.repository';

@Injectable()
export class WinOrderHealthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async get(scope: WinOrderConnectionScope, connectionId: string) {
    const [exportCounts, recentEvents] = await Promise.all([
      this.prisma.winOrderOrderExport.groupBy({
        by: ['state'],
        where: { ...scope, connectionId },
        _count: { _all: true },
      }),
      this.prisma.winOrderStatusEvent.findMany({
        where: { ...scope, connectionId },
        orderBy: [{ processedAt: 'desc' }],
        take: 20,
        select: {
          id: true,
          orderId: true,
          trackingStatus: true,
          result: true,
          errorMessage: true,
          processedAt: true,
        },
      }),
    ]);
    return {
      exportCounts: Object.fromEntries(
        exportCounts.map((item) => [item.state, item._count._all]),
      ),
      recentEvents,
    };
  }

  async retryFailed(
    scope: WinOrderConnectionScope,
    connectionId: string,
  ): Promise<number> {
    const result = await this.prisma.winOrderOrderExport.updateMany({
      where: {
        ...scope,
        connectionId,
        state: WinOrderExportState.FAILED,
        acknowledgedAt: null,
      },
      data: {
        state: WinOrderExportState.PENDING,
        leaseToken: null,
        leaseExpiresAt: null,
        failedAt: null,
        lastError: null,
      },
    });
    return result.count;
  }
}
