import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRoleEnum } from '../../common/enums';
import { BranchScheduleDayEnum } from './dto';
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
      findById: jest.fn(),
      listBranchAddresses: jest.fn(),
      findActiveCustomer: jest.fn(),
      findActiveCustomerById: jest.fn(),
      findOwnedCustomerAddress: jest.fn(),
      findActiveBranchAddress: jest.fn(),
      updateBranchAddress: jest.fn(),
      createBranchAddress: jest.fn(),
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

  it('updates branch address fields through branch update endpoint', async () => {
    const { service, repository, prisma } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
    });
    repository.update.mockResolvedValue({
      id: 'branch-1',
      name: 'Updated Branch',
    });
    repository.updateBranchAddress.mockResolvedValue({
      id: 'address-1',
    });
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback({}),
    );

    const result = await service.update(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
      {
        name: 'Updated Branch',
        street: 'Street 99',
        area: 'Phase 8',
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
        lat: '31.5700',
        lng: '74.3300',
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'branch-1',
      expect.objectContaining({
        name: 'Updated Branch',
      }),
      expect.any(Object),
    );
    expect(repository.updateBranchAddress).toHaveBeenCalledWith(
      'branch-1',
      expect.objectContaining({
        street: 'Street 99',
        area: 'Phase 8',
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
      }),
      expect.any(Object),
    );
    expect(repository.createBranchAddress).not.toHaveBeenCalled();
    expect(result.message).toBe('Branch updated successfully');
  });

  it('creates branch for business admin without requiring restaurantId in body', async () => {
    const { service, repository, usersService } = makeService();
    repository.create.mockResolvedValue({
      id: 'branch-1',
      name: 'Main Branch',
    });
    usersService.findByEmail.mockResolvedValue(null);

    const result = await service.createFromUser(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        name: 'Main Branch',
        street: 'Street 12',
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
        lat: '31.5204',
        lng: '74.3587',
      },
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
      }),
      undefined,
    );
    expect(result.message).toBe('Branch created successfully');
  });

  it('fetches branch details with populated address', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      name: 'Main',
      coverImage: null,
      description: null,
      settings: null,
      isMain: true,
      isActive: true,
      deletedAt: null,
      managerId: null,
      manager: null,
      restaurant: {
        id: 'restaurant-1',
        name: 'Restaurant',
        slug: 'restaurant',
        logoUrl: null,
        coverImage: null,
      },
    });
    repository.listBranchAddresses.mockResolvedValue([
      {
        referenceId: 'branch-1',
        lat: 31.5204,
        lng: 74.3587,
        street: 'Street 1',
        area: null,
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
      },
    ]);

    const result = await service.details(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      'branch-1',
    );

    expect(repository.findById).toHaveBeenCalledWith('branch-1');
    expect(
      (result.data as { address?: { city: string } | null }).address?.city,
    ).toBe('Lahore');
  });

  it('allows super admin to fetch all branches without restaurant filter', async () => {
    const { service, repository } = makeService();
    repository.listByRestaurant.mockResolvedValue({ items: [], total: 0 });
    repository.listBranchAddresses.mockResolvedValue([]);

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
    repository.listBranchAddresses.mockResolvedValue([]);

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
    repository.listByRestaurant.mockResolvedValue({
      items: [
        {
          id: 'branch-1',
          name: 'Main',
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
      total: 1,
    });
    repository.listBranchAddresses.mockResolvedValue([
      {
        referenceId: 'branch-1',
        lat: 31.5204,
        lng: 74.3587,
        street: 'Street 1',
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
    expect(
      (result.data[0] as { address?: { city: string } | null }).address?.city,
    ).toBe('Lahore');
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

  it('gets branch opening hours from branch settings', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: {
        openingHours: [
          {
            dayOfWeek: BranchScheduleDayEnum.MONDAY,
            isClosed: false,
            openTime: '09:00',
            closeTime: '22:00',
          },
        ],
      },
    });

    const result = await service.getOpeningHours(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
    );

    expect(result.data).toEqual([
      {
        dayOfWeek: BranchScheduleDayEnum.MONDAY,
        isClosed: false,
        openTime: '09:00',
        closeTime: '22:00',
      },
    ]);
  });

  it('updates branch opening hours for business admin within tenant scope', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: { contact: { phone: '123' } },
    });
    repository.update.mockResolvedValue({ id: 'branch-1' });

    const result = await service.updateOpeningHours(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
      {
        openingHours: [
          {
            dayOfWeek: BranchScheduleDayEnum.TUESDAY,
            isClosed: false,
            openTime: '10:00',
            closeTime: '21:00',
          },
          {
            dayOfWeek: BranchScheduleDayEnum.MONDAY,
            isClosed: true,
          },
        ],
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'branch-1',
      expect.objectContaining({
        settings: {
          contact: { phone: '123' },
          openingHours: [
            {
              dayOfWeek: BranchScheduleDayEnum.MONDAY,
              isClosed: true,
              openTime: null,
              closeTime: null,
            },
            {
              dayOfWeek: BranchScheduleDayEnum.TUESDAY,
              isClosed: false,
              openTime: '10:00',
              closeTime: '21:00',
            },
          ],
        },
      }),
      undefined,
    );
    expect(
      (result.data as { openingHours: unknown[] }).openingHours,
    ).toHaveLength(2);
  });

  it('blocks branch admin from updating another branch opening hours', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-2',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: null,
    });

    await expect(
      service.updateOpeningHours(
        {
          uid: 'branch-admin-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
          role: UserRoleEnum.BRANCH_ADMIN,
        },
        'branch-2',
        {
          openingHours: [
            {
              dayOfWeek: BranchScheduleDayEnum.MONDAY,
              isClosed: false,
              openTime: '09:00',
              closeTime: '18:00',
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolves tenant automatically for public branch listing', async () => {
    const { service, repository } = makeService();
    repository.findTenantIdByRestaurant.mockResolvedValue('tenant-1');
    repository.listByRestaurant.mockResolvedValue({ items: [], total: 0 });
    repository.listBranchAddresses.mockResolvedValue([]);

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
