import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserRoleEnum } from '../../common/enums';
import { UsersService } from '../users/users.service';

describe('AuthService checkEmailRole', () => {
  let service: AuthService;
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;

  beforeEach(() => {
    usersService = {
      existsByEmailAndRole: jest.fn(),
    };

    service = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      usersService as unknown as UsersService,
      {} as never,
      {} as never,
    );
  });

  it('returns true when the email already exists for the role and scope', async () => {
    usersService.existsByEmailAndRole!.mockResolvedValue(true);

    const result = await service.checkEmailRole({
      email: ' Customer@Example.COM ',
      role: UserRoleEnum.CUSTOMER,
      restaurantId: 'restaurant-1',
    });

    expect(usersService.existsByEmailAndRole).toHaveBeenCalledWith({
      email: 'customer@example.com',
      role: UserRoleEnum.CUSTOMER,
      restaurantId: 'restaurant-1',
    });
    expect(result).toEqual({
      data: {
        exists: true,
        email: 'customer@example.com',
        role: UserRoleEnum.CUSTOMER,
        restaurantId: 'restaurant-1',
      },
      message: 'Email already exists for this role',
    });
  });

  it('returns false when the email is available for the role', async () => {
    usersService.existsByEmailAndRole!.mockResolvedValue(false);

    const result = await service.checkEmailRole({
      email: 'owner@example.com',
      role: UserRoleEnum.BUSINESS_ADMIN,
    });

    expect(usersService.existsByEmailAndRole).toHaveBeenCalledWith({
      email: 'owner@example.com',
      role: UserRoleEnum.BUSINESS_ADMIN,
      restaurantId: undefined,
    });
    expect(result.data.exists).toBe(false);
    expect(result.message).toBe('Email is available for this role');
  });
});

describe('AuthService registerTenant duplicate email checks', () => {
  let service: AuthService;
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;
  const tenantsService = {
    findBySlug: jest.fn(),
  };

  const registerTenantDto = {
    user: {
      email: ' Owner@Example.COM ',
      password: 'password123',
      firstName: 'Owner',
      lastName: 'User',
    },
    tenant: {
      name: 'Tenant',
      slug: 'tenant',
    },
    restaurant: {
      name: 'Restaurant',
      slug: 'restaurant',
    },
    branch: {
      name: 'Main',
      street: 'Street',
      city: 'City',
      state: 'State',
      country: 'PK',
      lat: '33.6844',
      lng: '73.0479',
    },
  };

  beforeEach(() => {
    usersService = {
      existsByEmailAndRole: jest.fn(),
      findByEmail: jest.fn(),
    };
    tenantsService.findBySlug.mockReset();

    service = new AuthService(
      {} as never,
      {} as never,
      tenantsService as never,
      {} as never,
      {} as never,
      usersService as unknown as UsersService,
      {} as never,
      {} as never,
    );
  });

  it('blocks tenant registration only when a business admin email already exists', async () => {
    usersService.existsByEmailAndRole!.mockResolvedValue(true);

    await expect(service.registerTenant(registerTenantDto)).rejects.toThrow(
      BadRequestException,
    );

    expect(usersService.existsByEmailAndRole).toHaveBeenCalledWith({
      email: 'owner@example.com',
      role: UserRoleEnum.BUSINESS_ADMIN,
    });
    expect(usersService.findByEmail).not.toHaveBeenCalled();
    expect(tenantsService.findBySlug).not.toHaveBeenCalled();
  });

  it('does not block tenant registration just because the email exists for another role', async () => {
    usersService.existsByEmailAndRole!.mockResolvedValue(false);
    tenantsService.findBySlug.mockResolvedValue({ id: 'tenant-1' });

    await expect(service.registerTenant(registerTenantDto)).rejects.toThrow(
      ConflictException,
    );

    expect(usersService.existsByEmailAndRole).toHaveBeenCalledWith({
      email: 'owner@example.com',
      role: UserRoleEnum.BUSINESS_ADMIN,
    });
    expect(usersService.findByEmail).not.toHaveBeenCalled();
    expect(tenantsService.findBySlug).toHaveBeenCalledWith('tenant');
  });
});

describe('AuthService listCustomers and customerDetails', () => {
  let service: AuthService;
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;

  beforeEach(() => {
    usersService = {
      listCustomers: jest.fn(),
      findCustomerById: jest.fn(),
    };

    service = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      usersService as unknown as UsersService,
      {} as never,
      {} as never,
    );
  });

  it('allows super admin to list all customers without tenant context', async () => {
    usersService.listCustomers!.mockResolvedValue({
      items: [{ id: 'customer-1' }],
      total: 1,
    });

    const result = await service.listCustomers(
      {
        uid: 'super-admin-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(usersService.listCustomers).toHaveBeenCalledWith(
      undefined,
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
      false,
    );
    expect(result.message).toBe('Customers fetched successfully');
  });

  it('allows business admin customer list across tenant and preserves explicit restaurant filter', async () => {
    usersService.listCustomers!.mockResolvedValue({
      items: [],
      total: 0,
    });

    await service.listCustomers(
      {
        uid: 'business-admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        page: 1,
        limit: 10,
        restaurantId: 'restaurant-2',
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(usersService.listCustomers).toHaveBeenCalledWith(
      'tenant-1',
      {
        page: 1,
        limit: 10,
        restaurantId: 'restaurant-2',
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
      false,
    );
  });

  it('allows super admin to fetch a customer by id', async () => {
    usersService.findCustomerById!.mockResolvedValue({ id: 'customer-1' });

    const result = await service.customerDetails(
      {
        uid: 'super-admin-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'customer-1',
      { restaurantId: 'restaurant-1' },
    );

    expect(usersService.findCustomerById).toHaveBeenCalledWith('customer-1', {
      tenantId: undefined,
      restaurantId: 'restaurant-1',
    });
    expect(result.message).toBe('Customer fetched successfully');
  });

  it('requires restaurant context for business admin customer details', async () => {
    await expect(
      service.customerDetails(
        {
          uid: 'business-admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        'customer-1',
        {},
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws when customer is not found', async () => {
    usersService.findCustomerById!.mockResolvedValue(null);

    await expect(
      service.customerDetails(
        {
          uid: 'super-admin-1',
          role: UserRoleEnum.SUPER_ADMIN,
        },
        'missing-customer',
        {},
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('AuthService updateMyProfile', () => {
  let service: AuthService;
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;
  let prisma: {
    profile: {
      update: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    usersService = {
      findById: jest.fn(),
    };

    prisma = {
      profile: {
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    service = new AuthService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      usersService as unknown as UsersService,
      {} as never,
      {} as never,
    );
  });

  it('updates existing customer profile', async () => {
    usersService
      .findById!.mockResolvedValueOnce({
        id: 'user-1',
        email: 'customer@example.com',
        profile: {
          id: 'profile-1',
          firstName: 'Old',
          lastName: 'Name',
        },
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        profile: {
          id: 'profile-1',
          firstName: 'Bilal',
          lastName: 'Shah',
          phone: '+447700900123',
          bio: 'Updated bio',
        },
      });

    const result = await service.updateMyProfile(
      {
        uid: 'user-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        firstName: 'Bilal',
        lastName: 'Shah',
        phone: '+447700900123',
        bio: 'Updated bio',
      },
    );

    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: {
        firstName: 'Bilal',
        lastName: 'Shah',
        avatarUrl: undefined,
        phone: '+447700900123',
        bio: 'Updated bio',
      },
    });
    expect(result.message).toBe('Profile updated successfully');
  });

  it('creates profile when authenticated user has none', async () => {
    usersService
      .findById!.mockResolvedValueOnce({
        id: 'user-2',
        email: 'newcustomer@example.com',
        profile: null,
      })
      .mockResolvedValueOnce({
        id: 'user-2',
        profile: {
          id: 'profile-2',
          firstName: 'New',
          lastName: 'Customer',
          avatarUrl: 'https://cdn.example.com/avatar.png',
        },
      });

    const result = await service.updateMyProfile(
      {
        uid: 'user-2',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        firstName: 'New',
        lastName: 'Customer',
        avatarUrl: 'https://cdn.example.com/avatar.png',
      },
    );

    expect(prisma.profile.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-2',
        firstName: 'New',
        lastName: 'Customer',
        avatarUrl: 'https://cdn.example.com/avatar.png',
        phone: undefined,
        bio: undefined,
      },
    });
    expect(result.data.id).toBe('user-2');
  });

  it('throws when authenticated user is missing', async () => {
    usersService.findById!.mockResolvedValue(null);

    await expect(
      service.updateMyProfile(
        {
          uid: 'missing-user',
          role: UserRoleEnum.CUSTOMER,
        },
        { firstName: 'Nope' },
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('AuthService login', () => {
  let service: AuthService;
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;
  let jwtService: {
    signAsync: jest.Mock;
  };

  beforeEach(() => {
    usersService = {
      findManyForDevResolution: jest.fn(),
      findByEmailIncludingDeleted: jest.fn(),
      setRefreshTokenHash: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('token-value'),
    };

    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    jest
      .spyOn(bcrypt, 'hash')
      .mockResolvedValue('hashed-refresh-token' as never);

    service = new AuthService(
      {
        branch: {
          findFirst: jest.fn(),
        },
      } as never,
      jwtService as never,
      {} as never,
      {} as never,
      {} as never,
      usersService as unknown as UsersService,
      {} as never,
      {
        update: jest.fn(),
      } as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prefers non-customer account when login email is shared with customer profiles', async () => {
    usersService.findManyForDevResolution!.mockResolvedValue([
      {
        id: 'customer-1',
        email: 'shared@example.com',
        password: 'hashed-password',
        role: UserRoleEnum.CUSTOMER,
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: null,
        isVerified: true,
        isApproved: true,
        isGuest: false,
        isActive: true,
        deletedAt: null,
        profile: null,
      },
      {
        id: 'business-admin-1',
        email: 'shared@example.com',
        password: 'hashed-password',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        isVerified: true,
        isApproved: true,
        isGuest: false,
        isActive: true,
        deletedAt: null,
        profile: null,
      },
    ]);

    const result = await service.login({
      email: 'shared@example.com',
      password: 'Admin@123456',
    });

    expect(usersService.findManyForDevResolution).toHaveBeenCalledWith({
      email: 'shared@example.com',
      includeDeleted: true,
    });
    expect(result.data.user.role).toBe(UserRoleEnum.BUSINESS_ADMIN);
    expect(result.data.user.restaurantId).toBeNull();
    expect(result.data.user.branchId).toBeNull();
  });

  it('still requires restaurantId for customer-only login', async () => {
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
        isGuest: false,
        isActive: true,
        deletedAt: null,
        profile: null,
      },
    ]);

    await expect(
      service.login({
        email: 'customer@example.com',
        password: 'Customer@123',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('AuthService logout', () => {
  let service: AuthService;
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;

  beforeEach(() => {
    usersService = {
      findById: jest.fn(),
      setRefreshTokenHash: jest.fn(),
    };

    service = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      usersService as unknown as UsersService,
      {} as never,
      {} as never,
    );
  });

  it('clears refresh token hash for authenticated user', async () => {
    usersService.findById!.mockResolvedValue({
      id: 'user-1',
      deletedAt: null,
    });
    usersService.setRefreshTokenHash!.mockResolvedValue({ id: 'user-1' });

    const result = await service.logout({
      uid: 'user-1',
      role: UserRoleEnum.CUSTOMER,
    });

    expect(usersService.setRefreshTokenHash).toHaveBeenCalledWith(
      'user-1',
      null,
    );
    expect(result.message).toBe('Logout successful');
  });
});

describe('AuthService changePassword', () => {
  let service: AuthService;
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;

  beforeEach(() => {
    usersService = {
      findById: jest.fn(),
      updatePassword: jest.fn(),
    };

    service = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      usersService as unknown as UsersService,
      {} as never,
      {} as never,
    );
  });

  it('returns bad request instead of unauthorized when current password is wrong', async () => {
    usersService.findById!.mockResolvedValue({
      id: 'user-1',
      password: await bcrypt.hash('Correct@123', 10),
    });

    await expect(
      service.changePassword(
        {
          uid: 'user-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          currentPassword: 'Wrong@123',
          newPassword: 'New@12345',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(usersService.updatePassword).not.toHaveBeenCalled();
  });
});
