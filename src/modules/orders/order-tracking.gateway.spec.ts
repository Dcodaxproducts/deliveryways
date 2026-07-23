import { UserRoleEnum } from '../../common/enums';
import { OrderTrackingGateway } from './order-tracking.gateway';

describe('OrderTrackingGateway', () => {
  const makeGateway = (user: {
    uid: string;
    role: UserRoleEnum;
    rid?: string;
    bid?: string;
  }) => {
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
    const gateway = new OrderTrackingGateway(
      {
        verifyAsync: jest.fn().mockResolvedValue(user),
      } as never,
      {
        get: jest.fn().mockReturnValue('test-secret'),
      } as never,
      {} as never,
      {} as never,
      realtimeService as never,
    );
    const client = {
      id: 'socket-1',
      data: {},
      handshake: {
        auth: { token: 'valid-token' },
        headers: {},
      },
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    return { gateway, client, realtimeService };
  };

  it('joins business admins to their restaurant order room', async () => {
    const { gateway, client } = makeGateway({
      uid: 'owner-1',
      role: UserRoleEnum.BUSINESS_ADMIN,
      rid: 'restaurant-1',
    });

    await gateway.handleConnection(client as never);

    expect(client.join).toHaveBeenCalledWith('orders:restaurant:restaurant-1');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('joins branch admins only to their branch order room', async () => {
    const { gateway, client } = makeGateway({
      uid: 'branch-admin-1',
      role: UserRoleEnum.BRANCH_ADMIN,
      rid: 'restaurant-1',
      bid: 'branch-1',
    });

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
    const { gateway, client } = makeGateway({
      uid: 'owner-1',
      role: UserRoleEnum.BUSINESS_ADMIN,
    });

    await gateway.handleConnection(client as never);

    expect(client.emit).toHaveBeenCalledWith('order.tracking.error', {
      code: 'UNAUTHORIZED',
      message: 'Restaurant context is required',
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
});
