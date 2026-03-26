import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserRoleEnum } from '../../common/enums';
import { UsersService } from '../users/users.service';
import { StaffManagementRepository } from '../staff-management/staff-management.repository';

describe('AuthService login', () => {
  let service: AuthService;
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;
  let staffManagementRepository: Partial<
    Record<keyof StaffManagementRepository, jest.Mock>
  >;
  let jwtService: { signAsync: jest.Mock };

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      setRefreshTokenHash: jest.fn(),
    };

    staffManagementRepository = {
      findByEmail: jest.fn(),
      update: jest.fn(),
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
      staffManagementRepository as never,
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
      isActive: true,
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
      isActive: true,
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

  it('allows staff login through the dedicated endpoint', async () => {
    staffManagementRepository.findByEmail!.mockResolvedValue({
      id: 'staff-1',
      email: 'staff@example.com',
      password: 'hashed-password',
      ownerUserId: 'admin-1',
      staffRoleId: 'role-1',
      panelType: 'BUSINESS_ADMIN',
      tenantId: 'tenant-1',
      restaurantId: null,
      branchId: null,
      isVerified: true,
      isApproved: true,
      isActive: true,
      deletedAt: null,
      firstName: 'Staff',
      lastName: 'User',
      phone: null,
      avatarUrl: null,
      bio: null,
      staffRole: {
        id: 'role-1',
        isActive: true,
        deletedAt: null,
        permissions: [{ access: 'orders', operations: ['read'] }],
      },
    });

    const result = await service.loginStaff({
      email: 'staff@example.com',
      password: 'Password@123',
    });

    expect(staffManagementRepository.findByEmail).toHaveBeenCalledWith(
      'staff@example.com',
    );
    expect(result.data.user.actorType).toBe('STAFF');
    expect(staffManagementRepository.update).toHaveBeenCalledWith('staff-1', {
      refreshTokenHash: 'hashed-refresh',
    });
  });

  it('rejects staff login when assigned role is inactive', async () => {
    staffManagementRepository.findByEmail!.mockResolvedValue({
      id: 'staff-1',
      email: 'staff@example.com',
      password: 'hashed-password',
      ownerUserId: 'admin-1',
      staffRoleId: 'role-1',
      panelType: 'BUSINESS_ADMIN',
      tenantId: 'tenant-1',
      restaurantId: null,
      branchId: null,
      isVerified: true,
      isApproved: true,
      isActive: true,
      deletedAt: null,
      firstName: 'Staff',
      lastName: 'User',
      phone: null,
      avatarUrl: null,
      bio: null,
      staffRole: {
        id: 'role-1',
        isActive: false,
        deletedAt: null,
        permissions: [],
      },
    });

    await expect(
      service.loginStaff({
        email: 'staff@example.com',
        password: 'Password@123',
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
