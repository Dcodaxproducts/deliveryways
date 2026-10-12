import { RealtimeDeliveryService } from './realtime-delivery.service';
import { RealtimeEventName } from '../common/realtime/realtime-events';

describe('RealtimeDeliveryService', () => {
  it('reauthorizes one entity in a bounded batch and emits only to current principals', async () => {
    let subscriber: ((event: never) => Promise<void>) | undefined;
    const eventBus = {
      subscribe: jest.fn((handler: (event: never) => Promise<void>) => {
        subscriber = handler;
        return Promise.resolve();
      }),
    };
    const allowedEmit = jest.fn();
    const revokedEmit = jest.fn();
    const revokedDisconnect = jest.fn();
    const sockets = [
      {
        data: { user: { uid: 'current', role: 'CUSTOMER', ver: 1 } },
        emit: allowedEmit,
        disconnect: jest.fn(),
      },
      {
        data: { user: { uid: 'old-assignee', role: 'DELIVERYMAN', ver: 1 } },
        emit: revokedEmit,
        disconnect: revokedDisconnect,
      },
    ];
    const server = { fetchSockets: jest.fn().mockResolvedValue(sockets) };
    const authorization = {
      authorize: jest.fn().mockResolvedValue(new Set(['current'])),
    };
    const service = new RealtimeDeliveryService(
      eventBus as never,
      { server } as never,
      { server } as never,
      authorization as never,
    );
    await service.onApplicationBootstrap();
    await subscriber?.({
      version: 2,
      eventId: 'event-1',
      aggregateKey: 'order:order-1',
      event: RealtimeEventName.ORDER_TRACKING_UPDATED,
      payload: { id: 'order-1' },
      publishedAt: new Date().toISOString(),
    } as never);
    expect(authorization.authorize).toHaveBeenCalledTimes(1);
    expect(allowedEmit).toHaveBeenCalledWith('order.tracking.updated', {
      id: 'order-1',
    });
    expect(revokedEmit).not.toHaveBeenCalled();
    expect(revokedDisconnect).toHaveBeenCalledWith(true);
  });

  it('uses compact chat thread identifiers for delivery-time authorization', async () => {
    let subscriber: ((event: never) => Promise<void>) | undefined;
    const eventBus = {
      subscribe: jest.fn((handler: (event: never) => Promise<void>) => {
        subscriber = handler;
        return Promise.resolve();
      }),
    };
    const server = { fetchSockets: jest.fn().mockResolvedValue([]) };
    const authorization = { authorize: jest.fn().mockResolvedValue(new Set()) };
    const service = new RealtimeDeliveryService(
      eventBus as never,
      { server } as never,
      { server } as never,
      authorization as never,
    );
    await service.onApplicationBootstrap();
    await subscriber?.({
      version: 2,
      eventId: 'event-2',
      aggregateKey: 'chat:thread-1',
      event: RealtimeEventName.CHAT_MESSAGE_CREATED,
      payload: { threadId: 'thread-1', message: { id: 'message-1' } },
      publishedAt: new Date().toISOString(),
    } as never);
    expect(authorization.authorize).toHaveBeenCalledWith([], {
      kind: 'chat',
      id: 'thread-1',
    });
  });
  it('bounds reauthorization to one batch for thousands of passive sockets', async () => {
    let subscriber: ((event: never) => Promise<void>) | undefined;
    const eventBus = {
      subscribe: jest.fn((handler: (event: never) => Promise<void>) => {
        subscriber = handler;
        return Promise.resolve();
      }),
    };
    const sockets = Array.from({ length: 3000 }, (_, index) => ({
      data: { user: { uid: 'user-' + index, role: 'DELIVERYMAN', ver: 1 } },
      emit: jest.fn(),
      disconnect: jest.fn(),
    }));
    const server = { fetchSockets: jest.fn().mockResolvedValue(sockets) };
    let authorizedUsersLength = 0;
    const authorization = {
      authorize: jest.fn((users: unknown[]) => {
        authorizedUsersLength = users.length;
        return Promise.resolve(new Set<string>());
      }),
    };
    const service = new RealtimeDeliveryService(
      eventBus as never,
      { server } as never,
      { server } as never,
      authorization as never,
    );
    await service.onApplicationBootstrap();
    await subscriber?.({
      version: 2,
      eventId: 'stress',
      aggregateKey: 'order:one',
      event: RealtimeEventName.ORDER_UPDATED,
      payload: { id: 'one' },
      publishedAt: new Date().toISOString(),
    } as never);
    expect(authorization.authorize).toHaveBeenCalledTimes(1);
    expect(authorizedUsersLength).toBe(3000);
    expect(sockets.every((socket) => socket.emit.mock.calls.length === 0)).toBe(
      true,
    );
    expect(
      sockets.every((socket) => socket.disconnect.mock.calls.length === 1),
    ).toBe(true);
  });
});
