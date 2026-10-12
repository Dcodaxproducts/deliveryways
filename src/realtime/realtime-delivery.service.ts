import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ChatRealtimeService } from '../modules/chat/public-api';
import { RealtimeEventBusService } from '../common/realtime/realtime-event-bus.service';
import {
  RealtimeEventEnvelope,
  RealtimeEventName,
  RealtimeRooms,
} from '../common/realtime/realtime-events';
import { OrderTrackingGateway } from './gateways/order-tracking.gateway';

type OrderRoomPayload = {
  id?: unknown;
  tenantId?: unknown;
  restaurantId?: unknown;
  branchId?: unknown;
};

@Injectable()
export class RealtimeDeliveryService implements OnApplicationBootstrap {
  constructor(
    private readonly eventBus: RealtimeEventBusService,
    private readonly orderGateway: OrderTrackingGateway,
    private readonly chatRealtime: ChatRealtimeService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.eventBus.subscribe((event) => this.deliver(event));
  }

  private async deliver(envelope: RealtimeEventEnvelope): Promise<void> {
    if (envelope.event.startsWith('chat.')) {
      await this.chatRealtime.deliverEvent(envelope.event, envelope.payload);
      return;
    }
    const payload = envelope.payload as OrderRoomPayload;
    if (envelope.event === RealtimeEventName.ORDER_TRACKING_UPDATED) {
      if (typeof payload?.id === 'string') {
        this.orderGateway.server.local
          .to(RealtimeRooms.orderTracking(payload.id))
          .emit(envelope.event, envelope.payload);
      }
      return;
    }
    if (
      typeof payload?.tenantId !== 'string' ||
      typeof payload.restaurantId !== 'string' ||
      typeof payload.branchId !== 'string'
    ) {
      return;
    }
    this.orderGateway.server.local
      .to(RealtimeRooms.tenantOrders(payload.tenantId))
      .to(RealtimeRooms.restaurantOrders(payload.restaurantId))
      .to(RealtimeRooms.branchOrders(payload.restaurantId, payload.branchId))
      .emit(envelope.event, envelope.payload);
  }
}
