import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { PrismaService } from '../../database';

type StaffMenuOperation = 'read' | 'create' | 'update' | 'delete' | 'write';

interface StaffRestaurantAccessScope {
  restaurantIds: string[];
  branchIds: string[];
}

@Injectable()
export class StaffMenuAccessService {
  constructor(private readonly prisma: PrismaService) {}

  isStaff(user: AuthUserContext) {
    return user.actorType === 'STAFF' || user.role === UserRoleEnum.STAFF;
  }

  async resolveRestaurantIdForRead(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ) {
    const staff = await this.getActiveStaff(user);
    const access = this.resolveAccess(
      staff.restaurantAccess,
      staff.staffRole.restaurantAccess,
      user,
    );
    const restaurantId =
      requestedRestaurantId ?? access.restaurantIds[0] ?? user.rid;

    if (!restaurantId) {
      throw new ForbiddenException('Staff restaurant access is required');
    }

    await this.assertCanAccessRestaurant(user, restaurantId, 'read');
    return restaurantId;
  }

  async resolveRestaurantIdForWrite(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ) {
    const staff = await this.getActiveStaff(user);
    const access = this.resolveAccess(
      staff.restaurantAccess,
      staff.staffRole.restaurantAccess,
      user,
    );
    const restaurantId =
      requestedRestaurantId ?? access.restaurantIds[0] ?? user.rid;

    if (!restaurantId) {
      throw new ForbiddenException('Staff restaurant access is required');
    }

    await this.assertCanAccessRestaurant(user, restaurantId, 'write');
    return restaurantId;
  }

  async assertCanAccessRestaurant(
    user: AuthUserContext,
    restaurantId: string,
    operation: StaffMenuOperation,
  ) {
    const staff = await this.getActiveStaff(user);
    this.assertPermission(staff.staffRole.permissions, operation);

    const access = this.resolveAccess(
      staff.restaurantAccess,
      staff.staffRole.restaurantAccess,
      user,
    );
    if (!access.restaurantIds.includes(restaurantId)) {
      throw new ForbiddenException(
        'Staff account is not assigned to this restaurant',
      );
    }
  }

  async assertCanAccessBranch(
    user: AuthUserContext,
    branchId: string,
    restaurantId: string,
    operation: StaffMenuOperation,
  ) {
    await this.assertCanAccessRestaurant(user, restaurantId, operation);
    const staff = await this.getActiveStaff(user);
    const access = this.resolveAccess(
      staff.restaurantAccess,
      staff.staffRole.restaurantAccess,
      user,
    );

    if (access.branchIds.length && !access.branchIds.includes(branchId)) {
      throw new ForbiddenException(
        'Staff account is not assigned to this branch',
      );
    }
  }

  private async getActiveStaff(user: AuthUserContext) {
    if (!user.uid) {
      throw new ForbiddenException('Staff authentication is required');
    }

    const staff = await this.prisma.staffUser.findUnique({
      where: { id: user.uid },
      select: {
        id: true,
        restaurantId: true,
        branchId: true,
        restaurantAccess: true,
        isActive: true,
        deletedAt: true,
        staffRole: {
          select: {
            permissions: true,
            restaurantAccess: true,
            isActive: true,
            deletedAt: true,
          },
        },
      },
    });

    if (
      !staff ||
      staff.deletedAt ||
      !staff.isActive ||
      !staff.staffRole ||
      staff.staffRole.deletedAt ||
      !staff.staffRole.isActive
    ) {
      throw new ForbiddenException('Staff account is inactive');
    }

    return staff;
  }

  private assertPermission(
    permissions: Prisma.JsonValue,
    operation: StaffMenuOperation,
  ) {
    if (!Array.isArray(permissions)) {
      throw new ForbiddenException('Staff role does not allow menu access');
    }

    const canAccess = permissions.some((permission) => {
      if (
        !permission ||
        typeof permission !== 'object' ||
        Array.isArray(permission)
      ) {
        return false;
      }

      const rawAccess = (permission as { access?: unknown }).access;
      if (typeof rawAccess !== 'string') {
        return false;
      }

      const access = rawAccess.trim().toLowerCase();
      const operations = (permission as { operations?: unknown }).operations;
      if (!Array.isArray(operations)) {
        return false;
      }

      const normalizedOperations = operations
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().toLowerCase());
      const allowedAccesses = new Set([
        '*',
        'menu',
        'menus',
        'menu-management',
        'restaurant-menus',
        'menu-categories',
        'menu-items',
        'modifiers',
        'modifier-categories',
        'modifier-groups',
        'variations',
        'branch-overrides',
        'cuisines',
      ]);
      const requiredOperations =
        operation === 'read'
          ? ['read', 'list', 'view', '*']
          : [operation, 'write', 'manage', '*'];

      return (
        allowedAccesses.has(access) &&
        requiredOperations.some((required) =>
          normalizedOperations.includes(required),
        )
      );
    });

    if (!canAccess) {
      throw new ForbiddenException('Staff role does not allow menu access');
    }
  }

  private resolveAccess(
    staffAccess: Prisma.JsonValue | null,
    roleAccess: Prisma.JsonValue | null,
    user: AuthUserContext,
  ): StaffRestaurantAccessScope {
    const parsedStaffAccess = this.normalizeAccess(staffAccess);
    const parsedRoleAccess = this.normalizeAccess(roleAccess);
    const restaurantIds = parsedStaffAccess.restaurantIds.length
      ? parsedStaffAccess.restaurantIds
      : parsedRoleAccess.restaurantIds;
    const branchIds = parsedStaffAccess.branchIds.length
      ? parsedStaffAccess.branchIds
      : parsedRoleAccess.branchIds;

    return {
      restaurantIds: restaurantIds.length
        ? restaurantIds
        : user.rid
          ? [user.rid]
          : [],
      branchIds: branchIds.length ? branchIds : user.bid ? [user.bid] : [],
    };
  }

  private normalizeAccess(
    value: Prisma.JsonValue | null | undefined,
  ): StaffRestaurantAccessScope {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { restaurantIds: [], branchIds: [] };
    }

    const access = value as { restaurantIds?: unknown; branchIds?: unknown };
    return {
      restaurantIds: Array.isArray(access.restaurantIds)
        ? this.uniqueStrings(access.restaurantIds)
        : [],
      branchIds: Array.isArray(access.branchIds)
        ? this.uniqueStrings(access.branchIds)
        : [],
    };
  }

  private uniqueStrings(values: unknown[]) {
    return [
      ...new Set(
        values
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
  }
}
