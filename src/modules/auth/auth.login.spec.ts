import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserRoleEnum } from '../../common/enums';
import { UsersService } from '../users/users.service';

describe('AuthService login', () => {
  let service: AuthService;
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;
  let jwtService: { signAsync: jest.Mock };

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      setRefreshTokenHash: jest.fn(),
    };

    jwtService = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
    };

    service = new AuthService(
      {} as never,
      jwtService as never,
      {} as never,
      {} as never,
      {} as never,
      usersService as unknown as UsersService,
      {} as never,
    );

    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-refresh' as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires restaurantId for customer login', async () => {
    usersService.findByEmail!.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@example.com',
      password: 'hashed-password',
      role: UserRoleEnum.CUSTOMER,
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: null,
      isVerified: true,
      isApproved: true,
      profile: null,
    });

    await expect(
      service.login({
        email: 'customer@example.com',
        password: 'Password@123',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(usersService.findByEmail).toHaveBeenCalledWith(
      'customer@example.com',
      undefined,
    );
  });

  it('uses restaurantId when customer logs in', async () => {
    usersService.findByEmail!.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@example.com',
      password: 'hashed-password',
      role: UserRoleEnum.CUSTOMER,
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: null,
      isVerified: true,
      isApproved: true,
      profile: null,
    });

    const result = await service.login({
      email: 'customer@example.com',
      password: 'Password@123',
      restaurantId: 'restaurant-1',
    });

    expect(usersService.findByEmail).toHaveBeenCalledWith(
      'customer@example.com',
      'restaurant-1',
    );
    expect(result.data.accessToken).toBe('access-token');
    expect(usersService.setRefreshTokenHash).toHaveBeenCalledWith(
      'customer-1',
      'hashed-refresh',
    );
  });

  it('rejects invalid credentials', async () => {
    usersService.findByEmail!.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'missing@example.com',
        password: 'Password@123',
        restaurantId: 'restaurant-1',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
