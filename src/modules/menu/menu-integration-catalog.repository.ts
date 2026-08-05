import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database';
import { MenuIntegrationScope } from './menu-integration-catalog.port';

@Injectable()
export class MenuIntegrationCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async branchExists(scope: MenuIntegrationScope): Promise<boolean> {
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: scope.branchId,
        tenantId: scope.tenantId,
        restaurantId: scope.restaurantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    return Boolean(branch);
  }

  async listItems(scope: MenuIntegrationScope) {
    return this.prisma.menuItem.findMany({
      where: {
        restaurantId: scope.restaurantId,
        isActive: true,
        deletedAt: null,
        NOT: {
          branchOverrides: {
            some: { branchId: scope.branchId, isAvailable: false },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        sku: true,
        pricingMode: true,
        basePrice: true,
        branchOverrides: {
          where: { branchId: scope.branchId },
          take: 1,
          select: { priceOverride: true },
        },
        variationPriceOverrides: {
          where: { variation: { isActive: true, deletedAt: null } },
          orderBy: [{ variation: { sortOrder: 'asc' } }],
          select: {
            price: true,
            variation: {
              select: { id: true, name: true, sku: true },
            },
          },
        },
      },
    });
  }

  async listModifiers(scope: MenuIntegrationScope) {
    return this.prisma.modifier.findMany({
      where: {
        restaurantId: scope.restaurantId,
        isActive: true,
        deletedAt: null,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, priceDelta: true },
    });
  }
}
