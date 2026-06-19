import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { PrismaService } from '../../database';
import { UsersService } from '../users/users.service';
import {
  AdminCustomerDetailsQueryDto,
  AdminForceDeleteUsersDto,
  AdminListCustomersDto,
  UpdateAdminCustomerDto,
  UpdateAdminCustomerStatusDto,
} from './dto';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  async listCustomers(user: AuthUserContext, query: AdminListCustomersDto) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN && !user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const scopedQuery: AdminListCustomersDto = { ...query };

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.rid) {
        throw new ForbiddenException('Restaurant context is required');
      }

      scopedQuery.restaurantId = user.rid;
    }

    const allowWithDeleted =
      user.role === UserRoleEnum.SUPER_ADMIN && !!scopedQuery.withDeleted;
    const tenantId =
      user.role === UserRoleEnum.SUPER_ADMIN ? undefined : user.tid;
    const { items, total } = await this.usersService.listCustomers(
      tenantId,
      scopedQuery,
      allowWithDeleted,
    );

    return {
      data: items.map((item) => this.withDeletionState(item)),
      message: 'Customers fetched successfully',
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
        hasNext: query.page * query.limit < total,
        hasPrevious: query.page > 1,
      },
    };
  }

  async customerDetails(
    user: AuthUserContext,
    id: string,
    query: AdminCustomerDetailsQueryDto,
  ) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN && !user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const restaurantId =
      user.role === UserRoleEnum.BRANCH_ADMIN ? user.rid : query.restaurantId;

    if (user.role === UserRoleEnum.BRANCH_ADMIN && !restaurantId) {
      throw new ForbiddenException('Restaurant context is required');
    }

    const customer = await this.usersService.findCustomerById(id, {
      tenantId: user.role === UserRoleEnum.SUPER_ADMIN ? undefined : user.tid,
      restaurantId,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return {
      data: this.withDeletionState(customer),
      message: 'Customer fetched successfully',
    };
  }

  async updateCustomer(
    user: AuthUserContext,
    id: string,
    dto: UpdateAdminCustomerDto,
  ) {
    const customer = await this.getAccessibleCustomerOrThrow(user, id);

    if (dto.email && dto.email !== customer.email) {
      const existing = await this.usersService.findByEmail(
        dto.email,
        customer.restaurantId ?? undefined,
      );

      if (existing && existing.id !== customer.id) {
        throw new BadRequestException(
          'A customer with this email already exists in this restaurant',
        );
      }
    }

    const updated = await this.usersService.update(customer.id, {
      email: dto.email,
      profile:
        dto.firstName !== undefined ||
        dto.lastName !== undefined ||
        dto.avatarUrl !== undefined ||
        dto.phone !== undefined ||
        dto.bio !== undefined
          ? {
              firstName: dto.firstName ?? customer.profile?.firstName ?? '',
              lastName: dto.lastName ?? customer.profile?.lastName ?? '',
              avatarUrl:
                dto.avatarUrl ?? customer.profile?.avatarUrl ?? undefined,
              phone: dto.phone ?? customer.profile?.phone ?? undefined,
              bio: dto.bio ?? customer.profile?.bio ?? undefined,
            }
          : undefined,
    });

    return {
      data: updated,
      message: 'Customer updated successfully',
    };
  }

  async updateCustomerStatus(
    user: AuthUserContext,
    id: string,
    dto: UpdateAdminCustomerStatusDto,
  ) {
    const customer = await this.getAccessibleCustomerOrThrow(user, id);

    if (customer.isActive === dto.isActive) {
      return {
        data: {
          id: customer.id,
          isActive: customer.isActive,
        },
        message: customer.isActive
          ? 'Customer is already active'
          : 'Customer is already inactive',
      };
    }

    const updated = await this.usersService.setActiveStatus(
      customer.id,
      dto.isActive,
    );

    return {
      data: {
        id: updated.id,
        isActive: updated.isActive,
      },
      message: updated.isActive
        ? 'Customer activated successfully'
        : 'Customer blocked successfully',
    };
  }

  async removeUser(user: AuthUserContext, id: string) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN && !user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const targetUser = await this.usersService.findById(id);

    if (!targetUser || targetUser.deletedAt) {
      throw new NotFoundException('User not found');
    }

    if (targetUser.id === user.uid) {
      throw new BadRequestException(
        'Use the self delete endpoint to delete your own account',
      );
    }

    if (!this.canSoftDeleteUser(user, targetUser)) {
      throw new ForbiddenException(
        'You do not have permission to delete this user',
      );
    }

    const deletedUser = await this.usersService.softDeleteUser(targetUser.id);

    return {
      data: {
        id: deletedUser.id,
        role: deletedUser.role,
        isActive: deletedUser.isActive,
        deletedAt: deletedUser.deletedAt,
        deleteAfter: deletedUser.deleteAfter,
      },
      message: 'User scheduled for deletion in 30 days',
    };
  }

  async approveBusinessAdmin(_user: AuthUserContext, targetUserId: string) {
    const dbUser = await this.usersService.findById(targetUserId);

    if (!dbUser || dbUser.deletedAt) {
      throw new NotFoundException('User not found');
    }

    if (dbUser.role !== 'BUSINESS_ADMIN') {
      throw new BadRequestException(
        'Only business admin accounts can be approved',
      );
    }

    if (dbUser.isApproved && dbUser.isVerified) {
      return {
        data: {
          id: dbUser.id,
          isApproved: dbUser.isApproved,
          isVerified: dbUser.isVerified,
        },
        message: 'Business admin already approved',
      };
    }

    const updated = await this.usersService.setApprovalStatus(
      targetUserId,
      true,
    );

    return {
      data: {
        id: updated.id,
        isApproved: updated.isApproved,
        isVerified: updated.isVerified,
      },
      message: 'Business admin approved successfully',
    };
  }

  private withDeletionState<
    T extends {
      deletedAt?: Date | null;
      deleteAfter?: Date | null;
      isActive?: boolean;
    },
  >(entity: T) {
    const deletionState = entity.deletedAt
      ? {
          isDeleted: true,
          deletionScheduled:
            !!entity.deleteAfter && entity.deleteAfter.getTime() > Date.now(),
          deletedAt: entity.deletedAt,
          deleteAfter: entity.deleteAfter ?? null,
          isActive: entity.isActive ?? false,
        }
      : {
          isDeleted: false,
          deletionScheduled: false,
          deletedAt: null,
          deleteAfter: entity.deleteAfter ?? null,
          isActive: entity.isActive ?? true,
        };

    return {
      ...entity,
      deletionState,
    };
  }

  private async getAccessibleCustomerOrThrow(
    user: AuthUserContext,
    id: string,
  ) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN && !user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const restaurantId =
      user.role === UserRoleEnum.BRANCH_ADMIN ? user.rid : undefined;

    if (user.role === UserRoleEnum.BRANCH_ADMIN && !restaurantId) {
      throw new ForbiddenException('Restaurant context is required');
    }

    const customer = await this.usersService.findCustomerById(id, {
      tenantId: user.role === UserRoleEnum.SUPER_ADMIN ? undefined : user.tid,
      restaurantId,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  private canSoftDeleteUser(
    user: AuthUserContext,
    targetUser: {
      id: string;
      role: string;
      tenantId: string | null;
      restaurantId: string | null;
    },
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return ['BUSINESS_ADMIN', 'BRANCH_ADMIN', 'CUSTOMER'].includes(
        targetUser.role,
      );
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      return (
        !!user.tid &&
        targetUser.tenantId === user.tid &&
        ['BRANCH_ADMIN', 'CUSTOMER'].includes(targetUser.role)
      );
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      return (
        !!user.rid &&
        targetUser.restaurantId === user.rid &&
        targetUser.role === 'CUSTOMER'
      );
    }

    return false;
  }

  async forceDeleteUsers(
    _user: AuthUserContext,
    dto: AdminForceDeleteUsersDto,
  ) {
    const emails = [
      ...new Set(dto.emails.map((email) => email.trim().toLowerCase())),
    ];
    const result = await this.usersService.forceDeleteUsersByEmails(emails);

    return {
      data: result,
      message: 'Force delete users request processed',
    };
  }
}
