import { Injectable } from '@nestjs/common';
import { RealtimeEventBusService } from '../../common/realtime/realtime-event-bus.service';
import {
  RealtimeEventName,
  RealtimeRooms,
} from '../../common/realtime/realtime-events';

@Injectable()
export class OrderTrackingRealtimeService {
  constructor(private readonly eventBus: RealtimeEventBusService) {}

  getOrderRoom(orderId: string) {
    return RealtimeRooms.orderTracking(orderId);
  }

  emitTrackingUpdate(payload: unknown) {
    const orderId = this.readOrderId(payload);
    if (!orderId) return;
    this.eventBus.publish(RealtimeEventName.ORDER_TRACKING_UPDATED, payload);
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
