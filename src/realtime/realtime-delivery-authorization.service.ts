import { Injectable } from '@nestjs/common';
import { StaffPanelType } from '@prisma/client';
import { AuthUserContext } from '../common/decorators';
import { UserRoleEnum } from '../common/enums';
import { PrismaService } from '../database';

export type RealtimeResource =
  | { kind: 'order'; id: string }
  | { kind: 'chat'; id: string };

/** Current persisted ownership/scope of the entity an event refers to. */
export type RealtimeEntity = {
  kind: 'order' | 'chat';
  id: string;
  customerId: string;
  deliverymanId: string | null;
  assignedStaffUserId: string | null;
  tenantId: string;
  restaurantId: string;
  branchId: string | null;
};

/** One socket's session claims; `key` must be unique per socket/session tuple. */
export type RealtimeSubject = { key: string; user: AuthUserContext };

/**
 * Identifies one socket's authorization tuple: socket id, actor type, uid, auth
 * version and tenant/restaurant/branch/staff scope. Two sockets of the same uid
 * (for example a current and a revoked session) never share a key.
 */
export function realtimeSubjectKey(
  socketId: string,
  user: AuthUserContext,
): string {
  return JSON.stringify([
    socketId,
    user.actorType ?? null,
    user.role,
    user.uid,
    user.ver ?? null,
    user.tid ?? null,
    user.rid ?? null,
    user.bid ?? user.branchId ?? null,
    user.panelType ?? null,
    user.staffRoleId ?? null,
  ]);
}

const isStaff = (user: AuthUserContext): boolean => user.actorType === 'STAFF';
const isDeliveryman = (user: AuthUserContext): boolean =>
  user.actorType === 'DELIVERYMAN' || user.role === 'DELIVERYMAN';

@Injectable()
export class RealtimeDeliveryAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveEntity(
    resource: RealtimeResource,
  ): Promise<RealtimeEntity | null> {
    if (resource.kind === 'order') {
      const order = await this.prisma.order.findUnique({
        where: { id: resource.id },
        select: {
          customerId: true,
          deliverymanId: true,
          tenantId: true,
          restaurantId: true,
          branchId: true,
        },
      });
      return order
        ? {
            ...order,
            kind: 'order',
            id: resource.id,
            assignedStaffUserId: null,
          }
        : null;
    }
    const thread = await this.prisma.chatThread.findUnique({
      where: { id: resource.id },
      select: {
        customerId: true,
        deliverymanId: true,
        assignedStaffUserId: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
      },
    });
    return thread ? { ...thread, kind: 'chat', id: resource.id } : null;
  }

  /**
   * Re-reads the current accounts behind the given sockets and returns the keys
   * of subjects that may receive events for `entity` right now. Decisions are
   * per subject, never per uid.
   */
  async authorize(
    subjects: readonly RealtimeSubject[],
    entity: RealtimeEntity,
  ): Promise<Set<string>> {
    const userIds = new Set<string>();
    const staffIds = new Set<string>();
    const deliverymanIds = new Set<string>();
    for (const { user } of subjects) {
      if (isStaff(user)) staffIds.add(user.uid);
      else if (isDeliveryman(user)) deliverymanIds.add(user.uid);
      else userIds.add(user.uid);
    }
    const [dbUsers, staff, deliverymen] = await Promise.all([
      userIds.size === 0
        ? []
        : this.prisma.user.findMany({
            where: { id: { in: [...userIds] } },
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
      staffIds.size === 0
        ? []
        : this.prisma.staffUser.findMany({
            where: { id: { in: [...staffIds] } },
            select: {
              id: true,
              tenantId: true,
              restaurantId: true,
              branchId: true,
              staffRoleId: true,
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
      deliverymanIds.size === 0
        ? []
        : this.prisma.deliveryman.findMany({
            where: { id: { in: [...deliverymanIds] } },
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
    ]);
    const currentUsers = new Map(dbUsers.map((item) => [item.id, item]));
    const currentStaff = new Map(staff.map((item) => [item.id, item]));
    const currentDeliverymen = new Map(
      deliverymen.map((item) => [item.id, item]),
    );
    const allowed = new Set<string>();
    for (const { key, user } of subjects) {
      if (isStaff(user)) {
        if (this.staffAllowed(user, currentStaff.get(user.uid), entity))
          allowed.add(key);
      } else if (isDeliveryman(user)) {
        const row = currentDeliverymen.get(user.uid);
        if (
          row?.isActive &&
          !row.deletedAt &&
          row.authVersion === user.ver &&
          row.tenantId === (user.tid ?? null) &&
          row.restaurantId === (user.rid ?? null) &&
          row.branchId === (user.bid ?? null) &&
          entity.deliverymanId === user.uid
        )
          allowed.add(key);
      } else if (this.userAllowed(user, currentUsers.get(user.uid), entity)) {
        allowed.add(key);
      }
    }
    return allowed;
  }

  private staffAllowed(
    user: AuthUserContext,
    row:
      | {
          tenantId: string | null;
          restaurantId: string | null;
          branchId: string | null;
          staffRoleId: string;
          authVersion: number;
          isActive: boolean;
          deletedAt: Date | null;
          panelType: StaffPanelType;
          restaurantAccess: unknown;
          staffRole: {
            isActive: boolean;
            deletedAt: Date | null;
            permissions: unknown;
            restaurantAccess: unknown;
          };
        }
      | undefined,
    entity: RealtimeEntity,
  ): boolean {
    if (
      !row ||
      !row.isActive ||
      row.deletedAt ||
      !row.staffRole.isActive ||
      row.staffRole.deletedAt ||
      row.authVersion !== user.ver ||
      row.tenantId !== (user.tid ?? null) ||
      row.restaurantId !== (user.rid ?? null) ||
      row.branchId !== (user.bid ?? null) ||
      row.staffRoleId !== user.staffRoleId ||
      row.panelType !== user.panelType
    )
      return false;
    const scoped =
      row.panelType === StaffPanelType.BUSINESS_ADMIN
        ? row.tenantId === entity.tenantId
        : row.restaurantId === entity.restaurantId &&
          row.branchId === entity.branchId;
    return (
      scoped &&
      this.hasRestaurantAccess(
        row.restaurantAccess ?? row.staffRole.restaurantAccess,
        entity.restaurantId,
        entity.branchId,
      ) &&
      this.hasReadPermission(
        row.staffRole.permissions,
        entity.kind === 'chat' ? 'chat' : 'orders',
      ) &&
      (entity.kind === 'order' ||
        !entity.assignedStaffUserId ||
        entity.assignedStaffUserId === user.uid)
    );
  }

  private userAllowed(
    user: AuthUserContext,
    row:
      | {
          role: unknown;
          tenantId: string | null;
          restaurantId: string | null;
          branchId: string | null;
          authVersion: number;
          isActive: boolean;
          deletedAt: Date | null;
        }
      | undefined,
    entity: RealtimeEntity,
  ): boolean {
    if (
      !row ||
      !row.isActive ||
      row.deletedAt ||
      row.authVersion !== user.ver ||
      String(row.role) !== String(user.role) ||
      row.tenantId !== (user.tid ?? null) ||
      row.restaurantId !== (user.rid ?? null) ||
      row.branchId !== (user.bid ?? null)
    )
      return false;
    if (user.role === UserRoleEnum.CUSTOMER)
      return entity.customerId === user.uid;
    if (user.role === UserRoleEnum.SUPER_ADMIN) return true;
    if (user.role === UserRoleEnum.BUSINESS_ADMIN)
      return row.tenantId === entity.tenantId;
    if (user.role === UserRoleEnum.BRANCH_ADMIN)
      return (
        row.restaurantId === entity.restaurantId &&
        row.branchId === entity.branchId
      );
    return false;
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
