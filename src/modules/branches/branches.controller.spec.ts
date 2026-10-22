import 'reflect-metadata';
import { POS_PRINTER_ACCESS_KEY, ROLES_KEY } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import { BranchesController } from './branches.controller';

describe('BranchesController branch admin permissions', () => {
  const getRouteRoles = (methodName: keyof BranchesController) => {
    const handler = Object.getOwnPropertyDescriptor(
      BranchesController.prototype,
      methodName,
    )?.value as (...args: unknown[]) => unknown;

    return Reflect.getMetadata(ROLES_KEY, handler) as RolesEnum[];
  };

  const allowsPosPrinter = (methodName: keyof BranchesController) => {
    const handler = Object.getOwnPropertyDescriptor(
      BranchesController.prototype,
      methodName,
    )?.value as (...args: unknown[]) => unknown;

    return Reflect.getMetadata(POS_PRINTER_ACCESS_KEY, handler) as
      | boolean
      | undefined;
  };

  it('allows branch admins to update their assigned branch details', () => {
    expect(getRouteRoles('update')).toContain(RolesEnum.BRANCH_ADMIN);
  });

  it('allows branch admins to update their assigned branch images', () => {
    expect(getRouteRoles('updateImages')).toContain(RolesEnum.BRANCH_ADMIN);
  });

  it('allows staff to list branches through staff-role permission checks', () => {
    expect(getRouteRoles('list')).toContain(RolesEnum.STAFF);
  });

  it('allows staff to view and edit branches through permission checks', () => {
    expect(getRouteRoles('details')).toContain(RolesEnum.STAFF);
    expect(getRouteRoles('update')).toContain(RolesEnum.STAFF);
    expect(getRouteRoles('openingHours')).toContain(RolesEnum.STAFF);
    expect(getRouteRoles('updateOpeningHours')).toContain(RolesEnum.STAFF);
    expect(getRouteRoles('deliveryTime')).toContain(RolesEnum.STAFF);
    expect(getRouteRoles('updateDeliveryTime')).toContain(RolesEnum.STAFF);
    expect(getRouteRoles('deliveryHours')).toContain(RolesEnum.STAFF);
    expect(getRouteRoles('updateDeliveryHours')).toContain(RolesEnum.STAFF);
  });

  const readMethods: Array<keyof BranchesController> = [
    'list',
    'openingHours',
    'holidayOpeningHours',
    'deliveryTime',
    'deliveryHours',
  ];

  it.each(readMethods)(
    'allows POS printer accounts to read assigned branch data via %s',
    (method) => {
      expect(allowsPosPrinter(method)).toBe(true);
    },
  );

  it('keeps branch identity and manager details unavailable to POS printers', () => {
    expect(allowsPosPrinter('details')).toBeUndefined();
  });

  const mutationMethods: Array<keyof BranchesController> = [
    'create',
    'createBulk',
    'update',
    'updateOpeningHours',
    'updateHolidayOpeningHours',
    'updateDeliveryTime',
    'updateDeliveryHours',
    'updateTemporaryClosure',
    'updateNotificationSettings',
    'suspend',
    'activate',
    'setDefault',
    'restore',
    'remove',
  ];

  it.each(mutationMethods)(
    'keeps POS printer accounts denied from branch mutation via %s',
    (method) => {
      expect(allowsPosPrinter(method)).toBeUndefined();
    },
  );
});
