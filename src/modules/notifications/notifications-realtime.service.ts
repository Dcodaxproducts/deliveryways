import { Injectable } from '@nestjs/common';
import { RealtimeEventBusService } from '../../common/realtime/realtime-event-bus.service';
import {
  RealtimeEventName,
  RealtimeRooms,
} from '../../common/realtime/realtime-events';

export interface OrderCreatedRealtimePayload {
  id: string;
  status: string;
  tenantId: string;
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
  tenantId: string;
  restaurantId: string;
  branchId: string;
  updatedAt: Date;
}

export interface OrderUpdatedRealtimePayload {
  id: string;
  status: string;
  tenantId: string;
  restaurantId: string;
  branchId: string;
  paymentStatus: string;
  updatedAt: Date;
}

export interface OrderUpdatedRealtimePayload {
  id: string;
  status: string;
  tenantId: string;
  restaurantId: string;
  branchId: string;
  paymentStatus: string;
  updatedAt: Date;
}

@Injectable()
export class NotificationsRealtimeService {
  constructor(private readonly eventBus: RealtimeEventBusService) {}

  getRestaurantOrdersRoom(restaurantId: string) {
    return RealtimeRooms.restaurantOrders(restaurantId);
  }

  getTenantOrdersRoom(tenantId: string) {
    return RealtimeRooms.tenantOrders(tenantId);
  }

  getBranchOrdersRoom(restaurantId: string, branchId: string) {
    return RealtimeRooms.branchOrders(restaurantId, branchId);
  }

  emitOrderCreated(payload: OrderCreatedRealtimePayload) {
    this.eventBus.publish(RealtimeEventName.ORDER_CREATED, payload);
  }

  emitOrderStatusUpdated(payload: OrderStatusRealtimePayload) {
    this.eventBus.publish(RealtimeEventName.ORDER_STATUS_UPDATED, payload);
  }

  emitOrderUpdated(payload: OrderUpdatedRealtimePayload) {
    this.eventBus.publish(RealtimeEventName.ORDER_UPDATED, payload);
  }
}
