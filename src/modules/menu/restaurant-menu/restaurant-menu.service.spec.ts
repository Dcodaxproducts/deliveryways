import { UserRoleEnum } from '../../../common/enums';
import { RestaurantMenuService } from './restaurant-menu.service';

describe('RestaurantMenuService', () => {
  const makeService = () => {
    const restaurantMenuRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      findMenuItemLink: jest.fn(),
      findMenuItemLinkById: jest.fn(),
      updateMenuItemLink: jest.fn(),
      removeMenuItemLink: jest.fn(),
      listMenuItems: jest.fn(),
      findMenuCategoryLink: jest.fn(),
      getNextSortOrder: jest.fn(),
      getNextCategorySortOrder: jest.fn(),
      createMenuItemLinks: jest.fn(),
      createMenuCategoryLinks: jest.fn(),
      listMenuItemLinks: jest.fn(),
      syncMenuItemLinks: jest.fn(),
      listMenuCategoryLinks: jest.fn(),
      syncMenuCategoryLinks: jest.fn(),
      findMenuItemsByIds: jest.fn(),
      findMenuCategoriesByIds: jest.fn(),
      findRestaurantInTenant: jest.fn(),
      findSlugOwner: jest.fn(),
    };

    const storageService = {
      resolveMediaUrlsDeep: jest.fn(<T>(data: T) => Promise.resolve(data)),
    };

    const service = new RestaurantMenuService(
      restaurantMenuRepository as never,
      storageService as never,
    );

    return { service, restaurantMenuRepository, storageService };
  };

  it('creates a timed menu with category links', async () => {
    const { service, restaurantMenuRepository } = makeService();

    restaurantMenuRepository.findRestaurantInTenant.mockResolvedValue({
      id: 'restaurant-1',
    });
    restaurantMenuRepository.findSlugOwner.mockResolvedValue(null);
    restaurantMenuRepository.create.mockResolvedValue({ id: 'menu-1' });
    restaurantMenuRepository.findById.mockResolvedValue({
      id: 'menu-1',
      restaurantId: 'restaurant-1',
      categories: [],
      items: [],
    });
    restaurantMenuRepository.findMenuCategoriesByIds.mockResolvedValue([
      { id: 'category-1', restaurantId: 'restaurant-1' },
    ]);
    restaurantMenuRepository.findMenuCategoryLink.mockResolvedValue(null);
    restaurantMenuRepository.getNextCategorySortOrder.mockResolvedValue(0);
    restaurantMenuRepository.createMenuCategoryLinks.mockResolvedValue([
      { id: 'link-1' },
    ]);

    await service.create(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        restaurantId: 'restaurant-1',
        name: 'Lunch Menu',
        slug: 'lunch-menu',
        isTimed: true,
        timingConfig: {
          timezone: 'Asia/Karachi',
          windows: [{ day: 'MONDAY', start: '12:00', end: '16:00' }],
        },
        categoryIds: ['category-1'],
      },
    );

    expect(restaurantMenuRepository.create).toHaveBeenCalledWith({
      restaurant: { connect: { id: 'restaurant-1' } },
      name: 'Lunch Menu',
      slug: 'lunch-menu',
      description: undefined,
      isTimed: true,
      timingConfig: {
        timezone: 'Asia/Karachi',
        windows: [{ day: 'MONDAY', start: '12:00', end: '16:00' }],
      },
      sortOrder: 0,
      isActive: true,
    });
    expect(
      restaurantMenuRepository.createMenuCategoryLinks,
    ).toHaveBeenCalledWith(
      'menu-1',
      [{ id: 'category-1', restaurantId: 'restaurant-1' }],
      0,
    );
  });

  it('syncs menu category links during update', async () => {
    const { service, restaurantMenuRepository } = makeService();

    restaurantMenuRepository.findById.mockResolvedValue({
      id: 'menu-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    restaurantMenuRepository.findRestaurantInTenant.mockResolvedValue({
      id: 'restaurant-1',
    });
    restaurantMenuRepository.findSlugOwner.mockResolvedValue(null);
    restaurantMenuRepository.update.mockResolvedValue({ id: 'menu-1' });
    restaurantMenuRepository.findMenuCategoriesByIds.mockResolvedValue([
      { id: 'category-2', restaurantId: 'restaurant-1' },
    ]);
    restaurantMenuRepository.listMenuCategoryLinks.mockResolvedValue([
      { id: 'link-1', menuCategoryId: 'category-1' },
    ]);

    await service.update(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'menu-1',
      {
        categoryIds: ['category-2'],
      },
    );

    expect(restaurantMenuRepository.syncMenuCategoryLinks).toHaveBeenCalledWith(
      {
        restaurantMenuId: 'menu-1',
        linksToRemove: [{ id: 'link-1', menuCategoryId: 'category-1' }],
        categoriesToAdd: [{ id: 'category-2', restaurantId: 'restaurant-1' }],
        startSortOrder: 1,
      },
    );
  });

  it('lists effective menu items resolved from direct and category links', async () => {
    const { service, restaurantMenuRepository, storageService } = makeService();

    restaurantMenuRepository.findById.mockResolvedValue({
      id: 'menu-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    restaurantMenuRepository.listMenuItems.mockResolvedValue({
      items: [
        {
          id: 'item-1',
          name: 'Burger',
          imageUrl: 'burger.png',
          menuResolution: { source: 'DIRECT_AND_CATEGORY' },
        },
      ],
      total: 1,
    });

    const result = await service.listItems(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      'menu-1',
      {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        categoryId: 'category-1',
      },
    );

    expect(restaurantMenuRepository.listMenuItems).toHaveBeenCalledWith(
      'menu-1',
      expect.objectContaining({ categoryId: 'category-1' }),
    );
    expect(storageService.resolveMediaUrlsDeep).toHaveBeenCalledWith([
      expect.objectContaining({ imageUrl: 'burger.png' }),
    ]);
    expect(result.data[0].menuResolution.source).toBe('DIRECT_AND_CATEGORY');
  });

  it('returns no customer menu items when selected timed menu is inactive', async () => {
    const { service, restaurantMenuRepository } = makeService();

    restaurantMenuRepository.findById.mockResolvedValue({
      id: 'menu-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
      isActive: true,
      isTimed: true,
      timingConfig: { timezone: 'UTC', windows: [] },
    });

    const result = await service.listItems(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      'menu-1',
      {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(restaurantMenuRepository.listMenuItems).not.toHaveBeenCalled();
    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  it('locks business admin menu listing to restaurant id from token when query restaurantId is omitted', async () => {
    const { service, restaurantMenuRepository } = makeService();

    restaurantMenuRepository.list.mockResolvedValue({
      items: [],
      total: 0,
    });

    await service.list(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(restaurantMenuRepository.list).toHaveBeenCalledWith(
      'restaurant-1',
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it('hides inactive timed menus from customer listing', async () => {
    const { service, restaurantMenuRepository } = makeService();

    restaurantMenuRepository.list.mockResolvedValue({
      items: [
        {
          id: 'menu-open',
          restaurantId: 'restaurant-1',
          isActive: true,
          deletedAt: null,
          isTimed: false,
          timingConfig: null,
          items: [],
          categories: [],
        },
        {
          id: 'menu-closed',
          restaurantId: 'restaurant-1',
          isActive: true,
          deletedAt: null,
          isTimed: true,
          timingConfig: { timezone: 'UTC', windows: [] },
          items: [],
          categories: [],
        },
      ],
      total: 2,
    });

    const result = await service.list(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(result.data).toEqual([expect.objectContaining({ id: 'menu-open' })]);
  });

  it('rejects business admin menu listing without restaurant scope', async () => {
    const { service } = makeService();

    await expect(
      service.list(
        {
          uid: 'business-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        {
          page: 1,
          limit: 20,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
        },
      ),
    ).rejects.toThrow('restaurantId is required');
  });

  it('returns modifier links inside fetched menu items', async () => {
    const { service, restaurantMenuRepository } = makeService();

    restaurantMenuRepository.findById.mockResolvedValue({
      id: 'menu-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
      items: [
        {
          id: 'link-1',
          menuItem: {
            id: 'item-1',
            name: 'Burger',
            modifierLinks: [
              {
                id: 'item-modifier-link-1',
                modifierGroup: {
                  id: 'group-1',
                  name: 'Sauces',
                },
              },
            ],
          },
        },
      ],
      categories: [],
    });

    const result = (await service.getById(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      'menu-1',
    )) as {
      data: {
        items: Array<{
          menuItem: {
            modifierLinks: Array<{
              modifierGroup: {
                id: string;
                name: string;
              };
            }>;
          };
        }>;
      };
    };

    expect(
      result.data.items[0].menuItem.modifierLinks[0].modifierGroup,
    ).toEqual({
      id: 'group-1',
      name: 'Sauces',
    });
  });

  it('removes a menu item link when mobile sends menu item id', async () => {
    const { service, restaurantMenuRepository } = makeService();

    restaurantMenuRepository.findById.mockResolvedValue({
      id: 'menu-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    restaurantMenuRepository.findRestaurantInTenant.mockResolvedValue({
      id: 'restaurant-1',
    });
    restaurantMenuRepository.findMenuItemLinkById.mockResolvedValue(null);
    restaurantMenuRepository.findMenuItemLink.mockResolvedValue({
      id: 'link-1',
      restaurantMenuId: 'menu-1',
      menuItemId: 'item-1',
    });
    restaurantMenuRepository.removeMenuItemLink.mockResolvedValue({
      id: 'link-1',
    });

    const result = await service.removeItem(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'menu-1',
      'item-1',
    );

    expect(restaurantMenuRepository.findMenuItemLink).toHaveBeenCalledWith(
      'menu-1',
      'item-1',
    );
    expect(restaurantMenuRepository.removeMenuItemLink).toHaveBeenCalledWith(
      'link-1',
    );
    expect(result.message).toBe('Menu item removed from menu successfully');
  });

  it('does not expose legacy modifierGroups on fetched menu items', async () => {
    const { service, restaurantMenuRepository } = makeService();

    restaurantMenuRepository.findById.mockResolvedValue({
      id: 'menu-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
      items: [
        {
          id: 'link-1',
          menuItem: {
            id: 'item-1',
            category: {
              variations: [],
              modifierLinks: [
                {
                  sortOrder: 1,
                  modifierGroup: {
                    id: 'group-1',
                    name: 'Sauces',
                    description: 'Pick a sauce',
                    minSelect: 0,
                    maxSelect: 2,
                    isRequired: false,
                    modifierLinks: [
                      {
                        sortOrder: 1,
                        modifier: {
                          id: 'modifier-1',
                          name: 'Ketchup',
                          description: 'Tomato ketchup',
                          priceDelta: { toString: () => '25' },
                          itemPriceOverrides: [
                            {
                              menuItemId: 'item-1',
                              priceDelta: { toString: () => '35' },
                            },
                          ],
                          variationPriceOverrides: [
                            {
                              variationId: 'variation-1',
                              priceDelta: { toString: () => '45' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
            modifierLinks: [],
          },
        },
      ],
      categories: [],
    });

    const result = (await service.getById(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      'menu-1',
    )) as unknown as {
      data: {
        items: Array<{
          menuItem: Record<string, unknown>;
        }>;
      };
    };

    expect('modifierGroups' in result.data.items[0].menuItem).toBe(false);
  });

  it('exposes direct item variations and modifiers when fetching a menu', async () => {
    const { service, restaurantMenuRepository } = makeService();

    restaurantMenuRepository.findById.mockResolvedValue({
      id: 'menu-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
      items: [
        {
          id: 'link-1',
          menuItem: {
            id: 'item-1',
            category: {
              variations: [],
            },
            variationPriceOverrides: [
              {
                variation: {
                  id: 'variation-1',
                  name: 'Large',
                  price: { toString: () => '0' },
                  itemPriceOverrides: [
                    {
                      menuItemId: 'item-1',
                      price: { toString: () => '12.50' },
                      pickupPrice: { toString: () => '11.00' },
                      displayText: 'Large 12.50',
                    },
                  ],
                },
              },
            ],
            modifierPriceOverrides: [
              {
                priceDelta: { toString: () => '1.75' },
                modifier: {
                  id: 'modifier-1',
                  name: 'Extra Cheese',
                  description: 'More cheese',
                  sortOrder: 1,
                },
              },
            ],
            modifierLinks: [],
          },
        },
      ],
      categories: [],
    });

    const result = (await service.getById(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      'menu-1',
    )) as unknown as {
      data: {
        items: Array<{
          menuItem: {
            variations: Array<Record<string, unknown>>;
            modifiers: Array<Record<string, unknown>>;
          };
        }>;
      };
    };

    expect(result.data.items[0].menuItem.variations).toEqual([
      expect.objectContaining({
        id: 'variation-1',
        name: 'Large',
        price: 12.5,
        pickupPrice: 11,
        displayText: 'Large 12.50',
      }),
    ]);
    expect(result.data.items[0].menuItem.modifiers).toEqual([
      {
        id: 'modifier-1',
        name: 'Extra Cheese',
        description: 'More cheese',
        sortOrder: 1,
        priceDelta: 1.75,
        isRequired: false,
      },
    ]);
  });
});
