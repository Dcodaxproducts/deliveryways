import {
  NotificationsRealtimeService,
  OrderCreatedRealtimePayload,
  OrderUpdatedRealtimePayload,
} from './notifications-realtime.service';
import { RealtimeEventName } from '../../common/realtime/realtime-events';

describe('NotificationsRealtimeService', () => {
  const createService = () => {
    const eventBus = { publish: jest.fn() };
    return {
      eventBus,
      service: new NotificationsRealtimeService(eventBus as never),
    };
  };

  it('publishes order creation without requiring an in-process namespace', () => {
    const { service, eventBus } = createService();
    const payload: OrderCreatedRealtimePayload = {
      id: 'order-1',
      status: 'PLACED',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      orderType: 'DELIVERY',
      paymentStatus: 'PENDING',
      totalAmount: 42.5,
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
    };
    service.emitOrderCreated(payload);
    expect(eventBus.publish).toHaveBeenCalledWith(
      RealtimeEventName.ORDER_CREATED,
      payload,
    );
  });

  it('publishes status and general order updates with existing event names', () => {
    const { service, eventBus } = createService();
    const statusPayload = {
      id: 'order-1',
      status: 'REJECTED',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      updatedAt: new Date('2026-07-31T07:00:00.000Z'),
    };
    const updatedPayload: OrderUpdatedRealtimePayload = {
      ...statusPayload,
      paymentStatus: 'PAID',
    };
    service.emitOrderStatusUpdated(statusPayload);
    service.emitOrderUpdated(updatedPayload);
    expect(eventBus.publish).toHaveBeenNthCalledWith(
      1,
      RealtimeEventName.ORDER_STATUS_UPDATED,
      statusPayload,
    );
    expect(eventBus.publish).toHaveBeenNthCalledWith(
      2,
      RealtimeEventName.ORDER_UPDATED,
      updatedPayload,
    );
  });
});
