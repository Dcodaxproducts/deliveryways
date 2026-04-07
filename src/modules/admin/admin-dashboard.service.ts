import { Injectable } from '@nestjs/common';
import {
  AdminDashboardOverview,
  AdminDashboardRepository,
} from './admin-dashboard.repository';

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
}
