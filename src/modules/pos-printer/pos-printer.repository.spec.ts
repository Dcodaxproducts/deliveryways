import { StaffPanelType } from '@prisma/client';
import { PosPrinterRepository } from './pos-printer.repository';

describe('PosPrinterRepository system role identity', () => {
  it('upserts by immutable system key and never discovers a custom role by display name', async () => {
    const role = { id: 'system-role-1' };
    const upsertRole = jest
      .fn<Promise<typeof role>, [unknown]>()
      .mockResolvedValue(role);
    const createStaff = jest
      .fn<Promise<{ id: string }>, [unknown]>()
      .mockResolvedValue({ id: 'printer-1' });
    const tx = {
      staffRole: { upsert: upsertRole },
      staffUser: { create: createStaff },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const repository = new PosPrinterRepository(prisma as never);

    await repository.create({
      ownerUserId: 'owner-1',
      panelType: StaffPanelType.BRANCH_ADMIN,
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      email: 'printer@example.com',
      password: 'hash',
      firstName: 'POS',
      lastName: 'Printer',
    });

    const roleUpsert = upsertRole.mock.calls[0]?.[0] as {
      where: { systemKey: string };
      update: Record<string, never>;
      create: { systemKey: string; name: string };
    };
    expect(roleUpsert).toMatchObject({
      where: { systemKey: 'POS_PRINTER:owner-1:branch-1' },
      update: {},
      create: {
        systemKey: 'POS_PRINTER:owner-1:branch-1',
        name: 'POS Printer',
      },
    });
    const staffCreate = createStaff.mock.calls[0]?.[0] as {
      data: { staffRoleId: string };
    };
    expect(staffCreate).toMatchObject({ data: { staffRoleId: role.id } });
  });
});
