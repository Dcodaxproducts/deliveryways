import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  RequestMethod,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database';
import { ROLES_KEY } from '../decorators';
import { RolesEnum } from '../enums';

type PermissionEntry = {
  access?: unknown;
  operations?: unknown;
};

type StaffRestaurantAccess = {
  restaurantIds?: string[];
  branchIds?: string[];
  allRestaurants?: boolean;
  hasAllRestaurantsAccess?: boolean;
};

type StaffPermissionRecord = {
  ownerUserId: string;
  staffRoleId: string;
  panelType: string;
  tenantId: string | null;
  restaurantId: string | null;
  branchId: string | null;
  restaurantAccess: Prisma.JsonValue;
  isActive: boolean;
  deletedAt: Date | null;
  staffRole: {
    isActive: boolean;
    deletedAt: Date | null;
    permissions: Prisma.JsonValue;
    restaurantAccess: Prisma.JsonValue;
  } | null;
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<RolesEnum[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: {
        uid?: string;
        role?: string;
        actorType?: string;
        ownerUserId?: string;
        staffRoleId?: string;
        panelType?: string;
        tid?: string | null;
        rid?: string | null;
        bid?: string | null;
        restaurantAccess?: StaffRestaurantAccess | null;
      };
    }>();
    if (await this.canStaffUseRolePermission(context, request.user)) {
      return true;
    }

    const userRole = request.user?.role;

    if (userRole && requiredRoles.includes(userRole as RolesEnum)) {
      return true;
    }

    if (!userRole || !requiredRoles.includes(userRole as RolesEnum)) {
      const allowedRoles = requiredRoles.join(', ');
      throw new ForbiddenException(
        `Your role does not have access to this action. Allowed roles: ${allowedRoles}`,
      );
    }

    return true;
  }

  private async canStaffUseRolePermission(
    context: ExecutionContext,
    user?: {
      uid?: string;
      role?: string;
      actorType?: string;
      ownerUserId?: string;
      staffRoleId?: string;
      panelType?: string;
      tid?: string | null;
      rid?: string | null;
      bid?: string | null;
      restaurantAccess?: StaffRestaurantAccess | null;
    },
  ): Promise<boolean> {
    if (!user?.uid || !this.isStaffActor(user)) {
      return false;
    }

    const staff = await this.prisma.staffUser.findUnique({
      where: { id: user.uid },
      select: {
        ownerUserId: true,
        staffRoleId: true,
        panelType: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
        restaurantAccess: true,
        isActive: true,
        deletedAt: true,
        staffRole: {
          select: {
            isActive: true,
            deletedAt: true,
            permissions: true,
            restaurantAccess: true,
          },
        },
      },
    });

    if (!this.isActiveStaffWithRole(staff)) {
      return false;
    }

    this.attachStaffScopeToRequestUser(user, staff);

    const accessKeys = this.resolveRouteAccessKeys(context);
    if (!accessKeys.length) {
      return false;
    }

    if (this.isEssentialStaffRead(context)) {
      return true;
    }

    const canUsePermission = this.hasPermission(
      staff.staffRole.permissions,
      accessKeys,
      this.resolveRequiredOperation(context),
    );

    return canUsePermission;
  }

  private isEssentialStaffRead(context: ExecutionContext): boolean {
    if (this.resolveRequiredOperation(context) !== 'read') {
      return false;
    }

    const normalizedPath = this.resolveNormalizedRoutePath(context);
    return (
      normalizedPath === 'admin/global-settings' ||
      normalizedPath.startsWith('admin/global-settings/') ||
      normalizedPath === 'restaurants' ||
      normalizedPath.startsWith('restaurants/')
    );
  }

  private attachStaffScopeToRequestUser(
    user: {
      ownerUserId?: string;
      staffRoleId?: string;
      panelType?: string;
      tid?: string | null;
      rid?: string | null;
      bid?: string | null;
      restaurantAccess?: StaffRestaurantAccess | null;
    },
    staff: StaffPermissionRecord & {
      staffRole: NonNullable<StaffPermissionRecord['staffRole']>;
    },
  ): void {
    user.ownerUserId = staff.ownerUserId;
    user.staffRoleId = staff.staffRoleId;
    user.panelType = staff.panelType;
    user.tid = staff.tenantId;
    user.rid = staff.restaurantId;
    user.bid = staff.branchId;
    user.restaurantAccess =
      this.normalizeStaffRestaurantAccess(staff.restaurantAccess) ??
      this.normalizeStaffRestaurantAccess(staff.staffRole.restaurantAccess);
  }

  private normalizeStaffRestaurantAccess(
    value: Prisma.JsonValue,
  ): StaffRestaurantAccess | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    return {
      restaurantIds: Array.isArray(record.restaurantIds)
        ? record.restaurantIds.filter(
            (item): item is string => typeof item === 'string' && !!item,
          )
        : [],
      branchIds: Array.isArray(record.branchIds)
        ? record.branchIds.filter(
            (item): item is string => typeof item === 'string' && !!item,
          )
        : [],
      allRestaurants:
        record.allRestaurants === true ||
        record.hasAllRestaurantsAccess === true,
      hasAllRestaurantsAccess:
        record.hasAllRestaurantsAccess === true ||
        record.allRestaurants === true,
    };
  }

  private isActiveStaffWithRole(
    staff: StaffPermissionRecord | null,
  ): staff is StaffPermissionRecord & {
    staffRole: NonNullable<StaffPermissionRecord['staffRole']>;
  } {
    return !!(
      staff?.isActive &&
      !staff.deletedAt &&
      staff.staffRole?.isActive &&
      !staff.staffRole.deletedAt
    );
  }

  private hasPermission(
    permissions: Prisma.JsonValue,
    accessKeys: string[],
    operation: string,
  ): boolean {
    if (!Array.isArray(permissions)) {
      return false;
    }

    const allowedAccessKeys = new Set(
      accessKeys.map((key) => this.normalizeAccess(key)),
    );
    const allowedOperations = this.compatibleOperations(operation);

    return permissions.some((permission) => {
      if (
        !permission ||
        typeof permission !== 'object' ||
        Array.isArray(permission)
      ) {
        return false;
      }

      const entry = permission as PermissionEntry;
      const access = this.normalizeAccess(entry.access);
      const operations = Array.isArray(entry.operations)
        ? entry.operations.map((item) => this.normalizeOperation(item))
        : [];

      return (
        allowedAccessKeys.has(access) &&
        operations.some((item) => allowedOperations.has(item))
      );
    });
  }

  private compatibleOperations(operation: string): Set<string> {
    const normalizedOperation = this.normalizeOperation(operation);
    const operations = new Set([normalizedOperation, 'manage', '*', 'all']);
    if (normalizedOperation === 'read') {
      operations.add('view');
      operations.add('list');
      operations.add('get');
      operations.add('write');
      operations.add('create');
      operations.add('update');
      operations.add('edit');
    }
    if (
      normalizedOperation === 'create' ||
      normalizedOperation === 'update' ||
      normalizedOperation === 'delete'
    ) {
      operations.add('write');
    }
    if (normalizedOperation === 'update') {
      operations.add('edit');
    }
    if (normalizedOperation === 'delete') {
      operations.add('remove');
    }
    return operations;
  }

  private resolveRequiredOperation(context: ExecutionContext): string {
    const method = this.reflector.get<RequestMethod>(
      METHOD_METADATA,
      context.getHandler(),
    );

    switch (method) {
      case RequestMethod.POST:
        return 'create';
      case RequestMethod.PUT:
      case RequestMethod.PATCH:
        return 'update';
      case RequestMethod.DELETE:
        return 'delete';
      default:
        return 'read';
    }
  }

  private resolveRouteAccessKeys(context: ExecutionContext): string[] {
    const normalizedPath = this.resolveNormalizedRoutePath(context);
    const candidates = new Set<string>();

    this.addMappedAccessKeys(normalizedPath, candidates);

    normalizedPath
      .split('/')
      .filter((part) => part && !part.startsWith(':'))
      .forEach((part) => {
        candidates.add(part);
        candidates.add(part.replace(/-/g, '_'));
      });

    return [...candidates].filter(Boolean);
  }

  private resolveNormalizedRoutePath(context: ExecutionContext): string {
    const controllerPath = this.pathToString(
      this.reflector.get<string | string[]>(PATH_METADATA, context.getClass()),
    );
    const handlerPath = this.pathToString(
      this.reflector.get<string | string[]>(
        PATH_METADATA,
        context.getHandler(),
      ),
    );
    const routePath = [controllerPath, handlerPath].filter(Boolean).join('/');
    return routePath.replace(/^\/+|\/+$/g, '').toLowerCase();
  }

  private addMappedAccessKeys(path: string, candidates: Set<string>): void {
    const mappings: Array<[string, string[]]> = [
      ['admin/dashboard/orders/stats', ['order-management', 'orders']],
      ['admin/dashboard', ['dashboard', 'reports']],
      ['admin/global-settings', ['storefront-settings', 'settings']],
      ['restaurants/customer-app-content', ['storefront-settings']],
      ['restaurants', ['dashboard', 'profile', 'storefront-settings']],
      [
        'staff-management',
        [
          'employees',
          'staff-management',
          'staff',
          'staffs',
          'employees',
          'employee-management',
        ],
      ],
      ['staff-roles', ['employees', 'staff-roles', 'roles', 'role-management']],
      [
        'permission-modules',
        ['employees', 'staff-roles', 'storefront-settings', 'settings'],
      ],
      ['admin/promotions', ['promotion-management', 'promotions']],
      ['admin/deals', ['menu-management', 'menu', 'deals']],
      ['admin/loyalty', ['loyalty-program', 'customers']],
      ['admin/printing', ['auto-printing-pos', 'pos-management', 'pos']],
      ['admin/reports', ['reports-payouts', 'reports']],
      ['admin/package-plans/payouts', ['reports-payouts', 'reports']],
      ['admin/package-plans', ['payment-settings', 'settings']],
      [
        'admin/imports',
        ['content-management', 'promotion-management', 'deliveryman'],
      ],
      [
        'admin/import-samples',
        ['content-management', 'promotion-management', 'deliveryman'],
      ],
      ['coupons', ['promotion-management', 'coupons']],
      ['orders', ['order-management', 'orders']],
      ['group-orders', ['order-management', 'orders']],
      ['pos', ['pos-management', 'pos', 'table-reservations']],
      [
        'payments',
        ['payment-settings', 'reports-payouts', 'reports', 'settings'],
      ],
      ['notifications', ['notifications', 'chat', 'settings']],
      ['chat', ['notifications', 'chat']],
      ['contact-submissions', ['contact-submissions', 'customers', 'chat']],
      ['customer-app/admin/table-reservations', ['table-reservations']],
      ['customer-app/table-reservations', ['table-reservations']],
      ['customer-app/loyalty-points', ['loyalty-program']],
      ['loyalty-wallet', ['loyalty-program', 'customers']],
      [
        'localizations',
        ['content-management', 'storefront-settings', 'settings'],
      ],
      ['restaurants/:id/customer-app-faqs', ['content-management', 'faqs']],
      [
        'restaurants/:id/customer-app-content',
        ['content-management', 'storefront-settings'],
      ],
      [
        'restaurants/:id/legal-profile',
        ['content-management', 'legal-profile'],
      ],
      [
        'menu',
        [
          'menu-management',
          'menu',
          'restaurant-menus',
          'menu-categories',
          'menu-items',
          'modifiers',
          'modifier-categories',
          'modifier-groups',
          'variations',
          'branch-overrides',
          'cuisines',
        ],
      ],
      ['menus', ['menu-management', 'menu', 'restaurant-menus']],
      ['branches', ['branch-management', 'branch_management']],
      ['deliverymen', ['deliveryman', 'deliverymen']],
      ['auth/me/profile', ['profile']],
      ['auth/deliveryman', ['deliveryman']],
    ];

    mappings.forEach(([prefix, accessKeys]) => {
      if (path === prefix || path.startsWith(`${prefix}/`)) {
        accessKeys.forEach((key) => candidates.add(key));
      }
    });
  }

  private pathToString(path?: string | string[]): string {
    if (Array.isArray(path)) {
      return path[0] ?? '';
    }
    return path ?? '';
  }

  private isStaffActor(user: { role?: string; actorType?: string }): boolean {
    return user.role === RolesEnum.STAFF || user.actorType === RolesEnum.STAFF;
  }

  private normalizeAccess(value: unknown): string {
    return this.normalizeText(value).replace(/[\s_]+/g, '-');
  }

  private normalizeOperation(value: unknown): string {
    return this.normalizeText(value);
  }

  private normalizeText(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim().toLowerCase();
    }

    return '';
  }
}
