import 'reflect-metadata';
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
  let prismaService: {
    branch: { findFirst: jest.Mock };
    deliveryman: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      findByEmailIncludingDeleted: jest.fn(),
      findManyForDevResolution: jest.fn(),
      cancelDeleteUser: jest.fn(),
      setRefreshTokenHash: jest.fn(),
    };

    staffManagementRepository = {
      findByEmail: jest.fn(),
      update: jest.fn(),
    };

    prismaService = {
      branch: {
        findFirst: jest.fn(),
      },
      deliveryman: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    jwtService = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token')
        .mockResolvedValueOnce('access-token-2')
        .mockResolvedValueOnce('refresh-token-2'),
      verifyAsync: jest.fn(),
    };

    service = new AuthService(
      prismaService as never,
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
    usersService.findManyForDevResolution!.mockResolvedValue([
      {
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
        isGuest: false,
        deletedAt: null,
        deleteAfter: null,
        profile: null,
      },
    ]);

    await expect(
      service.login({
        email: 'customer@example.com',
        password: 'Password@123',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(usersService.findManyForDevResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'customer@example.com',
        includeDeleted: true,
      }),
    );
  });

  it('uses restaurantId when customer logs in', async () => {
    usersService.findByEmailIncludingDeleted!.mockResolvedValue({
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
      isGuest: false,
      deletedAt: null,
      deleteAfter: null,
      profile: null,
    });

    const result = await service.login({
      email: 'customer@example.com',
      password: 'Password@123',
      restaurantId: 'restaurant-1',
    });

    expect(usersService.findByEmailIncludingDeleted).toHaveBeenCalledWith(
      'customer@example.com',
      'restaurant-1',
    );
    expect(result.data.accessToken).toBe('access-token');
    expect(result.data.user.deletionScheduled).toBe(false);
    expect(usersService.setRefreshTokenHash).toHaveBeenCalledWith(
      'customer-1',
      'hashed-refresh',
    );
  });

  it('returns scheduled-deletion metadata on login only for actual account deletion', async () => {
    usersService.findByEmailIncludingDeleted!.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@example.com',
      password: 'hashed-password',
      role: UserRoleEnum.CUSTOMER,
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: null,
      isVerified: true,
      isApproved: true,
      isActive: false,
      isGuest: false,
      deletedAt: new Date('2026-04-09T00:00:00.000Z'),
      deleteAfter: new Date('2099-05-09T00:00:00.000Z'),
      profile: null,
    });

    const result = await service.login({
      email: 'customer@example.com',
      password: 'Password@123',
      restaurantId: 'restaurant-1',
    });

    expect(result.message).toBe(
      'Your account is scheduled to delete. Request cancel deletion in order to cancel.',
    );
    expect(result.data.user.deletionScheduled).toBe(true);
    expect(result.data.user.canCancelDeletion).toBe(true);
    expect(result.data.deletionState).toMatchObject({
      reason: 'ACCOUNT_DELETION_SCHEDULED',
      canCancelDeletion: true,
    });
  });

  it('allows account deletion cancellation by login credentials', async () => {
    usersService.findByEmailIncludingDeleted!.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@example.com',
      password: 'hashed-password',
      role: UserRoleEnum.CUSTOMER,
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: null,
      isVerified: true,
      isApproved: true,
      isActive: false,
      isGuest: false,
      deletedAt: new Date('2026-04-09T00:00:00.000Z'),
      deleteAfter: new Date('2099-05-09T00:00:00.000Z'),
      profile: null,
    });

    const result = await service.cancelDeletionByLogin({
      email: 'customer@example.com',
      password: 'Password@123',
      restaurantId: 'restaurant-1',
    });

    expect(usersService.cancelDeleteUser).toHaveBeenCalledWith('customer-1');
    expect(result.data.accessToken).toBe('access-token');
    expect(result.message).toBe('Account deletion cancelled successfully');
  });

  it('rejects branch-admin login with assigned deleted branch as branch state, not account deletion state', async () => {
    usersService.findManyForDevResolution!.mockResolvedValue([
      {
        id: 'branch-admin-1',
        email: 'branch.admin@example.com',
        password: 'hashed-password',
        role: UserRoleEnum.BRANCH_ADMIN,
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        isVerified: true,
        isApproved: true,
        isActive: true,
        isGuest: false,
        deletedAt: null,
        deleteAfter: null,
        profile: null,
      },
    ]);
    prismaService.branch.findFirst.mockResolvedValue({
      id: 'branch-1',
      deletedAt: new Date('2026-04-09T00:00:00.000Z'),
      isActive: true,
    });

    await expect(
      service.login({
        email: 'branch.admin@example.com',
        password: 'Password@123',
      }),
    ).rejects.toMatchObject({
      response: {
        message:
          'Assigned branch is soft-deleted. Restore branch to continue login.',
        error: 'ASSIGNED_BRANCH_SOFT_DELETED',
        details: {
          deletionScheduled: false,
          canRestore: true,
        },
      },
      status: 403,
    });
  });

  it('uses role to resolve business admin when email is shared with branch admin', async () => {
    usersService.findManyForDevResolution!.mockResolvedValue([
      {
        id: 'business-admin-1',
        email: 'shared.admin@example.com',
        password: 'hashed-password',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tenantId: 'tenant-1',
        restaurantId: null,
        branchId: null,
        isVerified: true,
        isApproved: true,
        isActive: true,
        isGuest: false,
        deletedAt: null,
        deleteAfter: null,
        profile: null,
      },
    ]);

    const result = await service.login({
      email: 'shared.admin@example.com',
      password: 'Password@123',
      role: UserRoleEnum.BUSINESS_ADMIN,
    });

    expect(usersService.findManyForDevResolution).toHaveBeenCalledWith({
      email: 'shared.admin@example.com',
      role: UserRoleEnum.BUSINESS_ADMIN,
      restaurantId: undefined,
      includeDeleted: true,
    });
    expect(result.data.user.role).toBe(UserRoleEnum.BUSINESS_ADMIN);
    expect(result.data.user.restaurantId).toBeNull();
    expect(result.data.user.branchId).toBeNull();
  });

  it('rejects business admin login when registration verification is pending', async () => {
    usersService.findManyForDevResolution!.mockResolvedValue([
      {
        id: 'business-admin-1',
        email: 'owner@example.com',
        password: 'hashed-password',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tenantId: 'tenant-1',
        restaurantId: null,
        branchId: null,
        isVerified: false,
        isApproved: true,
        isActive: true,
        isGuest: false,
        deletedAt: null,
        deleteAfter: null,
        profile: null,
      },
    ]);

    await expect(
      service.login({
        email: 'owner@example.com',
        password: 'Password@123',
        role: UserRoleEnum.BUSINESS_ADMIN,
      }),
    ).rejects.toThrow('Your tenant profile is pending verification');

    expect(usersService.setRefreshTokenHash).not.toHaveBeenCalled();
  });

  it('rejects business admin login when super admin approval is pending', async () => {
    usersService.findManyForDevResolution!.mockResolvedValue([
      {
        id: 'business-admin-1',
        email: 'owner@example.com',
        password: 'hashed-password',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tenantId: 'tenant-1',
        restaurantId: null,
        branchId: null,
        isVerified: true,
        isApproved: false,
        isActive: true,
        isGuest: false,
        deletedAt: null,
        deleteAfter: null,
        profile: null,
      },
    ]);

    await expect(
      service.login({
        email: 'owner@example.com',
        password: 'Password@123',
        role: UserRoleEnum.BUSINESS_ADMIN,
      }),
    ).rejects.toThrow('Your tenant profile is pending super admin approval');

    expect(usersService.setRefreshTokenHash).not.toHaveBeenCalled();
  });

  it('rejects business admin login when platform access is inactive', async () => {
    usersService.findManyForDevResolution!.mockResolvedValue([
      {
        id: 'business-admin-1',
        email: 'owner@example.com',
        password: 'hashed-password',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tenantId: 'tenant-1',
        restaurantId: null,
        branchId: null,
        isVerified: true,
        isApproved: true,
        isActive: false,
        isGuest: false,
        deletedAt: null,
        deleteAfter: null,
        profile: null,
      },
    ]);

    await expect(
      service.login({
        email: 'owner@example.com',
        password: 'Password@123',
        role: UserRoleEnum.BUSINESS_ADMIN,
      }),
    ).rejects.toThrow('Your account is inactive');

    expect(usersService.setRefreshTokenHash).not.toHaveBeenCalled();
  });

  it('uses role to resolve branch admin when email is shared with business admin', async () => {
    usersService.findManyForDevResolution!.mockResolvedValue([
      {
        id: 'branch-admin-1',
        email: 'shared.admin@example.com',
        password: 'hashed-password',
        role: UserRoleEnum.BRANCH_ADMIN,
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        isVerified: true,
        isApproved: true,
        isActive: true,
        isGuest: false,
        deletedAt: null,
        deleteAfter: null,
        profile: null,
      },
    ]);
    prismaService.branch.findFirst.mockResolvedValue({
      id: 'branch-1',
      deletedAt: null,
      isActive: true,
    });

    const result = await service.login({
      email: 'shared.admin@example.com',
      password: 'Password@123',
      role: UserRoleEnum.BRANCH_ADMIN,
    });

    expect(usersService.findManyForDevResolution).toHaveBeenCalledWith({
      email: 'shared.admin@example.com',
      role: UserRoleEnum.BRANCH_ADMIN,
      restaurantId: undefined,
      includeDeleted: true,
    });
    expect(result.data.user.role).toBe(UserRoleEnum.BRANCH_ADMIN);
    expect(result.data.user.restaurantId).toBe('restaurant-1');
    expect(result.data.user.branchId).toBe('branch-1');
  });

  it('requires role when email is shared by multiple admin accounts', async () => {
    usersService.findManyForDevResolution!.mockResolvedValue([
      {
        id: 'branch-admin-1',
        email: 'shared.admin@example.com',
        password: 'hashed-password',
        role: UserRoleEnum.BRANCH_ADMIN,
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        isVerified: true,
        isApproved: true,
        isActive: true,
        isGuest: false,
        deletedAt: null,
        deleteAfter: null,
        profile: null,
      },
      {
        id: 'business-admin-1',
        email: 'shared.admin@example.com',
        password: 'hashed-password',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tenantId: 'tenant-1',
        restaurantId: null,
        branchId: null,
        isVerified: true,
        isApproved: true,
        isActive: true,
        isGuest: false,
        deletedAt: null,
        deleteAfter: null,
        profile: null,
      },
    ]);

    await expect(
      service.login({
        email: 'shared.admin@example.com',
        password: 'Password@123',
      }),
    ).rejects.toThrow(
      'Multiple admin accounts use this email. Specify role to login.',
    );
  });

  it('rejects invalid credentials', async () => {
    usersService.findByEmailIncludingDeleted!.mockResolvedValue(null);

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

  it('logs in deliveryman with the password stored on the deliveryman record', async () => {
    prismaService.deliveryman.findFirst.mockResolvedValue({
      id: 'deliveryman-1',
      email: 'rider@example.com',
      password: 'hashed-rider-password',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      isActive: true,
      deletedAt: null,
      firstName: 'Rider',
      lastName: 'User',
      phone: '03000000000',
      vehicleType: 'bike',
      vehicleNumber: 'RDR-1',
      twoFactorEnabled: false,
    });

    const result = await service.loginDeliveryman({
      email: 'rider@example.com',
      password: 'Rider@123',
    });

    expect(prismaService.deliveryman.findFirst).toHaveBeenCalledWith({
      where: {
        email: 'rider@example.com',
        deletedAt: null,
      },
    });
    expect(bcrypt.compare).toHaveBeenCalledWith(
      'Rider@123',
      'hashed-rider-password',
    );
    expect(prismaService.deliveryman.update).toHaveBeenCalledWith({
      where: { id: 'deliveryman-1' },
      data: { refreshTokenHash: 'hashed-refresh' },
    });
    expect(result.message).toBe('Deliveryman login successful');
    const loginData = result.data as {
      user: { vehicle: { type: string | null; number: string | null } };
    };
    expect(loginData.user.vehicle).toEqual({
      type: 'bike',
      number: 'RDR-1',
    });
  });

  it('requires OTP verification when deliveryman 2FA is enabled', async () => {
    prismaService.deliveryman.findFirst.mockResolvedValue({
      id: 'deliveryman-1',
      email: 'rider@example.com',
      password: 'hashed-rider-password',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      isActive: true,
      deletedAt: null,
      firstName: 'Rider',
      lastName: 'User',
      phone: '03000000000',
      vehicleType: 'bike',
      vehicleNumber: 'RDR-1',
      twoFactorEnabled: true,
    });

    const result = await service.loginDeliveryman({
      email: 'rider@example.com',
      password: 'Rider@123',
    });

    expect(prismaService.deliveryman.update).toHaveBeenCalledWith({
      where: { id: 'deliveryman-1' },
      data: {
        twoFactorOtp: expect.any(String) as unknown as string,
        twoFactorOtpExpiresAt: expect.any(Date) as unknown as Date,
        twoFactorOtpAttempts: 0,
      },
    });
    expect(result.data).toEqual(
      expect.objectContaining({
        requiresTwoFactor: true,
        twoFactorToken: 'access-token',
      }),
    );
  });

  it('verifies deliveryman 2FA OTP and issues auth tokens', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      uid: 'deliveryman-1',
      actorType: 'DELIVERYMAN',
      purpose: 'DELIVERYMAN_2FA',
    });
    prismaService.deliveryman.findUnique.mockResolvedValue({
      id: 'deliveryman-1',
      email: 'rider@example.com',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      isActive: true,
      deletedAt: null,
      firstName: 'Rider',
      lastName: 'User',
      phone: '03000000000',
      vehicleType: 'bike',
      vehicleNumber: 'RDR-1',
      twoFactorEnabled: true,
      twoFactorOtp: '123456',
      twoFactorOtpExpiresAt: new Date(Date.now() + 60_000),
      twoFactorOtpAttempts: 0,
    });

    const result = await service.verifyDeliverymanTwoFactor({
      twoFactorToken: '2fa-token',
      otp: '123456',
    });

    expect(prismaService.deliveryman.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'deliveryman-1' },
      data: {
        twoFactorOtp: null,
        twoFactorOtpExpiresAt: null,
        twoFactorOtpAttempts: 0,
      },
    });
    expect(prismaService.deliveryman.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'deliveryman-1' },
      data: { refreshTokenHash: 'hashed-refresh' },
    });
    expect(result.data.accessToken).toBe('access-token');
    expect(result.data.user.twoFactorEnabled).toBe(true);
  });

  it('refreshes deliveryman tokens with the deliveryman actor store', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      uid: 'deliveryman-1',
      type: 'refresh',
      actorType: 'DELIVERYMAN',
    });
    prismaService.deliveryman.findUnique.mockResolvedValue({
      id: 'deliveryman-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      refreshTokenHash: 'hashed-refresh',
      deletedAt: null,
    });

    const result = await service.refreshTokens({
      refreshToken: 'refresh-token',
    });

    expect(prismaService.deliveryman.findUnique).toHaveBeenCalledWith({
      where: { id: 'deliveryman-1' },
    });
    expect(prismaService.deliveryman.update).toHaveBeenCalledWith({
      where: { id: 'deliveryman-1' },
      data: { refreshTokenHash: 'hashed-refresh' },
    });
    expect(result.data.accessToken).toBe('access-token');
    expect(result.data.refreshToken).toBe('refresh-token');
  });
});
