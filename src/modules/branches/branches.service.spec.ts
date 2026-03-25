import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRoleEnum } from '../../common/enums';
import { BranchesService } from './branches.service';

describe('BranchesService', () => {
  const makeService = () => {
    const repository = {
      create: jest.fn(),
      update: jest.fn(),
      listByBranchId: jest.fn(),
      listByRestaurant: jest.fn(),
      listAllByRestaurant: jest.fn(),
      findTenantIdByRestaurant: jest.fn(),
      listBranchAddresses: jest.fn(),
      findActiveCustomer: jest.fn(),
      findActiveCustomerById: jest.fn(),
      findOwnedCustomerAddress: jest.fn(),
      setActive: jest.fn(),
      softDelete: jest.fn(),
      getDeleteSummary: jest.fn(),
      forceDelete: jest.fn(),
    };

    const usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    };

    const prisma = {
      $transaction: jest.fn(),
      branch: { findUnique: jest.fn() },
    };

    const service = new BranchesService(
      repository as never,
      usersService as never,
      prisma as never,
    );

    return {
      service,
      repository,
      usersService,
      prisma,
    };
  };

  it('allows super admin to fetch all branches without restaurant filter', async () => {
    const { service, repository } = makeService();
    repository.listByRestaurant.mockResolvedValue({ items: [], total: 0 });

    const result = await service.list(
      {
        uid: 'super-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(repository.listByRestaurant).toHaveBeenCalledWith(
      undefined,
      undefined,
      expect.any(Object),
      false,
      false,
      false,
    );
    expect(result.message).toBe('Branches fetched successfully');
  });

  it('uses super admin restaurant filter to resolve tenant scope', async () => {
    const { service, repository } = makeService();
    repository.findTenantIdByRestaurant.mockResolvedValue('tenant-1');
    repository.listByRestaurant.mockResolvedValue({ items: [], total: 0 });

    await service.list(
      {
        uid: 'super-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        restaurantId: 'restaurant-1',
      },
    );

    expect(repository.findTenantIdByRestaurant).toHaveBeenCalledWith(
      'restaurant-1',
    );
    expect(repository.listByRestaurant).toHaveBeenCalledWith(
      'tenant-1',
      'restaurant-1',
      expect.any(Object),
      false,
      false,
      false,
    );
  });

  it('forces customer branch list to token restaurant scope', async () => {
    const { service, repository } = makeService();
    repository.listByRestaurant.mockResolvedValue({ items: [], total: 0 });

    await service.list(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(repository.listByRestaurant).toHaveBeenCalledWith(
      'tenant-1',
      'restaurant-1',
      expect.any(Object),
      false,
      false,
      false,
    );
  });

  it('rejects customer access to another restaurant', async () => {
    const { service } = makeService();

    await expect(
      service.list(
        {
          uid: 'customer-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
          restaurantId: 'restaurant-2',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sorts branches by nearest distance using provided lat/lng', async () => {
    const { service, repository } = makeService();
    repository.listAllByRestaurant.mockResolvedValue({
      items: [
        {
          id: 'branch-1',
          name: 'Far',
          createdAt: new Date(),
          updatedAt: new Date(),
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          coverImage: null,
          description: null,
          settings: null,
          isMain: false,
          isActive: true,
          deletedAt: null,
          managerId: null,
        },
        {
          id: 'branch-2',
          name: 'Near',
          createdAt: new Date(),
          updatedAt: new Date(),
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          coverImage: null,
          description: null,
          settings: null,
          isMain: false,
          isActive: true,
          deletedAt: null,
          managerId: null,
        },
      ],
      total: 2,
    });
    repository.listBranchAddresses.mockResolvedValue([
      {
        referenceId: 'branch-1',
        lat: 31.7,
        lng: 74.5,
        street: 'A',
        area: null,
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
      },
      {
        referenceId: 'branch-2',
        lat: 31.5205,
        lng: 74.3588,
        street: 'B',
        area: null,
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
      },
    ]);

    const result = await service.list(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        lat: 31.5204,
        lng: 74.3587,
      },
    );

    const firstBranch = result.data[0] as {
      id: string;
      distanceKm?: number | null;
    };
    expect(firstBranch.id).toBe('branch-2');
    expect(firstBranch.distanceKm).not.toBeNull();
    expect(repository.listAllByRestaurant).toHaveBeenCalled();
  });

  it('requires lat and lng together for nearest branch fetch', async () => {
    const { service } = makeService();

    await expect(
      service.list(
        {
          uid: 'customer-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
          lat: 31.5204,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolves tenant automatically for public branch listing', async () => {
    const { service, repository } = makeService();
    repository.findTenantIdByRestaurant.mockResolvedValue('tenant-1');
    repository.listByRestaurant.mockResolvedValue({ items: [], total: 0 });

    await service.listPublic({
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
      restaurantId: 'restaurant-1',
    });

    expect(repository.findTenantIdByRestaurant).toHaveBeenCalledWith(
      'restaurant-1',
    );
    expect(repository.listByRestaurant).toHaveBeenCalledWith(
      'tenant-1',
      'restaurant-1',
      expect.any(Object),
      true,
    );
  });
});
