import { ForbiddenException } from '@nestjs/common';
import { StaffPanelType } from '@prisma/client';
import { UserRoleEnum } from '../../common/enums';
import { StaffRolesRepository } from './staff-roles.repository';
import { StaffRolesService } from './staff-roles.service';

describe('StaffRolesService', () => {
  let service: StaffRolesService;
  let repository: jest.Mocked<StaffRolesRepository>;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByNameWithinScope: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      countAssignedUsers: jest.fn(),
      countRestaurants: jest.fn(),
      findBranches: jest.fn(),
    } as unknown as jest.Mocked<StaffRolesRepository>;

    service = new StaffRolesService(repository);
  });

  it('lists staff roles under the owner scope for staff actors', async () => {
    repository.list.mockResolvedValue({ items: [], total: 0 });

    await service.list(
      {
        uid: 'staff-1',
        role: UserRoleEnum.STAFF,
        actorType: 'STAFF',
        ownerUserId: 'admin-1',
        panelType: StaffPanelType.BUSINESS_ADMIN,
        tid: 'tenant-1',
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

  it('allows staff actors to read staff roles under their owner scope', async () => {
    repository.findById.mockResolvedValue({
      id: 'role-1',
      ownerUserId: 'admin-1',
      panelType: StaffPanelType.BUSINESS_ADMIN,
      tenantId: 'tenant-1',
      restaurantId: null,
      branchId: null,
      deletedAt: null,
      isActive: true,
      permissions: [{ access: 'employees', operations: ['read'] }],
    } as never);

    const result = await service.details(
      {
        uid: 'staff-1',
        role: UserRoleEnum.STAFF,
        actorType: 'STAFF',
        ownerUserId: 'admin-1',
        panelType: StaffPanelType.BUSINESS_ADMIN,
        tid: 'tenant-1',
      },
      'role-1',
    );

    expect(result.data).toEqual(
      expect.objectContaining({
        id: 'role-1',
        ownerUserId: 'admin-1',
        panelType: StaffPanelType.BUSINESS_ADMIN,
      }),
    );
  });

  it('blocks staff actors from reading staff roles outside their owner scope', async () => {
    repository.findById.mockResolvedValue({
      id: 'role-1',
      ownerUserId: 'other-admin',
      panelType: StaffPanelType.BUSINESS_ADMIN,
      tenantId: 'tenant-1',
      restaurantId: null,
      branchId: null,
      deletedAt: null,
      isActive: true,
      permissions: [{ access: 'employees', operations: ['read'] }],
    } as never);

    await expect(
      service.details(
        {
          uid: 'staff-1',
          role: UserRoleEnum.STAFF,
          actorType: 'STAFF',
          ownerUserId: 'admin-1',
          panelType: StaffPanelType.BUSINESS_ADMIN,
          tid: 'tenant-1',
        },
        'role-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
