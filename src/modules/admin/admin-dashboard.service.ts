import { Injectable } from '@nestjs/common';
import {
  AdminDashboardTopPerformingRestaurants,
  AdminDashboardOverview,
  AdminDashboardRepository,
  AdminDashboardRestaurantTrend,
} from './admin-dashboard.repository';
import {
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

  async getTopPerformingRestaurants(
    query: AdminDashboardTopRestaurantsQueryDto,
  ): Promise<{
    data: AdminDashboardTopPerformingRestaurants;
    message: string;
  }> {
    const data =
      await this.adminDashboardRepository.getTopPerformingRestaurants(
        query.range ?? 'all-time',
        query.limit,
      );

    return {
      data,
      message: 'Admin dashboard top restaurants fetched successfully',
    };
  }
}
