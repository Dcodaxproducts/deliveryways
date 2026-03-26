import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StaffRoleScope } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaService } from '../../database';
import {
  CreateStaffRoleDto,
  ListStaffRolesDto,
  UpdateStaffRoleDto,
} from './dto';
import { StaffRolesRepository } from './staff-roles.repository';

interface ResolvedStaffRoleScope {
  scope: StaffRoleScope;
  tenantId: string | null;
  restaurantId: string | null;
  branchId: string | null;
}

@Injectable()
export class StaffRolesService {
  constructor(
    private readonly staffRolesRepository: StaffRolesRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(user: AuthUserContext, dto: CreateStaffRoleDto) {
    const scope = await this.resolveScopeForCreation(
      user,
      dto.restaurantId,
      dto.branchId,
    );

    await this.assertUniqueRoleName(scope, dto.name);

    const data = await this.staffRolesRepository.create({
      name: dto.name.trim(),
      description: this.resolveOptionalString(dto.description),
      scope: scope.scope,
      tenant: scope.tenantId ? { connect: { id: scope.tenantId } } : undefined,
      restaurant: scope.restaurantId
        ? { connect: { id: scope.restaurantId } }
        : undefined,
      branch: scope.branchId ? { connect: { id: scope.branchId } } : undefined,
      permissions: {
        create: dto.permissions.map((permission) => ({
          access: permission.access.trim(),
          operations: [
            ...new Set(permission.operations.map((item) => item.trim())),
          ],
        })),
      },
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
          scope: role.scope,
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
          ? {
              deleteMany: {},
              create: dto.permissions.map((permission) => ({
                access: permission.access.trim(),
                operations: [
                  ...new Set(permission.operations.map((item) => item.trim())),
                ],
              })),
            }
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

    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return role;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid || role.tenantId !== user.tid) {
        throw new ForbiddenException(
          'You cannot access staff roles outside your tenant',
        );
      }

      return role;
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.bid || role.branchId !== user.bid) {
        throw new ForbiddenException(
          'You cannot access staff roles outside your branch',
        );
      }

      return role;
    }

    throw new ForbiddenException('You do not have access to staff roles');
  }

  private buildListWhere(
    user: AuthUserContext,
    query: ListStaffRolesDto,
  ): Prisma.StaffRoleWhereInput {
    const baseWhere: Prisma.StaffRoleWhereInput = {
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

    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return {
        ...baseWhere,
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      };
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      return {
        ...baseWhere,
        tenantId: user.tid,
        ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      };
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.bid) {
        throw new ForbiddenException('Branch context is required');
      }

      return {
        ...baseWhere,
        branchId: user.bid,
      };
    }

    throw new ForbiddenException('You do not have access to staff roles');
  }

  private async resolveScopeForCreation(
    user: AuthUserContext,
    requestedRestaurantId?: string,
    requestedBranchId?: string,
  ): Promise<ResolvedStaffRoleScope> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (requestedBranchId) {
        const branch = await this.prisma.branch.findFirst({
          where: { id: requestedBranchId, deletedAt: null, isActive: true },
          select: { id: true, tenantId: true, restaurantId: true },
        });

        if (!branch) {
          throw new BadRequestException('Branch not found');
        }

        return {
          scope: StaffRoleScope.BRANCH,
          tenantId: branch.tenantId,
          restaurantId: branch.restaurantId,
          branchId: branch.id,
        };
      }

      if (requestedRestaurantId) {
        const restaurant = await this.prisma.restaurant.findFirst({
          where: { id: requestedRestaurantId, deletedAt: null, isActive: true },
          select: { id: true, tenantId: true },
        });

        if (!restaurant) {
          throw new BadRequestException('Restaurant not found');
        }

        return {
          scope: StaffRoleScope.RESTAURANT,
          tenantId: restaurant.tenantId,
          restaurantId: restaurant.id,
          branchId: null,
        };
      }

      return {
        scope: StaffRoleScope.SUPER_ADMIN,
        tenantId: null,
        restaurantId: null,
        branchId: null,
      };
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (requestedBranchId) {
        const branch = await this.prisma.branch.findFirst({
          where: {
            id: requestedBranchId,
            tenantId: user.tid,
            ...(requestedRestaurantId
              ? { restaurantId: requestedRestaurantId }
              : {}),
            deletedAt: null,
            isActive: true,
          },
          select: { id: true, restaurantId: true },
        });

        if (!branch) {
          throw new BadRequestException('Branch not found');
        }

        return {
          scope: StaffRoleScope.BRANCH,
          tenantId: user.tid,
          restaurantId: branch.restaurantId,
          branchId: branch.id,
        };
      }

      if (!requestedRestaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      const restaurant = await this.prisma.restaurant.findFirst({
        where: {
          id: requestedRestaurantId,
          tenantId: user.tid,
          deletedAt: null,
          isActive: true,
        },
        select: { id: true },
      });

      if (!restaurant) {
        throw new BadRequestException('Restaurant not found');
      }

      return {
        scope: StaffRoleScope.RESTAURANT,
        tenantId: user.tid,
        restaurantId: restaurant.id,
        branchId: null,
      };
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.tid || !user.rid || !user.bid) {
        throw new ForbiddenException('Branch context is required');
      }

      if (requestedBranchId && requestedBranchId !== user.bid) {
        throw new ForbiddenException(
          'You cannot create staff roles outside your branch',
        );
      }

      return {
        scope: StaffRoleScope.BRANCH,
        tenantId: user.tid,
        restaurantId: user.rid,
        branchId: user.bid,
      };
    }

    throw new ForbiddenException(
      'You do not have access to create staff roles',
    );
  }

  private async assertUniqueRoleName(
    scope: ResolvedStaffRoleScope,
    name: string,
    excludeId?: string,
  ) {
    const existing = await this.staffRolesRepository.findByNameWithinScope({
      name: name.trim(),
      tenantId: scope.tenantId,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
      excludeId,
    });

    if (existing) {
      throw new BadRequestException(
        'A staff role with this name already exists in the selected scope',
      );
    }
  }

  private resolveOptionalString(value: string | undefined) {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
}
