import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  Roles,
  type AuthUserContext,
} from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import { AdminDashboardService } from './admin-dashboard.service';
import {
  AdminDashboardDeliverymenStatsQueryDto,
  AdminDashboardEmployeesStatsQueryDto,
  AdminDashboardCustomersStatsQueryDto,
  AdminDashboardOrdersTrendQueryDto,
  AdminDashboardOrdersStatsQueryDto,
  AdminDashboardRecentActivityQueryDto,
  AdminDashboardRestaurantOverviewQueryDto,
  AdminDashboardRevenueTrendQueryDto,
  AdminDashboardSystemAlertsQueryDto,
  AdminDashboardTopRestaurantsQueryDto,
  AdminDashboardRestaurantTrendQueryDto,
} from './dto';

@ApiTags('Admin Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get('restaurant/overview')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({
    summary:
      'Get restaurant dashboard overview cards for restaurant and branch admins',
  })
  getRestaurantOverview(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminDashboardRestaurantOverviewQueryDto,
  ) {
    return this.adminDashboardService.getRestaurantOverview(user, query);
  }

  @Get('overview')
  @Roles(RolesEnum.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Get super-admin dashboard totals for tenants, restaurants, branches, and customers',
  })
  getOverview() {
    return this.adminDashboardService.getOverview();
  }

  @Get('restaurants/trend')
  @Roles(RolesEnum.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get super-admin restaurant trend data for the dashboard graph',
  })
  getRestaurantTrend(@Query() query: AdminDashboardRestaurantTrendQueryDto) {
    return this.adminDashboardService.getRestaurantTrend(query);
  }

  @Get('orders/trend')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({
    summary: 'Get order trend data for admin dashboard graphs',
  })
  getOrdersTrend(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminDashboardOrdersTrendQueryDto,
  ) {
    return this.adminDashboardService.getOrdersTrend(user, query);
  }

  @Get('revenue/trend')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({
    summary: 'Get revenue trend data for admin dashboard graphs',
  })
  getRevenueTrend(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminDashboardRevenueTrendQueryDto,
  ) {
    return this.adminDashboardService.getRevenueTrend(user, query);
  }

  @Get('orders/stats')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({
    summary: 'Get order stats for admin dashboard summary cards',
  })
  getOrdersStats(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminDashboardOrdersStatsQueryDto,
  ) {
    return this.adminDashboardService.getOrdersStats(user, query);
  }

  @Get('customers/stats')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({
    summary: 'Get customer stats for admin dashboard summary cards',
  })
  getCustomersStats(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminDashboardCustomersStatsQueryDto,
  ) {
    return this.adminDashboardService.getCustomersStats(user, query);
  }

  @Get('business-owners/stats')
  @Roles(RolesEnum.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get business owner stats for super-admin dashboard summary cards',
  })
  getBusinessOwnersStats() {
    return this.adminDashboardService.getBusinessOwnersStats();
  }

  @Get('deliverymen/stats')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({
    summary: 'Get deliverymen stats for restaurant dashboard summary cards',
  })
  getDeliverymenStats(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminDashboardDeliverymenStatsQueryDto,
  ) {
    return this.adminDashboardService.getDeliverymenStats(user, query);
  }

  @Get('employees/stats')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({
    summary: 'Get employee stats for restaurant dashboard summary cards',
  })
  getEmployeesStats(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminDashboardEmployeesStatsQueryDto,
  ) {
    return this.adminDashboardService.getEmployeesStats(user, query);
  }

  @Get('system-alerts')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({
    summary:
      'Get dashboard system alerts derived from recent platform activity',
  })
  getSystemAlerts(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminDashboardSystemAlertsQueryDto,
  ) {
    return this.adminDashboardService.getSystemAlerts(user, query);
  }

  @Get('recent-activity')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({
    summary:
      'Get recent dashboard activity across orders, payments, restaurants, and customers',
  })
  getRecentActivity(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminDashboardRecentActivityQueryDto,
  ) {
    return this.adminDashboardService.getRecentActivity(user, query);
  }

  @Get('restaurants/top-performing')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({
    summary:
      'Get top-performing restaurants ranked by order count for the dashboard',
  })
  getTopPerformingRestaurants(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminDashboardTopRestaurantsQueryDto,
  ) {
    return this.adminDashboardService.getTopPerformingRestaurants(user, query);
  }
}
