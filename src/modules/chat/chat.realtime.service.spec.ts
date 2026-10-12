import { UserRoleEnum } from '../../common/enums';
import { RealtimeEventName } from '../../common/realtime/realtime-events';
import { ChatRealtimeService } from './chat.realtime.service';

describe('ChatRealtimeService room isolation', () => {
  const createService = () => {
    const eventBus = { publish: jest.fn() };
    const repository = {};
    return {
      eventBus,
      service: new ChatRealtimeService(repository as never, eventBus as never),
    };
  };

  it('derives customer, branch, and tenant rooms only from signed JWT claims', () => {
    const { service } = createService();
    expect(
      service.getInboxRoomsForUser({
        uid: 'customer-1',
        role: UserRoleEnum.CUSTOMER,
      }),
    ).toEqual(['chat:user:customer-1']);
    expect(
      service.getInboxRoomsForUser({
        uid: 'branch-admin-1',
        role: UserRoleEnum.BRANCH_ADMIN,
        rid: 'restaurant-1',
        bid: 'branch-1',
      }),
    ).toEqual(['chat:branch:branch-1']);
    expect(
      service.getInboxRoomsForUser({
        uid: 'business-admin-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
      }),
    ).toEqual(['chat:tenant:tenant-1']);
  });

  it('does not grant a global fallback room to incomplete or unsupported claims', () => {
    const { service } = createService();
    expect(
      service.getInboxRoomsForUser({
        uid: 'staff-1',
        role: UserRoleEnum.STAFF,
      }),
    ).toEqual([]);
    expect(
      service.getInboxRoomsForUser({
        uid: 'branch-admin-1',
        role: UserRoleEnum.BRANCH_ADMIN,
      }),
    ).toEqual([]);
  });

  it('publishes existing chat event names without requiring an in-process server', async () => {
    const { service, eventBus } = createService();
    const thread = {
      id: 'thread-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      orderId: null,
      deliverymanId: null,
      source: 'CUSTOMER',
      subject: null,
      status: 'OPEN',
      assignedStaffUserId: null,
      lastMessagePreview: null,
      lastMessageAt: new Date(),
      customerUnreadCount: 0,
      staffUnreadCount: 1,
      customerLastReadAt: null,
      staffLastReadAt: null,
      resolvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      customer: {},
      branch: {},
      order: null,
      assignedStaff: null,
      deliveryman: null,
    };
    await service.emitThreadCreated(thread);
    expect(eventBus.publish).toHaveBeenCalledWith(
      RealtimeEventName.CHAT_THREAD_CREATED,
      thread,
    );
  });

  it('computes exact legacy summaries once for every affected inbox scope', async () => {
    const repository = {
      buildWhere: jest.fn((value: unknown) => value),
      count: jest.fn().mockResolvedValue(7),
    };
    const service = new ChatRealtimeService(
      repository as never,
      { publish: jest.fn() } as never,
    );
    const summaries = await service.getInboxSummariesForThread({
      id: 'thread-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      orderId: null,
      deliverymanId: 'driver-1',
      source: 'CUSTOMER',
      subject: null,
      status: 'OPEN',
      assignedStaffUserId: null,
      lastMessagePreview: null,
      lastMessageAt: new Date(),
      customerUnreadCount: 0,
      staffUnreadCount: 0,
      customerLastReadAt: null,
      staffLastReadAt: null,
      resolvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      customer: {},
      branch: {},
      order: null,
      assignedStaff: null,
      deliveryman: {},
    });
    expect(summaries).toEqual(
      [
        ['chat:user:customer-1', 'customer'],
        ['chat:deliveryman:driver-1', 'deliveryman'],
        ['chat:tenant:tenant-1', 'tenant'],
        ['chat:global', 'global'],
        ['chat:branch:branch-1', 'branch'],
      ].map(([room, scope]) => ({
        room,
        summary: {
          scope,
          total: 7,
          open: 7,
          inProgress: 7,
          resolved: 7,
          unread: 7,
        },
      })),
    );
    expect(repository.count).toHaveBeenCalledTimes(25);
  });
});
