import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaService } from '../../database';
import {
  CreateEmployeeDto,
  ListEmployeesDto,
  UpdateEmployeeDto,
  UpdateEmployeeStatusDto,
} from './dto';
import { EmployeesRepository } from './employees.repository';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly employeesRepository: EmployeesRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(user: AuthUserContext, dto: CreateEmployeeDto) {
    const tenantId = this.requireTenantId(user);
    const restaurantId = this.resolveRestaurantId(user, dto.restaurantId);
    const branch = await this.assertBranchAccess(
      user,
      restaurantId,
      dto.branchId,
    );

    await this.assertUniqueEmail(dto.email, restaurantId);

    const data = await this.employeesRepository.create({
      email: dto.email.trim().toLowerCase(),
      password: await bcrypt.hash(dto.password, 10),
      role: 'BRANCH_STAFF',
      isVerified: true,
      isApproved: true,
      isActive: true,
      tenant: { connect: { id: tenantId } },
      restaurant: { connect: { id: restaurantId } },
      branch: { connect: { id: branch.id } },
      profile: {
        create: {
          firstName: dto.profile.firstName,
          lastName: dto.profile.lastName,
          phone: dto.profile.phone,
          avatarUrl: dto.profile.avatarUrl,
          bio: dto.profile.bio,
        },
      },
    });

    return {
      data,
      message: 'Employee created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListEmployeesDto) {
    const scopedQuery: ListEmployeesDto = { ...query };
    const restaurantId = this.resolveRestaurantId(
      user,
      scopedQuery.restaurantId,
    );

    if (this.isBranchScopedUser(user) && user.bid) {
      scopedQuery.branchId = user.bid;
      scopedQuery.withDeleted = false;
    }

    if (scopedQuery.branchId) {
      await this.assertBranchAccess(user, restaurantId, scopedQuery.branchId);
    }

    const withDeleted =
      user.role === UserRoleEnum.SUPER_ADMIN && !!scopedQuery.withDeleted;
    const { items, total } = await this.employeesRepository.list(
      restaurantId,
      scopedQuery,
      withDeleted,
    );

    return {
      data: items,
      message: 'Employees fetched successfully',
      meta: buildPaginationMeta(scopedQuery, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const employee = await this.getAccessibleEmployee(user, id);

    return {
      data: employee,
      message: 'Employee fetched successfully',
    };
  }

  async update(user: AuthUserContext, id: string, dto: UpdateEmployeeDto) {
    const employee = await this.getAccessibleEmployee(user, id);

    if (!employee.restaurantId) {
      throw new BadRequestException('Employee is missing restaurant scope');
    }

    let branchId = employee.branchId;

    if (dto.branchId) {
      const branch = await this.assertBranchAccess(
        user,
        employee.restaurantId,
        dto.branchId,
      );
      branchId = branch.id;
    }

    if (!branchId) {
      throw new BadRequestException('Employee is missing branch scope');
    }

    if (dto.email) {
      await this.assertUniqueEmail(
        dto.email,
        employee.restaurantId,
        employee.id,
      );
    }

    const data = await this.employeesRepository.update(id, {
      email: dto.email?.trim().toLowerCase(),
      password: dto.password ? await bcrypt.hash(dto.password, 10) : undefined,
      branch: dto.branchId ? { connect: { id: branchId } } : undefined,
      profile: dto.profile
        ? {
            upsert: {
              create: {
                firstName:
                  dto.profile.firstName ??
                  employee.profile?.firstName ??
                  'Employee',
                lastName:
                  dto.profile.lastName ?? employee.profile?.lastName ?? 'Staff',
                phone: dto.profile.phone,
                avatarUrl: dto.profile.avatarUrl,
                bio: dto.profile.bio,
              },
              update: {
                firstName: dto.profile.firstName,
                lastName: dto.profile.lastName,
                phone: dto.profile.phone,
                avatarUrl: dto.profile.avatarUrl,
                bio: dto.profile.bio,
              },
            },
          }
        : undefined,
    });

    return {
      data,
      message: 'Employee updated successfully',
    };
  }

  async updateStatus(
    user: AuthUserContext,
    id: string,
    dto: UpdateEmployeeStatusDto,
  ) {
    await this.getAccessibleEmployee(user, id);

    const data = await this.employeesRepository.update(id, {
      isActive: dto.isActive,
      refreshTokenHash: dto.isActive ? undefined : null,
    });

    return {
      data,
      message: 'Employee status updated successfully',
    };
  }

  async remove(user: AuthUserContext, id: string) {
    await this.getAccessibleEmployee(user, id);

    const data = await this.employeesRepository.softDelete(id);

    return {
      data,
      message: 'Employee removed successfully',
    };
  }

  private async getAccessibleEmployee(user: AuthUserContext, id: string) {
    const employee = await this.employeesRepository.findById(id);

    if (!employee || employee.deletedAt) {
      throw new NotFoundException('Employee not found');
    }

    this.assertRestaurantAccess(user, employee.restaurantId);

    if (this.isBranchScopedUser(user) && user.bid !== employee.branchId) {
      throw new ForbiddenException(
        'You cannot access resources outside your branch',
      );
    }

    return employee;
  }

  private requireTenantId(user: AuthUserContext): string {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    return user.tid;
  }

  private resolveRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): string {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (!requestedRestaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      return requestedRestaurantId;
    }

    if (!user.rid) {
      throw new ForbiddenException('Restaurant context is required');
    }

    if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }

    return user.rid;
  }

  private assertRestaurantAccess(
    user: AuthUserContext,
    restaurantId?: string | null,
  ) {
    this.resolveRestaurantId(user, restaurantId ?? undefined);
  }

  private async assertBranchAccess(
    user: AuthUserContext,
    restaurantId: string,
    branchId: string,
  ) {
    this.assertRestaurantAccess(user, restaurantId);

    if (this.isBranchScopedUser(user) && user.bid && user.bid !== branchId) {
      throw new ForbiddenException(
        'You cannot access resources outside your branch',
      );
    }

    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        restaurantId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        restaurantId: true,
        tenantId: true,
      },
    });

    if (!branch) {
      throw new BadRequestException('Branch not found or inactive');
    }

    if (user.tid && branch.tenantId !== user.tid) {
      throw new ForbiddenException(
        'You cannot access resources outside your tenant',
      );
    }

    return branch;
  }

  private async assertUniqueEmail(
    email: string,
    restaurantId: string,
    excludeId?: string,
  ) {
    const existing = await this.employeesRepository.findByEmail(
      email.trim().toLowerCase(),
      restaurantId,
      excludeId,
    );

    if (existing) {
      throw new BadRequestException(
        'An employee with this email already exists in this restaurant',
      );
    }
  }

  private isBranchScopedUser(user: AuthUserContext) {
    return (
      user.role === UserRoleEnum.BRANCH_ADMIN ||
      user.role === UserRoleEnum.BRANCH_STAFF
    );
  }
}
