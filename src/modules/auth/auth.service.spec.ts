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

describe('AuthService registerTenant branch admin onboarding', () => {
  let service: AuthService;
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;
  const prisma = {
    $transaction: jest.fn(),
  };
  const tx = {
    branch: {
      update: jest.fn(),
    },
  };
  const jwtService = {
    signAsync: jest.fn(),
  };
  const tenantsService = {
    findBySlug: jest.fn(),
    create: jest.fn(),
    assignOwner: jest.fn(),
  };
  const restaurantsService = {
    create: jest.fn(),
  };
  const branchesService = {
    create: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    usersService = {
      existsByEmailAndRole: jest.fn().mockResolvedValue(false),
      create: jest
        .fn()
        .mockResolvedValueOnce({ id: 'owner-1', email: 'owner@example.com' })
        .mockResolvedValueOnce({
          id: 'branch-admin-1',
          email: 'branch.admin@example.com',
        }),
      setRefreshTokenHash: jest.fn().mockResolvedValue(undefined),
    };
    tenantsService.findBySlug.mockResolvedValue(null);
    tenantsService.create.mockResolvedValue({ id: 'tenant-1' });
    tenantsService.assignOwner.mockResolvedValue(undefined);
    restaurantsService.create.mockResolvedValue({ id: 'restaurant-1' });
    branchesService.create.mockResolvedValue({ id: 'branch-1' });
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    );
    tx.branch.update.mockResolvedValue({ id: 'branch-1' });
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    service = new AuthService(
      prisma as never,
      jwtService as never,
      tenantsService as never,
      restaurantsService as never,
      branchesService as never,
      usersService as unknown as UsersService,
      {} as never,
      {} as never,
    );
  });

  it('creates branch admin credentials while registering a tenant', async () => {
    const result = await service.registerTenant({
      user: {
        email: ' Owner@Example.COM ',
        password: 'Owner@12345',
        firstName: 'Owner',
        lastName: 'User',
      },
      branchAdmin: {
        email: ' Branch.Admin@Example.COM ',
        password: 'Branch@12345',
        firstName: 'Branch',
        lastName: 'Admin',
        phone: '+923001234567',
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
    });

    expect(usersService.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        email: 'branch.admin@example.com',
        role: UserRoleEnum.BRANCH_ADMIN,
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        isVerified: true,
        isApproved: true,
        profile: {
          firstName: 'Branch',
          lastName: 'Admin',
          phone: '+923001234567',
        },
      }),
      tx,
    );
    expect(tx.branch.update).toHaveBeenCalledWith({
      where: { id: 'branch-1' },
      data: {
        manager: {
          connect: {
            id: 'branch-admin-1',
          },
        },
      },
    });
    expect(result.data.branchAdminId).toBe('branch-admin-1');
    expect(result.data.branchAdminCredentials).toEqual({
      email: 'branch.admin@example.com',
      password: 'Branch@12345',
    });
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

  it('allows branch admin to update own profile without touching email', async () => {
    usersService
      .findById!.mockResolvedValueOnce({
        id: 'branch-admin-1',
        email: 'branch.admin@example.com',
        role: UserRoleEnum.BRANCH_ADMIN,
        profile: {
          id: 'profile-3',
          firstName: 'Branch',
          lastName: 'Admin',
          phone: '+923001111111',
        },
      })
      .mockResolvedValueOnce({
        id: 'branch-admin-1',
        email: 'branch.admin@example.com',
        role: UserRoleEnum.BRANCH_ADMIN,
        profile: {
          id: 'profile-3',
          firstName: 'Updated',
          lastName: 'Manager',
          phone: '+923009999999',
          bio: 'Branch lead',
        },
      });

    const result = await service.updateMyProfile(
      {
        uid: 'branch-admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.BRANCH_ADMIN,
      },
      {
        firstName: 'Updated',
        lastName: 'Manager',
        phone: '+923009999999',
        bio: 'Branch lead',
      },
    );

    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { id: 'profile-3' },
      data: {
        firstName: 'Updated',
        lastName: 'Manager',
        avatarUrl: undefined,
        phone: '+923009999999',
        bio: 'Branch lead',
      },
    });
    expect(result.data.profile).toEqual({
      id: 'profile-3',
      firstName: 'Updated',
      lastName: 'Manager',
      phone: '+923009999999',
      bio: 'Branch lead',
    });
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

describe('AuthService dev user account tools', () => {
  let service: AuthService;
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;
  const now = new Date('2026-06-10T00:00:00.000Z');
  const user = {
    id: 'user-1',
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
    deleteAfter: null,
    createdAt: now,
    updatedAt: now,
    profile: null,
  };
  const prisma = {
    user: {
      update: jest.fn(),
    },
    profile: {
      upsert: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    usersService = {
      findManyForDevResolution: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
      deleteManyByIds: jest.fn(),
      softDeleteUser: jest.fn(),
    };
    prisma.user.update.mockResolvedValue(user);
    prisma.profile.upsert.mockResolvedValue({ id: 'profile-1' });

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

  afterEach(() => {
    process.env.NODE_ENV = 'test';
    jest.restoreAllMocks();
  });

  it('fetches dev user details by email without exposing password', async () => {
    usersService.findManyForDevResolution!.mockResolvedValue([user]);

    const result = await service.devUserDetails({
      email: ' Customer@Example.COM ',
      restaurantId: 'restaurant-1',
    });

    expect(usersService.findManyForDevResolution).toHaveBeenCalledWith({
      id: undefined,
      email: 'customer@example.com',
      restaurantId: 'restaurant-1',
      role: undefined,
      includeDeleted: undefined,
    });
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'user-1',
        email: 'customer@example.com',
        role: UserRoleEnum.CUSTOMER,
      }),
    ]);
    expect(result.data[0]).not.toHaveProperty('password');
  });

  it('updates email and password for a single matched dev user', async () => {
    usersService.findManyForDevResolution!.mockResolvedValue([user]);
    usersService.findByEmail!.mockResolvedValue(null);
    usersService.findById!.mockResolvedValue({
      ...user,
      email: 'new@example.com',
    });
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('new-hash' as never);

    const result = await service.updateDevUser({
      userId: 'user-1',
      newEmail: ' New@Example.COM ',
      newPassword: 'Password@123',
      firstName: 'New',
      isVerified: true,
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        email: 'new@example.com',
        password: 'new-hash',
        refreshTokenHash: null,
        isVerified: true,
      },
      include: { profile: true },
    });
    expect(prisma.profile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: {
        userId: 'user-1',
        firstName: 'New',
        lastName: 'customer',
        phone: undefined,
      },
      update: {
        firstName: 'New',
        lastName: undefined,
        phone: undefined,
      },
    });
    expect(result.data.email).toBe('new@example.com');
  });

  it('blocks dev user tools in production', async () => {
    process.env.NODE_ENV = 'production';

    await expect(
      service.devUserDetails({ email: 'customer@example.com' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('hard-deletes a single matched dev user when force is true', async () => {
    usersService.findManyForDevResolution!.mockResolvedValue([user]);
    usersService.deleteManyByIds!.mockResolvedValue({ count: 1 });

    const result = await service.deleteDevUser({
      userId: 'user-1',
      force: true,
    });

    expect(usersService.deleteManyByIds).toHaveBeenCalledWith(['user-1']);
    expect(result).toEqual({
      data: {
        id: 'user-1',
        deletedCount: 1,
        force: true,
      },
      message: 'Development user hard-deleted',
    });
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
