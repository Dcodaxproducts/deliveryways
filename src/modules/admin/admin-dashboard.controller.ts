import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUserContext } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import { AdminDashboardService } from './admin-dashboard.service';
import {
  AdminDashboardOrdersTrendQueryDto,
  AdminDashboardTopRestaurantsQueryDto,
  AdminDashboardRestaurantTrendQueryDto,
} from './dto';

@ApiTags('Admin Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

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
