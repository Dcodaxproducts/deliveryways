import { Injectable, NotFoundException } from '@nestjs/common';
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

    const [items, modifiers] = await Promise.all([
      this.repository.listItems(scope),
      this.repository.listModifiers(scope),
    ]);

    return {
      items: items.flatMap((item) => {
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
      modifiers: modifiers.map((modifier) => ({
        key: `modifier:${modifier.id}`,
        modifierId: modifier.id,
        name: modifier.name,
        priceDelta: modifier.priceDelta.toNumber(),
      })),
    };
  }
}
