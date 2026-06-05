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
});
