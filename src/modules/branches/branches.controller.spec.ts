import 'reflect-metadata';
import { ROLES_KEY } from '../../common/decorators';
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
});
