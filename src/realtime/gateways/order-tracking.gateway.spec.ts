import { UserRoleEnum } from '../../common/enums';
import { OrderTrackingGateway } from './order-tracking.gateway';

describe('OrderTrackingGateway', () => {
  const makeGateway = (user: {
    uid: string;
    role: UserRoleEnum;
    tid?: string;
    rid?: string;
    bid?: string;
    actorType?: string;
    panelType?: string;
  }) => {
    const ordersService = {
      resolveRealtimeAdminOrderScope: jest.fn(),
      getTrackingSnapshot: jest.fn().mockResolvedValue({ id: 'order-1' }),
    };
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue(user),
    };
    const admission = {
      begin: jest.fn().mockReturnValue({ allowed: true }),
      bindUser: jest.fn().mockReturnValue({ allowed: true }),
      release: jest.fn(),
    };
    const currentSessionValidator = {
      assertCurrentSession: jest.fn().mockResolvedValue(undefined),
    };
    const gateway = new OrderTrackingGateway(
      jwtService as never,
      currentSessionValidator as never,
      ordersService as never,
      admission as never,
    );
    const client = {
      id: 'socket-1',
      data: {},
      handshake: {
        auth: {
          token: 'valid-token',
          restaurantId: 'restaurant-1',
          branchId: 'branch-1',
        },
        headers: {},
        address: '198.51.100.1',
      },
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    return {
      gateway,
      client,
      ordersService,
      jwtService,
      admission,
      currentSessionValidator,
    };
  };

  it('joins business admins to their authenticated tenant order room without a database query', async () => {
    const user = {
      uid: 'owner-1',
      role: UserRoleEnum.BUSINESS_ADMIN,
      tid: 'tenant-1',
    };
    const { gateway, client, ordersService } = makeGateway(user);

    await gateway.handleConnection(client as never);

    expect(ordersService.resolveRealtimeAdminOrderScope).not.toHaveBeenCalled();
    expect(client.join).toHaveBeenCalledWith('orders:tenant:tenant-1');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('joins branch admins to their authenticated branch order room without a database query', async () => {
    const { gateway, client, ordersService } = makeGateway({
      uid: 'branch-admin-1',
      role: UserRoleEnum.BRANCH_ADMIN,
      rid: 'restaurant-1',
      bid: 'branch-1',
    });

    await gateway.handleConnection(client as never);

    expect(ordersService.resolveRealtimeAdminOrderScope).not.toHaveBeenCalled();
    expect(client.join).toHaveBeenCalledWith(
      'orders:restaurant:restaurant-1:branch:branch-1',
    );
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('does not join customers to an administrative order room', async () => {
    const { gateway, client } = makeGateway({
      uid: 'customer-1',
      role: UserRoleEnum.CUSTOMER,
      rid: 'restaurant-1',
    });

    await gateway.handleConnection(client as never);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('does not trust handshake scope when an admin token lacks tenant scope', async () => {
    const { gateway, client } = makeGateway({
      uid: 'owner-1',
      role: UserRoleEnum.BUSINESS_ADMIN,
    });

    await gateway.handleConnection(client as never);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('validates current sessions for concurrent socket connections', async () => {
    const user = {
      uid: 'owner-1',
      role: UserRoleEnum.BUSINESS_ADMIN,
      tid: 'tenant-1',
    };
    const { gateway, client, currentSessionValidator } = makeGateway(user);
    const firstClient = client as never;
    const secondClient = {
      ...client,
      id: 'socket-2',
      data: {},
      join: jest.fn().mockResolvedValue(undefined),
    } as never;

    await Promise.all([
      gateway.handleConnection(firstClient),
      gateway.handleConnection(secondClient),
    ]);

    expect(currentSessionValidator.assertCurrentSession).toHaveBeenCalledTimes(
      2,
    );
  });

  it('rejects reconnect bursts before JWT verification', async () => {
    const { gateway, client, jwtService, admission } = makeGateway({
      uid: 'owner-1',
      role: UserRoleEnum.BUSINESS_ADMIN,
      tid: 'tenant-1',
    });
    admission.begin.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 8,
    });

    await gateway.handleConnection(client as never);

    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('order.tracking.error', {
      code: 'RATE_LIMITED',
      message: 'Too many realtime connections',
      retryAfterSeconds: 8,
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('joins staff to a validated restaurant order room after explicit subscription', async () => {
    const user = {
      uid: 'staff-1',
      role: UserRoleEnum.STAFF,
      actorType: 'STAFF',
      tid: 'tenant-1',
    };
    const { gateway, client, ordersService } = makeGateway(user);
    ordersService.resolveRealtimeAdminOrderScope.mockResolvedValue({
      restaurantId: 'restaurant-1',
    });

    await gateway.handleConnection(client as never);
    const result = await gateway.subscribeToAdminOrders(client as never, {
      restaurantId: 'restaurant-1',
    });

    expect(ordersService.resolveRealtimeAdminOrderScope).toHaveBeenCalledWith(
      user,
      'restaurant-1',
      undefined,
    );
    expect(client.join).toHaveBeenCalledWith('orders:restaurant:restaurant-1');
    expect(result).toEqual({
      success: true,
      data: {
        restaurantId: 'restaurant-1',
        room: 'orders:restaurant:restaurant-1',
      },
    });
  });

  it.each([
    [
      'tracking',
      (gateway: OrderTrackingGateway, client: unknown) =>
        gateway.subscribeToOrder(client as never, { orderId: 'order-1' }),
    ],
    [
      'admin',
      (gateway: OrderTrackingGateway, client: unknown) =>
        gateway.subscribeToAdminOrders(client as never, {
          restaurantId: 'restaurant-1',
        }),
    ],
  ])(
    'rejects and disconnects a session revoked after connect before %s subscribe',
    async (_name, command) => {
      const ctx = makeGateway({
        uid: 'staff-1',
        role: UserRoleEnum.STAFF,
        actorType: 'STAFF',
        tid: 'tenant-1',
      });
      await ctx.gateway.handleConnection(ctx.client as never);
      ctx.currentSessionValidator.assertCurrentSession.mockRejectedValue(
        new Error('Session is no longer valid'),
      );
      const result = await command(ctx.gateway, ctx.client);
      expect(result).toMatchObject({ success: false });
      expect(ctx.client.disconnect).toHaveBeenCalledWith(true);
      expect(ctx.ordersService.getTrackingSnapshot).not.toHaveBeenCalled();
      expect(
        ctx.ordersService.resolveRealtimeAdminOrderScope,
      ).not.toHaveBeenCalled();
    },
  );
});
