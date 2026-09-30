import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffAccountType } from '@prisma/client';
import { PosPrinterAccessGuard } from './pos-printer-access.guard';

describe('PosPrinterAccessGuard', () => {
  const handler = () => undefined;
  const controller = () => undefined;
  const activeAccount = {
    accountType: StaffAccountType.POS_PRINTER,
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
    isActive: true,
    deletedAt: null,
    authVersion: 0,
    staffRole: { isActive: true, deletedAt: null },
  };

  const context = (path: string): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({
        getRequest: () => ({
          originalUrl: path,
          user: {
            uid: 'printer-1',
            actorType: 'STAFF',
            accountType: StaffAccountType.POS_PRINTER,
            tid: 'tenant-1',
            rid: 'restaurant-1',
            bid: 'branch-1',
            ver: 0,
          },
        }),
      }),
    }) as unknown as ExecutionContext;

  it.each([
    '/admin/dashboard',
    '/menu/items',
    '/admin/users/customers',
    '/payments',
    '/admin/reports',
    '/admin/global-settings',
    '/staff-management',
    '/admin/integrations/winorder',
  ])('denies unrelated business endpoint %s', async (path) => {
    const guard = new PosPrinterAccessGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as never,
      { staffUser: { findUnique: jest.fn() } } as never,
    );

    await expect(guard.canActivate(context(path))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows an explicitly marked endpoint for an active branch-scoped account', async () => {
    const prisma = {
      staffUser: { findUnique: jest.fn().mockResolvedValue(activeAccount) },
    };
    const guard = new PosPrinterAccessGuard(
      {
        getAllAndOverride: jest.fn().mockReturnValue(true),
      } as unknown as Reflector,
      prisma as never,
    );

    await expect(guard.canActivate(context('/orders'))).resolves.toBe(true);
    expect(prisma.staffUser.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'printer-1' } }),
    );
  });
});
