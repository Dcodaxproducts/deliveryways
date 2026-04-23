import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database';

export interface AdminPrintingScope {
  tenantId?: string;
  restaurantId?: string;
  branchId?: string;
}

@Injectable()
export class AdminPrintingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findRestaurantScope(restaurantId: string, tenantId?: string) {
    return this.prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        settings: true,
      },
    });
  }

  findBranchScope(branchId: string, tenantId?: string, restaurantId?: string) {
    return this.prisma.branch.findFirst({
      where: {
        id: branchId,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
        ...(restaurantId ? { restaurantId } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        settings: true,
      },
    });
  }

  async getRestaurantWithSettings(restaurantId: string) {
    return this.prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        deletedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        settings: true,
      },
    });
  }

  async getBranchWithSettings(branchId: string) {
    return this.prisma.branch.findFirst({
      where: {
        id: branchId,
        deletedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        settings: true,
      },
    });
  }

  async updateRestaurantSettings(
    restaurantId: string,
    settings: Prisma.JsonObject,
  ) {
    return this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        settings: settings as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        tenantId: true,
        settings: true,
      },
    });
  }

  async updateBranchSettings(branchId: string, settings: Prisma.JsonObject) {
    return this.prisma.branch.update({
      where: { id: branchId },
      data: {
        settings: settings as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        settings: true,
      },
    });
  }
}
