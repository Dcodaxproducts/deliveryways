import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRoleEnum } from '../enums';
import { PrismaService } from '../../database';

@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { role?: UserRoleEnum; tid?: string; rid?: string; bid?: string };
      params?: Record<string, string>;
      query?: Record<string, string>;
      body?: Record<string, unknown>;
      route?: { path?: string };
      originalUrl?: string;
    }>();

    const user = request.user;
    const tenantContext = (request as { tenantContext?: { tenantId?: string } })
      .tenantContext;

    if (!user || user.role === UserRoleEnum.SUPER_ADMIN) {
      return true;
    }

    if (
      tenantContext?.tenantId &&
      user.tid &&
      tenantContext.tenantId !== user.tid
    ) {
      throw new ForbiddenException(
        'You cannot access data outside your tenant context',
      );
    }

    this.validatePayloadTenant(user.tid, request);
    await this.validateResourceTenant(user, request);
    this.validateRoleScope(user, request);

    return true;
  }

  private validatePayloadTenant(
    userTenantId: string | undefined,
    request: {
      body?: Record<string, unknown>;
      query?: Record<string, string>;
    },
  ): void {
    const bodyTenantId = request.body?.tenantId as string | undefined;
    const queryTenantId = request.query?.tenantId;

    if (bodyTenantId && userTenantId && bodyTenantId !== userTenantId) {
      throw new ForbiddenException(
        'The tenantId in request body does not match your account context',
      );
    }

    if (queryTenantId && userTenantId && queryTenantId !== userTenantId) {
      throw new ForbiddenException(
        'The tenantId in query does not match your account context',
      );
    }
  }

  private async validateResourceTenant(
    user: { role?: UserRoleEnum; tid?: string },
    request: {
      params?: Record<string, string>;
      route?: { path?: string };
      originalUrl?: string;
    },
  ): Promise<void> {
    if (!user.tid) {
      return;
    }

    const idParam = request.params?.id;
    if (!idParam) {
      return;
    }

    const routePath = request.route?.path ?? request.originalUrl ?? '';

    if (routePath.includes('tenants')) {
      if (idParam !== user.tid) {
        throw new ForbiddenException('You cannot access another tenant record');
      }
      return;
    }

    if (routePath.includes('restaurants')) {
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: idParam },
        select: { tenantId: true },
      });

      if (restaurant && restaurant.tenantId !== user.tid) {
        throw new ForbiddenException(
          'You cannot access a restaurant that belongs to another tenant',
        );
      }

      return;
    }

    if (routePath.includes('branches')) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: idParam },
        select: { tenantId: true },
      });

      if (branch && branch.tenantId !== user.tid) {
        throw new ForbiddenException(
          'You cannot access a branch that belongs to another tenant',
        );
      }
    }
  }

  private validateRoleScope(
    user: { role?: UserRoleEnum; rid?: string; bid?: string },
    request: {
      params?: Record<string, string>;
      query?: Record<string, string>;
      body?: Record<string, unknown>;
    },
  ): void {
    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      const requestedBranchId =
        (request.body?.branchId as string | undefined) ??
        request.query?.branchId ??
        request.params?.id;

      if (requestedBranchId && user.bid && requestedBranchId !== user.bid) {
        throw new ForbiddenException(
          'Branch admins can only access their own branch',
        );
      }
    }

    if (user.role === UserRoleEnum.CUSTOMER) {
      const requestedRestaurantId =
        (request.body?.restaurantId as string | undefined) ??
        request.query?.restaurantId;

      if (
        requestedRestaurantId &&
        user.rid &&
        requestedRestaurantId !== user.rid
      ) {
        throw new ForbiddenException(
          'Customers can only access resources for their own restaurant account',
        );
      }
    }
  }
}
