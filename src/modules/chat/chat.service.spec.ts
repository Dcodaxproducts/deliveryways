/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ChatThreadStatus, StaffPanelType } from '@prisma/client';
import { ChatService } from './chat.service';
import { ChatRealtimeService } from './chat.realtime.service';
import { ChatRepository } from './chat.repository';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: any;
  let chatRepository: jest.Mocked<ChatRepository>;
  let chatRealtimeService: jest.Mocked<ChatRealtimeService>;

  beforeEach(() => {
    prisma = {
      order: { findFirst: jest.fn() },
      branch: { findFirst: jest.fn() },
      restaurant: { findFirst: jest.fn() },
      staffUser: { findFirst: jest.fn() },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({}),
      ),
      chatThread: {
        fields: {
          lastMessageAt: 'lastMessageAt',
        },
      },
    };

    chatRepository = {
      threadInclude: {} as never,
      messageInclude: {} as never,
      createThread: jest.fn(),
      createMessage: jest.fn(),
      findThreadById: jest.fn(),
      findOpenOrderThread: jest.fn(),
      findDeliveryThreadByOrder: jest.fn(),
      buildWhere: jest.fn(),
      list: jest.fn(),
      updateThread: jest.fn(),
      count: jest.fn(),
    } as unknown as jest.Mocked<ChatRepository>;

    chatRealtimeService = {
      registerServer: jest.fn(),
      getInboxRoomsForUser: jest.fn(),
      getThreadRoom: jest.fn(),
      getUserRoom: jest.fn(),
      getTenantRoom: jest.fn(),
      getBranchRoom: jest.fn(),
      getGlobalRoom: jest.fn(),
      emitInitialSummary: jest.fn(),
      emitThreadCreated: jest.fn(),
      emitThreadUpdated: jest.fn(),
      emitMessageCreated: jest.fn(),
      emitThreadRead: jest.fn(),
    } as unknown as jest.Mocked<ChatRealtimeService>;

    service = new ChatService(prisma, chatRepository, chatRealtimeService);
  });

  it('creates an order-linked customer support thread', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });
    chatRepository.findOpenOrderThread.mockResolvedValue(null);
    chatRepository.createThread.mockResolvedValue({ id: 'thread-1' } as never);
    chatRepository.findThreadById.mockResolvedValue({
      id: 'thread-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      orderId: 'order-1',
      source: 'ORDER',
      subject: null,
      status: 'OPEN',
      assignedStaffUserId: null,
      lastMessagePreview: 'Need help with my order',
      lastMessageAt: new Date('2026-03-30T06:00:00.000Z'),
      customerLastReadAt: new Date('2026-03-30T06:00:00.000Z'),
      staffLastReadAt: null,
      resolvedAt: null,
      createdAt: new Date('2026-03-30T06:00:00.000Z'),
      updatedAt: new Date('2026-03-30T06:00:00.000Z'),
      customer: {
        id: 'customer-1',
        email: 'guest@example.com',
        isGuest: true,
        profile: {
          firstName: 'Guest',
          lastName: 'Customer',
          phone: null,
          avatarUrl: null,
        },
      },
      branch: { id: 'branch-1', name: 'Main Branch' },
      order: {
        id: 'order-1',
        status: 'PLACED',
        orderType: 'DINE_IN',
        paymentStatus: 'PENDING',
        totalAmount: { toNumber: () => 1250, valueOf: () => 1250 },
        createdAt: new Date('2026-03-30T06:00:00.000Z'),
      },
      assignedStaff: null,
      messages: [
        {
          id: 'message-1',
          threadId: 'thread-1',
          senderType: 'CUSTOMER',
          body: 'Need help with my order',
          createdAt: new Date('2026-03-30T06:00:00.000Z'),
          senderUserId: 'customer-1',
          senderStaffUserId: null,
          senderUser: {
            id: 'customer-1',
            email: 'guest@example.com',
            role: 'CUSTOMER',
            isGuest: true,
            profile: {
              firstName: 'Guest',
              lastName: 'Customer',
              avatarUrl: null,
            },
          },
          senderStaffUser: null,
        },
      ],
    } as never);

    const result = await service.createThread(
      {
        uid: 'customer-1',
        role: 'CUSTOMER' as never,
        tid: 'tenant-1',
        rid: 'restaurant-1',
      },
      {
        orderId: 'order-1',
        message: 'Need help with my order',
      },
    );

    expect(chatRepository.findOpenOrderThread).toHaveBeenCalledWith(
      'order-1',
      'customer-1',
    );
    expect(chatRepository.createThread).toHaveBeenCalled();
    expect(chatRepository.createMessage).toHaveBeenCalled();
    expect(result.data.id).toBe('thread-1');
    expect(result.data.source).toBe('ORDER');
  });

  it('blocks duplicate open order support threads for a customer', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });
    chatRepository.findOpenOrderThread.mockResolvedValue({
      id: 'thread-1',
    } as never);

    await expect(
      service.createThread(
        {
          uid: 'customer-1',
          role: 'CUSTOMER' as never,
          tid: 'tenant-1',
          rid: 'restaurant-1',
        },
        { orderId: 'order-1', message: 'Need help' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces chat permission for staff replies', async () => {
    chatRepository.findThreadById.mockResolvedValue({
      id: 'thread-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      status: 'OPEN',
      customerLastReadAt: null,
    } as never);
    prisma.staffUser.findFirst.mockResolvedValue({
      id: 'staff-1',
      staffRole: {
        id: 'role-1',
        isActive: true,
        deletedAt: null,
        permissions: [{ access: 'orders', operations: ['read'] }],
      },
    });

    await expect(
      service.reply(
        {
          uid: 'staff-1',
          role: 'STAFF' as never,
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
          panelType: StaffPanelType.BRANCH_ADMIN,
        },
        'thread-1',
        { message: 'We are checking this for you' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('marks a thread resolved for authorized staff', async () => {
    chatRepository.findThreadById.mockResolvedValue({
      id: 'thread-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
    } as never);
    prisma.staffUser.findFirst.mockResolvedValue({
      id: 'staff-1',
      staffRole: {
        id: 'role-1',
        isActive: true,
        deletedAt: null,
        permissions: [{ access: 'chat', operations: ['read', 'resolve'] }],
      },
    });
    chatRepository.updateThread.mockResolvedValue({ id: 'thread-1' } as never);
    chatRepository.findThreadById
      .mockResolvedValueOnce({
        id: 'thread-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        customerId: 'customer-1',
      } as never)
      .mockResolvedValueOnce({
        id: 'thread-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        customerId: 'customer-1',
        orderId: null,
        source: 'SUPPORT',
        subject: null,
        status: ChatThreadStatus.RESOLVED,
        assignedStaffUserId: null,
        lastMessagePreview: null,
        lastMessageAt: new Date('2026-03-30T06:00:00.000Z'),
        customerLastReadAt: null,
        staffLastReadAt: new Date('2026-03-30T06:01:00.000Z'),
        resolvedAt: new Date('2026-03-30T06:01:00.000Z'),
        createdAt: new Date('2026-03-30T06:00:00.000Z'),
        updatedAt: new Date('2026-03-30T06:01:00.000Z'),
        customer: {
          id: 'customer-1',
          email: 'guest@example.com',
          isGuest: true,
          profile: {
            firstName: 'Guest',
            lastName: 'Customer',
            phone: null,
            avatarUrl: null,
          },
        },
        branch: { id: 'branch-1', name: 'Main Branch' },
        order: null,
        assignedStaff: null,
        messages: [],
      } as never);

    const result = await service.updateStatus(
      {
        uid: 'staff-1',
        role: 'STAFF' as never,
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        panelType: StaffPanelType.BRANCH_ADMIN,
      },
      'thread-1',
      { status: ChatThreadStatus.RESOLVED },
    );

    expect(chatRepository.updateThread).toHaveBeenCalled();
    expect(result.data.status).toBe(ChatThreadStatus.RESOLVED);
  });

  it('throws when thread is missing', async () => {
    chatRepository.findThreadById.mockResolvedValue(null);

    await expect(
      service.details(
        {
          uid: 'customer-1',
          role: 'CUSTOMER' as never,
          rid: 'restaurant-1',
        },
        'missing-thread',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
