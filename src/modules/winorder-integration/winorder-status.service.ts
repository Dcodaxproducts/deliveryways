import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, WinOrderStatusEventResult } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  IntegrationOrderStatus,
  ORDERS_INTEGRATION_PORT,
  OrdersIntegrationPort,
} from '../orders';
import { WinOrderTrackingStatusDto } from './dto';
import { WinOrderConnectionService } from './winorder-connection.service';
import { WinOrderMachineContext } from './winorder-machine-context';
import { WinOrderStatusRepository } from './winorder-status.repository';

@Injectable()
export class WinOrderStatusService {
  constructor(
    @Inject(ORDERS_INTEGRATION_PORT)
    private readonly orders: OrdersIntegrationPort,
    private readonly connections: WinOrderConnectionService,
    private readonly repository: WinOrderStatusRepository,
  ) {}

  async process(
    machine: WinOrderMachineContext,
    duplicateUsername: string | undefined,
    duplicatePassword: string | undefined,
    dto: WinOrderTrackingStatusDto,
  ) {
    if (!duplicateUsername || !duplicatePassword) {
      throw new UnauthorizedException('Invalid integration credentials');
    }
    const duplicateAuth = await this.connections.authenticate(
      duplicateUsername,
      duplicatePassword,
    );
    if (duplicateAuth.connectionId !== machine.connectionId) {
      throw new UnauthorizedException('Invalid integration credentials');
    }

    const fingerprint = this.fingerprint(dto);
    if (await this.repository.findEvent(machine, fingerprint)) {
      return { success: true };
    }
    const orderExport = await this.repository.findExport(machine, dto.ordersid);
    if (!orderExport) {
      throw new NotFoundException('Exported order not found');
    }

    const normalizedStatus = dto.trackingstatus.trim().toUpperCase();
    try {
      if (normalizedStatus === '0' || normalizedStatus === 'OK') {
        await this.repository.acknowledge(machine, orderExport.id);
        await this.record(
          machine,
          orderExport.id,
          fingerprint,
          dto,
          WinOrderStatusEventResult.PROCESSED,
        );
        return { success: true };
      }

      const target = this.orderStatus(normalizedStatus);
      if (target) {
        await this.orders.applyStatus({
          tenantId: machine.tenantId,
          restaurantId: machine.restaurantId,
          branchId: machine.branchId,
          orderId: dto.ordersid,
          status: target,
          estimatedPreparationMinutes: dto.deliver_minutes,
          estimatedCompletionAt: dto.deliver_eta
            ? new Date(dto.deliver_eta)
            : undefined,
        });
      }

      const result =
        normalizedStatus === '9'
          ? WinOrderStatusEventResult.FAILED
          : target
            ? WinOrderStatusEventResult.PROCESSED
            : WinOrderStatusEventResult.IGNORED;
      await this.record(machine, orderExport.id, fingerprint, dto, result);
      if (result === WinOrderStatusEventResult.FAILED) {
        await this.repository.recordConnectionError(
          machine,
          dto.message ?? 'WinOrder import error',
        );
      }
      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Status processing failed';
      await this.repository.recordConnectionError(machine, message);
      await this.record(
        machine,
        orderExport.id,
        fingerprint,
        dto,
        WinOrderStatusEventResult.FAILED,
        message,
      );
      throw error;
    }
  }

  private orderStatus(status: string): IntegrationOrderStatus | null {
    const mapping: Record<string, IntegrationOrderStatus | null> = {
      '1': 'CONFIRMED',
      '2': 'PREPARING',
      '3': 'PREPARING',
      '4': 'PREPARING',
      '5': 'OUT_FOR_DELIVERY',
      '6': 'COMPLETED',
      '7': 'REJECTED',
      '8': null,
      '9': null,
      '10': 'CANCELLED',
      '11': null,
    };
    if (!(status in mapping)) {
      throw new BadRequestException('Unsupported WinOrder tracking status');
    }
    return mapping[status];
  }

  private fingerprint(dto: WinOrderTrackingStatusDto): string {
    return createHash('sha256')
      .update(
        [
          dto.ordersid,
          dto.trackingstatus,
          dto.message ?? '',
          dto.deliver_minutes ?? '',
          dto.deliver_eta ?? '',
          dto.reject_reason ?? '',
        ].join('|'),
      )
      .digest('hex');
  }

  private record(
    machine: WinOrderMachineContext,
    exportId: string,
    fingerprint: string,
    dto: WinOrderTrackingStatusDto,
    result: WinOrderStatusEventResult,
    errorMessage?: string,
  ) {
    return this.repository.record({
      machine,
      exportId,
      orderId: dto.ordersid,
      fingerprint,
      trackingStatus: dto.trackingstatus,
      message: dto.message,
      deliverMinutes: dto.deliver_minutes,
      deliverEta: dto.deliver_eta ? new Date(dto.deliver_eta) : undefined,
      rejectReason: dto.reject_reason,
      rawPayload: dto as unknown as Prisma.InputJsonValue,
      result,
      errorMessage,
    });
  }
}
