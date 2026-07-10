import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StaffPanelType } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import {
  CreateStaffRoleDto,
  ListStaffRolesDto,
  StaffRolePermissionDto,
  UpdateStaffRoleDto,
} from './dto';
import { PermissionModulesService } from '../permission-modules/permission-modules.service';
import { StaffRolesRepository } from './staff-roles.repository';

interface ResolvedStaffScope {
  ownerUserId: string;
  panelType: StaffPanelType;
  tenantId: string | null;
  restaurantId: string | null;
  branchId: string | null;
}

interface StaffRestaurantAccessScope {
  restaurantIds: string[];
  branchIds: string[];
}

@Injectable()
export class StaffRolesService {
  constructor(
    private readonly staffRolesRepository: StaffRolesRepository,
    private readonly permissionModulesService?: PermissionModulesService,
  ) {}

  async create(user: AuthUserContext, dto: CreateStaffRoleDto) {
    const scope = this.resolveScopeForUser(user);
    await this.assertUniqueRoleName(scope, dto.name);

    const data = await this.staffRolesRepository.create({
      ownerUser: { connect: { id: scope.ownerUserId } },
      panelType: scope.panelType,
      name: dto.name.trim(),
      description: this.resolveOptionalString(dto.description),
      permissions: await this.normalizePermissions(dto.permissions),
      restaurantAccess: await this.resolveRestaurantAccess(scope, dto),
      tenant: scope.tenantId ? { connect: { id: scope.tenantId } } : undefined,
      restaurant: scope.restaurantId
        ? { connect: { id: scope.restaurantId } }
        : undefined,
      branch: scope.branchId ? { connect: { id: scope.branchId } } : undefined,
    });

    return {
      data,
      message: 'Staff role created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListStaffRolesDto) {
    const where = this.buildListWhere(user, query);
    const { items, total } = await this.staffRolesRepository.list(where, query);

    return {
      data: items,
      message: 'Staff roles fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const role = await this.getManageableRoleOrThrow(user, id);

    return {
      data: role,
      message: 'Staff role fetched successfully',
    };
  }

  async update(user: AuthUserContext, id: string, dto: UpdateStaffRoleDto) {
    const role = await this.getManageableRoleOrThrow(user, id);

    if (dto.name) {
      await this.assertUniqueRoleName(
        {
          ownerUserId: role.ownerUserId,
          panelType: role.panelType,
          tenantId: role.tenantId,
          restaurantId: role.restaurantId,
          branchId: role.branchId,
        },
        dto.name,
        role.id,
      );
    }

    const data = await this.staffRolesRepository.update(id, {
      name: dto.name?.trim(),
      description:
        dto.description !== undefined
          ? this.resolveOptionalString(dto.description)
          : undefined,
      isActive: dto.isActive,
      permissions:
        dto.permissions !== undefined
          ? await this.normalizePermissions(dto.permissions)
          : undefined,
      restaurantAccess:
        dto.restaurantIds !== undefined || dto.branchIds !== undefined
          ? await this.resolveRestaurantAccess(
              {
                ownerUserId: role.ownerUserId,
                panelType: role.panelType,
                tenantId: role.tenantId,
                restaurantId: role.restaurantId,
                branchId: role.branchId,
              },
              dto,
            )
          : undefined,
    });

    return {
      data,
      message: 'Staff role updated successfully',
    };
  }

  async remove(user: AuthUserContext, id: string) {
    const role = await this.getManageableRoleOrThrow(user, id);
    const assignedCount = await this.staffRolesRepository.countAssignedUsers(
      role.id,
    );

    if (assignedCount > 0) {
      throw new BadRequestException(
        'Staff role cannot be deleted while staff accounts are assigned',
      );
    }

    const data = await this.staffRolesRepository.softDelete(role.id);

    return {
      data,
      message: 'Staff role removed successfully',
    };
  }

  async getManageableRoleOrThrow(user: AuthUserContext, id: string) {
    const role = await this.staffRolesRepository.findById(id);

    if (!role || role.deletedAt) {
      throw new NotFoundException('Staff role not found');
    }

    const scope = this.resolveScopeForUser(user);

    if (role.ownerUserId !== scope.ownerUserId) {
      throw new ForbiddenException(
        'You cannot access staff roles created by another admin',
      );
    }

    this.assertRoleMatchesScope(role, scope);

    return role;
  }

  private buildListWhere(
    user: AuthUserContext,
    query: ListStaffRolesDto,
  ): Prisma.StaffRoleWhereInput {
    const scope = this.resolveScopeForUser(user);

    return {
      ownerUserId: scope.ownerUserId,
      panelType: scope.panelType,
      tenantId: scope.tenantId,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
      deletedAt: null,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
  }

  private resolveScopeForUser(user: AuthUserContext): ResolvedStaffScope {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return {
        ownerUserId: user.uid,
        panelType: StaffPanelType.SUPER_ADMIN,
        tenantId: null,
        restaurantId: null,
        branchId: null,
      };
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      return {
        ownerUserId: user.uid,
        panelType: StaffPanelType.BUSINESS_ADMIN,
        tenantId: user.tid,
        restaurantId: null,
        branchId: null,
      };
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.tid || !user.rid || !user.bid) {
        throw new ForbiddenException('Branch context is required');
      }

      return {
        ownerUserId: user.uid,
        panelType: StaffPanelType.BRANCH_ADMIN,
        tenantId: user.tid,
        restaurantId: user.rid,
        branchId: user.bid,
      };
    }

    if (user.actorType === 'STAFF' || user.role === UserRoleEnum.STAFF) {
      if (!user.ownerUserId || !user.panelType) {
        throw new ForbiddenException('Staff admin scope is required');
      }

      return {
        ownerUserId: user.ownerUserId,
        panelType: this.resolveStaffPanelType(user.panelType),
        tenantId: user.tid ?? null,
        restaurantId: user.rid ?? null,
        branchId: user.bid ?? null,
      };
    }

    throw new ForbiddenException('You do not have access to staff roles');
  }

  private resolveStaffPanelType(panelType: string): StaffPanelType {
    if (Object.values(StaffPanelType).includes(panelType as StaffPanelType)) {
      return panelType as StaffPanelType;
    }

    throw new ForbiddenException('Staff panel scope is invalid');
  }

  private assertRoleMatchesScope(
    role: {
      panelType: StaffPanelType;
      tenantId: string | null;
      restaurantId: string | null;
      branchId: string | null;
    },
    scope: ResolvedStaffScope,
  ) {
    if (
      role.panelType !== scope.panelType ||
      role.tenantId !== scope.tenantId ||
      role.restaurantId !== scope.restaurantId ||
      role.branchId !== scope.branchId
    ) {
      throw new ForbiddenException(
        'You cannot access staff roles outside your admin scope',
      );
    }
  }

  private async assertUniqueRoleName(
    scope: ResolvedStaffScope,
    name: string,
    excludeId?: string,
  ) {
    const existing = await this.staffRolesRepository.findByNameWithinScope({
      ownerUserId: scope.ownerUserId,
      panelType: scope.panelType,
      name: name.trim(),
      tenantId: scope.tenantId,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
      excludeId,
    });

    if (existing) {
      throw new BadRequestException(
        'A staff role with this name already exists for your admin scope',
      );
    }
  }

  private async normalizePermissions(permissions: StaffRolePermissionDto[]) {
    const normalized = permissions.map((permission) => ({
      access: this.normalizeAccessKey(permission.access),
      operations: [
        ...new Set(
          permission.operations
            .map((operation) => operation.trim().toLowerCase())
            .filter(Boolean),
        ),
      ],
    }));

    if (normalized.some((permission) => !permission.operations.length)) {
      throw new BadRequestException(
        'Each permission must define at least one operation',
      );
    }

    await this.permissionModulesService?.validateActivePermissions(normalized);

    return normalized as Prisma.InputJsonValue;
  }

  private normalizeAccessKey(value: string) {
    const access = value.trim().toLowerCase();
    if (!access) {
      throw new BadRequestException('Permission access is required');
    }
    return access;
  }

  private async resolveRestaurantAccess(
    scope: ResolvedStaffScope,
    dto: { restaurantIds?: string[]; branchIds?: string[] },
  ): Promise<Prisma.InputJsonValue | undefined> {
    if (dto.restaurantIds === undefined && dto.branchIds === undefined) {
      return undefined;
    }

    const restaurantIds = this.uniqueCleanIds(dto.restaurantIds ?? []);
    const branchIds = this.uniqueCleanIds(dto.branchIds ?? []);

    if (
      scope.restaurantId &&
      restaurantIds.some((id) => id !== scope.restaurantId)
    ) {
      throw new ForbiddenException(
        'Staff role restaurant access must stay within your admin restaurant scope',
      );
    }

    if (scope.branchId && branchIds.some((id) => id !== scope.branchId)) {
      throw new ForbiddenException(
        'Staff role branch access must stay within your admin branch scope',
      );
    }

    if (restaurantIds.length) {
      const count =
        await this.staffRolesRepository.countRestaurants(restaurantIds);
      if (count !== restaurantIds.length) {
        throw new BadRequestException('One or more restaurants were not found');
      }
    }

    if (branchIds.length) {
      const branches = await this.staffRolesRepository.findBranches(branchIds);
      if (branches.length !== branchIds.length) {
        throw new BadRequestException('One or more branches were not found');
      }

      const branchRestaurantIds = branches.map((branch) => branch.restaurantId);
      for (const restaurantId of branchRestaurantIds) {
        if (scope.restaurantId && restaurantId !== scope.restaurantId) {
          throw new ForbiddenException(
            'Staff role branch access must stay within your admin restaurant scope',
          );
        }
      }

      restaurantIds.push(
        ...branchRestaurantIds.filter(
          (restaurantId) => !restaurantIds.includes(restaurantId),
        ),
      );
    }

    return {
      restaurantIds,
      branchIds,
    } satisfies StaffRestaurantAccessScope;
  }

  private uniqueCleanIds(ids: string[]) {
    return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  }

  private resolveOptionalString(value: string | undefined) {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
}
