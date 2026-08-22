import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  OrderType,
  PaymentFeePayer,
  Prisma,
} from '@prisma/client';
import { ChatService } from '../chat/chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderTrackingRealtimeService } from './order-tracking.realtime.service';
import {
  ApplyIntegrationOrderStatusInput,
  IntegrationOrder,
  IntegrationOrderModifier,
  IntegrationOrderSection,
  IntegrationOrderStatus,
  IntegrationScope,
  OrdersIntegrationPort,
} from './orders-integration.port';
import { OrdersRepository } from './orders.repository';

type SnapshotRecord = Record<string, Prisma.JsonValue>;

@Injectable()
export class OrdersIntegrationService implements OrdersIntegrationPort {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly notificationsService: NotificationsService,
    private readonly chatService: ChatService,
    private readonly orderTrackingRealtimeService: OrderTrackingRealtimeService,
  ) {}

  async listExportCandidates(
    scope: IntegrationScope,
    limit: number,
  ): Promise<IntegrationOrder[]> {
    const orders = await this.ordersRepository.findIntegrationExportCandidates(
      scope,
      Math.min(Math.max(limit, 1), 100),
    );

    return orders.map((order) => ({
      id: order.id,
      orderType: order.orderType,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderTime: order.orderTime,
      createdAt: order.createdAt,
      subtotal: order.subtotal.toNumber(),
      taxAmount: order.taxAmount.toNumber(),
      deliveryFee: order.deliveryFee.toNumber(),
      serviceChargeAmount: order.serviceChargeAmount.toNumber(),
      paymentFeeAmount:
        order.transactionFeePayer === PaymentFeePayer.CUSTOMER
          ? order.transactionFeeAmount.toNumber()
          : 0,
      tipAmount: order.tipAmount.toNumber(),
      discountAmount: order.discountAmount.toNumber(),
      totalAmount: order.totalAmount.toNumber(),
      customerNote: order.customerNote,
      customer: {
        email: order.customer.email,
        firstName: order.customer.profile?.firstName ?? null,
        lastName: order.customer.profile?.lastName ?? null,
        phone: order.customer.profile?.phone ?? null,
      },
      deliveryAddress: order.deliveryAddress,
      paymentReference: order.transactions[0]?.providerRef ?? null,
      currency: order.transactions[0]?.currency ?? null,
      items: order.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        menuItemName: item.menuItemName,
        variationId: item.variationId,
        variationName: item.variationName,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toNumber(),
        depositAmount: item.depositAmount.toNumber(),
        lineTotal: item.lineTotal.toNumber(),
        taxPercentage: item.menuItem.taxPercentage?.toNumber() ?? null,
        note: item.note,
        dealId: this.readDealId(item.snapshotModifiers),
        modifiers: this.readModifiers(item.snapshotModifiers),
        sections: this.readSections(item.snapshotModifiers),
      })),
    }));
  }

  async applyStatus(input: ApplyIntegrationOrderStatusInput): Promise<void> {
    const order = await this.ordersRepository.findIntegrationOrder(
      input.orderId,
      input,
    );

    if (!order) {
      throw new NotFoundException('Order not found in integration scope');
    }

    const path = this.resolveTransitionPath(
      order.orderType,
      order.status,
      input.status,
    );

    if (path.length === 0 && order.status !== input.status) {
      throw new BadRequestException(
        'Invalid integration order status transition',
      );
    }

    for (const status of path) {
      await this.ordersRepository.updateIntegrationStatus(
        order.id,
        input,
        status,
        status === OrderStatus.CONFIRMED
          ? (order.orderTime ?? new Date())
          : undefined,
      );
    }

    await this.ordersRepository.updateIntegrationEstimate(order.id, input, {
      estimatedPreparationMinutes: input.estimatedPreparationMinutes,
      estimatedCompletionAt: input.estimatedCompletionAt,
    });

    if (path.length > 0) {
      const finalStatus = path[path.length - 1];
      await this.notificationsService.notifyOrderStatusChanged(order.id);
      await this.chatService.syncDeliveryThreadForOrderLifecycle(
        order.id,
        finalStatus,
      );
      this.orderTrackingRealtimeService.emitTrackingUpdate({ id: order.id });
    }
  }

  private resolveTransitionPath(
    orderType: OrderType,
    current: OrderStatus,
    requested: IntegrationOrderStatus,
  ): OrderStatus[] {
    const target = requested as OrderStatus;

    if (requested === 'COMPLETED') {
      const lifecycle = this.lifecycleFor(orderType);
      return this.resolveTransitionPath(
        orderType,
        current,
        lifecycle[lifecycle.length - 1] as IntegrationOrderStatus,
      );
    }

    if (current === target) {
      return [];
    }

    if (target === OrderStatus.REJECTED) {
      const rejectableStatuses: OrderStatus[] = [
        OrderStatus.PLACED,
        OrderStatus.CONFIRMED,
      ];
      return rejectableStatuses.includes(current) ? [target] : [];
    }

    if (target === OrderStatus.CANCELLED) {
      return this.isTerminal(current) ? [] : [target];
    }

    const lifecycle = this.lifecycleFor(orderType);
    const currentIndex = lifecycle.indexOf(current);
    const targetIndex = lifecycle.indexOf(target);

    if (currentIndex < 0 || targetIndex <= currentIndex) {
      return [];
    }

    return lifecycle.slice(currentIndex + 1, targetIndex + 1);
  }

  private lifecycleFor(orderType: OrderType): OrderStatus[] {
    const completion =
      orderType === OrderType.DELIVERY
        ? [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED]
        : orderType === OrderType.TAKEAWAY
          ? [OrderStatus.READY_FOR_PICKUP, OrderStatus.PICKED_UP]
          : [OrderStatus.READY_TO_SERVE, OrderStatus.SERVED];

    return [
      OrderStatus.PLACED,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      ...completion,
    ];
  }

  private isTerminal(status: OrderStatus): boolean {
    const terminalStatuses: OrderStatus[] = [
      OrderStatus.DELIVERED,
      OrderStatus.PICKED_UP,
      OrderStatus.SERVED,
      OrderStatus.CANCELLED,
      OrderStatus.REJECTED,
    ];
    return terminalStatuses.includes(status);
  }

  private readDealId(input: Prisma.JsonValue | null): string | null {
    const record = this.asRecord(input);
    return typeof record?.dealId === 'string' ? record.dealId : null;
  }

  private readModifiers(
    input: Prisma.JsonValue | null,
  ): IntegrationOrderModifier[] {
    const value = Array.isArray(input)
      ? input
      : this.asRecord(input)?.modifiers;
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((entry) => {
      const record = this.asRecord(entry);
      if (
        !record ||
        typeof record.modifierId !== 'string' ||
        typeof record.name !== 'string' ||
        typeof record.quantity !== 'number' ||
        typeof record.unitPrice !== 'number'
      ) {
        return [];
      }

      return [
        {
          modifierId: record.modifierId,
          name: record.name,
          quantity: record.quantity,
          unitPrice: record.unitPrice,
        },
      ];
    });
  }

  private readSections(
    input: Prisma.JsonValue | null,
  ): IntegrationOrderSection[] {
    const value = this.asRecord(input)?.sections;
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((entry) => {
      const record = this.asRecord(entry);
      if (
        !record ||
        (record.slot !== 'LEFT' && record.slot !== 'RIGHT') ||
        typeof record.menuItemId !== 'string' ||
        typeof record.menuItemName !== 'string' ||
        typeof record.unitPrice !== 'number'
      ) {
        return [];
      }

      return [
        {
          slot: record.slot,
          menuItemId: record.menuItemId,
          menuItemName: record.menuItemName,
          unitPrice: record.unitPrice,
        },
      ];
    });
  }

  private asRecord(
    input: Prisma.JsonValue | undefined | null,
  ): SnapshotRecord | null {
    if (!input || Array.isArray(input) || typeof input !== 'object') {
      return null;
    }

    return input as SnapshotRecord;
  }
}
