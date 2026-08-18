import type { Server } from 'socket.io';
import {
  NotificationsRealtimeService,
  OrderCreatedRealtimePayload,
  OrderUpdatedRealtimePayload,
  OrderUpdatedRealtimePayload,
} from './notifications-realtime.service';

describe('NotificationsRealtimeService', () => {
  it('emits a new order to the restaurant and branch rooms', () => {
    const emit = jest.fn();
    const branchTarget = { emit };
    const restaurantTarget = {
      to: jest.fn().mockReturnValue(branchTarget),
    };
    const server = {
      to: jest.fn().mockReturnValue(restaurantTarget),
    };
    const service = new NotificationsRealtimeService();
    const payload: OrderCreatedRealtimePayload = {
      id: 'order-1',
      status: 'PLACED',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      orderType: 'DELIVERY',
      paymentStatus: 'PENDING',
      totalAmount: 42.5,
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
    };

    service.registerServer(server as unknown as Server);
    service.emitOrderCreated(payload);

    expect(server.to).toHaveBeenCalledWith('orders:restaurant:restaurant-1');
    expect(restaurantTarget.to).toHaveBeenCalledWith(
      'orders:restaurant:restaurant-1:branch:branch-1',
    );
    expect(emit).toHaveBeenCalledWith('order.created', payload);
  });

  it('does nothing until the Socket.IO server is registered', () => {
    const service = new NotificationsRealtimeService();

    expect(() =>
      service.emitOrderCreated({
        id: 'order-1',
        status: 'PLACED',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        orderType: 'PICKUP',
        paymentStatus: 'PAID',
        totalAmount: 10,
        createdAt: new Date(),
      }),
    ).not.toThrow();
  });

  it('emits order status updates to the same scoped rooms', () => {
    const emit = jest.fn();
    const branchTarget = { emit };
    const restaurantTarget = {
      to: jest.fn().mockReturnValue(branchTarget),
    };
    const server = {
      to: jest.fn().mockReturnValue(restaurantTarget),
    };
    const service = new NotificationsRealtimeService();
    const payload = {
      id: 'order-1',
      status: 'REJECTED',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      updatedAt: new Date('2026-07-31T07:00:00.000Z'),
    };

    service.registerServer(server as unknown as Server);
    service.emitOrderStatusUpdated(payload);

    expect(emit).toHaveBeenCalledWith('order.status.updated', payload);
  });

  it('emits order updates to the restaurant and branch rooms', () => {
    const emit = jest.fn();
    const branchTarget = { emit };
    const restaurantTarget = {
      to: jest.fn().mockReturnValue(branchTarget),
    };
    const server = {
      to: jest.fn().mockReturnValue(restaurantTarget),
    };
    const service = new NotificationsRealtimeService();
    const payload: OrderUpdatedRealtimePayload = {
      id: 'order-1',
      status: 'CONFIRMED',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      paymentStatus: 'PAID',
      updatedAt: new Date('2026-08-18T09:00:00.000Z'),
    };

    service.registerServer(server as unknown as Server);
    service.emitOrderUpdated(payload);

    expect(server.to).toHaveBeenCalledWith('orders:restaurant:restaurant-1');
    expect(restaurantTarget.to).toHaveBeenCalledWith(
      'orders:restaurant:restaurant-1:branch:branch-1',
    );
    expect(emit).toHaveBeenCalledWith('order.updated', payload);
  });
});
