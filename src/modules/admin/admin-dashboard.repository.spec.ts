import { UserRole } from '@prisma/client';
import { AdminDashboardRepository } from './admin-dashboard.repository';

describe('AdminDashboardRepository', () => {
  it('counts business owner stats using the same non-deleted owner/tenant filter as the includeInactive superadmin list', async () => {
    const prisma = {
      $transaction: jest.fn((queries: unknown[]) => Promise.resolve(queries)),
      tenant: {
        count: jest.fn().mockReturnValueOnce(68).mockReturnValueOnce(66),
      },
    };
    const repository = new AdminDashboardRepository(prisma as never);

    await expect(repository.getBusinessOwnersStats()).resolves.toEqual({
      totalBusinessOwners: 68,
      activeBusinessOwners: 66,
      inactiveBusinessOwners: 2,
    });

    expect(prisma.tenant.count).toHaveBeenNthCalledWith(1, {
      where: {
        deletedAt: null,
        owner: {
          role: UserRole.BUSINESS_ADMIN,
          deletedAt: null,
        },
      },
    });
    expect(prisma.tenant.count).toHaveBeenNthCalledWith(2, {
      where: {
        deletedAt: null,
        isActive: true,
        owner: {
          role: UserRole.BUSINESS_ADMIN,
          deletedAt: null,
          isActive: true,
        },
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('counts all scoped employee roles including roles without employees', async () => {
    const prisma = {
      $transaction: jest.fn((queries: unknown[]) => Promise.resolve(queries)),
      staffUser: {
        count: jest.fn().mockReturnValueOnce(4).mockReturnValueOnce(3),
        findMany: jest.fn().mockReturnValue([
          {
            staffRoleId: 'role-1',
            staffRole: { name: 'Cashier' },
          },
          {
            staffRoleId: 'role-1',
            staffRole: { name: 'Cashier' },
          },
        ]),
      },
      staffRole: {
        count: jest.fn().mockReturnValue(3),
      },
    };
    const repository = new AdminDashboardRepository(prisma as never);

    await expect(
      repository.getEmployeesStats({ tenantId: 'tenant-1' }),
    ).resolves.toMatchObject({
      totalEmployees: 4,
      activeEmployees: 3,
      inactiveEmployees: 1,
      totalRoles: 3,
      roleBreakdown: [{ staffRoleId: 'role-1', name: 'Cashier', count: 2 }],
    });

    expect(prisma.staffRole.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        tenantId: 'tenant-1',
      },
    });
  });
});
