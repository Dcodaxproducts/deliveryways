import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRoleEnum } from '../../../common/enums';
import { MenuItemService } from './item.service';

describe('MenuItemService', () => {
  const makeService = () => {
    const itemRepository = {
      create: jest.fn(),
      createMany: jest.fn(),
      findById: jest.fn(),
      findByRestaurantAndSlug: jest.fn(),
      findByRestaurantAndSku: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      countOrderItems: jest.fn(),
      deleteMenuLinks: jest.fn(),
      deleteVariations: jest.fn(),
      deleteModifierLinks: jest.fn(),
      deleteBranchOverrides: jest.fn(),
      deleteRecipes: jest.fn(),
      clearCouponScopes: jest.fn(),
      hardDelete: jest.fn(),
    };

    const prisma = {
      restaurant: {
        findFirst: jest.fn(),
      },
      menuCategory: {
        findFirst: jest.fn(),
      },
      modifier: {
        count: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            menuItemModifierPriceOverride: {
              deleteMany: jest.fn(),
              createMany: jest.fn(),
            },
          }),
        ),
      ),
    };

    const storageService = {
      resolveMediaUrlsDeep: jest.fn((value) => Promise.resolve(value)),
    };

    const service = new MenuItemService(
      itemRepository as never,
      prisma as never,
      storageService as never,
    );

    return { service, itemRepository, prisma, storageService };
  };

  it('rejects duplicate menu item slug before hitting the database', async () => {
    const { service, itemRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.menuCategory.findFirst.mockResolvedValue({ id: 'category-1' });
    itemRepository.findByRestaurantAndSlug.mockResolvedValue({
      id: 'item-1',
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
          categoryId: 'category-1',
          name: 'Zinger Burger',
          slug: ' zinger-burger ',
          basePrice: 650,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(itemRepository.findByRestaurantAndSlug).toHaveBeenCalledWith(
      'restaurant-1',
      'zinger-burger',
      undefined,
    );
    expect(itemRepository.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate menu item sku before hitting the database', async () => {
    const { service, itemRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.menuCategory.findFirst.mockResolvedValue({ id: 'category-1' });
    itemRepository.findByRestaurantAndSlug.mockResolvedValue(null);
    itemRepository.findByRestaurantAndSku.mockResolvedValue({
      id: 'item-2',
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
          categoryId: 'category-1',
          name: 'Zinger Burger',
          slug: 'zinger-burger',
          sku: ' ZING-01 ',
          basePrice: 650,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(itemRepository.findByRestaurantAndSku).toHaveBeenCalledWith(
      'restaurant-1',
      'ZING-01',
      undefined,
    );
    expect(itemRepository.create).not.toHaveBeenCalled();
  });

  it('blocks customer writes outside menu item permissions', async () => {
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
          categoryId: 'category-1',
          name: 'Zinger Burger',
          slug: 'zinger-burger',
          basePrice: 650,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hard deletes menu item after clearing config references', async () => {
    const { service, itemRepository } = makeService();
    itemRepository.findById.mockResolvedValue({
      id: 'item-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    itemRepository.countOrderItems.mockResolvedValue(0);
    itemRepository.hardDelete.mockResolvedValue({ id: 'item-1' });

    const result = await service.remove(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'item-1',
    );

    expect(itemRepository.deleteMenuLinks).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(itemRepository.deleteVariations).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(itemRepository.deleteModifierLinks).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(itemRepository.deleteBranchOverrides).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(itemRepository.deleteRecipes).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(itemRepository.clearCouponScopes).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(itemRepository.hardDelete).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(result.message).toBe('Menu item deleted successfully');
  });

  it('blocks permanent item delete when order history exists', async () => {
    const { service, itemRepository } = makeService();
    itemRepository.findById.mockResolvedValue({
      id: 'item-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    itemRepository.countOrderItems.mockResolvedValue(1);

    await expect(
      service.remove(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.SUPER_ADMIN,
        },
        'item-1',
      ),
    ).rejects.toThrow(
      'Menu item cannot be permanently deleted because it is used in orders',
    );
  });

  it('persists optional ingredients and nutritional information on create', async () => {
    const { service, itemRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.menuCategory.findFirst.mockResolvedValue({ id: 'category-1' });
    prisma.modifier.count.mockResolvedValue(0);
    itemRepository.findByRestaurantAndSlug.mockResolvedValue(null);
    itemRepository.findByRestaurantAndSku.mockResolvedValue(null);
    itemRepository.create.mockImplementation((data: unknown) => data);

    const result = await service.create(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        restaurantId: 'restaurant-1',
        categoryId: 'category-1',
        name: 'Zinger Burger',
        slug: 'zinger-burger',
        basePrice: 650,
        ingredients: 'Chicken, bun, mayo',
        nutritionalInformation: '520 kcal',
      },
    );

    expect(itemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: 'Chicken, bun, mayo',
        nutritionalInformation: '520 kcal',
      }),
      expect.anything(),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        ingredients: 'Chicken, bun, mayo',
        nutritionalInformation: '520 kcal',
      }),
    );
  });
});
