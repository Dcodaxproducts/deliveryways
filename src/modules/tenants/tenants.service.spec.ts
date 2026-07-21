import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRoleEnum } from '../../common/enums';
import { TenantsService } from './tenants.service';

describe('TenantsService', () => {
  const makeService = () => {
    const tenantsRepository = {
      create: jest.fn(),
      update: jest.fn(),
      findBySlug: jest.fn(),
      findById: jest.fn(),
      findDetailsById: jest.fn(),
      findOwnerByTenantId: jest.fn(),
      list: jest.fn(),
      analytics: jest.fn(),
      getDeleteSummary: jest.fn(),
      forceDelete: jest.fn(),
      forceDeleteWithRelations: jest.fn(),
      transaction: jest.fn((callback: (tx: unknown) => Promise<unknown>) =>
        callback({}),
      ),
    };
    const storageService = {
      resolveMediaUrlsDeep: jest.fn(
        <T>(value: T): Promise<T> => Promise.resolve(value),
      ),
    };
    const usersService = {
      updatePassword: jest.fn(),
    };

    const service = new TenantsService(
      tenantsRepository as never,
      storageService as never,
      usersService as never,
    );

    return {
      service,
      tenantsRepository,
      storageService,
      usersService,
    };
  };

  it('generates a unique tenant slug from the business name', async () => {
    const { service, tenantsRepository } = makeService();
    tenantsRepository.findBySlug
      .mockResolvedValueOnce({ id: 'existing', slug: 'burger-house' })
      .mockResolvedValueOnce(null);
    tenantsRepository.create.mockImplementation((data: unknown) => data);

    const result = await service.create({ name: 'Burger House!' });

    expect(tenantsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Burger House!',
        slug: 'burger-house-2',
      }),
      undefined,
    );
    expect(result).toEqual(expect.objectContaining({ slug: 'burger-house-2' }));
  });

  it('returns tenant details for super admin by id', async () => {
    const { service, tenantsRepository, storageService } = makeService();
    tenantsRepository.findDetailsById.mockResolvedValue({
      id: 'tenant-1',
      name: 'Tenant One',
      slug: 'tenant-one',
      isActive: true,
      deletedAt: null,
      logoUrl: 'https://example.com/logo.png',
      owner: {
        id: 'owner-1',
        email: 'owner@example.com',
        isApproved: true,
        isVerified: true,
      },
    });

    const result = await service.tenantDetails(
      {
        uid: 'admin-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'tenant-1',
    );

    expect(tenantsRepository.findDetailsById).toHaveBeenCalledWith('tenant-1');
    expect(result.message).toBe('Tenant fetched successfully');
    expect(storageService.resolveMediaUrlsDeep).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tenant-1' }),
    );
    expect(result.data).toMatchObject({
      id: 'tenant-1',
      slug: 'tenant-one',
      isApproved: true,
      isVerified: true,
      ownerId: 'owner-1',
      owner: expect.objectContaining({ email: 'owner@example.com' }),
      deletionState: {
        isDeleted: false,
        isActive: true,
      },
    });
  });

  it('returns owner approval and verification status in tenant list', async () => {
    const { service, tenantsRepository } = makeService();
    tenantsRepository.list.mockResolvedValue({
      items: [
        {
          id: 'tenant-1',
          name: 'Tenant One',
          slug: 'tenant-one',
          isActive: true,
          deletedAt: null,
          owner: { isApproved: false, isVerified: false },
        },
      ],
      total: 1,
    });

    const result = await service.listTenants(
      {
        uid: 'admin-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      {
        page: 1,
        limit: 10,
        search: undefined,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'tenant-1',
        isApproved: false,
        isVerified: false,
      }),
    ]);
  });

  it('blocks non-super-admin users from tenant details', async () => {
    const { service } = makeService();

    await expect(
      service.tenantDetails(
        {
          uid: 'user-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        'tenant-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets super admin set a new business owner password without exposing it', async () => {
    const { service, tenantsRepository, usersService } = makeService();
    tenantsRepository.findOwnerByTenantId.mockResolvedValue({
      id: 'owner-1',
      email: 'owner@example.com',
    });

    const result = await service.resetOwnerPassword(
      { uid: 'admin-1', role: UserRoleEnum.SUPER_ADMIN },
      'tenant-1',
      'NewPassword@123',
    );

    expect(usersService.updatePassword).toHaveBeenCalledWith(
      'owner-1',
      'NewPassword@123',
    );
    expect(result).toEqual({
      data: { ownerId: 'owner-1', email: 'owner@example.com' },
      message: 'Business owner password updated successfully',
    });
    expect(result.data).not.toHaveProperty('password');
  });

  it('force deletes tenant and related records for super admin', async () => {
    const { service, tenantsRepository } = makeService();
    tenantsRepository.findById.mockResolvedValue({
      id: 'tenant-1',
      slug: 'tenant-one',
      isActive: true,
      deletedAt: null,
    });
    tenantsRepository.getDeleteSummary.mockResolvedValue({
      restaurants: 1,
      branches: 2,
      users: 3,
      orders: 4,
      coupons: 5,
      transactions: 6,
    });
    tenantsRepository.forceDeleteWithRelations.mockResolvedValue({
      id: 'tenant-1',
      slug: 'tenant-one',
    });

    const result = await service.forceDeleteTenant(
      {
        uid: 'admin-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'tenant-1',
    );

    expect(tenantsRepository.transaction).toHaveBeenCalledTimes(1);
    expect(tenantsRepository.forceDeleteWithRelations).toHaveBeenCalledWith(
      'tenant-1',
      {},
    );
    expect(result).toEqual({
      data: {
        id: 'tenant-1',
        slug: 'tenant-one',
        deletionSummary: {
          restaurants: 1,
          branches: 2,
          users: 3,
          orders: 4,
          coupons: 5,
          transactions: 6,
        },
      },
      message: 'Tenant force deleted successfully',
    });
  });

  it('throws not found when tenant does not exist', async () => {
    const { service, tenantsRepository } = makeService();
    tenantsRepository.findDetailsById.mockResolvedValue(null);

    await expect(
      service.tenantDetails(
        {
          uid: 'admin-1',
          role: UserRoleEnum.SUPER_ADMIN,
        },
        'missing-tenant',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
