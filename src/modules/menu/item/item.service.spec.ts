import { Prisma } from '@prisma/client';
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

    const tx = {
      menuItemModifierPriceOverride: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      menuItemVariation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      menuItemVariationPriceOverride: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      menuVariationModifierPriceOverride: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
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
        Promise.resolve(callback(tx)),
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

    return { service, itemRepository, prisma, storageService, tx };
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

  it('stores separate deposit amount when provided', async () => {
    const { service, itemRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.menuCategory.findFirst.mockResolvedValue({ id: 'category-1' });
    itemRepository.findByRestaurantAndSlug.mockResolvedValue(null);
    itemRepository.findByRestaurantAndSku.mockResolvedValue(null);
    itemRepository.create.mockResolvedValue({ id: 'item-1' });

    await service.create(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        restaurantId: 'restaurant-1',
        categoryId: 'category-1',
        name: 'Glass Bottle Cola',
        slug: 'glass-bottle-cola',
        basePrice: 250,
        depositAmount: 50,
      },
    );

    expect(itemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        depositAmount: new Prisma.Decimal(50),
      }),
      expect.anything(),
    );
  });

  it('stores multiple pricing adjustments when pricing mode is MULTIPLE', async () => {
    const { service, itemRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.menuCategory.findFirst.mockResolvedValue({ id: 'category-1' });
    itemRepository.findByRestaurantAndSlug.mockResolvedValue(null);
    itemRepository.findByRestaurantAndSku.mockResolvedValue(null);
    itemRepository.create.mockResolvedValue({ id: 'item-1' });

    await service.create(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        restaurantId: 'restaurant-1',
        categoryId: 'category-1',
        name: 'Family Burger',
        slug: 'family-burger',
        pricingMode: 'MULTIPLE',
        basePrice: 500,
        deliveryPriceAdjustment: 80,
        takeawayPriceAdjustment: 40,
      },
    );

    expect(itemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pricingMode: 'MULTIPLE',
        deliveryPriceAdjustment: new Prisma.Decimal(80),
        takeawayPriceAdjustment: new Prisma.Decimal(40),
      }),
      expect.anything(),
    );
  });

  it('stores variation modifier prices scoped to the menu item', async () => {
    const { service, itemRepository, prisma, tx } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.menuCategory.findFirst.mockResolvedValue({ id: 'category-1' });
    prisma.modifier.count.mockResolvedValue(1);
    tx.menuItemVariation.findMany.mockResolvedValue([
      {
        id: 'variation-small',
        price: new Prisma.Decimal(500),
      },
    ]);
    itemRepository.findByRestaurantAndSlug.mockResolvedValue(null);
    itemRepository.findByRestaurantAndSku.mockResolvedValue(null);
    itemRepository.create.mockResolvedValue({ id: 'item-1' });

    await service.create(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        restaurantId: 'restaurant-1',
        categoryId: 'category-1',
        name: 'Small Pizza',
        slug: 'small-pizza',
        basePrice: 500,
        variationPriceOverrides: [
          {
            variationId: 'variation-small',
            price: 600,
            modifierPriceOverrides: [
              { modifierId: 'modifier-extra-cheese', priceDelta: 50 },
            ],
          },
        ],
      },
    );

    expect(
      tx.menuVariationModifierPriceOverride.createMany,
    ).toHaveBeenCalledWith({
      data: [
        {
          menuItemId: 'item-1',
          variationId: 'variation-small',
          modifierId: 'modifier-extra-cheese',
          priceDelta: new Prisma.Decimal(50),
        },
      ],
    });
  });

  it('resets additional prices to zero when pricing mode is SINGLE', async () => {
    const { service, itemRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.menuCategory.findFirst.mockResolvedValue({ id: 'category-1' });
    itemRepository.findByRestaurantAndSlug.mockResolvedValue(null);
    itemRepository.findByRestaurantAndSku.mockResolvedValue(null);
    itemRepository.create.mockResolvedValue({ id: 'item-1' });

    await service.create(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        restaurantId: 'restaurant-1',
        categoryId: 'category-1',
        name: 'Simple Burger',
        slug: 'simple-burger',
        pricingMode: 'SINGLE',
        basePrice: 500,
        deliveryPriceAdjustment: 80,
        takeawayPriceAdjustment: 40,
      },
    );

    expect(itemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pricingMode: 'SINGLE',
        deliveryPriceAdjustment: new Prisma.Decimal(0),
        takeawayPriceAdjustment: new Prisma.Decimal(0),
      }),
      expect.anything(),
    );
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

  it('includes category-level modifier groups in item list responses', async () => {
    const { service, itemRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    itemRepository.list.mockResolvedValue({
      items: [
        {
          id: 'item-1',
          name: 'Zinger Burger',
          category: {
            id: 'category-1',
            name: 'Burgers',
            slug: 'burgers',
            imageUrl: null,
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
        categoryModifierGroups: [
          expect.objectContaining({
            id: 'group-1',
            name: 'Size',
          }),
        ],
      }),
    );
  });
});
