import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService registerGuestCustomer', () => {
  let service: AuthService;
  let prisma: {
    restaurant: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;
  let jwtService: { signAsync: jest.Mock };

  beforeEach(() => {
    prisma = {
      restaurant: { findFirst: jest.fn() },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(callback({})),
      ),
    };
    usersService = {
      create: jest.fn(),
      setRefreshTokenHash: jest.fn(),
    };
    jwtService = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
    };

    service = new AuthService(
      prisma as never,
      jwtService as never,
      {} as never,
      {} as never,
      {} as never,
      usersService as unknown as UsersService,
      {} as never,
      {} as never,
    );

    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-value' as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a guest customer in users and returns auth tokens', async () => {
    prisma.restaurant.findFirst.mockResolvedValue({ tenantId: 'tenant-1' });
    usersService.create!.mockResolvedValue({
      id: 'guest-1',
      email: 'guest+restaurant-1@guest.deliveryways.local',
      role: 'CUSTOMER',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: null,
      isVerified: false,
      isApproved: true,
      isGuest: true,
      profile: {
        firstName: 'Guest',
        lastName: 'Customer',
      },
    });

    const result = await service.registerGuestCustomer({
      restaurantId: 'restaurant-1',
    });

    expect(prisma.restaurant.findFirst).toHaveBeenCalledWith({
      where: { id: 'restaurant-1', deletedAt: null },
      select: { tenantId: true },
    });
    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'CUSTOMER',
        restaurantId: 'restaurant-1',
        tenantId: 'tenant-1',
        isGuest: true,
        isVerified: false,
        isApproved: true,
      }),
      {},
    );
    expect(result.data.user.isGuest).toBe(true);
    expect(result.data.accessToken).toBe('access-token');
  });
});
