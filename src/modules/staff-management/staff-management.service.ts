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
import { StaffManagementRepository } from './staff-management.repository';
import {
  CreateStaffDto,
  ListStaffDto,
  UpdateStaffDto,
  UpdateStaffStatusDto,
} from './dto';

interface ResolvedStaffManagementScope {
  panelType: StaffPanelType;
  tenantId: string | null;
  restaurantId: string | null;
  branchId: string | null;
}

@Injectable()
export class StaffManagementService {
  constructor(
    private readonly staffManagementRepository: StaffManagementRepository,
    private readonly staffRolesService: StaffRolesService,
  ) {}

  async create(user: AuthUserContext, dto: CreateStaffDto) {
    const existing = await this.staffManagementRepository.findByEmail(
      dto.email.trim().toLowerCase(),
    );
    if (existing && !existing.deletedAt) {
      throw new BadRequestException('Email already exists');
    }

    const staffRole = await this.staffRolesService.getManageableRoleOrThrow(
      user,
      dto.staffRoleId,
    );

    const data = await this.staffManagementRepository.create({
      email: dto.email.trim().toLowerCase(),
      password: await bcrypt.hash(dto.password, 10),
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      phone: this.resolveOptionalString(dto.phone),
      avatarUrl: this.resolveOptionalString(dto.avatarUrl),
      bio: this.resolveOptionalString(dto.bio),
      isVerified: true,
      isApproved: true,
      isActive: dto.isActive ?? true,
      panelType: staffRole.panelType,
      ownerUser: { connect: { id: user.uid } },
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
    });

    return {
      data: this.toStaffResponse(data),
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
      data: items.map((item) => this.toStaffResponse(item)),
      message: 'Staff accounts fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const staff = await this.getAccessibleStaffOrThrow(user, id);

    return {
      data: this.toStaffResponse(staff),
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
      data: this.toStaffResponse(data),
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
      data: this.toStaffResponse(data),
      message: 'Staff account status updated successfully',
    };
  }

  async remove(user: AuthUserContext, id: string) {
    await this.getAccessibleStaffOrThrow(user, id);

    const data = await this.staffManagementRepository.softDelete(id);

    return {
      data: this.toStaffResponse(data),
      message: 'Staff account removed successfully',
    };
  }

  private async getAccessibleStaffOrThrow(user: AuthUserContext, id: string) {
    const staff = await this.staffManagementRepository.findById(id);

    if (!staff || staff.deletedAt) {
      throw new NotFoundException('Staff account not found');
    }

    if (staff.ownerUserId !== user.uid) {
      throw new ForbiddenException(
        'You cannot access staff accounts created by another admin',
      );
    }

    const scope = this.resolveScopeForUser(user);
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
      ownerUserId: user.uid,
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
        panelType: StaffPanelType.BRANCH_ADMIN,
        tenantId: user.tid,
        restaurantId: user.rid,
        branchId: user.bid,
      };
    }

    throw new ForbiddenException('You do not have access to staff accounts');
  }

  private resolveOptionalString(value: string | undefined) {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private toStaffResponse(
    staff: { password?: string; deletedAt?: Date | null; isActive?: boolean } &
      Record<string, unknown>,
  ) {
    const rest = { ...staff };
    delete rest.password;

    return {
      ...rest,
      deletionState: {
        isDeleted: !!staff.deletedAt,
        deletionScheduled: false,
        deletedAt: staff.deletedAt ?? null,
        deleteAfter: null,
        isActive: staff.isActive ?? true,
      },
    };
  }
}
