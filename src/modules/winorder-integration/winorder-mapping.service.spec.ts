import { UserRoleEnum } from '../../common/enums';
import { WinOrderMappingService } from './winorder-mapping.service';

describe('WinOrderMappingService', () => {
  it('treats a mapped base item as coverage for its variants', async () => {
    const scope = {
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    };
    const connectionService = {
      resolveAdminScope: jest.fn().mockResolvedValue(scope),
    };
    const connectionRepository = {
      findByBranch: jest.fn().mockResolvedValue({ id: 'connection-1' }),
    };
    const mappingRepository = {
      list: jest.fn().mockResolvedValue({
        catalogMappings: [
          {
            mappingType: 'ITEM',
            localKey: 'item:pizza:base',
            externalArticleNo: 'P1',
          },
        ],
        paymentMappings: [],
      }),
    };
    const menuCatalog = {
      getCatalog: jest.fn().mockResolvedValue({
        items: [
          {
            key: 'item:pizza:base',
            menuItemId: 'pizza',
            menuItemName: 'Pizza',
            variationId: null,
            variationName: null,
            sku: null,
            price: 10,
          },
          {
            key: 'item:pizza:variation:large',
            menuItemId: 'pizza',
            menuItemName: 'Pizza',
            variationId: 'large',
            variationName: 'Large',
            sku: null,
            price: 12,
          },
        ],
        modifiers: [
          {
            key: 'modifier:cheese',
            modifierId: 'cheese',
            name: 'Cheese',
            priceDelta: 1,
          },
        ],
      }),
    };
    const service = new WinOrderMappingService(
      connectionService as never,
      connectionRepository as never,
      mappingRepository as never,
      menuCatalog as never,
    );

    const result = await service.get(
      { uid: 'admin-1', role: UserRoleEnum.SUPER_ADMIN },
      'branch-1',
    );

    expect(result.data.missingCatalogKeys).toEqual(['modifier:cheese']);
  });
});
