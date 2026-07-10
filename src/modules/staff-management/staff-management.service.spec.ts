import { ForbiddenException } from '@nestjs/common';
import { StaffPanelType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
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
      countRestaurants: jest.fn(),
      findBranches: jest.fn(),
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

  it('lists staff-management records under the owner scope for staff actors', async () => {
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

  it('allows staff actors to fetch staff-management records under their owner scope', async () => {
    repository.findById.mockResolvedValue({
      id: 'managed-staff-1',
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
        uid: 'staff-actor-1',
        role: UserRoleEnum.STAFF,
        actorType: 'STAFF',
        ownerUserId: 'admin-1',
        panelType: StaffPanelType.BUSINESS_ADMIN,
        tid: 'tenant-1',
      },
      'managed-staff-1',
    );

    expect(result.data).toEqual(
      expect.objectContaining({
        id: 'managed-staff-1',
        ownerUserId: 'admin-1',
        panelType: StaffPanelType.BUSINESS_ADMIN,
      }),
    );
  });

  it('allows staff actors to update staff-management records under their owner scope', async () => {
    repository.findById.mockResolvedValue({
      id: 'managed-staff-1',
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
        panelType: StaffPanelType.BUSINESS_ADMIN,
        tenantId: 'tenant-1',
        restaurantId: null,
        branchId: null,
      },
    } as never);
    repository.update.mockResolvedValue({
      id: 'managed-staff-1',
      firstName: 'Updated',
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

    await service.update(
      {
        uid: 'staff-actor-1',
        role: UserRoleEnum.STAFF,
        actorType: 'STAFF',
        ownerUserId: 'admin-1',
        panelType: StaffPanelType.BUSINESS_ADMIN,
        tid: 'tenant-1',
      },
      'managed-staff-1',
      { firstName: ' Updated ' },
    );

    expect(repository.update.mock.calls[0]?.[0]).toBe('managed-staff-1');
    expect(repository.update.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ firstName: 'Updated' }),
    );
  });

  it('allows staff actors to delete staff-management records under their owner scope', async () => {
    repository.findById.mockResolvedValue({
      id: 'managed-staff-1',
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
    repository.softDelete.mockResolvedValue({
      id: 'managed-staff-1',
      ownerUserId: 'admin-1',
      panelType: StaffPanelType.BUSINESS_ADMIN,
      tenantId: 'tenant-1',
      restaurantId: null,
      branchId: null,
      deletedAt: new Date('2026-07-10T00:00:00.000Z'),
      password: 'hashed',
      staffRole: {
        id: 'role-1',
        deletedAt: null,
        isActive: true,
      },
    } as never);

    await service.remove(
      {
        uid: 'staff-actor-1',
        role: UserRoleEnum.STAFF,
        actorType: 'STAFF',
        ownerUserId: 'admin-1',
        panelType: StaffPanelType.BUSINESS_ADMIN,
        tid: 'tenant-1',
      },
      'managed-staff-1',
    );

    expect(repository.softDelete.mock.calls[0]).toEqual(['managed-staff-1']);
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

  it('returns stored client-visible staff password fields when present', async () => {
    repository.findById.mockResolvedValue({
      id: 'staff-1',
      ownerUserId: 'admin-1',
      panelType: StaffPanelType.BUSINESS_ADMIN,
      tenantId: 'tenant-1',
      restaurantId: null,
      branchId: null,
      deletedAt: null,
      password: '$2b$10$storedHashShouldStayHidden',
      plainPassword: 'Employee@123',
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
        password: 'Employee@123',
        plainPassword: 'Employee@123',
      }),
    );
  });

  it('does not expose stored staff password hashes when no client-visible password exists', async () => {
    repository.findById.mockResolvedValue({
      id: 'staff-1',
      ownerUserId: 'admin-1',
      panelType: StaffPanelType.BUSINESS_ADMIN,
      tenantId: 'tenant-1',
      restaurantId: null,
      branchId: null,
      deletedAt: null,
      password: '$2b$10$storedHashShouldStayHidden',
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

    expect(result.data).not.toHaveProperty('password');
    expect(result.data).not.toHaveProperty('plainPassword');
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

  it('restores a deleted staff account when creating with the same email', async () => {
    const staffRolesService = {
      getManageableRoleOrThrow: jest.fn().mockResolvedValue({
        id: 'role-1',
        panelType: StaffPanelType.BUSINESS_ADMIN,
        tenantId: 'tenant-1',
        restaurantId: null,
        branchId: null,
      }),
    };
    service = new StaffManagementService(
      repository,
      staffRolesService as unknown as StaffRolesService,
    );
    repository.findByEmail.mockResolvedValue({
      id: 'staff-deleted',
      deletedAt: new Date('2026-06-01T10:00:00.000Z'),
    } as never);
    repository.update.mockResolvedValue({
      id: 'staff-deleted',
      email: 'employee@example.com',
      ownerUserId: 'admin-1',
      panelType: StaffPanelType.BUSINESS_ADMIN,
      tenantId: 'tenant-1',
      restaurantId: null,
      branchId: null,
      deletedAt: null,
      password: 'hashed-password',
      staffRole: {
        id: 'role-1',
        deletedAt: null,
        isActive: true,
      },
    } as never);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);

    await service.create(
      {
        uid: 'admin-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
      },
      {
        staffRoleId: 'role-1',
        email: 'Employee@Example.com',
        password: 'Employee@123',
        firstName: 'New',
        lastName: 'Employee',
      },
    );

    expect(repository.create.mock.calls).toHaveLength(0);
    expect(repository.update.mock.calls[0]).toEqual([
      'staff-deleted',
      expect.objectContaining({
        email: 'employee@example.com',
        password: 'hashed-password',
        deletedAt: null,
        refreshTokenHash: null,
        isActive: true,
      }),
    ]);
  });

  it('stores all-restaurants staff access without expanding restaurant ids', async () => {
    const staffRolesService = {
      getManageableRoleOrThrow: jest.fn().mockResolvedValue({
        id: 'role-1',
        panelType: StaffPanelType.BUSINESS_ADMIN,
        tenantId: 'tenant-1',
        restaurantId: null,
        branchId: null,
        restaurantAccess: null,
      }),
    };
    service = new StaffManagementService(
      repository,
      staffRolesService as unknown as StaffRolesService,
    );
    repository.findByEmail.mockResolvedValue(null);
    repository.create.mockResolvedValue({
      id: 'staff-1',
      email: 'employee@example.com',
      ownerUserId: 'admin-1',
      panelType: StaffPanelType.BUSINESS_ADMIN,
      tenantId: 'tenant-1',
      restaurantId: null,
      branchId: null,
      restaurantAccess: {
        restaurantIds: [],
        branchIds: [],
        allRestaurants: true,
        hasAllRestaurantsAccess: true,
      },
      deletedAt: null,
      password: 'hashed-password',
      staffRole: {
        id: 'role-1',
        deletedAt: null,
        isActive: true,
      },
    } as never);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);

    const result = await service.create(
      {
        uid: 'admin-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
      },
      {
        staffRoleId: 'role-1',
        email: 'Employee@Example.com',
        password: 'Employee@123',
        firstName: 'New',
        lastName: 'Employee',
        allRestaurants: true,
      },
    );

    expect(repository.countRestaurants.mock.calls).toHaveLength(0);
    expect(repository.create.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        restaurantAccess: {
          restaurantIds: [],
          branchIds: [],
          allRestaurants: true,
          hasAllRestaurantsAccess: true,
        },
      }),
    );
    const resultData = result.data as { restaurantAccess?: unknown };
    expect(resultData.restaurantAccess).toEqual(
      expect.objectContaining({ allRestaurants: true }),
    );
  });
});
