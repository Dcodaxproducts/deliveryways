import { ForbiddenException } from '@nestjs/common';
import { UserRoleEnum } from '../../common/enums';
import { OrderTrackingGateway } from './order-tracking.gateway';

describe('OrderTrackingGateway', () => {
  const makeGateway = (
    user: {
      uid: string;
      role: UserRoleEnum;
      rid?: string;
      bid?: string;
    },
    scope: { restaurantId: string; branchId?: string } | null = null,
  ) => {
    const realtimeService = {
      registerServer: jest.fn(),
      getRestaurantOrdersRoom: jest.fn(
        (restaurantId: string) => `orders:restaurant:${restaurantId}`,
      ),
      getBranchOrdersRoom: jest.fn(
        (restaurantId: string, branchId: string) =>
          `orders:restaurant:${restaurantId}:branch:${branchId}`,
      ),
    };
    const ordersService = {
      resolveRealtimeAdminOrderScope: jest.fn().mockResolvedValue(scope),
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

  it('joins business admins using their validated handshake restaurant', async () => {
    const user = {
      uid: 'owner-1',
      role: UserRoleEnum.BUSINESS_ADMIN,
    };
    const { gateway, client, ordersService } = makeGateway(user, {
      restaurantId: 'restaurant-1',
    });

    await gateway.handleConnection(client as never);

    expect(ordersService.resolveRealtimeAdminOrderScope).toHaveBeenCalledWith(
      user,
      'restaurant-1',
      'branch-1',
    );
    expect(client.join).toHaveBeenCalledWith('orders:restaurant:restaurant-1');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('joins branch admins only to their branch order room', async () => {
    const { gateway, client } = makeGateway(
      {
        uid: 'branch-admin-1',
        role: UserRoleEnum.BRANCH_ADMIN,
        rid: 'restaurant-1',
        bid: 'branch-1',
      },
      {
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
    );

    await gateway.handleConnection(client as never);

    expect(client.join).toHaveBeenCalledWith(
      'orders:restaurant:restaurant-1:branch:branch-1',
    );
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

  it('rejects an admin token without its required restaurant context', async () => {
    const { gateway, client, ordersService } = makeGateway({
      uid: 'owner-1',
      role: UserRoleEnum.BUSINESS_ADMIN,
    });
    ordersService.resolveRealtimeAdminOrderScope.mockRejectedValue(
      new ForbiddenException('Restaurant context is required'),
    );

    await gateway.handleConnection(client as never);

    expect(client.emit).toHaveBeenCalledWith('order.tracking.error', {
      code: 'UNAUTHORIZED',
      message: 'Restaurant context is required',
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('serializes concurrent administrative scope lookups', async () => {
    const user = {
      uid: 'owner-1',
      role: UserRoleEnum.BUSINESS_ADMIN,
    };
    const { gateway, client, ordersService } = makeGateway(user);
    let releaseFirstLookup: (() => void) | undefined;
    const firstLookup = new Promise<{ restaurantId: string }>((resolve) => {
      releaseFirstLookup = () => resolve({ restaurantId: 'restaurant-1' });
    });
    ordersService.resolveRealtimeAdminOrderScope
      .mockImplementationOnce(() => firstLookup)
      .mockResolvedValueOnce({ restaurantId: 'restaurant-1' });

    const firstClient = client as never;
    const secondClient = {
      ...client,
      id: 'socket-2',
      data: {},
      join: jest.fn().mockResolvedValue(undefined),
    } as never;

    const firstConnection = gateway.handleConnection(firstClient);
    await Promise.resolve();
    await Promise.resolve();
    const secondConnection = gateway.handleConnection(secondClient);
    await Promise.resolve();
    await Promise.resolve();

    expect(ordersService.resolveRealtimeAdminOrderScope).toHaveBeenCalledTimes(
      1,
    );

    releaseFirstLookup?.();
    await Promise.all([firstConnection, secondConnection]);

    expect(ordersService.resolveRealtimeAdminOrderScope).toHaveBeenCalledTimes(
      2,
    );
  });
});
