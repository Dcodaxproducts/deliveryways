import { Prisma } from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UserRoleEnum } from '../../../common/enums';
import { CreateMenuItemDto, UpdateMenuItemDto } from './dto';
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
      deleteModifierPriceOverrides: jest.fn(),
      deleteVariationPriceOverrides: jest.fn(),
      deleteVariationModifierPriceOverrides: jest.fn(),
      deleteCartItems: jest.fn(),
      deleteGroupOrderItems: jest.fn(),
      deletePosDraftItems: jest.fn(),
      deleteBranchOverrides: jest.fn(),
      deleteRecipes: jest.fn(),
      clearCouponScopes: jest.fn(),
      softDelete: jest.fn(),
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
      menuItem: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
      },
      restaurant: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      tenant: {
        findFirst: jest.fn().mockResolvedValue({ settings: null }),
        update: jest.fn(),
      },
      menuCategory: {
        findFirst: jest.fn(),
      },
      modifier: {
        count: jest.fn(),
      },
      globalSetting: {
        upsert: jest.fn().mockResolvedValue({ productLabels: null }),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };

    const storageService = {
      resolveMediaUrlsDeep: jest.fn((value) => Promise.resolve(value)),
    };
    const couponsService = {
      getActiveAutoApplyPromotions: jest.fn().mockResolvedValue([]),
    };

    const service = new MenuItemService(
      itemRepository as never,
      prisma as never,
      storageService as never,
      couponsService as never,
    );

    return {
      service,
      itemRepository,
      prisma,
      storageService,
      couponsService,
      tx,
    };
  };

  it('generates a unique slug when requested slug already exists', async () => {
    const { service, itemRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.menuCategory.findFirst.mockResolvedValue({ id: 'category-1' });
    itemRepository.findByRestaurantAndSlug
      .mockResolvedValueOnce({
        id: 'item-1',
        deletedAt: null,
      })
      .mockResolvedValueOnce(null);
    itemRepository.findByRestaurantAndSku.mockResolvedValue(null);
    itemRepository.create.mockResolvedValue({ id: 'item-2' });

    await service.create(
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
    );

    expect(itemRepository.findByRestaurantAndSlug).toHaveBeenCalledWith(
      'restaurant-1',
      'zinger-burger',
      undefined,
    );
    expect(itemRepository.findByRestaurantAndSlug).toHaveBeenCalledWith(
      'restaurant-1',
      'zinger-burger-2',
      undefined,
    );
    expect(itemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'zinger-burger-2' }),
      expect.anything(),
    );
  });

  it('generates slug from item name when slug is omitted', async () => {
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
        name: 'Loaded Fries',
        basePrice: 450,
      },
    );

    expect(itemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'loaded-fries' }),
      expect.anything(),
    );
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

  it('stores predefined labels and item selection limits', async () => {
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
        name: 'Spicy Vegan Burger',
        basePrice: 650,
        labels: ['SPICY', 'VEGAN'],
        isRequired: true,
        minSelect: 1,
        maxSelect: 2,
      },
    );

    expect(itemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        dietaryFlags: ['SPICY', 'VEGAN'],
        isRequired: true,
        minSelect: 1,
        maxSelect: 2,
      }),
      expect.anything(),
    );
  });

  it('creates product labels for checkbox selection', async () => {
    const { service, prisma } = makeService();
    prisma.tenant.findFirst.mockResolvedValue({ settings: null });

    const result = await service.createLabel(
      { uid: 'admin-1', tid: 'tenant-1', role: UserRoleEnum.BUSINESS_ADMIN },
      { label: 'Halal' },
    );

    const upsertMock = prisma.tenant.update;
    const calls = upsertMock.mock.calls as Array<
      [
        {
          data: {
            settings: {
              productLabels: Array<{ value: string; label: string }>;
            };
          };
        },
      ]
    >;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.data.settings.productLabels).toContainEqual({
      value: 'HALAL',
      label: 'Halal',
    });
    expect(result).toEqual({
      data: { value: 'HALAL', label: 'Halal' },
      message: 'Menu item label created successfully',
    });
  });

  it('updates and deletes product labels when not assigned to items', async () => {
    const { service, prisma } = makeService();
    prisma.tenant.findFirst
      .mockResolvedValueOnce({
        settings: { productLabels: [{ value: 'HALAL', label: 'Halal' }] },
      })
      .mockResolvedValueOnce({
        settings: { productLabels: [{ value: 'HOT', label: 'Hot' }] },
      });

    const user = {
      uid: 'admin-1',
      tid: 'tenant-1',
      role: UserRoleEnum.BUSINESS_ADMIN,
    };

    await expect(
      service.updateLabel(user, 'HALAL', { value: 'HOT', label: 'Hot' }),
    ).resolves.toMatchObject({
      data: { value: 'HOT', label: 'Hot' },
      message: 'Menu item label updated successfully',
    });
    await expect(service.deleteLabel(user, 'HOT')).resolves.toMatchObject({
      data: { value: 'HOT' },
      message: 'Menu item label deleted successfully',
    });
  });

  it('attaches promotion metadata on /menu/items responses when item has active promotion', async () => {
    const { service, itemRepository, couponsService, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    itemRepository.list.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'item-1',
          name: 'Vegan Burger',
          basePrice: new Prisma.Decimal(800),
          dietaryFlags: ['VEGAN'],
          allergenFlags: [],
          allergenPdfUrl: null,
          restaurant: {
            id: 'restaurant-1',
            settings: {},
            tenant: { settings: {} },
          },
          category: { id: 'category-1', items: [] },
          variations: [
            {
              id: 'variation-1',
              name: 'Large',
              price: new Prisma.Decimal(900),
            },
          ],
        },
      ],
    });
    couponsService.getActiveAutoApplyPromotions.mockResolvedValue([
      {
        id: 'promo-1',
        title: 'Burger Deal',
        description: '10% off',
        applyMode: 'SCOPED_ITEMS',
        discountType: 'PERCENTAGE',
        discountValue: new Prisma.Decimal(10),
        maxDiscountAmount: new Prisma.Decimal(100),
        scopeMenuItem: { id: 'item-1' },
        scopeCategory: null,
        scopeMenuItems: [],
        scopeCategories: [],
      },
    ]);

    const result = await service.list(
      { uid: 'admin-1', tid: 'tenant-1', role: UserRoleEnum.BUSINESS_ADMIN },
      { page: 1, limit: 10, restaurantId: 'restaurant-1' } as never,
    );

    const data = result.data as Array<{
      discountedBasePrice: number | null;
      promotion: Record<string, unknown> | null;
      variations: Array<Record<string, unknown>>;
    }>;
    expect(data[0].discountedBasePrice).toBe(720);
    expect(data[0].promotion).toEqual(
      expect.objectContaining({
        promotionId: 'promo-1',
        discountAmount: 80,
        discountedAmount: 720,
      }),
    );
    expect(data[0].variations[0].discountedPrice).toBe(810);
    expect(
      (data[0].variations[0].promotion as { promotionId: string }).promotionId,
    ).toBe('promo-1');
  });

  it('returns label objects for product labels, allergens, and additives in item lists', async () => {
    const { service, itemRepository } = makeService();
    itemRepository.list.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'item-1',
          name: 'Vegan Burger',
          dietaryFlags: ['VEGAN', 'NON_ALCOHOLIC'],
          allergenFlags: ['A', '1'],
          allergenPdfUrl: null,
          restaurant: {
            id: 'restaurant-1',
            settings: {},
            tenant: {
              settings: {
                productLabels: [
                  { value: 'VEGAN', label: 'Vegan' },
                  { value: 'NON_ALCOHOLIC', label: 'Non Alcoholic' },
                ],
                customerApp: {
                  allergenAdditiveTemplates: {
                    allergens: [{ code: 'A', label: 'Gluten' }],
                    additives: [{ code: '1', label: 'Coloring' }],
                  },
                },
              },
            },
          },
          category: { items: [] },
        },
      ],
    });

    const result = await service.list(
      { uid: 'admin-1', tid: 'tenant-1', role: UserRoleEnum.BUSINESS_ADMIN },
      { page: 1, limit: 10 } as never,
    );

    const item = result.data[0] as Record<string, unknown>;
    expect(item.productLabels).toEqual([
      { value: 'VEGAN', label: 'Vegan' },
      { value: 'NON_ALCOHOLIC', label: 'Non Alcoholic' },
    ]);
    expect(item.allergens).toEqual([{ code: 'A', label: 'Gluten' }]);
    expect(item.additives).toEqual([{ code: '1', label: 'Coloring' }]);
  });

  it('stores allergen/additive codes from comma-separated item input', async () => {
    const { service, itemRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.menuCategory.findFirst.mockResolvedValue({ id: 'category-1' });
    itemRepository.findByRestaurantAndSlug.mockResolvedValue(null);
    itemRepository.findByRestaurantAndSku.mockResolvedValue(null);
    itemRepository.create.mockResolvedValue({ id: 'item-1' });
    const dto = plainToInstance(CreateMenuItemDto, {
      restaurantId: 'restaurant-1',
      categoryId: 'category-1',
      name: 'Allergen Burger',
      basePrice: 650,
      allergenCodes: 'A, 1',
    });

    await service.create(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      dto,
    );

    expect(itemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ allergenFlags: ['A', '1'] }),
      expect.anything(),
    );
  });

  it('updates restaurant allergen/additive templates', async () => {
    const { service, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.tenant.findFirst.mockResolvedValue({
      settings: { customerApp: { currency: 'EUR' } },
    });
    prisma.tenant.update.mockResolvedValue({ id: 'tenant-1' });

    const result = await service.updateAllergenAdditiveTemplates(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        restaurantId: 'restaurant-1',
        allergens: [{ code: 'A', label: 'Gluten' }],
        additives: [{ code: '1', label: 'Coloring' }],
      },
    );

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: {
        settings: {
          customerApp: {
            currency: 'EUR',
            allergenAdditiveTemplates: {
              allergens: [{ code: 'A', label: 'Gluten' }],
              additives: [{ code: '1', label: 'Coloring' }],
            },
          },
        },
      },
    });
    expect(result.data).toEqual({
      allergens: [{ code: 'A', label: 'Gluten' }],
      additives: [{ code: '1', label: 'Coloring' }],
    });
  });

  it('creates, updates, and deletes allergen template entries', async () => {
    const { service, prisma } = makeService();
    prisma.tenant.findFirst
      .mockResolvedValueOnce({ settings: { customerApp: {} } })
      .mockResolvedValueOnce({
        settings: {
          customerApp: {
            allergenAdditiveTemplates: {
              allergens: [{ code: 'A', label: 'Gluten' }],
              additives: [],
            },
          },
        },
      })
      .mockResolvedValueOnce({
        settings: {
          customerApp: {
            allergenAdditiveTemplates: {
              allergens: [{ code: 'B', label: 'Barley' }],
              additives: [],
            },
          },
        },
      });
    prisma.tenant.update.mockResolvedValue({ id: 'tenant-1' });

    await expect(
      service.createAllergenAdditiveTemplateEntry(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        'allergens',
        { code: 'A', label: 'Gluten' },
      ),
    ).resolves.toMatchObject({
      data: { code: 'A', label: 'Gluten' },
      message: 'Allergen/additive template entry created successfully',
    });
    await expect(
      service.updateAllergenAdditiveTemplateEntry(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        'allergens',
        'A',
        { code: 'B', label: 'Barley' },
      ),
    ).resolves.toMatchObject({
      data: { code: 'B', label: 'Barley' },
      message: 'Allergen/additive template entry updated successfully',
    });
    await expect(
      service.deleteAllergenAdditiveTemplateEntry(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        'allergens',
        'B',
      ),
    ).resolves.toMatchObject({
      data: { code: 'B' },
      message: 'Allergen/additive template entry deleted successfully',
    });
  });

  it('rejects required menu items without a minimum selection', async () => {
    const { service, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.menuCategory.findFirst.mockResolvedValue({ id: 'category-1' });

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
          name: 'Required Burger',
          basePrice: 650,
          isRequired: true,
          minSelect: 0,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate direct modifier assignments before hitting the database', async () => {
    const { service, itemRepository, prisma } = makeService();

    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.menuCategory.findFirst.mockResolvedValue({ id: 'category-1' });
    prisma.modifier.count.mockResolvedValue(1);
    itemRepository.findByRestaurantAndSlug.mockResolvedValue(null);
    itemRepository.findByRestaurantAndSku.mockResolvedValue(null);
    itemRepository.create.mockResolvedValue({ id: 'item-1' });

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
          name: 'Burger',
          slug: 'burger',
          basePrice: 500,
          modifiers: [
            { modifierId: 'modifier-1', priceDelta: 50 },
            { modifierId: 'modifier-1', priceDelta: 75 },
          ],
        },
      ),
    ).rejects.toThrow('Modifier assignments must contain unique modifierIds');
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

  it('stores update price adjustments when pricing mode is omitted', async () => {
    const { service, itemRepository, prisma } = makeService();
    itemRepository.findById.mockResolvedValue({
      id: 'item-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
      pricingMode: 'SINGLE',
      basePrice: new Prisma.Decimal(500),
      deliveryPriceAdjustment: new Prisma.Decimal(0),
      takeawayPriceAdjustment: new Prisma.Decimal(0),
      dietaryFlags: [],
    });
    itemRepository.findByRestaurantAndSku.mockResolvedValue(null);
    itemRepository.update.mockResolvedValue({ id: 'item-1' });
    prisma.modifier.count.mockResolvedValue(0);

    await service.update(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'item-1',
      {
        deliveryPriceAdjustment: 10,
        takeawayPriceAdjustment: 20,
      },
    );

    expect(itemRepository.update).toHaveBeenCalledWith(
      'item-1',
      expect.objectContaining({
        pricingMode: 'MULTIPLE',
        deliveryPriceAdjustment: new Prisma.Decimal(10),
        takeawayPriceAdjustment: new Prisma.Decimal(20),
      }),
      expect.anything(),
    );
  });

  it('clears item modifiers and variation overrides when update sends empty arrays', async () => {
    const { service, itemRepository, prisma, tx } = makeService();
    itemRepository.findById.mockResolvedValue({
      id: 'item-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
      pricingMode: 'SINGLE',
      basePrice: new Prisma.Decimal(500),
      deliveryPriceAdjustment: new Prisma.Decimal(0),
      takeawayPriceAdjustment: new Prisma.Decimal(0),
      dietaryFlags: [],
    });
    itemRepository.findByRestaurantAndSku.mockResolvedValue(null);
    itemRepository.update.mockResolvedValue({ id: 'item-1' });
    prisma.modifier.count.mockResolvedValue(0);

    await service.update(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'item-1',
      {
        modifiers: [],
        variationPriceOverrides: [],
      },
    );

    expect(tx.menuItemModifierPriceOverride.deleteMany).toHaveBeenCalledWith({
      where: { menuItemId: 'item-1' },
    });
    expect(tx.menuItemModifierPriceOverride.createMany).not.toHaveBeenCalled();
    expect(tx.menuItemVariationPriceOverride.deleteMany).toHaveBeenCalledWith({
      where: { menuItemId: 'item-1' },
    });
    expect(
      tx.menuVariationModifierPriceOverride.deleteMany,
    ).toHaveBeenCalledWith({ where: { menuItemId: 'item-1' } });
    expect(tx.menuItemVariationPriceOverride.createMany).not.toHaveBeenCalled();
    expect(
      tx.menuVariationModifierPriceOverride.createMany,
    ).not.toHaveBeenCalled();
  });

  it('parses stringified empty modifier and variation arrays on update DTO', () => {
    const dto = plainToInstance(UpdateMenuItemDto, {
      modifiers: '[]',
      variationPriceOverrides: '[]',
    });

    const errors = validateSync(dto);

    expect(errors).toEqual([]);
    expect(dto.modifiers).toEqual([]);
    expect(dto.variationPriceOverrides).toEqual([]);
  });

  it('hard deletes menu item after clearing active flow and config references', async () => {
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

    expect(itemRepository.deleteCartItems).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(itemRepository.deleteGroupOrderItems).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(itemRepository.deletePosDraftItems).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(itemRepository.deleteMenuLinks).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(itemRepository.deleteModifierLinks).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(itemRepository.deleteModifierPriceOverrides).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(itemRepository.deleteVariationPriceOverrides).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(
      itemRepository.deleteVariationModifierPriceOverrides,
    ).toHaveBeenCalledWith('item-1', expect.anything());
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

  it('soft deletes menu item after clearing active references when order history exists', async () => {
    const { service, itemRepository } = makeService();
    itemRepository.findById.mockResolvedValue({
      id: 'item-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    itemRepository.countOrderItems.mockResolvedValue(1);
    itemRepository.softDelete.mockResolvedValue({ id: 'item-1' });

    const result = await service.remove(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'item-1',
    );

    expect(itemRepository.deleteCartItems).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(itemRepository.deleteGroupOrderItems).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(itemRepository.deletePosDraftItems).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(itemRepository.softDelete).toHaveBeenCalledWith(
      'item-1',
      expect.anything(),
    );
    expect(itemRepository.hardDelete).not.toHaveBeenCalled();
    expect(result.message).toBe(
      'Menu item removed from active flows and archived because it is used in orders',
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

  it('passes split pizza filter to repository', async () => {
    const { service, itemRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    itemRepository.list.mockResolvedValue({ items: [], total: 0 });

    await service.list(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        restaurantId: 'restaurant-1',
        supportsSplitPizza: true,
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(itemRepository.list).toHaveBeenCalledWith(
      'restaurant-1',
      expect.objectContaining({ supportsSplitPizza: true }),
    );
  });

  it('does not expose legacy category modifier groups in item list responses', async () => {
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

    expect('categoryModifierGroups' in result.data[0]).toBe(false);
    expect('modifierLinks' in result.data[0]).toBe(false);
  });
});
