import { ForbiddenException } from '@nestjs/common';
import { StaffActivityAction, StaffPanelType } from '@prisma/client';
import { UserRoleEnum } from '../../common/enums';
import { StaffActivityLogsRepository } from './staff-activity-logs.repository';
import { StaffActivityLogsService } from './staff-activity-logs.service';

describe('StaffActivityLogsService', () => {
  let repository: jest.Mocked<StaffActivityLogsRepository>;
  let service: StaffActivityLogsService;

  beforeEach(() => {
    repository = {
      findStaffIdentity: jest.fn(),
      findLocation: jest.fn(),
      create: jest.fn(),
      list: jest.fn(),
    } as unknown as jest.Mocked<StaffActivityLogsRepository>;
    service = new StaffActivityLogsService(repository);
  });

  it('stores immutable staff and branch/restaurant snapshots', async () => {
    repository.findStaffIdentity.mockResolvedValue({
      id: 'staff-1',
      ownerUserId: 'owner-1',
      email: 'employee@example.com',
      firstName: 'Alex',
      lastName: 'Meyer',
      staffRoleId: 'role-1',
      panelType: StaffPanelType.SUPER_ADMIN,
      deletedAt: null,
      staffRole: { name: 'Operations' },
    });
    repository.findLocation.mockResolvedValue({
      id: 'branch-1',
      name: 'Central Branch',
      restaurant: {
        id: 'restaurant-1',
        name: 'Central Kitchen',
      },
    });
    repository.create.mockResolvedValue({
      id: 'log-1',
    } as never);

    await service.record({
      staffUserId: 'staff-1',
      action: StaffActivityAction.UPDATE,
      module: 'orders',
      targetId: 'order-1',
      branchId: 'branch-1',
      changedFields: ['status', 'status', 'password'],
    });

    expect(repository.create.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        ownerUserId: 'owner-1',
        staffUserId: 'staff-1',
        staffEmail: 'employee@example.com',
        staffName: 'Alex Meyer',
        staffRoleName: 'Operations',
        restaurantId: 'restaurant-1',
        restaurantName: 'Central Kitchen',
        branchId: 'branch-1',
        branchName: 'Central Branch',
        changedFields: ['status'],
      }),
    );
  });

  it('does not let an audit write failure break the business action', async () => {
    repository.findStaffIdentity.mockRejectedValue(new Error('database down'));

    await expect(
      service.record({
        staffUserId: 'staff-1',
        action: StaffActivityAction.CREATE,
        module: 'restaurants',
      }),
    ).resolves.toBeUndefined();
  });

  it('lists only records owned by the authenticated super admin', async () => {
    repository.list.mockResolvedValue({ items: [], total: 0 });

    const result = await service.list(
      {
        uid: 'owner-1',
        role: UserRoleEnum.SUPER_ADMIN,
        actorType: 'USER',
      },
      {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        staffUserId: 'staff-1',
        restaurantId: 'restaurant-1',
        action: StaffActivityAction.UPDATE,
        from: '2026-09-01',
        to: '2026-09-21',
      },
    );

    expect(repository.list.mock.calls[0]).toEqual([
      expect.objectContaining({
        ownerUserId: 'owner-1',
        staffUserId: 'staff-1',
        restaurantId: 'restaurant-1',
        action: StaffActivityAction.UPDATE,
        occurredAt: {
          gte: new Date('2026-09-01'),
          lte: new Date('2026-09-21T23:59:59.999Z'),
        },
      }),
      expect.objectContaining({ page: 1, limit: 20 }),
    ]);
    expect(result.meta.total).toBe(0);
  });

  it('rejects staff actors even when they use the Superadmin panel', async () => {
    await expect(
      service.list(
        {
          uid: 'staff-1',
          role: UserRoleEnum.STAFF,
          actorType: 'STAFF',
          ownerUserId: 'owner-1',
          panelType: StaffPanelType.SUPER_ADMIN,
        },
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
