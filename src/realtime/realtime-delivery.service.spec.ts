import { RealtimeDeliveryService } from './realtime-delivery.service';
import { RealtimeEventName } from '../common/realtime/realtime-events';

describe('RealtimeDeliveryService', () => {
  const setup = () => {
    let subscriber:
      | ((event: {
          version: 1;
          event: (typeof RealtimeEventName)[keyof typeof RealtimeEventName];
          payload: unknown;
          publishedAt: string;
        }) => Promise<void> | void)
      | undefined;
    const eventBus = {
      subscribe: jest.fn((handler: typeof subscriber) => {
        subscriber = handler;
        return Promise.resolve();
      }),
    };
    const emit = jest.fn();
    const target = { to: jest.fn(), emit };
    target.to.mockReturnValue(target);
    const local = { to: jest.fn().mockReturnValue(target) };
    const orderGateway = { server: { local } };
    const chatRealtime = {
      deliverEvent: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RealtimeDeliveryService(
      eventBus as never,
      orderGateway as never,
      chatRealtime as never,
    );
    return {
      service,
      eventBus,
      orderGateway,
      chatRealtime,
      emit,
      target,
      getSubscriber: () => subscriber,
    };
  };

  it('fans one order event only to its authenticated tenant, restaurant, and branch rooms', async () => {
    const context = setup();
    await context.service.onApplicationBootstrap();
    const payload = {
      id: 'order-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    };
    await context.getSubscriber()?.({
      version: 1,
      event: RealtimeEventName.ORDER_CREATED,
      payload,
      publishedAt: '2026-10-13T00:00:00.000Z',
    });
    expect(context.orderGateway.server.local.to).toHaveBeenCalledWith(
      'orders:tenant:tenant-1',
    );
    expect(context.target.to).toHaveBeenNthCalledWith(
      1,
      'orders:restaurant:restaurant-1',
    );
    expect(context.target.to).toHaveBeenNthCalledWith(
      2,
      'orders:restaurant:restaurant-1:branch:branch-1',
    );
    expect(context.emit).toHaveBeenCalledTimes(1);
    expect(context.emit).toHaveBeenCalledWith('order.created', payload);
  });

  it('delivers tracking instantly only to the requested order room', async () => {
    const context = setup();
    await context.service.onApplicationBootstrap();
    const payload = { id: 'order-42', status: 'ON_THE_WAY' };
    await context.getSubscriber()?.({
      version: 1,
      event: RealtimeEventName.ORDER_TRACKING_UPDATED,
      payload,
      publishedAt: '2026-10-13T00:00:00.000Z',
    });
    expect(context.orderGateway.server.local.to).toHaveBeenCalledWith(
      'orders:tracking:order-42',
    );
    expect(context.emit).toHaveBeenCalledWith(
      'order.tracking.updated',
      payload,
    );
  });

  it('routes chat events through the chat authorization-aware delivery service', async () => {
    const context = setup();
    await context.service.onApplicationBootstrap();
    const payload = { id: 'thread-1', customerId: 'customer-1' };
    await context.getSubscriber()?.({
      version: 1,
      event: RealtimeEventName.CHAT_THREAD_UPDATED,
      payload,
      publishedAt: '2026-10-13T00:00:00.000Z',
    });
    expect(context.chatRealtime.deliverEvent).toHaveBeenCalledWith(
      'chat.thread.updated',
      payload,
    );
    expect(context.emit).not.toHaveBeenCalled();
  });

  it('rejects malformed scoped order events without leaking to any room', async () => {
    const context = setup();
    await context.service.onApplicationBootstrap();
    await context.getSubscriber()?.({
      version: 1,
      event: RealtimeEventName.ORDER_UPDATED,
      payload: { id: 'order-1', tenantId: 'tenant-1' },
      publishedAt: '2026-10-13T00:00:00.000Z',
    });
    expect(context.orderGateway.server.local.to).not.toHaveBeenCalled();
    expect(context.emit).not.toHaveBeenCalled();
  });
});
