import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database';

@Injectable()
export class BranchOverrideRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertItemOverride(
    branchId: string,
    menuItemId: string,
    payload: { isAvailable: boolean; priceOverride?: Prisma.Decimal },
  ) {
    return this.prisma.branchMenuItemOverride.upsert({
      where: { branchId_menuItemId: { branchId, menuItemId } },
      update: payload,
      create: {
        branchId,
        menuItemId,
        ...payload,
      },
    });
  }

  async upsertCategoryOverride(
    branchId: string,
    menuCategoryId: string,
    isVisible: boolean,
  ) {
    return this.prisma.branchCategoryOverride.upsert({
      where: { branchId_menuCategoryId: { branchId, menuCategoryId } },
      update: { isVisible },
      create: {
        branchId,
        menuCategoryId,
        isVisible,
      },
    });
  }
}
