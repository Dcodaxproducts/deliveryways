/* eslint-disable @typescript-eslint/unbound-method */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffAccountType } from '@prisma/client';
import { POS_PRINTER_ACCESS_KEY, ROLES_KEY } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import { PosPrinterAccessGuard } from '../../common/guards';
import { CustomerAppController } from './customer-app.controller';

describe('CustomerAppController POS printer reservation access', () => {
  const activeAccount = {
    accountType: StaffAccountType.POS_PRINTER,
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
    authVersion: 3,
    isActive: true,
    deletedAt: null,
    staffRole: { isActive: true, deletedAt: null },
  };
  const printerUser = {
    uid: 'printer-1',
    actorType: 'STAFF',
    accountType: StaffAccountType.POS_PRINTER,
    tid: 'tenant-1',
    rid: 'restaurant-1',
    bid: 'branch-1',
    ver: 3,
  };

  const contextFor = (
    handler: (...args: never[]) => unknown,
  ): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => CustomerAppController,
      switchToHttp: () => ({ getRequest: () => ({ user: printerUser }) }),
    }) as unknown as ExecutionContext;

  it.each([
    ['list', CustomerAppController.prototype.listAdminTableReservations],
    [
      'status update',
      CustomerAppController.prototype.updateAdminTableReservationStatus,
    ],
  ])('allows reservation %s', async (_label, handler) => {
    const prisma = {
      staffUser: { findUnique: jest.fn().mockResolvedValue(activeAccount) },
    };
    const guard = new PosPrinterAccessGuard(new Reflector(), prisma as never);

    await expect(guard.canActivate(contextFor(handler))).resolves.toBe(true);
    expect(Reflect.getMetadata(POS_PRINTER_ACCESS_KEY, handler)).toBe(true);
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toContain(RolesEnum.STAFF);
  });

  it.each([
    ['detail', CustomerAppController.prototype.getAdminTableReservation],
    [
      'walk-in creation',
      CustomerAppController.prototype.createAdminWalkInReservation,
    ],
    [
      'table assignment',
      CustomerAppController.prototype.assignAdminTableReservation,
    ],
  ])('keeps reservation %s denied', async (_label, handler) => {
    const prisma = { staffUser: { findUnique: jest.fn() } };
    const guard = new PosPrinterAccessGuard(new Reflector(), prisma as never);

    await expect(guard.canActivate(contextFor(handler))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(Reflect.getMetadata(POS_PRINTER_ACCESS_KEY, handler)).not.toBe(true);
    expect(Reflect.getMetadata(ROLES_KEY, handler)).not.toContain(
      RolesEnum.STAFF,
    );
    expect(prisma.staffUser.findUnique).not.toHaveBeenCalled();
  });
});
