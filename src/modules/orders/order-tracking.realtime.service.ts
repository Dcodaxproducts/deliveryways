import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class OrderTrackingRealtimeService {
  private readonly logger = new Logger(OrderTrackingRealtimeService.name);
  private server: Server | null = null;

  registerServer(server: Server) {
    this.server = server;
  }

  getOrderRoom(orderId: string) {
    return `orders:tracking:${orderId}`;
  }

  emitTrackingUpdate(payload: unknown) {
    const orderId = this.readOrderId(payload);
    if (!orderId || !this.server) {
      return;
    }

    this.server
      .to(this.getOrderRoom(orderId))
      .emit('order.tracking.updated', payload);

    this.logger.debug(`Emitted live tracking update for order ${orderId}`);
  }

  private readOrderId(payload: unknown) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const orderId = (payload as { id?: unknown }).id;
    return typeof orderId === 'string' && orderId.trim().length
      ? orderId
      : null;
  }
}
