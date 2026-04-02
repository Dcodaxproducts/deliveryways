import { BadRequestException } from '@nestjs/common';
import { GroupOrderParticipantStatus } from '@prisma/client';
import { OrderTypeEnum, UserRoleEnum } from '../../common/enums';
import { GroupOrdersService } from './group-orders.service';

describe('GroupOrdersService', () => {
  const makeService = () => {
    const groupOrdersRepository = {
      findActiveBranch: jest.fn(),
      findActiveSessionByHost: jest.fn(),
      findOwnedAddress: jest.fn(),
      createSession: jest.fn(),
      updateSession: jest.fn(),
      findSessionByInviteCode: jest.fn(),
      findParticipant: jest.fn(),
      createParticipant: jest.fn(),
      updateParticipant: jest.fn(),
      findSessionById: jest.fn(),
      findMenuItemsForResponse: jest.fn(),
    };

    const ordersService = {
      create: jest.fn(),
      quote: jest.fn(),
      quoteForCouponValidation: jest.fn(),
    };

    const service = new GroupOrdersService(
      groupOrdersRepository as never,
      ordersService as never,
    );

    return { service, groupOrdersRepository, ordersService };
  };

  const customerUser = {
    uid: 'customer-1',
    tid: 'tenant-1',
    rid: 'restaurant-1',
    role: UserRoleEnum.CUSTOMER,
  };

  it('blocks creating a new group order when host already has an active session', async () => {
    const { service, groupOrdersRepository } = makeService();
    groupOrdersRepository.findActiveBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
    });
    groupOrdersRepository.findActiveSessionByHost.mockResolvedValue({
      id: 'session-1',
    });

    await expect(
      service.create(customerUser, {
        branchId: 'branch-1',
        orderType: OrderTypeEnum.TAKEAWAY,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(groupOrdersRepository.createSession).not.toHaveBeenCalled();
  });

  it('blocks host from joining their own group order', async () => {
    const { service, groupOrdersRepository } = makeService();
    groupOrdersRepository.findSessionByInviteCode.mockResolvedValue({
      id: 'session-1',
      inviteCode: 'INVITE123',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      hostUserId: 'customer-1',
      status: 'OPEN',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      participants: [
        {
          id: 'participant-host',
          userId: 'customer-1',
          status: GroupOrderParticipantStatus.ACTIVE,
          isHost: true,
        },
      ],
    });

    await expect(
      service.join(customerUser, { inviteCode: 'INVITE123' }),
    ).rejects.toThrow('Host is already part of this group order');

    expect(groupOrdersRepository.createParticipant).not.toHaveBeenCalled();
    expect(groupOrdersRepository.updateParticipant).not.toHaveBeenCalled();
  });

  it('blocks joining the same group order twice while already active', async () => {
    const { service, groupOrdersRepository } = makeService();
    groupOrdersRepository.findSessionByInviteCode.mockResolvedValue({
      id: 'session-1',
      inviteCode: 'INVITE123',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      hostUserId: 'host-1',
      status: 'OPEN',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      participants: [
        {
          id: 'participant-1',
          userId: 'customer-1',
          status: GroupOrderParticipantStatus.ACTIVE,
          isHost: false,
        },
      ],
    });
    groupOrdersRepository.findParticipant.mockResolvedValue({
      id: 'participant-1',
      sessionId: 'session-1',
      userId: 'customer-1',
      status: GroupOrderParticipantStatus.ACTIVE,
    });

    await expect(
      service.join(customerUser, { inviteCode: 'INVITE123' }),
    ).rejects.toThrow('You are already part of this group order');

    expect(groupOrdersRepository.createParticipant).not.toHaveBeenCalled();
    expect(groupOrdersRepository.updateParticipant).not.toHaveBeenCalled();
  });

  it('rejects saving a group-order coupon before items exist', async () => {
    const { service, groupOrdersRepository, ordersService } = makeService();
    const session = {
      id: 'session-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      hostUserId: 'customer-1',
      orderType: 'DELIVERY',
      deliveryAddressId: 'address-1',
      couponCode: null,
      orderTime: null,
      hostNote: null,
      inviteCode: 'INVITE123',
      status: 'OPEN',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lockedAt: null,
      checkedOutAt: null,
      finalOrderId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      hostUser: {
        id: 'customer-1',
        email: 'host@test.com',
        isGuest: false,
        profile: null,
      },
      branch: { id: 'branch-1', name: 'Main', coverImage: null },
      restaurant: {
        id: 'restaurant-1',
        name: 'Restaurant',
        slug: 'restaurant',
        logoUrl: null,
        coverImage: null,
      },
      deliveryAddress: null,
      finalOrder: null,
      participants: [
        {
          id: 'participant-host',
          userId: 'customer-1',
          status: GroupOrderParticipantStatus.ACTIVE,
          isHost: true,
          joinedAt: new Date(),
          leftAt: null,
          user: {
            id: 'customer-1',
            email: 'host@test.com',
            isGuest: false,
            profile: null,
          },
        },
      ],
      items: [],
    };
    groupOrdersRepository.findSessionById.mockResolvedValue(session);
    groupOrdersRepository.findOwnedAddress.mockResolvedValue({
      id: 'address-1',
    });

    await expect(
      service.updateSettings(customerUser, 'session-1', {
        couponCode: 'SAVE10',
      }),
    ).rejects.toThrow('Add items before applying a coupon');

    expect(ordersService.quoteForCouponValidation).not.toHaveBeenCalled();
    expect(groupOrdersRepository.updateSession).not.toHaveBeenCalled();
  });

  it('allows host to cancel an expired group order', async () => {
    const { service, groupOrdersRepository } = makeService();
    groupOrdersRepository.findSessionById.mockResolvedValue({
      id: 'session-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      hostUserId: 'customer-1',
      orderType: 'TAKEAWAY',
      deliveryAddressId: null,
      couponCode: null,
      orderTime: null,
      hostNote: null,
      inviteCode: 'INVITE123',
      status: 'OPEN',
      expiresAt: new Date(Date.now() - 60 * 1000),
      lockedAt: null,
      checkedOutAt: null,
      finalOrderId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      hostUser: {
        id: 'customer-1',
        email: 'host@test.com',
        isGuest: false,
        profile: null,
      },
      branch: { id: 'branch-1', name: 'Main', coverImage: null },
      restaurant: {
        id: 'restaurant-1',
        name: 'Restaurant',
        slug: 'restaurant',
        logoUrl: null,
        coverImage: null,
      },
      deliveryAddress: null,
      finalOrder: null,
      participants: [
        {
          id: 'participant-host',
          userId: 'customer-1',
          status: GroupOrderParticipantStatus.ACTIVE,
          isHost: true,
          joinedAt: new Date(),
          leftAt: null,
          user: {
            id: 'customer-1',
            email: 'host@test.com',
            isGuest: false,
            profile: null,
          },
        },
      ],
      items: [],
    });
    groupOrdersRepository.updateSession.mockResolvedValue({ id: 'session-1' });
    groupOrdersRepository.findMenuItemsForResponse.mockResolvedValue([]);

    await service.updateStatus(customerUser, 'session-1', {
      status: 'CANCELLED' as never,
    });

    expect(groupOrdersRepository.updateSession).toHaveBeenCalledWith(
      'session-1',
      {
        status: 'CANCELLED',
        lockedAt: null,
      },
    );
  });

  it('includes live order summary on group-order details', async () => {
    const { service, groupOrdersRepository, ordersService } = makeService();
    groupOrdersRepository.findSessionById.mockResolvedValue({
      id: 'session-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      hostUserId: 'customer-1',
      orderType: 'TAKEAWAY',
      deliveryAddressId: null,
      couponCode: null,
      orderTime: new Date('2099-03-30T19:30:00.000Z'),
      hostNote: null,
      inviteCode: 'INVITE123',
      status: 'OPEN',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lockedAt: null,
      checkedOutAt: null,
      finalOrderId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      hostUser: {
        id: 'customer-1',
        email: 'host@test.com',
        isGuest: false,
        profile: null,
      },
      branch: { id: 'branch-1', name: 'Main', coverImage: null },
      restaurant: {
        id: 'restaurant-1',
        name: 'Restaurant',
        slug: 'restaurant',
        logoUrl: null,
        coverImage: null,
      },
      deliveryAddress: null,
      finalOrder: null,
      participants: [
        {
          id: 'participant-host',
          userId: 'customer-1',
          status: GroupOrderParticipantStatus.ACTIVE,
          isHost: true,
          joinedAt: new Date(),
          leftAt: null,
          user: {
            id: 'customer-1',
            email: 'host@test.com',
            isGuest: false,
            profile: null,
          },
        },
      ],
      items: [
        {
          id: 'item-1',
          participantId: 'participant-host',
          menuItemId: 'menu-1',
          variationId: null,
          quantity: 2,
          note: null,
          modifiers: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    groupOrdersRepository.findMenuItemsForResponse.mockResolvedValue([]);
    ordersService.quote.mockResolvedValue({
      data: {
        branchId: 'branch-1',
        restaurantId: 'restaurant-1',
        customerId: 'customer-1',
        orderType: 'TAKEAWAY',
        orderTime: '2099-03-30T19:30:00.000Z',
        isScheduled: true,
        subtotal: 500,
        taxAmount: 50,
        deliveryFee: 0,
        discountAmount: 0,
        totalAmount: 550,
        couponCode: null,
        items: [],
      },
      message: 'Order quote generated successfully',
    });

    const result = await service.details(customerUser, 'session-1');

    expect(result.data.summary).toEqual(
      expect.objectContaining({
        source: 'quote',
        orderType: 'TAKEAWAY',
        subtotal: 500,
        taxAmount: 50,
        totalAmount: 550,
        itemCount: 1,
      }),
    );
  });

  it('validates group-order coupon before saving it', async () => {
    const { service, groupOrdersRepository, ordersService } = makeService();
    const session = {
      id: 'session-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      hostUserId: 'customer-1',
      orderType: 'TAKEAWAY',
      deliveryAddressId: null,
      couponCode: null,
      orderTime: null,
      hostNote: null,
      inviteCode: 'INVITE123',
      status: 'OPEN',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lockedAt: null,
      checkedOutAt: null,
      finalOrderId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      hostUser: {
        id: 'customer-1',
        email: 'host@test.com',
        isGuest: false,
        profile: null,
      },
      branch: { id: 'branch-1', name: 'Main', coverImage: null },
      restaurant: {
        id: 'restaurant-1',
        name: 'Restaurant',
        slug: 'restaurant',
        logoUrl: null,
        coverImage: null,
      },
      deliveryAddress: null,
      finalOrder: null,
      participants: [
        {
          id: 'participant-host',
          userId: 'customer-1',
          status: GroupOrderParticipantStatus.ACTIVE,
          isHost: true,
          joinedAt: new Date(),
          leftAt: null,
          user: {
            id: 'customer-1',
            email: 'host@test.com',
            isGuest: false,
            profile: null,
          },
        },
      ],
      items: [
        {
          id: 'item-1',
          participantId: 'participant-host',
          menuItemId: 'menu-1',
          variationId: null,
          quantity: 2,
          note: null,
          modifiers: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    groupOrdersRepository.findSessionById
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce({ ...session, couponCode: 'SAVE10' });
    groupOrdersRepository.findMenuItemsForResponse.mockResolvedValue([]);
    ordersService.quote.mockResolvedValue({
      data: {
        branchId: 'branch-1',
        restaurantId: 'restaurant-1',
        customerId: 'customer-1',
        orderType: 'TAKEAWAY',
        orderTime: new Date().toISOString(),
        isScheduled: false,
        subtotal: 500,
        taxAmount: 0,
        deliveryFee: 0,
        discountAmount: 100,
        totalAmount: 400,
        couponCode: 'SAVE10',
        items: [],
      },
      message: 'Order quote generated successfully',
    });
    ordersService.quoteForCouponValidation.mockResolvedValue({
      data: {
        couponCode: 'SAVE10',
      },
      message: 'Order quote generated successfully',
    });

    const result = await service.updateSettings(customerUser, 'session-1', {
      couponCode: ' SAVE10 ',
    });

    expect(ordersService.quoteForCouponValidation).toHaveBeenCalledWith(
      customerUser,
      expect.objectContaining({
        branchId: 'branch-1',
        couponCode: 'SAVE10',
      }),
    );
    expect(groupOrdersRepository.updateSession).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        couponCode: 'SAVE10',
      }),
    );
    expect(result.message).toBe('Group order updated successfully');
  });
});
