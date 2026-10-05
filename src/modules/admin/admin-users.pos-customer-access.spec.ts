import { ROLES_KEY } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import { AdminUsersController } from './admin-users.controller';

describe('AdminUsersController POS customer access', () => {
  it('allows restaurant-scoped staff to list and read eligible customers', () => {
    const listHandler = Object.getOwnPropertyDescriptor(
      AdminUsersController.prototype,
      'listCustomers',
    )?.value as (...args: never[]) => unknown;
    const detailHandler = Object.getOwnPropertyDescriptor(
      AdminUsersController.prototype,
      'customerDetails',
    )?.value as (...args: never[]) => unknown;
    const listRoles = Reflect.getMetadata(
      ROLES_KEY,
      listHandler,
    ) as RolesEnum[];
    const detailRoles = Reflect.getMetadata(
      ROLES_KEY,
      detailHandler,
    ) as RolesEnum[];

    expect(listRoles).toContain(RolesEnum.STAFF);
    expect(detailRoles).toContain(RolesEnum.STAFF);
  });
});
