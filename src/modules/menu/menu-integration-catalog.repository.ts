import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  CouponCampaignKind,
  CouponDiscountType,
  CouponStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database';
import { MenuIntegrationScope } from './menu-integration-catalog.port';

const DEAL_DISCOVERY_BATCH_SIZE = 100;
const DEAL_DISCOVERY_MAX = 500;

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

  async listDeals(scope: MenuIntegrationScope) {
    const now = new Date();
    const where: Prisma.CouponWhereInput = {
      tenantId: scope.tenantId,
      restaurantId: scope.restaurantId,
      kind: CouponCampaignKind.PROMOTION,
      discountType: CouponDiscountType.FIXED_PRICE,
      status: CouponStatus.ACTIVE,
      isActive: true,
      deletedAt: null,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
      ],
      OR: [{ branchId: null }, { branchId: scope.branchId }],
    };
    const select = {
      id: true,
      title: true,
      discountValue: true,
      dealSelectionMode: true,
    } as const;
    const deals: Array<Prisma.CouponGetPayload<{ select: typeof select }>> = [];
    let cursor: string | undefined;

    while (deals.length < DEAL_DISCOVERY_MAX) {
      const batch = await this.prisma.coupon.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }, { id: 'asc' }],
        take: DEAL_DISCOVERY_BATCH_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select,
      });
      const page = batch.slice(0, DEAL_DISCOVERY_BATCH_SIZE);
      deals.push(...page);

      if (batch.length <= DEAL_DISCOVERY_BATCH_SIZE) {
        return deals;
      }
      if (deals.length >= DEAL_DISCOVERY_MAX) {
        throw new ServiceUnavailableException(
          'WinOrder deal discovery limit exceeded',
        );
      }
      cursor = page[page.length - 1]?.id;
      if (!cursor) {
        throw new ServiceUnavailableException(
          'WinOrder deal discovery pagination failed',
        );
      }
    }

    return deals;
  }
}
