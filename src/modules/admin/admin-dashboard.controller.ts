import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import { AdminDashboardService } from './admin-dashboard.service';
import {
  AdminDashboardTopRestaurantsQueryDto,
  AdminDashboardRestaurantTrendQueryDto,
} from './dto';

@ApiTags('Admin Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(RolesEnum.SUPER_ADMIN)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get('overview')
  @ApiOperation({
    summary:
      'Get super-admin dashboard totals for tenants, restaurants, branches, and customers',
  })
  getOverview() {
    return this.adminDashboardService.getOverview();
  }

  @Get('restaurants/trend')
  @ApiOperation({
    summary: 'Get super-admin restaurant trend data for the dashboard graph',
  })
  getRestaurantTrend(@Query() query: AdminDashboardRestaurantTrendQueryDto) {
    return this.adminDashboardService.getRestaurantTrend(query);
  }

  @Get('restaurants/top-performing')
  @ApiOperation({
    summary:
      'Get top-performing restaurants ranked by order count for the dashboard',
  })
  getTopPerformingRestaurants(
    @Query() query: AdminDashboardTopRestaurantsQueryDto,
  ) {
    return this.adminDashboardService.getTopPerformingRestaurants(query);
  }
}
