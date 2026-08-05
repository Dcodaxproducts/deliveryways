import { NotFoundException } from '@nestjs/common';
import { MenuItemPricingMode, Prisma } from '@prisma/client';
import { MenuIntegrationCatalogService } from './menu-integration-catalog.service';

describe('MenuIntegrationCatalogService', () => {
  const scope = {
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
  };

  const makeService = () => {
    const repository = {
      branchExists: jest.fn(),
      listItems: jest.fn(),
      listModifiers: jest.fn(),
    };
    return {
      service: new MenuIntegrationCatalogService(repository as never),
      repository,
    };
  };

  it('creates unambiguous item and variation mapping keys', async () => {
    const { service, repository } = makeService();
    repository.branchExists.mockResolvedValue(true);
    repository.listItems.mockResolvedValue([
      {
        id: 'item-1',
        name: 'Pizza',
        sku: 'PIZZA',
        pricingMode: MenuItemPricingMode.SINGLE,
        basePrice: new Prisma.Decimal(10),
        branchOverrides: [{ priceOverride: new Prisma.Decimal(12) }],
        variationPriceOverrides: [
          {
            price: new Prisma.Decimal(15),
            variation: { id: 'large', name: 'Large', sku: null },
          },
        ],
      },
    ]);
    repository.listModifiers.mockResolvedValue([
      { id: 'olives', name: 'Olives', priceDelta: new Prisma.Decimal(2) },
    ]);

    const result = await service.getCatalog(scope);

    expect(result.items).toEqual([
      expect.objectContaining({ key: 'item:item-1:base', price: 12 }),
      expect.objectContaining({
        key: 'item:item-1:variation:large',
        variationId: 'large',
        price: 15,
      }),
    ]);
    expect(result.modifiers).toEqual([
      expect.objectContaining({ key: 'modifier:olives', priceDelta: 2 }),
    ]);
  });

  it('rejects a branch outside the supplied tenant scope', async () => {
    const { service, repository } = makeService();
    repository.branchExists.mockResolvedValue(false);

    await expect(service.getCatalog(scope)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.listItems).not.toHaveBeenCalled();
  });
});
