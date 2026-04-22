import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import {
  AdminDashboardDeliverymenStats,
  AdminDashboardEmployeesStats,
  AdminDashboardCustomersStats,
  AdminDashboardOrdersTrend,
  AdminDashboardOrdersStats,
  AdminDashboardRestaurantOverview,
  AdminDashboardOverview,
  AdminDashboardRecentActivity,
  AdminDashboardRevenueTrend,
  AdminDashboardRepository,
  AdminDashboardRestaurantTrend,
  AdminDashboardScope,
  AdminDashboardSystemAlerts,
  AdminDashboardTopPerformingRestaurants,
} from './admin-dashboard.repository';
import {
  AdminDashboardDeliverymenStatsQueryDto,
  AdminDashboardEmployeesStatsQueryDto,
  AdminDashboardCustomersStatsQueryDto,
  AdminDashboardOrdersTrendQueryDto,
  AdminDashboardOrdersStatsQueryDto,
  AdminDashboardRecentActivityQueryDto,
  AdminDashboardRestaurantOverviewQueryDto,
  AdminDashboardRevenueTrendQueryDto,
  AdminDashboardTopRestaurantsQueryDto,
  AdminDashboardRestaurantTrendQueryDto,
  AdminDashboardSystemAlertsQueryDto,
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

  async getRestaurantOverview(
    user: AuthUserContext,
    query: AdminDashboardRestaurantOverviewQueryDto,
  ): Promise<{
    data: AdminDashboardRestaurantOverview;
    message: string;
  }> {
    const scope = await this.resolveDashboardScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const data = await this.adminDashboardRepository.getRestaurantOverview(
      scope,
    );

    return {
      data,
      message: 'Restaurant dashboard overview fetched successfully',
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

  async getRevenueTrend(
    user: AuthUserContext,
    query: AdminDashboardRevenueTrendQueryDto,
  ): Promise<{
    data: AdminDashboardRevenueTrend;
    message: string;
  }> {
    const scope = await this.resolveDashboardScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const data = await this.adminDashboardRepository.getRevenueTrend(
      scope,
      query.range ?? 'daily',
    );

    return {
      data,
      message: 'Admin dashboard revenue trend fetched successfully',
    };
  }

  async getOrdersStats(
    user: AuthUserContext,
    query: AdminDashboardOrdersStatsQueryDto,
  ): Promise<{
    data: AdminDashboardOrdersStats;
    message: string;
  }> {
    const scope = await this.resolveDashboardScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const data = await this.adminDashboardRepository.getOrdersStats(scope);

    return {
      data,
      message: 'Admin dashboard order stats fetched successfully',
    };
  }

  async getCustomersStats(
    user: AuthUserContext,
    query: AdminDashboardCustomersStatsQueryDto,
  ): Promise<{
    data: AdminDashboardCustomersStats;
    message: string;
  }> {
    const scope = await this.resolveDashboardScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const data = await this.adminDashboardRepository.getCustomersStats(scope);

    return {
      data,
      message: 'Admin dashboard customer stats fetched successfully',
    };
  }

  async getDeliverymenStats(
    user: AuthUserContext,
    query: AdminDashboardDeliverymenStatsQueryDto,
  ): Promise<{
    data: AdminDashboardDeliverymenStats;
    message: string;
  }> {
    const scope = await this.resolveDashboardScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const data = await this.adminDashboardRepository.getDeliverymenStats(
      scope,
    );

    return {
      data,
      message: 'Admin dashboard deliverymen stats fetched successfully',
    };
  }

  async getEmployeesStats(
    user: AuthUserContext,
    query: AdminDashboardEmployeesStatsQueryDto,
  ): Promise<{
    data: AdminDashboardEmployeesStats;
    message: string;
  }> {
    const scope = await this.resolveDashboardScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const data = await this.adminDashboardRepository.getEmployeesStats(scope);

    return {
      data,
      message: 'Admin dashboard employee stats fetched successfully',
    };
  }

  async getSystemAlerts(
    user: AuthUserContext,
    query: AdminDashboardSystemAlertsQueryDto,
  ): Promise<{
    data: AdminDashboardSystemAlerts;
    message: string;
  }> {
    const scope = await this.resolveDashboardScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const data = await this.adminDashboardRepository.getSystemAlerts(scope);

    return {
      data,
      message: 'Admin dashboard system alerts fetched successfully',
    };
  }

  async getRecentActivity(
    user: AuthUserContext,
    query: AdminDashboardRecentActivityQueryDto,
  ): Promise<{
    data: AdminDashboardRecentActivity;
    message: string;
  }> {
    const scope = await this.resolveDashboardScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const data = await this.adminDashboardRepository.getRecentActivity(
      scope,
      query.limit,
    );

    return {
      data,
      message: 'Admin dashboard recent activity fetched successfully',
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
        const branch =
          await this.adminDashboardRepository.findBranchScope(
            requestedBranchId,
          );

        if (!branch) {
          throw new NotFoundException('Branch not found');
        }

        if (
          requestedRestaurantId &&
          requestedRestaurantId !== branch.restaurantId
        ) {
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
        const restaurant =
          await this.adminDashboardRepository.findRestaurantScope(
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

      if (
        requestedRestaurantId &&
        requestedRestaurantId !== branch.restaurantId
      ) {
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
      const restaurant =
        await this.adminDashboardRepository.findRestaurantScope(
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
