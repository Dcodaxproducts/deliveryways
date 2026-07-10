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

type StaffPermissionRecord = {
  isActive: boolean;
  deletedAt: Date | null;
  staffRole: {
    isActive: boolean;
    deletedAt: Date | null;
    permissions: Prisma.JsonValue;
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
      user?: { uid?: string; role?: string; actorType?: string };
    }>();
    const userRole = request.user?.role;

    if (userRole && requiredRoles.includes(userRole as RolesEnum)) {
      return true;
    }

    if (await this.canStaffUseRolePermission(context, request.user)) {
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
    user?: { uid?: string; role?: string; actorType?: string },
  ): Promise<boolean> {
    if (!user?.uid || !this.isStaffActor(user)) {
      return false;
    }

    const accessKeys = this.resolveRouteAccessKeys(context);
    if (!accessKeys.length) {
      return false;
    }

    const staff = await this.prisma.staffUser.findUnique({
      where: { id: user.uid },
      select: {
        isActive: true,
        deletedAt: true,
        staffRole: {
          select: {
            isActive: true,
            deletedAt: true,
            permissions: true,
          },
        },
      },
    });

    if (!this.isActiveStaffWithRole(staff)) {
      return false;
    }

    return this.hasPermission(
      staff.staffRole.permissions,
      accessKeys,
      this.resolveRequiredOperation(context),
    );
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
    const normalizedPath = routePath.replace(/^\/+|\/+$/g, '').toLowerCase();
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

  private addMappedAccessKeys(path: string, candidates: Set<string>): void {
    const mappings: Array<[string, string[]]> = [
      ['admin/dashboard', ['dashboard', 'reports']],
      ['admin/global-settings', ['settings']],
      ['restaurants', ['restaurants', 'dashboard']],
      [
        'staff-management',
        [
          'staff-management',
          'staff',
          'staffs',
          'employees',
          'employee-management',
        ],
      ],
      ['staff-roles', ['staff-roles', 'roles', 'role-management']],
      ['permission-modules', ['staff-roles', 'settings']],
      ['admin/promotions', ['promotions']],
      ['admin/deals', ['coupons', 'promotions']],
      ['coupons', ['coupons']],
      ['orders', ['orders']],
      ['pos', ['pos']],
      ['payments', ['reports', 'settings']],
      ['notifications', ['chat', 'settings']],
      ['contact-submissions', ['customers', 'chat']],
      ['loyalty-wallet', ['customers']],
      ['localizations', ['settings']],
      ['branches', ['branch_management', 'branch-management']],
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
