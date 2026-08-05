import { Injectable } from '@nestjs/common';
import {
  Prisma,
  WinOrderExportState,
  WinOrderStatusEventResult,
} from '@prisma/client';
import { PrismaService } from '../../database';
import { WinOrderMachineContext } from './winorder-machine-context';

@Injectable()
export class WinOrderStatusRepository {
  constructor(private readonly prisma: PrismaService) {}

  findEvent(machine: WinOrderMachineContext, fingerprint: string) {
    return this.prisma.winOrderStatusEvent.findFirst({
      where: {
        ...this.scope(machine),
        connectionId: machine.connectionId,
        fingerprint,
      },
      select: { id: true, result: true },
    });
  }

  findExport(machine: WinOrderMachineContext, orderId: string) {
    return this.prisma.winOrderOrderExport.findFirst({
      where: {
        ...this.scope(machine),
        connectionId: machine.connectionId,
        orderId,
      },
      select: { id: true, state: true },
    });
  }

  async record(input: {
    machine: WinOrderMachineContext;
    exportId: string | null;
    orderId: string;
    fingerprint: string;
    trackingStatus: string;
    message?: string;
    deliverMinutes?: number;
    deliverEta?: Date;
    rejectReason?: string;
    rawPayload: Prisma.InputJsonValue;
    result: WinOrderStatusEventResult;
    errorMessage?: string;
  }) {
    await this.prisma.winOrderStatusEvent.create({
      data: {
        ...this.scope(input.machine),
        connectionId: input.machine.connectionId,
        exportId: input.exportId,
        orderId: input.orderId,
        fingerprint: input.fingerprint,
        trackingStatus: input.trackingStatus,
        message: input.message,
        deliverMinutes: input.deliverMinutes,
        deliverEta: input.deliverEta,
        rejectReason: input.rejectReason,
        rawPayload: input.rawPayload,
        result: input.result,
        errorMessage: input.errorMessage,
      },
    });
  }

  async acknowledge(
    machine: WinOrderMachineContext,
    exportId: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.winOrderOrderExport.updateMany({
        where: {
          id: exportId,
          ...this.scope(machine),
          connectionId: machine.connectionId,
        },
        data: {
          state: WinOrderExportState.ACKNOWLEDGED,
          acknowledgedAt: new Date(),
          leaseToken: null,
          leaseExpiresAt: null,
          failedAt: null,
          lastError: null,
        },
      }),
      this.prisma.winOrderConnection.updateMany({
        where: { id: machine.connectionId, ...this.scope(machine) },
        data: { lastSuccessfulCallbackAt: new Date(), lastError: null },
      }),
    ]);
  }

  async recordConnectionError(
    machine: WinOrderMachineContext,
    error: string,
  ): Promise<void> {
    await this.prisma.winOrderConnection.updateMany({
      where: { id: machine.connectionId, ...this.scope(machine) },
      data: { lastErrorAt: new Date(), lastError: error },
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
