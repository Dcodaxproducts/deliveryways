import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRoleEnum } from '../../../common/enums';
import { MenuCategoryService } from './category.service';

describe('MenuCategoryService', () => {
  const makeService = () => {
    const categoryRepository = {
      create: jest.fn(),
      createMany: jest.fn(),
      findById: jest.fn(),
      findDetailById: jest.fn(),
      findByRestaurantAndSlug: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      countChildren: jest.fn(),
      countItems: jest.fn(),
      findActiveItemIdsForCategory: jest.fn(),
      deleteCartItemsForMenuItems: jest.fn(),
      deleteGroupOrderItemsForMenuItems: jest.fn(),
      deletePosDraftItemsForMenuItems: jest.fn(),
      deleteMenuItemLinks: jest.fn(),
      deleteMenuItemCategoryLinks: jest.fn(),
      deleteMenuItemModifierLinks: jest.fn(),
      deleteMenuItemModifierPriceOverrides: jest.fn(),
      deleteMenuItemVariationPriceOverrides: jest.fn(),
      deleteMenuItemVariationModifierPriceOverrides: jest.fn(),
      deleteMenuItemBranchOverrides: jest.fn(),
      deleteMenuItemRecipes: jest.fn(),
      clearMenuItemCouponScopes: jest.fn(),
      deleteMenuItemCouponScopeLinks: jest.fn(),
      softDeleteMenuItems: jest.fn(),
      clearCouponScopes: jest.fn(),
      deleteBranchOverrides: jest.fn(),
      deleteMenuLinks: jest.fn(),
      deleteModifierLinks: jest.fn(),
      deleteCouponScopeLinks: jest.fn(),
      deleteVariations: jest.fn(),
      clearDirectVariationCategory: jest.fn(),
      softDelete: jest.fn(),
      hardDelete: jest.fn(),
    };

    const prisma = {
      restaurant: {
        findFirst: jest.fn(),
      },
      menuCategory: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(callback({})),
      ),
    };

    const storageService = {
      resolveMediaUrlsDeep: jest.fn((value) => Promise.resolve(value)),
    };

    const service = new MenuCategoryService(
      categoryRepository as never,
      prisma as never,
      storageService as never,
    );

    return { service, categoryRepository, prisma };
  };

  it('rejects duplicate category slug before hitting the database', async () => {
    const { service, categoryRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    categoryRepository.findByRestaurantAndSlug.mockResolvedValue({
      id: 'category-1',
      deletedAt: null,
    });

    await expect(
      service.create(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        {
          restaurantId: 'restaurant-1',
          name: 'Burgers',
          slug: ' burgers ',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(categoryRepository.findByRestaurantAndSlug).toHaveBeenCalledWith(
      'restaurant-1',
      'burgers',
      undefined,
    );
    expect(categoryRepository.create).not.toHaveBeenCalled();
  });

  it('passes inactive category filter to repository', async () => {
    const { service, categoryRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    categoryRepository.list.mockResolvedValue({ items: [], total: 0 });

    await service.list(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        restaurantId: 'restaurant-1',
        inactive: true,
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(categoryRepository.list).toHaveBeenCalledWith(
      'restaurant-1',
      expect.objectContaining({ inactive: true }),
    );
  });

  it('requires restaurant scope for business admin category lists', async () => {
    const { service, categoryRepository } = makeService();

    await expect(
      service.list(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
        },
      ),
    ).rejects.toThrow('restaurantId is required');

    expect(categoryRepository.list).not.toHaveBeenCalled();
  });

  it('derives business admin category list restaurant scope from token when present', async () => {
    const { service, categoryRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    categoryRepository.list.mockResolvedValue({ items: [], total: 0 });

    await service.list(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(categoryRepository.list).toHaveBeenCalledWith(
      'restaurant-1',
      expect.objectContaining({ page: 1 }),
    );
  });

  it('allows updating a category with its own slug', async () => {
    const { service, categoryRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    categoryRepository.findById.mockResolvedValue({
      id: 'category-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    categoryRepository.findByRestaurantAndSlug.mockResolvedValue(null);
    categoryRepository.update.mockResolvedValue({
      id: 'category-1',
      restaurantId: 'restaurant-1',
      slug: 'burgers',
    });

    await expect(
      service.update(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        'category-1',
        {
          slug: ' burgers ',
        },
      ),
    ).resolves.toEqual({
      data: {
        id: 'category-1',
        restaurantId: 'restaurant-1',
        slug: 'burgers',
      },
      message: 'Menu category updated successfully',
    });

    expect(categoryRepository.findByRestaurantAndSlug).toHaveBeenCalledWith(
      'restaurant-1',
      'burgers',
      'category-1',
    );
  });

  it('allows reusing a slug from a soft-deleted category', async () => {
    const { service, categoryRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    categoryRepository.findByRestaurantAndSlug.mockResolvedValue(null);
    categoryRepository.create.mockResolvedValue({
      id: 'category-3',
      restaurantId: 'restaurant-1',
      name: 'Burgers',
      slug: 'burgers',
      deletedAt: null,
    });

    await expect(
      service.create(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        {
          restaurantId: 'restaurant-1',
          name: 'Burgers',
          slug: 'burgers',
        },
      ),
    ).resolves.toEqual({
      data: {
        id: 'category-3',
        restaurantId: 'restaurant-1',
        name: 'Burgers',
        slug: 'burgers',
        deletedAt: null,
      },
      message: 'Menu category created successfully',
    });
  });

  it('blocks customer writes outside category permissions', async () => {
    const { service } = makeService();

    await expect(
      service.create(
        {
          uid: 'customer-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          restaurantId: 'restaurant-1',
          name: 'Burgers',
          slug: 'burgers',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('soft deletes category after clearing simple references', async () => {
    const { service, categoryRepository } = makeService();
    categoryRepository.findById.mockResolvedValue({
      id: 'category-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    categoryRepository.countChildren.mockResolvedValue(0);
    categoryRepository.findActiveItemIdsForCategory.mockResolvedValue([]);
    categoryRepository.softDelete.mockResolvedValue({ id: 'category-1' });

    const result = await service.remove(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'category-1',
    );

    expect(categoryRepository.clearCouponScopes).toHaveBeenCalledWith(
      'category-1',
      expect.anything(),
    );
    expect(categoryRepository.deleteBranchOverrides).toHaveBeenCalledWith(
      'category-1',
      expect.anything(),
    );
    expect(categoryRepository.deleteMenuLinks).toHaveBeenCalledWith(
      'category-1',
      expect.anything(),
    );
    expect(categoryRepository.deleteModifierLinks).toHaveBeenCalledWith(
      'category-1',
      expect.anything(),
    );
    expect(categoryRepository.deleteCouponScopeLinks).toHaveBeenCalledWith(
      'category-1',
      expect.anything(),
    );
    expect(categoryRepository.deleteVariations).toHaveBeenCalledWith(
      'category-1',
      expect.anything(),
    );
    expect(
      categoryRepository.clearDirectVariationCategory,
    ).toHaveBeenCalledWith('category-1', expect.anything());
    expect(categoryRepository.softDelete).toHaveBeenCalledWith(
      'category-1',
      expect.anything(),
    );
    expect(categoryRepository.hardDelete).not.toHaveBeenCalled();
    expect(result.message).toBe('Menu category deleted successfully');
  });

  it('soft deletes category items and clears item references before deleting category', async () => {
    const { service, categoryRepository } = makeService();
    categoryRepository.findById.mockResolvedValue({
      id: 'category-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    categoryRepository.countChildren.mockResolvedValue(0);
    categoryRepository.findActiveItemIdsForCategory.mockResolvedValue([
      'item-primary',
      'item-secondary',
    ]);
    categoryRepository.softDelete.mockResolvedValue({ id: 'category-1' });

    await service.remove(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'category-1',
    );

    const expectedItemIds = ['item-primary', 'item-secondary'];
    expect(categoryRepository.deleteCartItemsForMenuItems).toHaveBeenCalledWith(
      expectedItemIds,
      expect.anything(),
    );
    expect(
      categoryRepository.deleteGroupOrderItemsForMenuItems,
    ).toHaveBeenCalledWith(expectedItemIds, expect.anything());
    expect(
      categoryRepository.deletePosDraftItemsForMenuItems,
    ).toHaveBeenCalledWith(expectedItemIds, expect.anything());
    expect(categoryRepository.deleteMenuItemLinks).toHaveBeenCalledWith(
      expectedItemIds,
      expect.anything(),
    );
    expect(categoryRepository.deleteMenuItemCategoryLinks).toHaveBeenCalledWith(
      expectedItemIds,
      expect.anything(),
    );
    expect(categoryRepository.deleteMenuItemModifierLinks).toHaveBeenCalledWith(
      expectedItemIds,
      expect.anything(),
    );
    expect(
      categoryRepository.deleteMenuItemModifierPriceOverrides,
    ).toHaveBeenCalledWith(expectedItemIds, expect.anything());
    expect(
      categoryRepository.deleteMenuItemVariationPriceOverrides,
    ).toHaveBeenCalledWith(expectedItemIds, expect.anything());
    expect(
      categoryRepository.deleteMenuItemVariationModifierPriceOverrides,
    ).toHaveBeenCalledWith(expectedItemIds, expect.anything());
    expect(
      categoryRepository.deleteMenuItemBranchOverrides,
    ).toHaveBeenCalledWith(expectedItemIds, expect.anything());
    expect(categoryRepository.deleteMenuItemRecipes).toHaveBeenCalledWith(
      expectedItemIds,
      expect.anything(),
    );
    expect(categoryRepository.clearMenuItemCouponScopes).toHaveBeenCalledWith(
      expectedItemIds,
      expect.anything(),
    );
    expect(
      categoryRepository.deleteMenuItemCouponScopeLinks,
    ).toHaveBeenCalledWith(expectedItemIds, expect.anything());
    expect(categoryRepository.softDeleteMenuItems).toHaveBeenCalledWith(
      expectedItemIds,
      expect.anything(),
    );
    expect(categoryRepository.softDelete).toHaveBeenCalledWith(
      'category-1',
      expect.anything(),
    );
    expect(categoryRepository.hardDelete).not.toHaveBeenCalled();
  });

  it('includes category-level modifier groups in list responses', async () => {
    const { service, categoryRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    categoryRepository.list.mockResolvedValue({
      items: [
        {
          id: 'category-1',
          name: 'Burgers',
          slug: 'burgers',
          modifierLinks: [
            {
              sortOrder: 1,
              modifierGroup: {
                id: 'group-1',
                name: 'Size',
                description: 'Choose size',
                minSelect: 1,
                maxSelect: 1,
                isRequired: true,
                modifierLinks: [
                  {
                    sortOrder: 1,
                    modifier: {
                      id: 'modifier-1',
                      name: 'Large',
                      priceDelta: 0,
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
      total: 1,
    });

    const result = await service.list(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        restaurantId: 'restaurant-1',
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        modifierGroups: [
          expect.objectContaining({
            id: 'group-1',
            name: 'Size',
          }),
        ],
      }),
    );
  });

  it('returns category full detail by id', async () => {
    const { service, categoryRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    categoryRepository.findDetailById.mockResolvedValue({
      id: 'category-1',
      restaurantId: 'restaurant-1',
      name: 'Salads',
      slug: 'salads',
      deletedAt: null,
      parent: null,
      children: [],
      items: [{ id: 'item-1', name: 'Greek Salad', slug: 'greek-salad' }],
      variations: [{ id: 'variation-1', name: 'Medium' }],
      menuLinks: [],
      modifierLinks: [
        {
          sortOrder: 0,
          modifierGroup: {
            id: 'group-1',
            name: 'Dressing',
            description: null,
            minSelect: 1,
            maxSelect: 1,
            isRequired: true,
            modifierLinks: [
              {
                sortOrder: 0,
                modifier: {
                  id: 'modifier-1',
                  name: 'Ranch',
                  priceDelta: 0,
                },
              },
            ],
          },
        },
      ],
      _count: { children: 0, items: 1 },
    });

    const result = await service.getById(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'category-1',
    );

    expect(categoryRepository.findDetailById).toHaveBeenCalledWith(
      'category-1',
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        id: 'category-1',
        items: [{ id: 'item-1', name: 'Greek Salad', slug: 'greek-salad' }],
        variations: [{ id: 'variation-1', name: 'Medium' }],
        modifierGroups: [expect.objectContaining({ id: 'group-1' })],
      }),
    );
    expect(result.message).toBe('Menu category fetched successfully');
  });
});
