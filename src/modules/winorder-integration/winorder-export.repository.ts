import { Injectable } from '@nestjs/common';
import { WinOrderExportState } from '@prisma/client';
import { PrismaService } from '../../database';
import { WinOrderMachineContext } from './winorder-machine-context';

@Injectable()
export class WinOrderExportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async lease(
    machine: WinOrderMachineContext,
    orderIds: string[],
    leaseToken: string,
    leaseExpiresAt: Date,
  ): Promise<Set<string>> {
    if (!orderIds.length) {
      await this.prisma.winOrderConnection.updateMany({
        where: { id: machine.connectionId, ...this.scope(machine) },
        data: { lastPollAt: new Date() },
      });
      return new Set();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.winOrderOrderExport.createMany({
        data: orderIds.map((orderId) => ({
          ...this.scope(machine),
          connectionId: machine.connectionId,
          orderId,
        })),
        skipDuplicates: true,
      });
      await tx.winOrderOrderExport.updateMany({
        where: {
          ...this.scope(machine),
          connectionId: machine.connectionId,
          orderId: { in: orderIds },
          OR: [
            { state: WinOrderExportState.PENDING },
            { state: WinOrderExportState.FAILED },
            {
              state: WinOrderExportState.LEASED,
              leaseExpiresAt: { lt: new Date() },
            },
          ],
        },
        data: {
          state: WinOrderExportState.LEASED,
          leaseToken,
          leaseExpiresAt,
          attemptCount: { increment: 1 },
          failedAt: null,
          lastError: null,
        },
      });
      await tx.winOrderConnection.updateMany({
        where: { id: machine.connectionId, ...this.scope(machine) },
        data: { lastPollAt: new Date() },
      });
    });

    const leased = await this.prisma.winOrderOrderExport.findMany({
      where: {
        ...this.scope(machine),
        connectionId: machine.connectionId,
        leaseToken,
        state: WinOrderExportState.LEASED,
      },
      select: { orderId: true },
    });
    return new Set(leased.map((item) => item.orderId));
  }

  async markFailed(
    machine: WinOrderMachineContext,
    orderId: string,
    error: string,
  ) {
    await this.prisma.winOrderOrderExport.updateMany({
      where: {
        ...this.scope(machine),
        connectionId: machine.connectionId,
        orderId,
        state: WinOrderExportState.LEASED,
      },
      data: {
        state: WinOrderExportState.FAILED,
        failedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: error,
      },
    });
  }

  private scope(machine: WinOrderMachineContext) {
    return {
      tenantId: machine.tenantId,
      restaurantId: machine.restaurantId,
      branchId: machine.branchId,
    };
  }
}
