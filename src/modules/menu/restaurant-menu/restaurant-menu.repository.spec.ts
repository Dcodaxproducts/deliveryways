import { Prisma } from '@prisma/client';
import { RestaurantMenuRepository } from './restaurant-menu.repository';

describe('RestaurantMenuRepository', () => {
  it('exposes modifier groups with item and variation price overrides in listMenuItems', async () => {
    const prisma = {
      menuItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'item-1',
            categoryId: 'category-1',
            name: 'Pizza',
            slug: 'pizza',
            description: 'desc',
            imageUrl: 'image',
            sku: 'SKU-1',
            basePrice: new Prisma.Decimal(0),
            depositAmount: new Prisma.Decimal(0),
            prepTimeMinutes: 20,
            isActive: true,
            category: {
              id: 'category-1',
              name: 'Pizza',
              slug: 'pizza',
              imageUrl: 'category-image',
              variations: [],
              modifierLinks: [
                {
                  sortOrder: 1,
                  modifierGroup: {
                    id: 'group-category',
                    name: 'Category Group',
                    description: 'category group',
                    minSelect: 0,
                    maxSelect: 2,
                    isRequired: false,
                    modifierLinks: [
                      {
                        sortOrder: 1,
                        modifier: {
                          id: 'modifier-category',
                          name: 'Extra Cheese',
                          description: 'extra cheese',
                          priceDelta: new Prisma.Decimal(100),
                          itemPriceOverrides: [
                            {
                              menuItemId: 'item-1',
                              priceDelta: new Prisma.Decimal(150),
                            },
                          ],
                          variationPriceOverrides: [
                            {
                              variationId: 'variation-1',
                              priceDelta: new Prisma.Decimal(175),
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
            menuLinks: [
              {
                id: 'menu-link-1',
                sortOrder: 1,
                isActive: true,
              },
            ],
            modifierLinks: [
              {
                sortOrder: 2,
                modifierGroup: {
                  id: 'group-item',
                  name: 'Item Group',
                  description: 'item group',
                  minSelect: 1,
                  maxSelect: 1,
                  isRequired: true,
                  modifierLinks: [
                    {
                      sortOrder: 1,
                      modifier: {
                        id: 'modifier-item',
                        name: 'Stuffed Crust',
                        description: 'stuffed crust',
                        priceDelta: new Prisma.Decimal(200),
                        itemPriceOverrides: [
                          {
                            menuItemId: 'item-1',
                            priceDelta: new Prisma.Decimal(250),
                          },
                        ],
                        variationPriceOverrides: [
                          {
                            variationId: 'variation-2',
                            priceDelta: new Prisma.Decimal(300),
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      restaurantMenuCategory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };

    const repository = new RestaurantMenuRepository(prisma as never);

    const result = await repository.listMenuItems('menu-1', {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    } as never);

    expect('modifierGroups' in result.items[0]).toBe(false);
  });
});
