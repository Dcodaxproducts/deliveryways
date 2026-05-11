import { BadRequestException } from '@nestjs/common';
import { GroupOrderParticipantStatus } from '@prisma/client';
import { OrderTypeEnum, UserRoleEnum } from '../../common/enums';
import { GroupOrdersService } from './group-orders.service';

describe('GroupOrdersService', () => {
  const makeService = () => {
    const groupOrdersRepository = {
      findActiveBranch: jest.fn(),
      findActiveSessionByHost: jest.fn(),
      findRestaurantMenuById: jest.fn(),
      findOwnedAddress: jest.fn(),
      createSession: jest.fn(),
      updateSession: jest.fn(),
      findSessionByInviteCode: jest.fn(),
      findParticipant: jest.fn(),
      listForUser: jest.fn(),
      listForAdmin: jest.fn(),
      createParticipant: jest.fn(),
      updateParticipant: jest.fn(),
      markParticipantLeftAndDeleteItems: jest.fn(),
      createItem: jest.fn(),
      updateItem: jest.fn(),
      deleteItem: jest.fn(),
      deleteItems: jest.fn(),
      findItemById: jest.fn(),
      findSessionById: jest.fn(),
      findRestaurantInTenant: jest.fn(),
      findMenuItemForSession: jest.fn(),
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

  const businessAdminUser = {
    uid: 'business-admin-1',
    tid: 'tenant-1',
    role: UserRoleEnum.BUSINESS_ADMIN,
  };

  it('rejects creating a group order when the branch does not support the selected order type', async () => {
    const { service, groupOrdersRepository } = makeService();
    groupOrdersRepository.findActiveBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      settings: {
        allowedOrderTypes: [OrderTypeEnum.TAKEAWAY],
      },
    });
    groupOrdersRepository.findActiveSessionByHost.mockResolvedValue(null);

    await expect(
      service.create(customerUser, {
        branchId: 'branch-1',
        orderType: OrderTypeEnum.DELIVERY,
        deliveryAddressId: 'address-1',
      }),
    ).rejects.toThrow('Order type is not supported by this branch');

    expect(groupOrdersRepository.createSession).not.toHaveBeenCalled();
  });

  it('blocks creating a new group order when host already has an active session', async () => {
    const { service, groupOrdersRepository } = makeService();
    groupOrdersRepository.findActiveBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      settings: {
        allowedOrderTypes: [OrderTypeEnum.DELIVERY, OrderTypeEnum.TAKEAWAY],
      },
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

  it('does not require delivery coordinates when fetching group-order details', async () => {
    const { service, groupOrdersRepository, ordersService } = makeService();
    groupOrdersRepository.findSessionById.mockResolvedValue({
      id: 'session-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      hostUserId: 'customer-1',
      orderType: 'DELIVERY',
      deliveryAddressId: 'address-1',
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
      deliveryAddress: {
        id: 'address-1',
        street: 'Street 1',
        area: null,
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
        lat: null,
        lng: null,
      },
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
          quantity: 1,
          note: null,
          modifiers: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    groupOrdersRepository.findMenuItemsForResponse.mockResolvedValue([]);
    ordersService.quoteForCouponValidation.mockResolvedValue({
      data: {
        branchId: 'branch-1',
        restaurantId: 'restaurant-1',
        customerId: 'customer-1',
        orderType: 'DELIVERY',
        orderTime: '2099-03-30T19:30:00.000Z',
        isScheduled: true,
        subtotal: 500,
        taxAmount: 50,
        deliveryFee: 100,
        discountAmount: 0,
        totalAmount: 650,
        couponCode: null,
        items: [],
      },
      message: 'Order quote generated successfully',
    });

    const result = await service.details(customerUser, 'session-1');

    expect(ordersService.quote).not.toHaveBeenCalled();
    expect(ordersService.quoteForCouponValidation).toHaveBeenCalledWith(
      customerUser,
      expect.objectContaining({
        branchId: 'branch-1',
        deliveryAddressId: 'address-1',
        orderType: OrderTypeEnum.DELIVERY,
      }),
    );
    expect(result.data.summary).toEqual(
      expect.objectContaining({
        source: 'quote',
        totalAmount: 650,
      }),
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
    ordersService.quoteForCouponValidation.mockResolvedValue({
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

  it('does not expose a separate summary.items array on details', async () => {
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
          quantity: 1,
          note: null,
          modifiers: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    groupOrdersRepository.findSessionById.mockResolvedValue(session);
    groupOrdersRepository.findMenuItemsForResponse.mockResolvedValue([]);
    ordersService.quoteForCouponValidation.mockResolvedValue({
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
        items: [
          {
            menuItemId: 'menu-1',
            quantity: 1,
          },
        ],
      },
      message: 'Order quote generated successfully',
    });

    const result = await service.details(customerUser, 'session-1');

    expect(result.data.participants[0].items).toHaveLength(1);
    expect(result.data.summary).not.toHaveProperty('items');
  });

  it('does not fail details when branch no longer supports the session order type', async () => {
    const { service, groupOrdersRepository, ordersService } = makeService();
    const session = {
      id: 'session-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      hostUserId: 'customer-1',
      orderType: 'DELIVERY',
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
          quantity: 1,
          note: null,
          modifiers: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };

    groupOrdersRepository.findSessionById.mockResolvedValue(session);
    groupOrdersRepository.findMenuItemsForResponse.mockResolvedValue([]);
    ordersService.quoteForCouponValidation.mockRejectedValue(
      new BadRequestException('Order type is not supported by this branch'),
    );

    const result = await service.details(customerUser, 'session-1');

    expect(result.data.summary).toEqual(
      expect.objectContaining({
        source: 'session',
        orderType: 'DELIVERY',
        itemCount: 1,
      }),
    );
  });

  it('returns the same session schema for list items and details', async () => {
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
          quantity: 1,
          note: null,
          modifiers: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    groupOrdersRepository.listForUser.mockResolvedValue({
      items: [session],
      total: 1,
    });
    groupOrdersRepository.findSessionById.mockResolvedValue(session);
    groupOrdersRepository.findMenuItemsForResponse.mockResolvedValue([]);
    ordersService.quoteForCouponValidation.mockResolvedValue({
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

    const listResult = await service.list(customerUser, {
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    });
    const detailsResult = await service.details(customerUser, 'session-1');

    expect(listResult.data[0]).toEqual(detailsResult.data);
  });

  it('lists tenant group orders for business admin and forwards optional restaurant scope', async () => {
    const { service, groupOrdersRepository } = makeService();
    groupOrdersRepository.findRestaurantInTenant.mockResolvedValue({
      id: 'restaurant-2',
    });
    groupOrdersRepository.listForAdmin.mockResolvedValue({
      items: [],
      total: 0,
    });

    const result = await service.list(businessAdminUser, {
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
      restaurantId: 'restaurant-2',
    });

    expect(groupOrdersRepository.findRestaurantInTenant).toHaveBeenCalledWith(
      'restaurant-2',
      'tenant-1',
    );
    expect(groupOrdersRepository.listForAdmin).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-2',
      },
      expect.objectContaining({ restaurantId: 'restaurant-2' }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        data: [],
        message: 'Group orders fetched successfully',
      }),
    );
  });

  it('allows business admin to fetch group-order details for tenant restaurants', async () => {
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
          quantity: 1,
          note: null,
          modifiers: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    groupOrdersRepository.findSessionById.mockResolvedValue(session);
    groupOrdersRepository.findRestaurantInTenant.mockResolvedValue({
      id: 'restaurant-1',
    });
    groupOrdersRepository.findMenuItemsForResponse.mockResolvedValue([]);
    ordersService.quoteForCouponValidation.mockResolvedValue({
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

    const result = await service.details(businessAdminUser, 'session-1');

    expect(groupOrdersRepository.findRestaurantInTenant).toHaveBeenCalledWith(
      'restaurant-1',
      'tenant-1',
    );
    expect(result.data.id).toBe('session-1');
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

  it('validates modifiers through the order quote path before adding group-order items', async () => {
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
      items: [],
    };
    groupOrdersRepository.findSessionById.mockResolvedValue(session);
    groupOrdersRepository.findMenuItemForSession.mockResolvedValue({
      id: 'menu-1',
      branchOverrides: [],
      variations: [{ id: 'variation-1' }],
    });
    ordersService.quoteForCouponValidation.mockRejectedValue(
      new BadRequestException('Modifier not found for item: Zingory cheese'),
    );

    await expect(
      service.addItem(customerUser, 'session-1', {
        menuItemId: 'menu-1',
        variationId: 'variation-1',
        quantity: 1,
        modifiers: [{ modifierId: 'bad-modifier', quantity: 1 }],
      }),
    ).rejects.toThrow('Modifier not found for item: Zingory cheese');

    expect(ordersService.quoteForCouponValidation).toHaveBeenCalledWith(
      customerUser,
      expect.objectContaining({
        branchId: 'branch-1',
        items: [
          expect.objectContaining({
            menuItemId: 'menu-1',
            variationId: 'variation-1',
            modifiers: [{ modifierId: 'bad-modifier', quantity: 1 }],
          }),
        ],
      }),
    );
    expect(groupOrdersRepository.createItem).not.toHaveBeenCalled();
  });

  it('accepts split-pizza sections and stores them with modifiers for group-order items', async () => {
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
      items: [],
    };
    const updatedSession = {
      ...session,
      items: [
        {
          id: 'item-1',
          participantId: 'participant-host',
          menuItemId: 'pizza-1',
          variationId: null,
          quantity: 1,
          note: null,
          modifiers: {
            modifiers: [{ modifierId: 'modifier-1', quantity: 1 }],
            sections: [
              { slot: 'LEFT', menuItemId: 'pizza-left' },
              { slot: 'RIGHT', menuItemId: 'pizza-right' },
            ],
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    groupOrdersRepository.findSessionById
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(updatedSession);
    groupOrdersRepository.findMenuItemForSession.mockResolvedValue({
      id: 'pizza-1',
      branchOverrides: [],
      variations: [],
    });
    groupOrdersRepository.findMenuItemsForResponse.mockResolvedValue([]);
    ordersService.quoteForCouponValidation.mockResolvedValue({
      data: { totalAmount: 100, items: [] },
    });

    const result = await service.addItem(customerUser, 'session-1', {
      menuItemId: 'pizza-1',
      quantity: 1,
      modifiers: [{ modifierId: 'modifier-1', quantity: 1 }],
      sections: [
        { slot: 'LEFT', menuItemId: 'pizza-left' },
        { slot: 'RIGHT', menuItemId: 'pizza-right' },
      ],
    });

    expect(ordersService.quoteForCouponValidation).toHaveBeenCalledWith(
      customerUser,
      expect.objectContaining({
        items: [
          expect.objectContaining({
            menuItemId: 'pizza-1',
            modifiers: [{ modifierId: 'modifier-1', quantity: 1 }],
            sections: [
              { slot: 'LEFT', menuItemId: 'pizza-left' },
              { slot: 'RIGHT', menuItemId: 'pizza-right' },
            ],
          }),
        ],
      }),
    );
    expect(groupOrdersRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        modifiers: {
          modifiers: [{ modifierId: 'modifier-1', quantity: 1 }],
          sections: [
            { slot: 'LEFT', menuItemId: 'pizza-left' },
            { slot: 'RIGHT', menuItemId: 'pizza-right' },
          ],
        },
      }),
    );
    expect(result.data.participants[0].items[0].modifiers).toEqual({
      modifiers: [{ modifierId: 'modifier-1', quantity: 1 }],
      sections: [
        { slot: 'LEFT', menuItemId: 'pizza-left' },
        { slot: 'RIGHT', menuItemId: 'pizza-right' },
      ],
    });
  });

  it('drops a deleted optional variation when adding a group-order item', async () => {
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
      items: [],
    };
    groupOrdersRepository.findSessionById
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce({
        ...session,
        items: [
          {
            id: 'item-1',
            participantId: 'participant-host',
            menuItemId: 'menu-1',
            variationId: null,
            quantity: 1,
            note: '',
            modifiers: undefined,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
    groupOrdersRepository.findMenuItemForSession.mockResolvedValue({
      id: 'menu-1',
      branchOverrides: [],
      variations: [],
    });
    groupOrdersRepository.findMenuItemsForResponse.mockResolvedValue([]);
    ordersService.quoteForCouponValidation.mockResolvedValue({
      data: { totalAmount: 40, items: [] },
    });

    await service.addItem(customerUser, 'session-1', {
      menuItemId: 'menu-1',
      variationId: 'deleted-variation',
      quantity: 1,
      modifiers: [],
      note: '',
    });

    expect(ordersService.quoteForCouponValidation).toHaveBeenCalledWith(
      customerUser,
      expect.objectContaining({
        items: [
          expect.not.objectContaining({ variationId: 'deleted-variation' }),
        ],
      }),
    );
    expect(groupOrdersRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({ variationId: undefined }),
    );
  });

  it('keeps group-order list/details readable when stored item selections become invalid', async () => {
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
          variationId: 'variation-1',
          quantity: 1,
          note: null,
          modifiers: [{ modifierId: 'deleted-modifier', quantity: 1 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    groupOrdersRepository.listForUser.mockResolvedValue({
      items: [session],
      total: 1,
    });
    groupOrdersRepository.findMenuItemsForResponse.mockResolvedValue([]);
    ordersService.quoteForCouponValidation.mockRejectedValue(
      new BadRequestException('Modifier not found for item: Zingory cheese'),
    );

    const result = await service.list(customerUser, {
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    });

    expect(groupOrdersRepository.deleteItems).toHaveBeenCalledWith(['item-1']);
    expect(result.data[0].summary).toEqual(
      expect.objectContaining({
        source: 'session',
        orderType: 'TAKEAWAY',
        itemCount: 1,
        totalAmount: 0,
      }),
    );
  });

  it('deletes participant items when a participant leaves a group order', async () => {
    const { service, groupOrdersRepository } = makeService();
    const leftSession = {
      id: 'session-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      hostUserId: 'host-1',
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
        id: 'host-1',
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
          id: 'participant-1',
          userId: 'customer-1',
          status: GroupOrderParticipantStatus.LEFT,
          isHost: false,
          joinedAt: new Date(),
          leftAt: new Date(),
          user: {
            id: 'customer-1',
            email: 'customer@test.com',
            isGuest: false,
            profile: null,
          },
        },
      ],
      items: [
        {
          id: 'item-1',
          participantId: 'participant-1',
          menuItemId: 'menu-1',
          variationId: null,
          quantity: 1,
          note: null,
          modifiers: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    groupOrdersRepository.findSessionById
      .mockResolvedValueOnce({
        ...leftSession,
        participants: [
          {
            ...leftSession.participants[0],
            status: GroupOrderParticipantStatus.ACTIVE,
            leftAt: null,
          },
        ],
      })
      .mockResolvedValueOnce(leftSession);
    groupOrdersRepository.findMenuItemsForResponse.mockResolvedValue([]);

    const result = await service.leave(customerUser, 'session-1');

    expect(
      groupOrdersRepository.markParticipantLeftAndDeleteItems,
    ).toHaveBeenCalledWith('participant-1', expect.any(Date));
    expect(result.data.participants[0].items).toEqual([]);
    expect(result.data.itemCount).toBe(0);
  });
});
