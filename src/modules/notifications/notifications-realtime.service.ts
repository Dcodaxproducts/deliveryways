import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

export interface OrderCreatedRealtimePayload {
  id: string;
  status: string;
  restaurantId: string;
  branchId: string;
  orderType: string;
  paymentStatus: string;
  totalAmount: number;
  createdAt: Date;
  source?: 'STOREFRONT' | 'POS';
}

export interface OrderStatusRealtimePayload {
  id: string;
  status: string;
  restaurantId: string;
  branchId: string;
  updatedAt: Date;
}

@Injectable()
export class NotificationsRealtimeService {
  private readonly logger = new Logger(NotificationsRealtimeService.name);
  private server: Server | null = null;

  registerServer(server: Server) {
    this.server = server;
  }

  getRestaurantOrdersRoom(restaurantId: string) {
    return `orders:restaurant:${restaurantId}`;
  }

  getBranchOrdersRoom(restaurantId: string, branchId: string) {
    return `orders:restaurant:${restaurantId}:branch:${branchId}`;
  }

  emitOrderCreated(payload: OrderCreatedRealtimePayload) {
    if (!this.server) {
      return;
    }

    this.server
      .to(this.getRestaurantOrdersRoom(payload.restaurantId))
      .to(this.getBranchOrdersRoom(payload.restaurantId, payload.branchId))
      .emit('order.created', payload);

    this.logger.debug(
      `Emitted new order ${payload.id} for restaurant ${payload.restaurantId}`,
    );
  }

  emitOrderStatusUpdated(payload: OrderStatusRealtimePayload) {
    if (!this.server) return;

    this.server
      .to(this.getRestaurantOrdersRoom(payload.restaurantId))
      .to(this.getBranchOrdersRoom(payload.restaurantId, payload.branchId))
      .emit('order.status.updated', payload);
  }
}
