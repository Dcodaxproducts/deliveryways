import { UserRoleEnum } from '../../common/enums';
import { OrderTrackingGateway } from './order-tracking.gateway';

describe('OrderTrackingGateway', () => {
  const makeGateway = (user: {
    uid: string;
    role: UserRoleEnum;
    tid?: string;
    rid?: string;
    bid?: string;
  }) => {
    const realtimeService = {
      registerServer: jest.fn(),
      getRestaurantOrdersRoom: jest.fn(
        (restaurantId: string) => `orders:restaurant:${restaurantId}`,
      ),
      getTenantOrdersRoom: jest.fn(
        (tenantId: string) => `orders:tenant:${tenantId}`,
      ),
      getBranchOrdersRoom: jest.fn(
        (restaurantId: string, branchId: string) =>
          `orders:restaurant:${restaurantId}:branch:${branchId}`,
      ),
    };
    const ordersService = {
      resolveRealtimeAdminOrderScope: jest.fn(),
    };
    const gateway = new OrderTrackingGateway(
      {
        verifyAsync: jest.fn().mockResolvedValue(user),
      } as never,
      {
        get: jest.fn().mockReturnValue('test-secret'),
      } as never,
      ordersService as never,
      {} as never,
      realtimeService as never,
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
      },
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    return { gateway, client, realtimeService, ordersService };
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

  it('does not perform database work for concurrent socket connections', async () => {
    const user = {
      uid: 'owner-1',
      role: UserRoleEnum.BUSINESS_ADMIN,
      tid: 'tenant-1',
    };
    const { gateway, client, ordersService } = makeGateway(user);
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

    expect(ordersService.resolveRealtimeAdminOrderScope).not.toHaveBeenCalled();
  });
});
