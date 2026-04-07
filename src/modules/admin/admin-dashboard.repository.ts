import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database';

interface EntityOverviewCounts {
  total: number;
  active: number;
  inactive: number;
}

export interface AdminDashboardOverview {
  tenants: EntityOverviewCounts;
  restaurants: EntityOverviewCounts;
  branches: EntityOverviewCounts;
  customers: EntityOverviewCounts;
}

@Injectable()
export class AdminDashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(): Promise<AdminDashboardOverview> {
    const [
      totalTenants,
      activeTenants,
      totalRestaurants,
      activeRestaurants,
      totalBranches,
      activeBranches,
      totalCustomers,
      activeCustomers,
    ] = await this.prisma.$transaction([
      this.prisma.tenant.count({ where: { deletedAt: null } }),
      this.prisma.tenant.count({
        where: { deletedAt: null, isActive: true },
      }),
      this.prisma.restaurant.count({ where: { deletedAt: null } }),
      this.prisma.restaurant.count({
        where: { deletedAt: null, isActive: true },
      }),
      this.prisma.branch.count({ where: { deletedAt: null } }),
      this.prisma.branch.count({
        where: { deletedAt: null, isActive: true },
      }),
      this.prisma.user.count({
        where: { deletedAt: null, role: UserRole.CUSTOMER },
      }),
      this.prisma.user.count({
        where: {
          deletedAt: null,
          role: UserRole.CUSTOMER,
          isActive: true,
        },
      }),
    ]);

    return {
      tenants: this.buildCounts(totalTenants, activeTenants),
      restaurants: this.buildCounts(totalRestaurants, activeRestaurants),
      branches: this.buildCounts(totalBranches, activeBranches),
      customers: this.buildCounts(totalCustomers, activeCustomers),
    };
  }

  private buildCounts(total: number, active: number): EntityOverviewCounts {
    return {
      total,
      active,
      inactive: total - active,
    };
  }
}
