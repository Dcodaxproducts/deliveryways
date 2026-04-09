import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import {
  AdminDashboardOrdersTrend,
  AdminDashboardOverview,
  AdminDashboardRepository,
  AdminDashboardRestaurantTrend,
  AdminDashboardScope,
  AdminDashboardTopPerformingRestaurants,
} from './admin-dashboard.repository';
import {
  AdminDashboardOrdersTrendQueryDto,
  AdminDashboardTopRestaurantsQueryDto,
  AdminDashboardRestaurantTrendQueryDto,
} from './dto';

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly adminDashboardRepository: AdminDashboardRepository,
  ) {}

  async getOverview(): Promise<{
    data: AdminDashboardOverview;
    message: string;
  }> {
    const data = await this.adminDashboardRepository.getOverview();

    return {
      data,
      message: 'Admin dashboard overview fetched successfully',
    };
  }

  async getRestaurantTrend(
    query: AdminDashboardRestaurantTrendQueryDto,
  ): Promise<{
    data: AdminDashboardRestaurantTrend;
    message: string;
  }> {
    const data = await this.adminDashboardRepository.getRestaurantTrend(
      query.range ?? 'daily',
    );

    return {
      data,
      message: 'Admin dashboard restaurant trend fetched successfully',
    };
  }

  async getOrdersTrend(
    user: AuthUserContext,
    query: AdminDashboardOrdersTrendQueryDto,
  ): Promise<{
    data: AdminDashboardOrdersTrend;
    message: string;
  }> {
    const scope = await this.resolveDashboardScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const data = await this.adminDashboardRepository.getOrdersTrend(
      scope,
      query.range ?? 'daily',
    );

    return {
      data,
      message: 'Admin dashboard orders trend fetched successfully',
    };
  }

  async getTopPerformingRestaurants(
    user: AuthUserContext,
    query: AdminDashboardTopRestaurantsQueryDto,
  ): Promise<{
    data: AdminDashboardTopPerformingRestaurants;
    message: string;
  }> {
    const scope = await this.resolveDashboardScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const data =
      await this.adminDashboardRepository.getTopPerformingRestaurants(
        scope,
        query.range ?? 'all-time',
        query.limit,
      );

    return {
      data,
      message: 'Admin dashboard top restaurants fetched successfully',
    };
  }

  private async resolveDashboardScope(
    user: AuthUserContext,
    requestedRestaurantId?: string,
    requestedBranchId?: string,
  ): Promise<AdminDashboardScope> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (requestedBranchId) {
        const branch = await this.adminDashboardRepository.findBranchScope(
          requestedBranchId,
        );

        if (!branch) {
          throw new NotFoundException('Branch not found');
        }

        if (requestedRestaurantId && requestedRestaurantId !== branch.restaurantId) {
          throw new BadRequestException(
            'branchId does not belong to the provided restaurantId',
          );
        }

        return {
          tenantId: branch.tenantId,
          restaurantId: branch.restaurantId,
          branchId: branch.id,
        };
      }

      if (requestedRestaurantId) {
        const restaurant = await this.adminDashboardRepository.findRestaurantScope(
          requestedRestaurantId,
        );

        if (!restaurant) {
          throw new NotFoundException('Restaurant not found');
        }

        return {
          tenantId: restaurant.tenantId,
          restaurantId: restaurant.id,
        };
      }

      return {};
    }

    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.rid || !user.bid) {
        throw new ForbiddenException('Branch context is required');
      }

      if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
        throw new ForbiddenException(
          'You cannot access resources outside your restaurant',
        );
      }

      if (requestedBranchId && requestedBranchId !== user.bid) {
        throw new ForbiddenException(
          'You cannot access resources outside your branch',
        );
      }

      return {
        tenantId: user.tid,
        restaurantId: user.rid,
        branchId: user.bid,
      };
    }

    if (requestedBranchId) {
      const branch = await this.adminDashboardRepository.findBranchScope(
        requestedBranchId,
        user.tid,
        user.rid,
      );

      if (!branch) {
        throw new ForbiddenException(
          'You cannot access resources outside your tenant restaurants',
        );
      }

      if (requestedRestaurantId && requestedRestaurantId !== branch.restaurantId) {
        throw new BadRequestException(
          'branchId does not belong to the provided restaurantId',
        );
      }

      return {
        tenantId: user.tid,
        restaurantId: branch.restaurantId,
        branchId: branch.id,
      };
    }

    if (user.rid) {
      if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
        throw new ForbiddenException(
          'You cannot access resources outside your restaurant',
        );
      }

      return {
        tenantId: user.tid,
        restaurantId: user.rid,
      };
    }

    if (requestedRestaurantId) {
      const restaurant = await this.adminDashboardRepository.findRestaurantScope(
        requestedRestaurantId,
        user.tid,
      );

      if (!restaurant) {
        throw new ForbiddenException(
          'You cannot access resources outside your tenant restaurants',
        );
      }

      return {
        tenantId: user.tid,
        restaurantId: restaurant.id,
      };
    }

    return {
      tenantId: user.tid,
    };
  }
}
