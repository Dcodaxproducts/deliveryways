import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserRoleEnum } from '../../common/enums';
import { UsersService } from '../users/users.service';

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
