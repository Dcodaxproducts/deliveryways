import { ForbiddenException } from '@nestjs/common';
import { StaffPanelType } from '@prisma/client';
import { UserRoleEnum } from '../../common/enums';
import { StaffRolesService } from '../staff-roles/staff-roles.service';
import { StaffManagementRepository } from './staff-management.repository';
import { StaffManagementService } from './staff-management.service';

describe('StaffManagementService', () => {
  let service: StaffManagementService;
  let repository: jest.Mocked<StaffManagementRepository>;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<StaffManagementRepository>;

    service = new StaffManagementService(repository, {} as StaffRolesService);
  });

  it('lists business-admin staff using tenant scope only', async () => {
    repository.list.mockResolvedValue({ items: [], total: 0 });

    await service.list(
      {
        uid: 'admin-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(repository.list.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        ownerUserId: 'admin-1',
        panelType: StaffPanelType.BUSINESS_ADMIN,
        tenantId: 'tenant-1',
        restaurantId: null,
        branchId: null,
        deletedAt: null,
      }),
    );
  });

  it('allows business admin to access business-scope staff even if token carries restaurant and branch ids', async () => {
    repository.findById.mockResolvedValue({
      id: 'staff-1',
      ownerUserId: 'admin-1',
      panelType: StaffPanelType.BUSINESS_ADMIN,
      tenantId: 'tenant-1',
      restaurantId: null,
      branchId: null,
      deletedAt: null,
      password: 'hashed',
      staffRole: {
        id: 'role-1',
        deletedAt: null,
        isActive: true,
      },
    } as never);

    const result = await service.details(
      {
        uid: 'admin-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
      },
      'staff-1',
    );

    expect(result.data).toEqual(
      expect.objectContaining({
        id: 'staff-1',
        tenantId: 'tenant-1',
        restaurantId: null,
        branchId: null,
      }),
    );
  });

  it('still blocks cross-scope business-admin access', async () => {
    repository.findById.mockResolvedValue({
      id: 'staff-1',
      ownerUserId: 'admin-1',
      panelType: StaffPanelType.BUSINESS_ADMIN,
      tenantId: 'tenant-2',
      restaurantId: null,
      branchId: null,
      deletedAt: null,
      password: 'hashed',
      staffRole: {
        id: 'role-1',
        deletedAt: null,
        isActive: true,
      },
    } as never);

    await expect(
      service.details(
        {
          uid: 'admin-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
        },
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
