import { ForbiddenException } from '@nestjs/common';
import { StaffMenuAccessService } from './staff-menu-access.service';
import { UserRoleEnum } from '../../common/enums';

describe('StaffMenuAccessService', () => {
  const makeService = (staff: unknown) => {
    const prisma = {
      staffUser: {
        findUnique: jest.fn().mockResolvedValue(staff),
      },
    };

    return {
      service: new StaffMenuAccessService(prisma as never),
      prisma,
    };
  };

  const user = {
    uid: 'staff-1',
    role: UserRoleEnum.STAFF,
    actorType: 'STAFF' as const,
  };

  it('allows staff menu writes when permission and restaurant assignment match', async () => {
    const { service } = makeService({
      id: 'staff-1',
      restaurantId: null,
      branchId: null,
      restaurantAccess: { restaurantIds: ['restaurant-1'], branchIds: [] },
      isActive: true,
      deletedAt: null,
      staffRole: {
        permissions: [{ access: 'menu', operations: ['write'] }],
        restaurantAccess: { restaurantIds: ['restaurant-1'], branchIds: [] },
        isActive: true,
        deletedAt: null,
      },
    });

    await expect(
      service.assertCanAccessRestaurant(user, 'restaurant-1', 'write'),
    ).resolves.toBeUndefined();
  });

  it('denies staff menu writes without write permission', async () => {
    const { service } = makeService({
      id: 'staff-1',
      restaurantId: null,
      branchId: null,
      restaurantAccess: { restaurantIds: ['restaurant-1'], branchIds: [] },
      isActive: true,
      deletedAt: null,
      staffRole: {
        permissions: [{ access: 'menu', operations: ['read'] }],
        restaurantAccess: { restaurantIds: ['restaurant-1'], branchIds: [] },
        isActive: true,
        deletedAt: null,
      },
    });

    await expect(
      service.assertCanAccessRestaurant(user, 'restaurant-1', 'write'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies staff menu access outside assigned restaurants', async () => {
    const { service } = makeService({
      id: 'staff-1',
      restaurantId: null,
      branchId: null,
      restaurantAccess: { restaurantIds: ['restaurant-1'], branchIds: [] },
      isActive: true,
      deletedAt: null,
      staffRole: {
        permissions: [{ access: 'menu', operations: ['read', 'write'] }],
        restaurantAccess: { restaurantIds: ['restaurant-1'], branchIds: [] },
        isActive: true,
        deletedAt: null,
      },
    });

    await expect(
      service.assertCanAccessRestaurant(user, 'restaurant-2', 'read'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows staff menu access to any restaurant with all-restaurants scope', async () => {
    const { service } = makeService({
      id: 'staff-1',
      restaurantId: null,
      branchId: null,
      restaurantAccess: {
        restaurantIds: [],
        branchIds: [],
        allRestaurants: true,
      },
      isActive: true,
      deletedAt: null,
      staffRole: {
        permissions: [{ access: 'menu', operations: ['read'] }],
        restaurantAccess: null,
        isActive: true,
        deletedAt: null,
      },
    });

    await expect(
      service.assertCanAccessRestaurant(user, 'future-restaurant', 'read'),
    ).resolves.toBeUndefined();
  });
});
