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

    const service = new TenantsService(
      tenantsRepository as never,
      storageService as never,
    );

    return {
      service,
      tenantsRepository,
      storageService,
    };
  };

  it('returns tenant details for super admin by id', async () => {
    const { service, tenantsRepository, storageService } = makeService();
    tenantsRepository.findDetailsById.mockResolvedValue({
      id: 'tenant-1',
      name: 'Tenant One',
      slug: 'tenant-one',
      isActive: true,
      deletedAt: null,
      logoUrl: 'https://example.com/logo.png',
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
      deletionState: {
        isDeleted: false,
        isActive: true,
      },
    });
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
