import { UserRoleEnum } from '../enums';
import { isCurrentUserSession } from './jwt-auth.guard';

describe('isCurrentUserSession', () => {
  const persistedUser = {
    authVersion: 2,
    isActive: true,
    role: UserRoleEnum.BUSINESS_ADMIN,
    tenantId: 'tenant-1',
    restaurantId: 'legacy-restaurant-1',
    branchId: 'legacy-branch-1',
  };

  it('accepts a tenant-wide business-admin token for a legacy restaurant-linked account', () => {
    expect(
      isCurrentUserSession(persistedUser, {
        uid: 'business-admin-1',
        actorType: 'USER',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
        rid: undefined,
        bid: undefined,
        ver: 2,
      }),
    ).toBe(true);
  });

  it('rejects a business-admin token that carries a restaurant or branch scope', () => {
    expect(
      isCurrentUserSession(persistedUser, {
        uid: 'business-admin-1',
        actorType: 'USER',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
        rid: 'legacy-restaurant-1',
        bid: 'legacy-branch-1',
        ver: 2,
      }),
    ).toBe(false);
  });

  it('continues to require exact restaurant and branch scope for branch admins', () => {
    expect(
      isCurrentUserSession(
        {
          ...persistedUser,
          role: UserRoleEnum.BRANCH_ADMIN,
        },
        {
          uid: 'branch-admin-1',
          actorType: 'USER',
          role: UserRoleEnum.BRANCH_ADMIN,
          tid: 'tenant-1',
          rid: 'different-restaurant',
          bid: 'legacy-branch-1',
          ver: 2,
        },
      ),
    ).toBe(false);
  });

  it.each([
    ['auth version', { ver: 3 }],
    ['tenant', { tid: 'tenant-2' }],
  ])('rejects a business-admin token with a stale %s', (_label, override) => {
    expect(
      isCurrentUserSession(persistedUser, {
        uid: 'business-admin-1',
        actorType: 'USER',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
        ver: 2,
        ...override,
      }),
    ).toBe(false);
  });
});
