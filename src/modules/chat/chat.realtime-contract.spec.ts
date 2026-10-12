import { RealtimeEventName } from '../../common/realtime/realtime-events';
import { ChatRealtimeService } from './chat.realtime.service';
import { ChatService } from './chat.service';

const at = (minute: number) => new Date(Date.UTC(2026, 9, 12, 10, minute));

const message = (id: string, minute: number) => ({
  id,
  threadId: 'thread-1',
  senderType: 'CUSTOMER',
  body: 'body ' + id,
  createdAt: at(minute),
  senderUserId: 'customer-1',
  senderStaffUserId: null,
  senderDeliverymanId: null,
  senderUser: {
    id: 'customer-1',
    role: 'CUSTOMER',
    email: 'c@example.com',
    isGuest: false,
    profile: { firstName: 'Cee', lastName: 'Customer', avatarUrl: null },
  },
  senderStaffUser: null,
  senderDeliveryman: null,
});

const threadRow = {
  id: 'thread-1',
  tenantId: 'tenant-1',
  restaurantId: 'restaurant-1',
  branchId: 'branch-1',
  customerId: 'customer-1',
  orderId: 'order-1',
  deliverymanId: null,
  source: 'CUSTOMER',
  subject: 'Where is my order?',
  status: 'OPEN',
  assignedStaffUserId: null,
  lastMessagePreview: 'body m2',
  lastMessageAt: at(2),
  customerUnreadCount: 0,
  staffUnreadCount: 2,
  customerLastReadAt: at(2),
  staffLastReadAt: null,
  resolvedAt: null,
  createdAt: at(0),
  updatedAt: at(2),
  customer: {
    id: 'customer-1',
    email: 'c@example.com',
    isGuest: false,
    profile: {
      firstName: 'Cee',
      lastName: 'Customer',
      phone: null,
      avatarUrl: null,
    },
  },
  branch: { id: 'branch-1', name: 'Main' },
  order: {
    id: 'order-1',
    status: 'PLACED',
    orderType: 'DELIVERY',
    paymentStatus: 'PENDING',
    totalAmount: 12.5,
    createdAt: at(0),
  },
  assignedStaff: null,
  deliveryman: null,
  messages: [message('m1', 1), message('m2', 2)],
};

const setup = (thread: unknown = threadRow) => {
  const eventBus = { publish: jest.fn() };
  const repository = { findThreadById: jest.fn().mockResolvedValue(thread) };
  const realtime = new ChatRealtimeService(
    repository as never,
    eventBus as never,
  );
  const service = new ChatService({} as never, repository as never, realtime);
  const published = (event: string): unknown =>
    (eventBus.publish.mock.calls as Array<[string, unknown]>).find(
      (call) => call[0] === event,
    )?.[1];
  return { service, realtime, eventBus, repository, published };
};

type MessagePayload = {
  threadId: string;
  message: { id: string };
  thread: { id: string };
};
const asMessage = (payload: unknown): MessagePayload =>
  payload as MessagePayload;

/** Publishes through the existing emit* path to capture the established socket schema. */
const existingSchema = async (event: string, thread: unknown) => {
  const { service, realtime, published } = setup(thread);
  const details = (await service.getRealtimeEventPayload(
    'chat.thread.created',
    'thread-1',
  )) as Parameters<ChatRealtimeService['emitThreadCreated']>[0];
  await realtime.emitThreadCreated(details);
  await realtime.emitThreadUpdated(details);
  await realtime.emitMessageCreated(details);
  await realtime.emitThreadRead(details);
  return published(event);
};

describe('ChatService realtime payload contracts', () => {
  it.each([
    [RealtimeEventName.CHAT_THREAD_CREATED],
    [RealtimeEventName.CHAT_THREAD_UPDATED],
  ])('%s is the full thread details object', async (event) => {
    const { service } = setup();
    const payload = await service.getRealtimeEventPayload(event, 'thread-1');
    expect(payload).toEqual(await existingSchema(event, threadRow));
    expect(payload).toMatchObject({
      id: 'thread-1',
      customer: { id: 'customer-1', firstName: 'Cee' },
      order: { id: 'order-1', totalAmount: 12.5 },
      unreadForStaff: true,
      unreadForCustomer: false,
    });
    expect((payload as { messages: unknown[] }).messages).toHaveLength(2);
  });

  it('chat.message.created is { threadId, message, thread } with the message the intent names', async () => {
    const { service } = setup();
    const payload = asMessage(
      await service.getRealtimeEventPayload(
        'chat.message.created',
        'thread-1',
        'm1',
      ),
    );
    expect(Object.keys(payload).sort()).toEqual([
      'message',
      'thread',
      'threadId',
    ]);
    expect(payload.threadId).toBe('thread-1');
    expect(payload.message.id).toBe('m1');
    expect(payload.message).toMatchObject({
      senderType: 'CUSTOMER',
      sender: { id: 'customer-1', firstName: 'Cee' },
    });
    expect(payload.thread.id).toBe('thread-1');
  });

  it('chat.message.created falls back to the latest message exactly like the existing emitter', async () => {
    const { service } = setup();
    const payload = await service.getRealtimeEventPayload(
      'chat.message.created',
      'thread-1',
    );
    expect(payload).toEqual(
      await existingSchema(RealtimeEventName.CHAT_MESSAGE_CREATED, threadRow),
    );
    expect(asMessage(payload).message.id).toBe('m2');
    const unknown = await service.getRealtimeEventPayload(
      'chat.message.created',
      'thread-1',
      'missing',
    );
    expect(asMessage(unknown).message.id).toBe('m2');
  });

  it('chat.thread.read matches the existing read payload including the embedded thread', async () => {
    const { service } = setup();
    const payload = await service.getRealtimeEventPayload(
      'chat.thread.read',
      'thread-1',
    );
    expect(payload).toEqual(
      await existingSchema(RealtimeEventName.CHAT_THREAD_READ, threadRow),
    );
    expect(Object.keys(payload as object).sort()).toEqual([
      'customerLastReadAt',
      'customerUnreadCount',
      'staffLastReadAt',
      'staffUnreadCount',
      'thread',
      'threadId',
    ]);
  });

  it('returns null when the thread is gone or has no messages for a message event', async () => {
    expect(
      await setup(null).service.getRealtimeEventPayload(
        'chat.thread.updated',
        'gone',
      ),
    ).toBeNull();
    expect(
      await setup({
        ...threadRow,
        messages: [],
      }).service.getRealtimeEventPayload('chat.message.created', 'thread-1'),
    ).toBeNull();
  });
});
