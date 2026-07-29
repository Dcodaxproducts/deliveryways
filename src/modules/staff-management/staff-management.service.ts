import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, StaffPanelType } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { StaffRolesService } from '../staff-roles/staff-roles.service';
import { StorageService } from '../storage/storage.service';
import { StaffManagementRepository } from './staff-management.repository';
import {
  CreateStaffDto,
  ListStaffDto,
  UpdateStaffDto,
  UpdateStaffStatusDto,
} from './dto';

interface ResolvedStaffManagementScope {
  ownerUserId: string;
  panelType: StaffPanelType;
  tenantId: string | null;
  restaurantId: string | null;
  branchId: string | null;
}

interface StaffRestaurantAccessScope {
  restaurantIds: string[];
  branchIds: string[];
  allRestaurants: boolean;
}

@Injectable()
export class StaffManagementService {
  constructor(
    private readonly staffManagementRepository: StaffManagementRepository,
    private readonly staffRolesService: StaffRolesService,
    private readonly storageService?: StorageService,
  ) {}

  async create(user: AuthUserContext, dto: CreateStaffDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.staffManagementRepository.findByEmail(email);
    if (existing && !existing.deletedAt) {
      throw new BadRequestException('Email already exists');
    }

    const staffRole = await this.staffRolesService.getManageableRoleOrThrow(
      user,
      dto.staffRoleId,
    );

    const staffPayload = {
      email,
      password: await bcrypt.hash(dto.password, 10),
      plainPassword: dto.password,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      phone: this.resolveOptionalString(dto.phone),
      avatarUrl: this.resolveOptionalString(dto.avatarUrl),
      bio: this.resolveOptionalString(dto.bio),
      restaurantAccess: await this.resolveRestaurantAccessForStaff(
        staffRole,
        dto,
      ),
      isVerified: true,
      isApproved: true,
      isActive: dto.isActive ?? true,
      panelType: staffRole.panelType,
      ownerUser: { connect: { id: staffRole.ownerUserId } },
      staffRole: { connect: { id: staffRole.id } },
      tenant: staffRole.tenantId
        ? { connect: { id: staffRole.tenantId } }
        : undefined,
      restaurant: staffRole.restaurantId
        ? { connect: { id: staffRole.restaurantId } }
        : undefined,
      branch: staffRole.branchId
        ? { connect: { id: staffRole.branchId } }
        : undefined,
      deletedAt: null,
      refreshTokenHash: null,
    };
    const data =
      existing && existing.deletedAt
        ? await this.staffManagementRepository.update(existing.id, staffPayload)
        : await this.staffManagementRepository.create(staffPayload);

    return {
      data: await this.resolveMediaResponse(this.toStaffResponse(data)),
      message: 'Staff account created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListStaffDto) {
    const where = this.buildListWhere(user, query);
    const { items, total } = await this.staffManagementRepository.list(
      where,
      query,
    );

    return {
      data: await this.resolveMediaResponse(
        items.map((item) => this.toStaffResponse(item)),
      ),
      message: 'Staff accounts fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const staff = await this.getAccessibleStaffOrThrow(user, id);

    return {
      data: await this.resolveMediaResponse(this.toStaffResponse(staff)),
      message: 'Staff account fetched successfully',
    };
  }

  async update(user: AuthUserContext, id: string, dto: UpdateStaffDto) {
    const staff = await this.getAccessibleStaffOrThrow(user, id);

    if (dto.email) {
      const existing = await this.staffManagementRepository.findByEmail(
        dto.email.trim().toLowerCase(),
      );
      if (existing && existing.id !== staff.id && !existing.deletedAt) {
        throw new BadRequestException('Email already exists');
      }
    }

    const nextRole = dto.staffRoleId
      ? await this.staffRolesService.getManageableRoleOrThrow(
          user,
          dto.staffRoleId,
        )
      : staff.staffRole;

    if (!nextRole || nextRole.deletedAt || !nextRole.isActive) {
      throw new BadRequestException('Staff role is inactive');
    }

    const data = await this.staffManagementRepository.update(id, {
      email: dto.email?.trim().toLowerCase(),
      password: dto.password ? await bcrypt.hash(dto.password, 10) : undefined,
      plainPassword: dto.password,
      firstName: dto.firstName?.trim(),
      lastName: dto.lastName?.trim(),
      phone:
        dto.phone !== undefined
          ? this.resolveOptionalString(dto.phone)
          : undefined,
      avatarUrl:
        dto.avatarUrl !== undefined
          ? this.resolveOptionalString(dto.avatarUrl)
          : undefined,
      bio:
        dto.bio !== undefined ? this.resolveOptionalString(dto.bio) : undefined,
      isActive: dto.isActive,
      panelType: nextRole.panelType,
      restaurantAccess:
        dto.restaurantIds !== undefined ||
        dto.branchIds !== undefined ||
        dto.allRestaurants !== undefined ||
        dto.hasAllRestaurantsAccess !== undefined ||
        dto.staffRoleId !== undefined
          ? await this.resolveRestaurantAccessForStaff(nextRole, dto)
          : undefined,
      staffRole: { connect: { id: nextRole.id } },
      tenant:
        nextRole.tenantId !== undefined
          ? nextRole.tenantId
            ? { connect: { id: nextRole.tenantId } }
            : { disconnect: true }
          : undefined,
      restaurant:
        nextRole.restaurantId !== undefined
          ? nextRole.restaurantId
            ? { connect: { id: nextRole.restaurantId } }
            : { disconnect: true }
          : undefined,
      branch:
        nextRole.branchId !== undefined
          ? nextRole.branchId
            ? { connect: { id: nextRole.branchId } }
            : { disconnect: true }
          : undefined,
    });

    return {
      data: await this.resolveMediaResponse(this.toStaffResponse(data)),
      message: 'Staff account updated successfully',
    };
  }

  async updateStatus(
    user: AuthUserContext,
    id: string,
    dto: UpdateStaffStatusDto,
  ) {
    await this.getAccessibleStaffOrThrow(user, id);

    const data = await this.staffManagementRepository.update(id, {
      isActive: dto.isActive,
    });

    return {
      data: await this.resolveMediaResponse(this.toStaffResponse(data)),
      message: 'Staff account status updated successfully',
    };
  }

  async remove(user: AuthUserContext, id: string) {
    await this.getAccessibleStaffOrThrow(user, id);

    const data = await this.staffManagementRepository.softDelete(id);

    return {
      data: await this.resolveMediaResponse(this.toStaffResponse(data)),
      message: 'Staff account removed successfully',
    };
  }

  private async resolveMediaResponse<T>(data: T) {
    return (await this.storageService?.resolveMediaUrlsDeep(data)) ?? data;
  }

  private async getAccessibleStaffOrThrow(user: AuthUserContext, id: string) {
    const staff = await this.staffManagementRepository.findById(id);

    if (!staff || staff.deletedAt) {
      throw new NotFoundException('Staff account not found');
    }

    const scope = this.resolveScopeForUser(user);

    if (staff.ownerUserId !== scope.ownerUserId) {
      throw new ForbiddenException(
        'You cannot access staff accounts created by another admin',
      );
    }

    if (staff.panelType !== scope.panelType) {
      throw new ForbiddenException(
        'You cannot access staff accounts outside your admin scope',
      );
    }

    if (
      staff.tenantId !== scope.tenantId ||
      staff.restaurantId !== scope.restaurantId ||
      staff.branchId !== scope.branchId
    ) {
      throw new ForbiddenException(
        'You cannot access staff accounts outside your admin scope',
      );
    }

    return staff;
  }

  private buildListWhere(
    user: AuthUserContext,
    query: ListStaffDto,
  ): Prisma.StaffUserWhereInput {
    const scope = this.resolveScopeForUser(user);

    return {
      ownerUserId: scope.ownerUserId,
      panelType: scope.panelType,
      tenantId: scope.tenantId,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
      deletedAt: null,
      ...(query.staffRoleId ? { staffRoleId: query.staffRoleId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              {
                email: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                firstName: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                lastName: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                phone: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
  }

  private resolveScopeForUser(
    user: AuthUserContext,
  ): ResolvedStaffManagementScope {
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

    throw new ForbiddenException('You do not have access to staff accounts');
  }

  private resolveStaffPanelType(panelType: string): StaffPanelType {
    if (Object.values(StaffPanelType).includes(panelType as StaffPanelType)) {
      return panelType as StaffPanelType;
    }

    throw new ForbiddenException('Staff panel scope is invalid');
  }

  private resolveOptionalString(value: string | undefined) {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private async resolveRestaurantAccessForStaff(
    role: {
      restaurantAccess?: Prisma.JsonValue | null;
      restaurantId?: string | null;
      branchId?: string | null;
    },
    dto: {
      restaurantIds?: string[];
      branchIds?: string[];
      allRestaurants?: boolean;
      hasAllRestaurantsAccess?: boolean;
    },
  ): Promise<Prisma.InputJsonValue | undefined> {
    if (
      dto.restaurantIds === undefined &&
      dto.branchIds === undefined &&
      dto.allRestaurants === undefined &&
      dto.hasAllRestaurantsAccess === undefined
    ) {
      return this.normalizeExistingRestaurantAccess(
        role.restaurantAccess,
      ) as unknown as Prisma.InputJsonValue;
    }

    const roleAccess = this.normalizeExistingRestaurantAccess(
      role.restaurantAccess,
    );
    const roleRestaurantIds = new Set([
      ...roleAccess.restaurantIds,
      ...(role.restaurantId ? [role.restaurantId] : []),
    ]);
    const roleBranchIds = new Set([
      ...roleAccess.branchIds,
      ...(role.branchId ? [role.branchId] : []),
    ]);
    const restaurantIds = this.uniqueCleanIds(dto.restaurantIds ?? []);
    const branchIds = this.uniqueCleanIds(dto.branchIds ?? []);
    const allRestaurants =
      dto.allRestaurants === true || dto.hasAllRestaurantsAccess === true;

    if (allRestaurants) {
      if (roleRestaurantIds.size > 0 || roleBranchIds.size > 0) {
        return {
          restaurantIds: [...roleRestaurantIds],
          branchIds: [...roleBranchIds],
          allRestaurants: false,
          hasAllRestaurantsAccess: false,
        } as Prisma.InputJsonValue;
      }

      return {
        restaurantIds: [],
        branchIds: [],
        allRestaurants: true,
        hasAllRestaurantsAccess: true,
      } as Prisma.InputJsonValue;
    }

    if (
      roleRestaurantIds.size > 0 &&
      restaurantIds.some((restaurantId) => !roleRestaurantIds.has(restaurantId))
    ) {
      throw new ForbiddenException(
        'Staff account restaurant access must stay within the assigned role access',
      );
    }

    if (
      roleBranchIds.size > 0 &&
      branchIds.some((branchId) => !roleBranchIds.has(branchId))
    ) {
      throw new ForbiddenException(
        'Staff account branch access must stay within the assigned role access',
      );
    }

    if (restaurantIds.length) {
      const count =
        await this.staffManagementRepository.countRestaurants(restaurantIds);
      if (count !== restaurantIds.length) {
        throw new BadRequestException('One or more restaurants were not found');
      }
    }

    if (branchIds.length) {
      const branches =
        await this.staffManagementRepository.findBranches(branchIds);
      if (branches.length !== branchIds.length) {
        throw new BadRequestException('One or more branches were not found');
      }

      const branchRestaurantIds = branches.map((branch) => branch.restaurantId);
      for (const restaurantId of branchRestaurantIds) {
        if (
          roleRestaurantIds.size > 0 &&
          !roleRestaurantIds.has(restaurantId)
        ) {
          throw new ForbiddenException(
            'Staff account branch access must stay within the assigned role access',
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
      allRestaurants: false,
      hasAllRestaurantsAccess: false,
    } as Prisma.InputJsonValue;
  }

  private normalizeExistingRestaurantAccess(
    access: Prisma.JsonValue | null | undefined,
  ): StaffRestaurantAccessScope {
    if (!access || typeof access !== 'object' || Array.isArray(access)) {
      return { restaurantIds: [], branchIds: [], allRestaurants: false };
    }

    const value = access as {
      restaurantIds?: unknown;
      branchIds?: unknown;
      allRestaurants?: unknown;
      hasAllRestaurantsAccess?: unknown;
    };
    return {
      allRestaurants:
        value.allRestaurants === true || value.hasAllRestaurantsAccess === true,
      restaurantIds: Array.isArray(value.restaurantIds)
        ? this.uniqueCleanIds(
            value.restaurantIds.filter(
              (id): id is string => typeof id === 'string',
            ),
          )
        : [],
      branchIds: Array.isArray(value.branchIds)
        ? this.uniqueCleanIds(
            value.branchIds.filter(
              (id): id is string => typeof id === 'string',
            ),
          )
        : [],
    };
  }

  private uniqueCleanIds(ids: string[]) {
    return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  }

  private toStaffResponse(
    staff: {
      password?: string;
      plainPassword?: unknown;
      temporaryPassword?: unknown;
      generatedPassword?: unknown;
      deletedAt?: Date | null;
      isActive?: boolean;
    } & Record<string, unknown>,
  ) {
    const clientVisiblePassword = this.resolveClientVisiblePassword(staff);
    const rest = { ...staff };
    delete rest.password;
    delete rest.plainPassword;
    delete rest.temporaryPassword;
    delete rest.generatedPassword;

    return {
      ...rest,
      ...(clientVisiblePassword
        ? {
            password: clientVisiblePassword,
            plainPassword: clientVisiblePassword,
          }
        : {}),
      deletionState: {
        isDeleted: !!staff.deletedAt,
        deletionScheduled: false,
        deletedAt: staff.deletedAt ?? null,
        deleteAfter: null,
        isActive: staff.isActive ?? true,
      },
    };
  }

  private resolveClientVisiblePassword(staff: {
    plainPassword?: unknown;
    temporaryPassword?: unknown;
    generatedPassword?: unknown;
  }) {
    return (
      this.normalizeClientVisiblePassword(staff.plainPassword) ??
      this.normalizeClientVisiblePassword(staff.temporaryPassword) ??
      this.normalizeClientVisiblePassword(staff.generatedPassword)
    );
  }

  private normalizeClientVisiblePassword(value: unknown) {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
}
