import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserRoleEnum } from '../../common/enums';
import { UsersService } from '../users/users.service';

describe('AuthService googleLogin', () => {
  const environment = process['env'];
  const originalGoogleClientId = environment.GOOGLE_CLIENT_ID;
  let service: AuthService;
  let prisma: {
    restaurant: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;
  let jwtService: { signAsync: jest.Mock };

  const customer = {
    id: 'customer-1',
    email: 'customer@example.com',
    role: UserRoleEnum.CUSTOMER,
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: null,
    isVerified: true,
    isApproved: true,
    isGuest: false,
    isActive: true,
    deletedAt: null,
    deleteAfter: null,
    profile: {
      firstName: 'Ada',
      lastName: 'Lovelace',
    },
  };

  beforeEach(() => {
    environment.GOOGLE_CLIENT_ID = 'google-client-id';
    prisma = {
      restaurant: { findFirst: jest.fn() },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(callback({})),
      ),
    };
    usersService = {
      create: jest.fn(),
      findByEmailIncludingDeleted: jest.fn(),
      findManyForDevResolution: jest.fn(),
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
    if (originalGoogleClientId === undefined) {
      delete environment.GOOGLE_CLIENT_ID;
    } else {
      environment.GOOGLE_CLIENT_ID = originalGoogleClientId;
    }
  });

  const mockGoogleToken = (overrides: Record<string, unknown> = {}) => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        aud: 'google-client-id',
        email: 'customer@example.com',
        email_verified: 'true',
        given_name: 'Ada',
        family_name: 'Lovelace',
        ...overrides,
      }),
    } as never);
  };

  it('signs in an existing customer only in the selected restaurant', async () => {
    mockGoogleToken();
    usersService.findManyForDevResolution!.mockResolvedValue([customer]);

    const result = await service.googleLogin({
      idToken: 'valid-google-token-value',
      restaurantId: 'restaurant-1',
    });

    expect(usersService.findManyForDevResolution).toHaveBeenCalledWith({
      email: 'customer@example.com',
      restaurantId: 'restaurant-1',
      role: UserRoleEnum.CUSTOMER,
      includeDeleted: true,
    });
    expect(usersService.create).not.toHaveBeenCalled();
    expect(result.data.user.id).toBe('customer-1');
    expect(result.data.user.authProvider).toBe('GOOGLE');
  });

  it('creates and signs in a verified customer when the scoped account is missing', async () => {
    mockGoogleToken({ picture: 'https://images.example.com/ada.png' });
    usersService
      .findManyForDevResolution!.mockResolvedValueOnce([])
      .mockResolvedValueOnce([customer]);
    prisma.restaurant.findFirst.mockResolvedValue({ tenantId: 'tenant-1' });

    const result = await service.googleLogin({
      idToken: 'valid-google-token-value',
      restaurantId: 'restaurant-1',
    });

    expect(prisma.restaurant.findFirst).toHaveBeenCalledWith({
      where: { id: 'restaurant-1', deletedAt: null },
      select: { tenantId: true },
    });
    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'customer@example.com',
        role: UserRoleEnum.CUSTOMER,
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        isVerified: true,
        isApproved: true,
        isGuest: false,
        profile: {
          firstName: 'Ada',
          lastName: 'Lovelace',
          avatarUrl: 'https://images.example.com/ada.png',
        },
      }),
      {},
    );
    expect(result.data.user.id).toBe('customer-1');
  });

  it('rejects a Google token with a different audience', async () => {
    mockGoogleToken({ aud: 'another-client-id' });

    await expect(
      service.googleLogin({
        idToken: 'valid-google-token-value',
        restaurantId: 'restaurant-1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersService.create).not.toHaveBeenCalled();
  });
});
