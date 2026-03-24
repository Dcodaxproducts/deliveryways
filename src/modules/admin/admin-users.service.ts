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

    if (
      user.role === UserRoleEnum.BRANCH_ADMIN ||
      user.role === UserRoleEnum.BUSINESS_ADMIN
    ) {
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
      data: items,
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
      user.role === UserRoleEnum.SUPER_ADMIN ? query.restaurantId : user.rid;

    if (
      (user.role === UserRoleEnum.BRANCH_ADMIN ||
        user.role === UserRoleEnum.BUSINESS_ADMIN) &&
      !restaurantId
    ) {
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
      data: customer,
      message: 'Customer fetched successfully',
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

    if (dbUser.isApproved) {
      return {
        data: {
          id: dbUser.id,
          isApproved: dbUser.isApproved,
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
      },
      message: 'Business admin approved successfully',
    };
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
