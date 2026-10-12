import { Injectable } from '@nestjs/common';
import { StaffPanelType } from '@prisma/client';
import { AuthUserContext } from '../common/decorators';
import { UserRoleEnum } from '../common/enums';
import { PrismaService } from '../database';

export type RealtimeResource =
  | { kind: 'order'; id: string }
  | { kind: 'chat'; id: string };

@Injectable()
export class RealtimeDeliveryAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async authorize(
    users: readonly AuthUserContext[],
    resource: RealtimeResource,
  ): Promise<Set<string>> {
    const unique = new Map(users.map((user) => [user.uid, user]));
    const values = [...unique.values()];
    const userIds = values
      .filter(
        (user) =>
          user.actorType !== 'STAFF' &&
          user.actorType !== 'DELIVERYMAN' &&
          user.role !== 'DELIVERYMAN',
      )
      .map((user) => user.uid);
    const staffIds = values
      .filter((user) => user.actorType === 'STAFF')
      .map((user) => user.uid);
    const deliverymanIds = values
      .filter(
        (user) =>
          user.actorType === 'DELIVERYMAN' || user.role === 'DELIVERYMAN',
      )
      .map((user) => user.uid);
    const [dbUsers, staff, deliverymen, entity] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          role: true,
          tenantId: true,
          restaurantId: true,
          branchId: true,
          authVersion: true,
          isActive: true,
          deletedAt: true,
        },
      }),
      this.prisma.staffUser.findMany({
        where: { id: { in: staffIds } },
        select: {
          id: true,
          tenantId: true,
          restaurantId: true,
          branchId: true,
          authVersion: true,
          isActive: true,
          deletedAt: true,
          panelType: true,
          restaurantAccess: true,
          staffRole: {
            select: {
              isActive: true,
              deletedAt: true,
              permissions: true,
              restaurantAccess: true,
            },
          },
        },
      }),
      this.prisma.deliveryman.findMany({
        where: { id: { in: deliverymanIds } },
        select: {
          id: true,
          tenantId: true,
          restaurantId: true,
          branchId: true,
          authVersion: true,
          isActive: true,
          deletedAt: true,
        },
      }),
      resource.kind === 'order'
        ? this.prisma.order.findUnique({
            where: { id: resource.id },
            select: {
              customerId: true,
              deliverymanId: true,
              tenantId: true,
              restaurantId: true,
              branchId: true,
            },
          })
        : this.prisma.chatThread.findUnique({
            where: { id: resource.id },
            select: {
              customerId: true,
              deliverymanId: true,
              assignedStaffUserId: true,
              tenantId: true,
              restaurantId: true,
              branchId: true,
            },
          }),
    ]);
    if (!entity) return new Set();
    const currentUsers = new Map(dbUsers.map((item) => [item.id, item]));
    const currentStaff = new Map(staff.map((item) => [item.id, item]));
    const currentDeliverymen = new Map(
      deliverymen.map((item) => [item.id, item]),
    );
    const allowed = new Set<string>();
    for (const user of values) {
      if (user.actorType === 'STAFF') {
        const row = currentStaff.get(user.uid);
        if (
          !row ||
          !row.isActive ||
          row.deletedAt ||
          !row.staffRole.isActive ||
          row.staffRole.deletedAt ||
          row.authVersion !== user.ver
        )
          continue;
        const scoped =
          row.panelType === StaffPanelType.BUSINESS_ADMIN
            ? row.tenantId === entity.tenantId
            : row.restaurantId === entity.restaurantId &&
              row.branchId === entity.branchId;
        const assignedStaffUserId =
          resource.kind === 'chat'
            ? (entity as { assignedStaffUserId: string | null })
                .assignedStaffUserId
            : null;
        const restaurantAllowed = this.hasRestaurantAccess(
          row.restaurantAccess ?? row.staffRole.restaurantAccess,
          entity.restaurantId,
          entity.branchId,
        );
        const permissionAllowed = this.hasReadPermission(
          row.staffRole.permissions,
          resource.kind === 'chat' ? 'chat' : 'orders',
        );
        if (
          scoped &&
          restaurantAllowed &&
          permissionAllowed &&
          (resource.kind === 'order' ||
            !assignedStaffUserId ||
            assignedStaffUserId === user.uid)
        )
          allowed.add(user.uid);
        continue;
      }
      if (user.actorType === 'DELIVERYMAN' || user.role === 'DELIVERYMAN') {
        const row = currentDeliverymen.get(user.uid);
        if (
          row?.isActive &&
          !row.deletedAt &&
          row.authVersion === user.ver &&
          entity.deliverymanId === user.uid
        )
          allowed.add(user.uid);
        continue;
      }
      const row = currentUsers.get(user.uid);
      if (
        !row ||
        !row.isActive ||
        row.deletedAt ||
        row.authVersion !== user.ver ||
        String(row.role) !== String(user.role)
      )
        continue;
      if (user.role === UserRoleEnum.CUSTOMER && entity.customerId === user.uid)
        allowed.add(user.uid);
      else if (user.role === UserRoleEnum.SUPER_ADMIN) allowed.add(user.uid);
      else if (
        user.role === UserRoleEnum.BUSINESS_ADMIN &&
        row.tenantId === entity.tenantId
      )
        allowed.add(user.uid);
      else if (
        user.role === UserRoleEnum.BRANCH_ADMIN &&
        row.restaurantId === entity.restaurantId &&
        row.branchId === entity.branchId
      )
        allowed.add(user.uid);
    }
    return allowed;
  }

  private hasReadPermission(value: unknown, access: string): boolean {
    if (!Array.isArray(value)) return false;
    return value.some((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const permission = entry as { access?: unknown; operations?: unknown };
      return (
        permission.access === access &&
        Array.isArray(permission.operations) &&
        permission.operations.some(
          (operation) => operation === 'read' || operation === 'view',
        )
      );
    });
  }

  private hasRestaurantAccess(
    value: unknown,
    restaurantId: string,
    branchId: string | null,
  ): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return true;
    const access = value as {
      allRestaurants?: unknown;
      hasAllRestaurantsAccess?: unknown;
      restaurantIds?: unknown;
      branchIds?: unknown;
    };
    if (
      access.allRestaurants === true ||
      access.hasAllRestaurantsAccess === true
    )
      return true;
    const restaurants = Array.isArray(access.restaurantIds)
      ? access.restaurantIds
      : [];
    const branches = Array.isArray(access.branchIds) ? access.branchIds : [];
    return (
      restaurants.includes(restaurantId) ||
      (branchId !== null && branches.includes(branchId))
    );
  }
}
