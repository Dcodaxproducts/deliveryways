import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { WinOrderCatalogMappingType } from '@prisma/client';
import { UserRoleEnum } from '../../common/enums';
import { WinOrderMappingService } from './winorder-mapping.service';

describe('WinOrderMappingService', () => {
  const scope = {
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
  };

  it('does not require manual mappings for name-based catalog matching', async () => {
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

    expect(result.data.matchingMode).toBe('ARTICLE_NAME');
    expect(result.data.missingCatalogKeys).toEqual([]);
  });

  it('persists name-only and number-only catalog overrides', async () => {
    const connectionService = {
      resolveAdminScope: jest.fn().mockResolvedValue(scope),
    };
    const connectionRepository = {
      findByBranch: jest.fn().mockResolvedValue({ id: 'connection-1' }),
    };
    const mappingRepository = {
      replaceCatalog: jest.fn(),
      list: jest.fn().mockResolvedValue({
        catalogMappings: [],
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

    await service.replaceCatalog(
      { uid: 'admin-1', role: UserRoleEnum.SUPER_ADMIN },
      'branch-1',
      {
        mappings: [
          {
            mappingType: WinOrderCatalogMappingType.ITEM,
            localKey: 'item:pizza:base',
            externalArticleName: 'Pizza Spezial',
          },
          {
            mappingType: WinOrderCatalogMappingType.MODIFIER,
            localKey: 'modifier:cheese',
            externalArticleNo: 'E1',
          },
        ],
      },
    );

    expect(mappingRepository.replaceCatalog).toHaveBeenCalledWith(
      scope,
      'connection-1',
      [
        {
          mappingType: WinOrderCatalogMappingType.ITEM,
          localKey: 'item:pizza:base',
          localName: 'Pizza',
          externalArticleNo: null,
          externalArticleName: 'Pizza Spezial',
        },
        {
          mappingType: WinOrderCatalogMappingType.MODIFIER,
          localKey: 'modifier:cheese',
          localName: 'Cheese',
          externalArticleNo: 'E1',
          externalArticleName: null,
        },
      ],
    );
  });

  it('persists canonical package and legacy deal keys with resolved local names', async () => {
    const connectionService = {
      resolveAdminScope: jest.fn().mockResolvedValue(scope),
    };
    const connectionRepository = {
      findByBranch: jest.fn().mockResolvedValue({ id: 'connection-1' }),
    };
    const mappingRepository = {
      replaceCatalog: jest.fn(),
      list: jest.fn().mockResolvedValue({
        catalogMappings: [],
        paymentMappings: [],
      }),
    };
    const menuCatalog = {
      getCatalog: jest.fn().mockResolvedValue({
        items: [
          {
            key: 'package:family',
            dealId: 'family',
            packageName: 'Family Package',
            price: 25,
          },
        ],
        modifiers: [],
      }),
    };
    const service = new WinOrderMappingService(
      connectionService as never,
      connectionRepository as never,
      mappingRepository as never,
      menuCatalog as never,
    );

    await service.replaceCatalog(
      { uid: 'admin-1', role: UserRoleEnum.SUPER_ADMIN },
      'branch-1',
      {
        mappings: [
          {
            mappingType: WinOrderCatalogMappingType.ITEM,
            localKey: 'deal:family',
            externalArticleName: 'Familienpaket',
          },
        ],
      },
    );

    expect(mappingRepository.replaceCatalog).toHaveBeenCalledWith(
      scope,
      'connection-1',
      [
        expect.objectContaining({
          mappingType: WinOrderCatalogMappingType.ITEM,
          localKey: 'deal:family',
          localName: 'Family Package',
        }),
      ],
    );
  });

  it('does not load catalog data when branch scope authorization fails', async () => {
    const connectionService = {
      resolveAdminScope: jest
        .fn()
        .mockRejectedValue(new ForbiddenException('Branch access denied')),
    };
    const connectionRepository = { findByBranch: jest.fn() };
    const mappingRepository = { replaceCatalog: jest.fn() };
    const menuCatalog = { getCatalog: jest.fn() };
    const service = new WinOrderMappingService(
      connectionService as never,
      connectionRepository as never,
      mappingRepository as never,
      menuCatalog as never,
    );

    await expect(
      service.replaceCatalog(
        { uid: 'admin-1', role: UserRoleEnum.BRANCH_ADMIN },
        'other-branch',
        { mappings: [] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(connectionRepository.findByBranch).not.toHaveBeenCalled();
    expect(menuCatalog.getCatalog).not.toHaveBeenCalled();
    expect(mappingRepository.replaceCatalog).not.toHaveBeenCalled();
  });

  it('rejects an empty catalog override', async () => {
    const connectionService = {
      resolveAdminScope: jest.fn().mockResolvedValue(scope),
    };
    const connectionRepository = {
      findByBranch: jest.fn().mockResolvedValue({ id: 'connection-1' }),
    };
    const mappingRepository = { replaceCatalog: jest.fn() };
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
        ],
        modifiers: [],
      }),
    };
    const service = new WinOrderMappingService(
      connectionService as never,
      connectionRepository as never,
      mappingRepository as never,
      menuCatalog as never,
    );

    await expect(
      service.replaceCatalog(
        { uid: 'admin-1', role: UserRoleEnum.SUPER_ADMIN },
        'branch-1',
        {
          mappings: [
            {
              mappingType: WinOrderCatalogMappingType.ITEM,
              localKey: 'item:pizza:base',
              externalArticleNo: ' ',
              externalArticleName: '',
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mappingRepository.replaceCatalog).not.toHaveBeenCalled();
  });
});
