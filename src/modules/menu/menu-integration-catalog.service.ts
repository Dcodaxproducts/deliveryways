import { Injectable, NotFoundException } from '@nestjs/common';
import { CouponDealSelectionMode } from '@prisma/client';
import {
  MenuIntegrationCatalog,
  MenuIntegrationCatalogPort,
  MenuIntegrationItemOption,
  MenuIntegrationScope,
} from './menu-integration-catalog.port';
import { MenuIntegrationCatalogRepository } from './menu-integration-catalog.repository';

@Injectable()
export class MenuIntegrationCatalogService implements MenuIntegrationCatalogPort {
  constructor(private readonly repository: MenuIntegrationCatalogRepository) {}

  async getCatalog(
    scope: MenuIntegrationScope,
  ): Promise<MenuIntegrationCatalog> {
    if (!(await this.repository.branchExists(scope))) {
      throw new NotFoundException('Branch not found in integration scope');
    }

    const [items, modifiers, deals] = await Promise.all([
      this.repository.listItems(scope),
      this.repository.listModifiers(scope),
      this.repository.listDeals(scope),
    ]);

    return {
      items: [
        ...items.flatMap((item) => {
          const basePrice =
            item.branchOverrides[0]?.priceOverride ?? item.basePrice;
          const base: MenuIntegrationItemOption = {
            key: `item:${item.id}:base`,
            menuItemId: item.id,
            menuItemName: item.name,
            variationId: null,
            variationName: null,
            sku: item.sku,
            price: basePrice.toNumber(),
          };

          return [
            base,
            ...item.variationPriceOverrides.map((override) => ({
              key: `item:${item.id}:variation:${override.variation.id}`,
              menuItemId: item.id,
              menuItemName: item.name,
              variationId: override.variation.id,
              variationName: override.variation.name,
              sku: override.variation.sku ?? item.sku,
              price: override.price.toNumber(),
            })),
          ];
        }),
        ...deals.map((deal) =>
          deal.dealSelectionMode === CouponDealSelectionMode.FLEXIBLE_ITEMS
            ? {
                key: `deal:${deal.id}`,
                dealId: deal.id,
                dealName: deal.title,
                price: deal.discountValue.toNumber(),
              }
            : {
                key: `package:${deal.id}`,
                dealId: deal.id,
                packageName: deal.title,
                price: deal.discountValue.toNumber(),
              },
        ),
      ],
      modifiers: modifiers.map((modifier) => ({
        key: `modifier:${modifier.id}`,
        modifierId: modifier.id,
        name: modifier.name,
        priceDelta: modifier.priceDelta.toNumber(),
      })),
    };
  }
}
