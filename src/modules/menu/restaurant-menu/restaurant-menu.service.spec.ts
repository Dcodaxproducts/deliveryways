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
    };

    const prisma = {
      restaurant: {
        findFirst: jest.fn(),
      },
      restaurantMenu: {
        findFirst: jest.fn(),
      },
      menuItem: {
        findMany: jest.fn(),
      },
      menuCategory: {
        findMany: jest.fn(),
      },
      restaurantMenuItem: {
        create: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      restaurantMenuCategory: {
        create: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
    };

    const service = new RestaurantMenuService(
      restaurantMenuRepository as never,
      prisma as never,
    );

    return { service, restaurantMenuRepository, prisma };
  };

  it('creates a timed menu with category links', async () => {
    const { service, restaurantMenuRepository, prisma } = makeService();

    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.restaurantMenu.findFirst.mockResolvedValue(null);
    restaurantMenuRepository.create.mockResolvedValue({ id: 'menu-1' });
    restaurantMenuRepository.findById.mockResolvedValue({
      id: 'menu-1',
      restaurantId: 'restaurant-1',
      categories: [],
      items: [],
    });
    prisma.menuCategory.findMany.mockResolvedValue([
      { id: 'category-1', restaurantId: 'restaurant-1' },
    ]);
    restaurantMenuRepository.findMenuCategoryLink.mockResolvedValue(null);
    restaurantMenuRepository.getNextCategorySortOrder.mockResolvedValue(0);
    prisma.restaurantMenuCategory.create.mockResolvedValue({ id: 'link-1' });

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
    expect(prisma.restaurantMenuCategory.create).toHaveBeenCalledWith({
      data: {
        restaurantMenuId: 'menu-1',
        menuCategoryId: 'category-1',
        sortOrder: 0,
      },
    });
  });

  it('syncs menu category links during update', async () => {
    const { service, restaurantMenuRepository, prisma } = makeService();

    restaurantMenuRepository.findById.mockResolvedValue({
      id: 'menu-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.restaurantMenu.findFirst.mockResolvedValue(null);
    restaurantMenuRepository.update.mockResolvedValue({ id: 'menu-1' });
    prisma.menuCategory.findMany.mockResolvedValue([
      { id: 'category-2', restaurantId: 'restaurant-1' },
    ]);
    prisma.restaurantMenuCategory.findMany.mockResolvedValue([
      { id: 'link-1', menuCategoryId: 'category-1' },
    ]);
    prisma.restaurantMenuCategory.delete.mockResolvedValue({ id: 'link-1' });
    prisma.restaurantMenuCategory.create.mockResolvedValue({ id: 'link-2' });

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

    expect(prisma.restaurantMenuCategory.delete).toHaveBeenCalledWith({
      where: { id: 'link-1' },
    });
    expect(prisma.restaurantMenuCategory.create).toHaveBeenCalledWith({
      data: {
        restaurantMenuId: 'menu-1',
        menuCategoryId: 'category-2',
        sortOrder: 1,
      },
    });
  });

  it('lists effective menu items resolved from direct and category links', async () => {
    const { service, restaurantMenuRepository } = makeService();

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
    expect(result.data[0].menuResolution.source).toBe('DIRECT_AND_CATEGORY');
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

  it('adds frontend-friendly modifierGroups to fetched menu items', async () => {
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
          menuItem: {
            modifierGroups: unknown[];
          };
        }>;
      };
    };

    expect(result.data.items[0].menuItem.modifierGroups).toEqual([
      {
        id: 'group-1',
        name: 'Sauces',
        description: 'Pick a sauce',
        minSelect: 0,
        maxSelect: 2,
        isRequired: false,
        sortOrder: 1,
        modifiers: [
          {
            id: 'modifier-1',
            name: 'Ketchup',
            description: 'Tomato ketchup',
            sortOrder: 1,
            priceDelta: 25,
            itemPriceOverrides: [
              {
                menuItemId: 'item-1',
                priceDelta: 35,
              },
            ],
            variationPriceOverrides: [
              {
                variationId: 'variation-1',
                priceDelta: 45,
              },
            ],
          },
        ],
      },
    ]);
  });
});
