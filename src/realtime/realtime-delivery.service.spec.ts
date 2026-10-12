import { AuthUserContext } from '../common/decorators';
import {
  RealtimeEventEnvelope,
  RealtimeEventName,
  RealtimeRooms,
} from '../common/realtime/realtime-events';
import {
  DELIVERY_AUTH_CHUNK_SIZE,
  RealtimeDeliveryService,
} from './realtime-delivery.service';
import {
  RealtimeEntity,
  RealtimeSubject,
  realtimeSubjectKey,
} from './realtime-delivery-authorization.service';

type FakeSocket = {
  id: string;
  rooms: Set<string>;
  data: { user?: AuthUserContext };
  emit: jest.Mock;
  leave: jest.Mock;
  disconnect: jest.Mock;
};

const makeSocket = (
  id: string,
  rooms: string[],
  user?: AuthUserContext,
): FakeSocket => {
  const socket: FakeSocket = {
    id,
    rooms: new Set(rooms),
    data: { user },
    emit: jest.fn(),
    disconnect: jest.fn(),
    leave: jest.fn((room: string) => {
      socket.rooms.delete(room);
    }),
  };
  return socket;
};

/** In-memory server: `in(rooms).fetchSockets()` only returns members of those rooms. */
const makeServer = (all: FakeSocket[]) => {
  const fetchRooms: string[][] = [];
  const server = {
    fetchSockets: jest.fn(() => {
      throw new Error('global fetchSockets must never be used');
    }),
    in: jest.fn((rooms: string[]) => ({
      fetchSockets: () => {
        fetchRooms.push(rooms);
        return Promise.resolve(
          all.filter((socket) => rooms.some((room) => socket.rooms.has(room))),
        );
      },
    })),
  };
  return { server, fetchRooms };
};

const customer = (uid: string, ver = 1): AuthUserContext => ({
  uid,
  role: 'CUSTOMER' as AuthUserContext['role'],
  ver,
});

const orderEntity: RealtimeEntity = {
  kind: 'order',
  id: 'order-1',
  customerId: 'customer-1',
  deliverymanId: null,
  assignedStaffUserId: null,
  tenantId: 'tenant-1',
  restaurantId: 'restaurant-1',
  branchId: 'branch-1',
};
const chatEntity: RealtimeEntity = {
  ...orderEntity,
  kind: 'chat',
  id: 'thread-1',
  deliverymanId: 'deliveryman-1',
};

const envelope = (
  event: RealtimeEventName,
  payload: unknown,
): RealtimeEventEnvelope => ({
  version: 2,
  eventId: '1',
  aggregateKey: 'x:1',
  event,
  payload,
  publishedAt: new Date().toISOString(),
});

const setup = (options: {
  orderSockets?: FakeSocket[];
  chatSockets?: FakeSocket[];
  allowKeys?: (subjects: readonly RealtimeSubject[]) => Set<string>;
  orderPayload?: unknown;
  chatPayload?: unknown;
  entity?: RealtimeEntity | null;
}) => {
  let deliver: ((event: RealtimeEventEnvelope) => Promise<void>) | undefined;
  const dispatcher = {
    subscribe: jest.fn((handler: typeof deliver) => {
      deliver = handler;
      return Promise.resolve();
    }),
  };
  const order = makeServer(options.orderSockets ?? []);
  const chat = makeServer(options.chatSockets ?? []);
  const authorization = {
    resolveEntity: jest.fn((resource: { kind: 'order' | 'chat' }) =>
      Promise.resolve(
        options.entity === undefined
          ? resource.kind === 'order'
            ? orderEntity
            : chatEntity
          : options.entity,
      ),
    ),
    authorize: jest.fn((subjects: readonly RealtimeSubject[]) =>
      Promise.resolve(
        options.allowKeys
          ? options.allowKeys(subjects)
          : new Set(subjects.map((subject) => subject.key)),
      ),
    ),
  };
  const ordersService = {
    getRealtimeEventPayload: jest
      .fn()
      .mockResolvedValue(
        options.orderPayload === undefined
          ? { id: 'order-1', hydrated: true }
          : options.orderPayload,
      ),
  };
  const chatService = {
    getRealtimeEventPayload: jest
      .fn()
      .mockResolvedValue(
        options.chatPayload === undefined
          ? { threadId: 'thread-1', thread: { id: 'thread-1' } }
          : options.chatPayload,
      ),
  };
  const chatGateway = {
    server: chat.server,
    deliverInboxSummaries: jest.fn().mockResolvedValue(undefined),
  };
  const service = new RealtimeDeliveryService(
    dispatcher as never,
    { server: order.server } as never,
    chatGateway as never,
    authorization as never,
    ordersService as never,
    chatService as never,
  );
  return {
    service,
    authorization,
    ordersService,
    chatService,
    chatGateway,
    order,
    chat,
    run: async (event: RealtimeEventEnvelope) => {
      await service.onApplicationBootstrap();
      await deliver?.(event);
    },
  };
};

describe('RealtimeDeliveryService', () => {
  const trackingRoom = RealtimeRooms.orderTracking('order-1');

  it('emits the hydrated payload, not the compact intent', async () => {
    const socket = makeSocket('s1', [trackingRoom], customer('customer-1'));
    const hydrated = { id: 'order-1', timeline: [], progressPercent: 50 };
    const ctx = setup({ orderSockets: [socket], orderPayload: hydrated });
    await ctx.run(
      envelope(RealtimeEventName.ORDER_TRACKING_UPDATED, {
        id: 'order-1',
        status: 'PLACED',
      }),
    );
    expect(ctx.ordersService.getRealtimeEventPayload).toHaveBeenCalledWith(
      'order.tracking.updated',
      'order-1',
    );
    expect(socket.emit).toHaveBeenCalledWith('order.tracking.updated', {
      ...hydrated,
      eventId: '1',
    });
  });

  describe('stable event ids', () => {
    it('adds the outbox id to every order and chat payload without touching existing fields', async () => {
      const orderSocket = makeSocket(
        'o1',
        [trackingRoom],
        customer('customer-1'),
      );
      const hydrated = { id: 'order-1', status: 'PLACED', nested: { a: 1 } };
      const orders = setup({
        orderSockets: [orderSocket],
        orderPayload: hydrated,
      });
      await orders.run({
        ...envelope(RealtimeEventName.ORDER_TRACKING_UPDATED, {
          id: 'order-1',
        }),
        eventId: '42',
      });
      expect(orderSocket.emit).toHaveBeenCalledWith('order.tracking.updated', {
        ...hydrated,
        eventId: '42',
      });
      // The hydrated object itself is never mutated.
      expect(hydrated).not.toHaveProperty('eventId');

      const chatSocket = makeSocket(
        'c1',
        [RealtimeRooms.chatThread('thread-1')],
        customer('customer-1'),
      );
      const chat = setup({ chatSockets: [chatSocket] });
      await chat.run({
        ...envelope(RealtimeEventName.CHAT_THREAD_UPDATED, { id: 'thread-1' }),
        eventId: '43',
      });
      expect(chatSocket.emit).toHaveBeenCalledWith('chat.thread.updated', {
        threadId: 'thread-1',
        thread: { id: 'thread-1' },
        eventId: '43',
      });
    });

    it('carries the id on the thread-stripped chat.thread.read payload too', async () => {
      const read = { threadId: 'thread-1', customerUnreadCount: 0, thread: {} };
      const threadOnly = makeSocket(
        'thread-only',
        [RealtimeRooms.chatThread('thread-1')],
        customer('c2'),
      );
      const ctx = setup({ chatSockets: [threadOnly], chatPayload: read });
      await ctx.run({
        ...envelope(RealtimeEventName.CHAT_THREAD_READ, { id: 'thread-1' }),
        eventId: '77',
      });
      expect(threadOnly.emit).toHaveBeenCalledWith('chat.thread.read', {
        threadId: 'thread-1',
        customerUnreadCount: 0,
        eventId: '77',
      });
    });

    it('re-emits the very same id when a crash replays the event, so clients can dedupe', async () => {
      const socket = makeSocket('s1', [trackingRoom], customer('customer-1'));
      const ctx = setup({ orderSockets: [socket] });
      const replayed = {
        ...envelope(RealtimeEventName.ORDER_TRACKING_UPDATED, {
          id: 'order-1',
        }),
        eventId: '9',
      };
      await ctx.run(replayed);
      await ctx.run(replayed);
      expect(socket.emit).toHaveBeenCalledTimes(2);
      expect(socket.emit.mock.calls[1]).toEqual(socket.emit.mock.calls[0]);
      const [, emitted] = socket.emit.mock.calls[0] as [
        string,
        { eventId: string },
      ];
      expect(emitted.eventId).toBe('9');
    });
  });

  it('fetches only entity/scope room members and never calls global fetchSockets', async () => {
    const related = makeSocket('r1', [trackingRoom], customer('customer-1'));
    const unrelated = Array.from({ length: 3000 }, (_, index) =>
      makeSocket(
        'u' + index,
        ['orders:tracking:other-' + (index % 50)],
        customer('user-' + index),
      ),
    );
    const ctx = setup({ orderSockets: [related, ...unrelated] });
    await ctx.run(
      envelope(RealtimeEventName.ORDER_TRACKING_UPDATED, { id: 'order-1' }),
    );
    expect(ctx.order.server.fetchSockets).not.toHaveBeenCalled();
    expect(ctx.chat.server.fetchSockets).not.toHaveBeenCalled();
    expect(ctx.order.fetchRooms).toEqual([[trackingRoom]]);
    expect(ctx.authorization.authorize).toHaveBeenCalledTimes(1);
    const subjects = ctx.authorization.authorize.mock.calls[0][0] as unknown[];
    expect(subjects).toHaveLength(1);
    expect(related.emit).toHaveBeenCalledTimes(1);
    for (const socket of unrelated) {
      expect(socket.emit).not.toHaveBeenCalled();
      expect(socket.leave).not.toHaveBeenCalled();
      expect(socket.disconnect).not.toHaveBeenCalled();
    }
  });

  it('leaves unrelated sockets untouched even when 3000 of them share a scope room but fail entity auth', async () => {
    const scoped = Array.from({ length: 3000 }, (_, index) =>
      makeSocket(
        'p' + index,
        [RealtimeRooms.tenantOrders('tenant-1')],
        customer('passive-' + index),
      ),
    );
    const ctx = setup({
      orderSockets: scoped,
      allowKeys: () => new Set<string>(),
    });
    await ctx.run(
      envelope(RealtimeEventName.ORDER_UPDATED, {
        id: 'order-1',
        tenantId: 'tenant-1',
      }),
    );
    expect(ctx.authorization.authorize).toHaveBeenCalledTimes(
      Math.ceil(3000 / DELIVERY_AUTH_CHUNK_SIZE),
    );
    for (const call of ctx.authorization.authorize.mock.calls)
      expect((call[0] as unknown[]).length).toBeLessThanOrEqual(
        DELIVERY_AUTH_CHUNK_SIZE,
      );
    for (const socket of scoped) {
      expect(socket.emit).not.toHaveBeenCalled();
      expect(socket.disconnect).not.toHaveBeenCalled();
      // Shared scope-room membership belongs to other entities too and is never removed.
      expect(socket.leave).not.toHaveBeenCalled();
    }
  });

  it('keys authorization by socket tuple so a current and a revoked session of one uid diverge', async () => {
    const current = makeSocket(
      's-current',
      [trackingRoom],
      customer('same', 2),
    );
    const revoked = makeSocket(
      's-revoked',
      [trackingRoom],
      customer('same', 1),
    );
    const ctx = setup({
      orderSockets: [current, revoked],
      allowKeys: (subjects) =>
        new Set(
          subjects
            .filter((subject) => subject.user.ver === 2)
            .map((subject) => subject.key),
        ),
    });
    await ctx.run(
      envelope(RealtimeEventName.ORDER_TRACKING_UPDATED, { id: 'order-1' }),
    );
    const subjects = ctx.authorization.authorize.mock
      .calls[0][0] as RealtimeSubject[];
    expect(new Set(subjects.map((subject) => subject.key)).size).toBe(2);
    expect(subjects.map((subject) => subject.key)).toEqual([
      realtimeSubjectKey('s-current', customer('same', 2)),
      realtimeSubjectKey('s-revoked', customer('same', 1)),
    ]);
    expect(current.emit).toHaveBeenCalledTimes(1);
    expect(revoked.emit).not.toHaveBeenCalled();
  });

  it('removes only stale entity-room membership and never disconnects', async () => {
    const stale = makeSocket(
      'stale',
      [trackingRoom, RealtimeRooms.tenantOrders('tenant-1'), 'other-room'],
      customer('former-owner'),
    );
    const ctx = setup({
      orderSockets: [stale],
      allowKeys: () => new Set<string>(),
    });
    await ctx.run(
      envelope(RealtimeEventName.ORDER_TRACKING_UPDATED, { id: 'order-1' }),
    );
    expect(stale.leave).toHaveBeenCalledTimes(1);
    expect(stale.leave).toHaveBeenCalledWith(trackingRoom);
    expect([...stale.rooms].sort()).toEqual(
      ['orders:tenant:tenant-1', 'other-room'].sort(),
    );
    expect(stale.disconnect).not.toHaveBeenCalled();
    expect(stale.emit).not.toHaveBeenCalled();
  });

  it('routes order admin events to tenant, restaurant and branch rooms only', async () => {
    const ctx = setup({ orderSockets: [] });
    await ctx.run(
      envelope(RealtimeEventName.ORDER_STATUS_UPDATED, { id: 'order-1' }),
    );
    expect(ctx.order.fetchRooms).toEqual([
      [
        'orders:tenant:tenant-1',
        'orders:restaurant:restaurant-1',
        'orders:restaurant:restaurant-1:branch:branch-1',
      ],
    ]);
  });

  it('keeps impossible missing payloads retrying but resolves proven deleted entities', async () => {
    const missingPayload = setup({ orderPayload: null });
    await expect(
      missingPayload.run(
        envelope(RealtimeEventName.ORDER_UPDATED, { id: 'order-1' }),
      ),
    ).rejects.toThrow('payload unavailable for existing entity');
    expect(missingPayload.order.server.in).not.toHaveBeenCalled();

    const noEntity = setup({ entity: null });
    await noEntity.run(
      envelope(RealtimeEventName.ORDER_UPDATED, { id: 'order-1' }),
    );
    expect(noEntity.order.server.in).not.toHaveBeenCalled();
  });

  it('rejects malformed intents so they remain visible for retry', async () => {
    const ctx = setup({});
    await expect(
      ctx.run(envelope(RealtimeEventName.ORDER_UPDATED, {})),
    ).rejects.toThrow('malformed order outbox intent');
    await expect(
      ctx.run(envelope(RealtimeEventName.CHAT_THREAD_UPDATED, {})),
    ).rejects.toThrow('malformed chat outbox intent');
  });

  it('explicitly resolves deleted entities without emitting', async () => {
    const gone = setup({ entity: null });
    await expect(
      gone.run(envelope(RealtimeEventName.ORDER_UPDATED, { id: 'order-1' })),
    ).resolves.toBeUndefined();
    expect(gone.order.server.in).not.toHaveBeenCalled();
  });

  it('propagates hydration and authorization failures so the outbox retries', async () => {
    const hydration = setup({});
    hydration.ordersService.getRealtimeEventPayload.mockRejectedValue(
      new Error('db down'),
    );
    await expect(
      hydration.run(
        envelope(RealtimeEventName.ORDER_UPDATED, { id: 'order-1' }),
      ),
    ).rejects.toThrow('db down');

    const socket = makeSocket('s', [trackingRoom], customer('customer-1'));
    const auth = setup({ orderSockets: [socket] });
    auth.authorization.authorize.mockRejectedValue(new Error('auth db down'));
    await expect(
      auth.run(
        envelope(RealtimeEventName.ORDER_TRACKING_UPDATED, { id: 'order-1' }),
      ),
    ).rejects.toThrow('auth db down');
    expect(socket.emit).not.toHaveBeenCalled();
  });

  describe('chat', () => {
    const threadRoom = RealtimeRooms.chatThread('thread-1');
    const inbox = RealtimeRooms.chatTenant('tenant-1');

    it('hydrates through the Chat service using thread and message ids from the intent', async () => {
      const ctx = setup({ chatSockets: [] });
      await ctx.run(
        envelope(RealtimeEventName.CHAT_MESSAGE_CREATED, {
          threadId: 'thread-1',
          message: { id: 'message-9' },
        }),
      );
      expect(ctx.chatService.getRealtimeEventPayload).toHaveBeenCalledWith(
        'chat.message.created',
        'thread-1',
        'message-9',
      );
      expect(ctx.chat.fetchRooms[0]).toEqual([
        threadRoom,
        RealtimeRooms.chatCustomer('customer-1'),
        RealtimeRooms.chatTenant('tenant-1'),
        RealtimeRooms.chatGlobal(),
        RealtimeRooms.chatDeliveryman('deliveryman-1'),
        RealtimeRooms.chatBranch('branch-1'),
      ]);
    });

    it.each([
      RealtimeEventName.CHAT_THREAD_CREATED,
      RealtimeEventName.CHAT_THREAD_UPDATED,
      RealtimeEventName.CHAT_MESSAGE_CREATED,
      RealtimeEventName.CHAT_THREAD_READ,
    ])('emits legacy inbox summaries after %s delivery', async (event) => {
      const thread = { id: 'thread-1' };
      const payload = { threadId: 'thread-1', thread };
      const ctx = setup({ chatSockets: [], chatPayload: payload });
      await ctx.run(envelope(event, { id: 'thread-1' }));
      expect(ctx.chatGateway.deliverInboxSummaries).toHaveBeenCalledWith(
        thread,
      );
      expect(ctx.chatGateway.deliverInboxSummaries).toHaveBeenCalledTimes(1);
    });

    it('uses the compact thread id for thread events', async () => {
      const ctx = setup({ chatSockets: [] });
      await ctx.run(
        envelope(RealtimeEventName.CHAT_THREAD_UPDATED, { id: 'thread-1' }),
      );
      expect(ctx.chatService.getRealtimeEventPayload).toHaveBeenCalledWith(
        'chat.thread.updated',
        'thread-1',
        undefined,
      );
    });

    it('sends each socket one copy and strips the thread only for thread-room-only read sockets', async () => {
      const read = {
        threadId: 'thread-1',
        customerUnreadCount: 0,
        staffUnreadCount: 0,
        customerLastReadAt: null,
        staffLastReadAt: null,
        thread: { id: 'thread-1' },
      };
      const both = makeSocket(
        'both',
        [threadRoom, inbox],
        customer('customer-1'),
      );
      const threadOnly = makeSocket(
        'thread-only',
        [threadRoom],
        customer('c2'),
      );
      const ctx = setup({ chatSockets: [both, threadOnly], chatPayload: read });
      await ctx.run(
        envelope(RealtimeEventName.CHAT_THREAD_READ, { id: 'thread-1' }),
      );
      expect(both.emit).toHaveBeenCalledTimes(1);
      expect(both.emit).toHaveBeenCalledWith('chat.thread.read', {
        ...read,
        eventId: '1',
      });
      expect(threadOnly.emit).toHaveBeenCalledTimes(1);
      const { thread: _omitted, ...stripped } = read;
      void _omitted;
      expect(threadOnly.emit).toHaveBeenCalledWith('chat.thread.read', {
        ...stripped,
        eventId: '1',
      });
    });

    it('drops stale thread-room membership after reassignment but keeps inbox membership', async () => {
      const stale = makeSocket('stale', [threadRoom, inbox], customer('old'));
      const ctx = setup({
        chatSockets: [stale],
        allowKeys: () => new Set<string>(),
      });
      await ctx.run(
        envelope(RealtimeEventName.CHAT_THREAD_UPDATED, { id: 'thread-1' }),
      );
      expect(stale.leave).toHaveBeenCalledTimes(1);
      expect(stale.leave).toHaveBeenCalledWith(threadRoom);
      expect(stale.rooms.has(inbox)).toBe(true);
      expect(stale.disconnect).not.toHaveBeenCalled();
    });
  });
});
