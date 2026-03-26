import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRoleEnum } from '../../common/enums';
import { AuthUserContext } from '../../common/decorators';
import { buildPaginationMeta } from '../../common/utils';
import { StaffRolesService } from '../staff-roles/staff-roles.service';
import { StaffManagementRepository } from './staff-management.repository';
import {
  CreateStaffDto,
  ListStaffDto,
  UpdateStaffDto,
  UpdateStaffStatusDto,
} from './dto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';

@Injectable()
export class StaffManagementService {
  constructor(
    private readonly staffManagementRepository: StaffManagementRepository,
    private readonly staffRolesService: StaffRolesService,
  ) {}

  async create(user: AuthUserContext, dto: CreateStaffDto) {
    const existing = await this.staffManagementRepository.findByEmail(
      dto.email,
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
      role: UserRole.STAFF,
      tenant: staffRole.tenantId
        ? { connect: { id: staffRole.tenantId } }
        : undefined,
      restaurant: staffRole.restaurantId
        ? { connect: { id: staffRole.restaurantId } }
        : undefined,
      branch: staffRole.branchId
        ? { connect: { id: staffRole.branchId } }
        : undefined,
      staffRole: { connect: { id: staffRole.id } },
      isVerified: true,
      isApproved: true,
      isActive: dto.isActive ?? true,
      profile: {
        create: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          avatarUrl: dto.avatarUrl,
          bio: dto.bio,
        },
      },
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
        dto.email,
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

    if (!nextRole) {
      throw new BadRequestException('Staff role is required');
    }

    const data = await this.staffManagementRepository.update(id, {
      email: dto.email?.trim().toLowerCase(),
      password: dto.password ? await bcrypt.hash(dto.password, 10) : undefined,
      isActive: dto.isActive,
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
      staffRole: { connect: { id: nextRole.id } },
      profile:
        dto.firstName !== undefined ||
        dto.lastName !== undefined ||
        dto.phone !== undefined ||
        dto.avatarUrl !== undefined ||
        dto.bio !== undefined
          ? {
              upsert: {
                create: {
                  firstName:
                    dto.firstName ?? staff.profile?.firstName ?? 'Staff',
                  lastName: dto.lastName ?? staff.profile?.lastName ?? 'User',
                  phone: dto.phone ?? staff.profile?.phone ?? null,
                  avatarUrl: dto.avatarUrl ?? staff.profile?.avatarUrl ?? null,
                  bio: dto.bio ?? staff.profile?.bio ?? null,
                },
                update: {
                  firstName: dto.firstName,
                  lastName: dto.lastName,
                  phone: dto.phone,
                  avatarUrl: dto.avatarUrl,
                  bio: dto.bio,
                },
              },
            }
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

    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return staff;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid || staff.tenantId !== user.tid) {
        throw new ForbiddenException(
          'You cannot access staff accounts outside your tenant',
        );
      }

      return staff;
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.bid || staff.branchId !== user.bid) {
        throw new ForbiddenException(
          'You cannot access staff accounts outside your branch',
        );
      }

      return staff;
    }

    throw new ForbiddenException('You do not have access to staff accounts');
  }

  private buildListWhere(user: AuthUserContext, query: ListStaffDto) {
    const baseWhere = {
      role: UserRole.STAFF,
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
                profile: {
                  OR: [
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
                },
              },
            ],
          }
        : {}),
    };

    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return baseWhere;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      return {
        ...baseWhere,
        tenantId: user.tid,
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

    throw new ForbiddenException('You do not have access to staff accounts');
  }

  private toStaffResponse(
    staff: {
      password?: string;
      staffRole?: unknown;
    } & Record<string, unknown>,
  ) {
    const rest = { ...staff };
    delete rest.password;
    return rest;
  }
}
