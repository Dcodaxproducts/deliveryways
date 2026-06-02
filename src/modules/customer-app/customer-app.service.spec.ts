import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRoleEnum } from '../../common/enums';
import { CustomerAppService } from './customer-app.service';

describe('CustomerAppService', () => {
  const itemFixture = {
    id: 'item-1',
    name: 'Zinger Burger',
    slug: 'zinger-burger',
    description: 'Crispy chicken burger',
    ingredients: 'Chicken, bun, mayo',
    nutritionalInformation: '520 kcal',
    imageUrl: 'https://cdn.example.com/zinger.png',
    basePrice: 799,
    depositAmount: 100,
    prepTimeMinutes: 15,
    isRequired: false,
    minSelect: 0,
    maxSelect: null,
    dietaryFlags: ['NON_ALCOHOLIC', 'VEGAN'],
    allergenFlags: ['A', '1'],
    restaurant: {
      id: 'restaurant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: 'https://cdn.example.com/logo.png',
      tagline: 'Fresh food fast',
      settings: {},
      tenant: {
        settings: {
          productLabels: [
            { value: 'NON_ALCOHOLIC', label: 'Non Alcoholic' },
            { value: 'VEGAN', label: 'Vegan' },
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
    category: {
      id: 'category-1',
      name: 'Burgers',
      imageUrl: 'https://cdn.example.com/category.png',
      variations: [],
    },
    variationPriceOverrides: [
      {
        menuItemId: 'item-1',
        price: new Prisma.Decimal(899),
        pickupPrice: null,
        displayText: 'Large',
        variation: {
          id: 'variation-1',
          name: 'Large',
          description: null,
          price: new Prisma.Decimal(0),
          isDefault: false,
          itemPriceOverrides: [],
          modifierPriceOverrides: [],
        },
      },
    ],
    modifierLinks: [
      {
        sortOrder: 1,
        modifierGroup: {
          id: 'group-1',
          name: 'Toppings',
          minSelect: 0,
          maxSelect: 3,
          isRequired: false,
          modifierLinks: [
            {
              sortOrder: 1,
              modifier: {
                id: 'modifier-1',
                name: 'Extra Cheese',
                priceDelta: 100,
                itemPriceOverrides: [
                  {
                    menuItemId: 'item-1',
                    priceDelta: 150,
                  },
                ],
              },
            },
          ],
        },
      },
    ],
    modifierPriceOverrides: [
      {
        menuItemId: 'item-1',
        modifierId: 'modifier-1',
        priceDelta: 150,
        isRequired: true,
        modifier: {
          id: 'modifier-1',
          name: 'Extra Cheese',
          priceDelta: 100,
          sortOrder: 1,
          isActive: true,
        },
      },
    ],
    branchOverrides: [],
  };

  const makeService = () => {
    const findBranchesPublicContent = jest.fn<
      Promise<
        Array<{
          id: string;
          name: string;
          coverImage: string | null;
          description: string | null;
        }>
      >,
      [string[], string]
    >();

    const loyaltyWalletService = {
      getLoyaltySummary: jest.fn(),
      redeemPointsToWallet: jest.fn(),
      getWalletSummary: jest.fn(),
      listWalletHistory: jest.fn(),
    };

    const paymentsService = {
      createWalletTopUpAttempt: jest.fn(),
    };

    const storageService = {
      resolveViewUrl: jest.fn(
        (value: string | null | undefined) => value ?? null,
      ),
      resolveMediaUrlsDeep: jest.fn(<T>(value: T) => value),
    };

    const repository = {
      findCustomerProfile: jest.fn(),
      findActiveCustomer: jest.fn(),
      findCustomersForTableReservations: jest.fn(),
      findRestaurantScope: jest.fn(),
      upsertCustomerProfile: jest.fn(),
      findFavoriteMenuItems: jest.fn(),
      findRestaurantPublicContent: jest.fn(),
      findBranchPublicContent: jest.fn(),
      findBranchesPublicContent,
      listCuisineCategories: jest.fn(),
      findPublicCuisine: jest.fn(),
      listCuisineMenuItems: jest.fn(),
      listPromotionalItems: jest.fn(),
      findPublicMenuItemBySlug: jest.fn(),
    };

    const couponsService = {
      getActiveAutoApplyPromotions: jest.fn().mockResolvedValue([]),
    };

    const service = new CustomerAppService(
      repository as never,
      storageService as never,
      loyaltyWalletService as never,
      paymentsService as never,
      couponsService as never,
    );
    return {
      service,
      repository,
      loyaltyWalletService,
      paymentsService,
      couponsService,
    };
  };

  it('adds favorite item to customer metadata', async () => {
    const { service, repository } = makeService();
    repository.findCustomerProfile.mockResolvedValue({
      id: 'customer-1',
      deletedAt: null,
      profile: {
        metadata: {
          customerApp: {
            favoriteMenuItemIds: ['item-1'],
          },
        },
      },
    });

    const result = await service.addFavorite(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        tid: 'tenant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      { menuItemId: 'item-2' },
    );

    expect(repository.upsertCustomerProfile).toHaveBeenCalledWith(
      'customer-1',
      {
        customerApp: {
          favoriteMenuItemIds: ['item-1', 'item-2'],
        },
      },
    );
    expect(result.message).toBe('Item added to favorites successfully');
  });

  it('requires customerId for admin-managed favorites', async () => {
    const { service } = makeService();

    await expect(
      service.listFavorites(
        {
          uid: 'admin-1',
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
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns FAQs from branch settings before restaurant settings', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      coverImage: 'https://cdn.example.com/restaurant-cover.png',
      settings: {
        faqs: [
          {
            id: 'faq-restaurant',
            question: 'Restaurant question',
            answer: 'Restaurant answer',
            category: 'Orders',
            status: 'PUBLISHED',
            visibility: 'PUBLIC',
          },
        ],
      },
    });
    repository.findBranchPublicContent.mockResolvedValue({
      id: 'branch-1',
      settings: {
        faqs: [
          {
            id: 'faq-branch',
            question: 'Branch question',
            answer: 'Branch answer',
            category: 'Delivery',
            status: 'PUBLISHED',
            visibility: 'PUBLIC',
          },
        ],
      },
    });

    const result = await service.getFaqs({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });

    expect(result.data.items).toEqual([
      {
        id: 'faq-branch',
        question: 'Branch question',
        answer: 'Branch answer',
        category: 'Delivery',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        createdByUserId: null,
        createdAt: null,
        updatedAt: null,
      },
    ]);
    expect(result.data.categories).toEqual([
      'Orders',
      'Delivery',
      'Payments',
      'Policy',
    ]);
    expect(result.data.restaurantCoverImage).toBe(
      'https://cdn.example.com/restaurant-cover.png',
    );
  });

  it('filters public faqs by category and auth visibility', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      coverImage: null,
      settings: {
        faqs: [
          {
            id: 'faq-1',
            question: 'Order question',
            answer: 'Order answer',
            category: 'Orders',
            status: 'PUBLISHED',
            visibility: 'PUBLIC',
          },
          {
            id: 'faq-2',
            question: 'Payment question',
            answer: 'Payment answer',
            category: 'Payments',
            status: 'PUBLISHED',
            visibility: 'AUTHENTICATED',
          },
          {
            id: 'faq-3',
            question: 'Draft question',
            answer: 'Draft answer',
            category: 'Payments',
            status: 'DRAFT',
            visibility: 'PUBLIC',
          },
        ],
      },
    });
    repository.findBranchPublicContent.mockResolvedValue(null);

    const anonymousResult = await service.getFaqs({
      restaurantId: 'restaurant-1',
      category: 'Payments',
    });

    expect(anonymousResult.data.items).toEqual([]);

    const authenticatedResult = await service.getFaqs(
      {
        restaurantId: 'restaurant-1',
        category: 'Payments',
      },
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        tid: 'tenant-1',
        role: UserRoleEnum.CUSTOMER,
      },
    );

    expect(authenticatedResult.data.items).toHaveLength(1);
    expect(authenticatedResult.data.items[0].id).toBe('faq-2');
    expect(authenticatedResult.data.categories).toEqual([
      'Orders',
      'Delivery',
      'Payments',
      'Policy',
    ]);
  });

  it('populates restaurant on promotional items', async () => {
    const { service, repository, couponsService } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: 'https://cdn.example.com/logo.png',
      coverImage: 'https://cdn.example.com/restaurant-cover.png',
      tagline: 'Fresh food fast',
      bio: null,
      supportContact: null,
      settings: {},
    });
    repository.listPromotionalItems.mockResolvedValue([itemFixture]);
    couponsService.getActiveAutoApplyPromotions.mockResolvedValue([
      {
        id: 'promo-1',
        title: 'Burger Deal',
        description: 'Auto discount',
        imageUrl: 'promo-thumb.jpg',
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

    const result = await service.listPromotionalItems({
      restaurantId: 'restaurant-1',
      limit: 10,
    });

    expect(result.data[0].restaurant).toEqual({
      id: 'restaurant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: 'https://cdn.example.com/logo.png',
      tagline: 'Fresh food fast',
    });
    expect(result.data[0].depositAmount).toBe(100);
    expect(result.data[0].discountedBasePrice).toBe(719.1);
    expect(result.data[0].promotion).toEqual(
      expect.objectContaining({
        promotionId: 'promo-1',
        discountAmount: 79.9,
        discountedAmount: 719.1,
      }),
    );
    expect(result.data[0].dietaryFlags).toEqual(['NON_ALCOHOLIC', 'VEGAN']);
    expect(result.data[0].productLabels).toEqual([
      { value: 'NON_ALCOHOLIC', label: 'Non Alcoholic' },
      { value: 'VEGAN', label: 'Vegan' },
    ]);
    expect(result.data[0].allergenFlags).toEqual(['A', '1']);
    expect(result.data[0].allergens).toEqual([{ code: 'A', label: 'Gluten' }]);
    expect(result.data[0].additives).toEqual([
      { code: '1', label: 'Coloring' },
    ]);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        isRequired: false,
        minSelect: 0,
        maxSelect: 1,
      }),
    );
    expect(result.data[0].modifiers).toEqual([
      expect.objectContaining({
        id: 'modifier-1',
        name: 'Extra Cheese',
        priceDelta: 150,
        isRequired: true,
      }),
    ]);
    expect('modifierLinks' in result.data[0]).toBe(false);
    expect(result.data[0].modifierPriceOverrides).toBe(
      itemFixture.modifierPriceOverrides,
    );
    expect(result.data[0].variations).toEqual([
      expect.objectContaining({
        id: 'variation-1',
        name: 'Large',
        price: new Prisma.Decimal(899),
        pickupPrice: null,
        displayText: 'Large',
      }),
    ]);
    expect('modifierGroups' in result.data[0]).toBe(false);
  });

  it('lists active promotion campaigns for customer app', async () => {
    const { service, repository, couponsService } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: 'restaurant-logo.png',
      coverImage: 'restaurant-cover.png',
      tagline: 'Fresh food fast',
      bio: null,
      supportContact: null,
      settings: {},
    });
    couponsService.getActiveAutoApplyPromotions.mockResolvedValue([
      {
        id: 'promo-1',
        title: 'Burger Deal',
        description: 'Auto discount',
        imageUrl: 'promo-thumb.jpg',
        applyMode: 'SCOPED_ITEMS',
        discountType: 'PERCENTAGE',
        discountValue: new Prisma.Decimal(10),
        maxDiscountAmount: new Prisma.Decimal(100),
        minOrderAmount: new Prisma.Decimal(500),
        startsAt: new Date('2026-05-20T00:00:00.000Z'),
        expiresAt: new Date('2026-05-25T00:00:00.000Z'),
        restaurant: {
          id: 'restaurant-1',
          name: 'DeliveryWays Kitchen',
          slug: 'deliveryways-kitchen',
          logoUrl: 'restaurant-logo.png',
          coverImage: 'restaurant-cover.png',
        },
        branch: null,
        scopeMenuItem: {
          id: 'item-1',
          name: 'Zinger Burger',
          imageUrl: 'zinger.png',
        },
        scopeCategory: null,
        scopeMenuItems: [],
        scopeCategories: [
          {
            menuCategory: {
              id: 'category-1',
              name: 'Burgers',
              imageUrl: 'burgers.png',
            },
          },
        ],
      },
      {
        id: 'deal-1',
        title: 'Burger Combo',
        description: 'Fixed bundle',
        imageUrl: 'deal-thumb.jpg',
        applyMode: 'SCOPED_ITEMS',
        discountType: 'FIXED_PRICE',
        discountValue: new Prisma.Decimal(999),
        maxDiscountAmount: null,
        minOrderAmount: null,
        startsAt: new Date('2026-05-20T00:00:00.000Z'),
        expiresAt: new Date('2026-05-25T00:00:00.000Z'),
        restaurant: null,
        branch: null,
        scopeMenuItem: null,
        scopeCategory: null,
        scopeMenuItems: [],
        scopeCategories: [],
      },
    ]);

    const result = await service.listPromotions({
      restaurantId: 'restaurant-1',
      limit: 10,
    });

    expect(couponsService.getActiveAutoApplyPromotions).toHaveBeenCalledWith(
      'restaurant-1',
      undefined,
    );
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'promo-1',
        title: 'Burger Deal',
        imageUrl: 'promo-thumb.jpg',
        thumbnailUrl: 'promo-thumb.jpg',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        maxDiscountAmount: 100,
        minOrderAmount: 500,
        scopeMenuItems: [
          { id: 'item-1', name: 'Zinger Burger', imageUrl: 'zinger.png' },
        ],
        scopeCategories: [
          { id: 'category-1', name: 'Burgers', imageUrl: 'burgers.png' },
        ],
      }),
    ]);
    expect(result.data).toHaveLength(1);
  });

  it('lists only fixed price promotions as public deals', async () => {
    const { service, repository, couponsService } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: 'restaurant-logo.png',
      coverImage: 'restaurant-cover.png',
      tagline: 'Fresh food fast',
      bio: null,
      supportContact: null,
      settings: {},
    });
    const basePromotion = {
      description: 'Auto discount',
      imageUrl: null,
      applyMode: 'SCOPED_ITEMS',
      maxDiscountAmount: null,
      minOrderAmount: null,
      startsAt: new Date('2026-05-20T00:00:00.000Z'),
      expiresAt: new Date('2026-05-25T00:00:00.000Z'),
      restaurant: null,
      branch: null,
      scopeMenuItem: null,
      scopeCategory: null,
      scopeCategories: [],
    };
    couponsService.getActiveAutoApplyPromotions.mockResolvedValue([
      {
        ...basePromotion,
        id: 'promo-1',
        title: 'Ten Percent Off',
        discountType: 'PERCENTAGE',
        discountValue: new Prisma.Decimal(10),
        scopeMenuItems: [],
      },
      {
        ...basePromotion,
        id: 'deal-1',
        title: 'Burger Combo',
        imageUrl: 'deal-thumb.jpg',
        discountType: 'FIXED_PRICE',
        discountValue: new Prisma.Decimal(999),
        scopeMenuItems: [
          {
            menuItem: {
              id: 'item-1',
              name: 'Zinger Burger',
              imageUrl: 'zinger.png',
              basePrice: new Prisma.Decimal(799),
            },
          },
          {
            menuItem: {
              id: 'item-2',
              name: 'Cold Drink',
              imageUrl: 'drink.png',
              basePrice: new Prisma.Decimal(199),
            },
          },
        ],
      },
    ]);
    repository.listPromotionalItems.mockResolvedValue([
      itemFixture,
      { ...itemFixture, id: 'item-2', name: 'Cold Drink', slug: 'cold-drink' },
    ]);

    const result = await service.listDeals({
      restaurantId: 'restaurant-1',
      limit: 10,
    });

    expect(repository.listPromotionalItems).toHaveBeenCalledWith(
      {
        restaurantId: 'restaurant-1',
        branchId: undefined,
        limit: 2,
      },
      { menuItemIds: ['item-1', 'item-2'] },
    );
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'deal-1',
        title: 'Burger Combo',
        imageUrl: 'deal-thumb.jpg',
        thumbnailUrl: 'deal-thumb.jpg',
        discountType: 'FIXED_PRICE',
        discountValue: 999,
        scopeMenuItems: [
          expect.objectContaining({
            id: 'item-1',
            name: 'Zinger Burger',
            basePrice: 799,
          }),
          expect.objectContaining({
            id: 'item-2',
            name: 'Cold Drink',
          }),
        ],
      }),
    ]);
    const [firstDealItem, secondDealItem] = result.data[0]
      .scopeMenuItems as unknown as Array<Record<string, unknown>>;

    expect('isRequired' in firstDealItem).toBe(false);
    expect('minSelect' in firstDealItem).toBe(false);
    expect('maxSelect' in firstDealItem).toBe(false);
    expect('modifiers' in firstDealItem).toBe(false);
    expect('modifierLinks' in firstDealItem).toBe(false);
    expect('isRequired' in secondDealItem).toBe(false);
    expect('minSelect' in secondDealItem).toBe(false);
    expect('maxSelect' in secondDealItem).toBe(false);
    expect('modifiers' in secondDealItem).toBe(false);
    expect('modifierLinks' in secondDealItem).toBe(false);
    expect(result.message).toBe('Deals fetched successfully');
  });

  it('includes promotion metadata on cuisine categories and promotional cuisine list', async () => {
    const { service, repository, couponsService } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: null,
      coverImage: null,
      tagline: null,
      bio: null,
      supportContact: null,
      settings: {},
    });
    repository.listCuisineCategories.mockResolvedValue({
      items: [
        {
          id: 'category-1',
          name: 'Burgers',
          slug: 'burgers',
          description: null,
          imageUrl: 'category.png',
          sortOrder: 0,
          _count: { items: 3 },
        },
      ],
      total: 1,
    });
    couponsService.getActiveAutoApplyPromotions.mockResolvedValue([
      {
        id: 'promo-1',
        title: 'Burger week',
        description: 'Category deal',
        applyMode: 'SCOPED_ITEMS',
        discountType: 'PERCENTAGE',
        discountValue: new Prisma.Decimal(15),
        maxDiscountAmount: new Prisma.Decimal(200),
        scopeMenuItem: null,
        scopeCategory: { id: 'category-1' },
        scopeMenuItems: [],
        scopeCategories: [],
      },
    ]);

    const result = await service.listCuisines({
      restaurantId: 'restaurant-1',
      page: 1,
      limit: 10,
      sortBy: 'sortOrder',
      sortOrder: 'ASC',
    });

    expect(result.data[0].promotion).toEqual({
      promotionId: 'promo-1',
      title: 'Burger week',
      description: 'Category deal',
      applyMode: 'SCOPED_ITEMS',
      discountType: 'PERCENTAGE',
      discountValue: 15,
      maxDiscountAmount: 200,
    });

    await service.listPromotionalCuisines({
      restaurantId: 'restaurant-1',
      page: 1,
      limit: 10,
      sortBy: 'sortOrder',
      sortOrder: 'ASC',
    });

    expect(repository.listCuisineCategories).toHaveBeenLastCalledWith(
      expect.objectContaining({ restaurantId: 'restaurant-1' }),
      { categoryIds: ['category-1'] },
    );
  });

  it('uses the same menu item shape for cuisine items', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: 'https://cdn.example.com/logo.png',
      coverImage: null,
      tagline: 'Fresh food fast',
      bio: null,
      supportContact: null,
      settings: {},
    });
    repository.findPublicCuisine.mockResolvedValue({
      id: 'category-1',
      name: 'Burgers',
      slug: 'burgers',
      description: null,
      imageUrl: 'https://cdn.example.com/category.png',
    });
    repository.listCuisineMenuItems.mockResolvedValue({
      items: [itemFixture],
      total: 1,
    });

    const result = await service.listCuisineItems('category-1', {
      restaurantId: 'restaurant-1',
      page: 1,
      limit: 10,
      sortBy: 'sortOrder',
      sortOrder: 'ASC',
    });

    expect(result.data.items[0]).toEqual(
      expect.objectContaining({
        id: 'item-1',
        variations: [
          expect.objectContaining({
            id: 'variation-1',
            price: new Prisma.Decimal(899),
          }),
        ],
        modifiers: [
          expect.objectContaining({
            id: 'modifier-1',
            priceDelta: 150,
            isRequired: true,
          }),
        ],
        dietaryFlags: ['NON_ALCOHOLIC', 'VEGAN'],
        productLabels: [
          { value: 'NON_ALCOHOLIC', label: 'Non Alcoholic' },
          { value: 'VEGAN', label: 'Vegan' },
        ],
        allergenFlags: ['A', '1'],
        allergens: [{ code: 'A', label: 'Gluten' }],
        additives: [{ code: '1', label: 'Coloring' }],
        modifierPriceOverrides: itemFixture.modifierPriceOverrides,
      }),
    );
    expect('modifierLinks' in result.data.items[0]).toBe(false);
    expect('modifierGroups' in result.data.items[0]).toBe(false);
  });

  it('hides cuisine items when their timed menu is not currently active', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: 'https://cdn.example.com/logo.png',
      coverImage: null,
      tagline: 'Fresh food fast',
      bio: null,
      supportContact: null,
      settings: {},
    });
    repository.findPublicCuisine.mockResolvedValue({
      id: 'category-1',
      name: 'Burgers',
      slug: 'burgers',
      description: null,
      imageUrl: 'https://cdn.example.com/category.png',
    });
    repository.listCuisineMenuItems.mockResolvedValue({
      items: [
        itemFixture,
        {
          ...itemFixture,
          id: 'item-closed',
          slug: 'closed-item',
          menuLinks: [
            {
              isActive: true,
              restaurantMenu: {
                isActive: true,
                deletedAt: null,
                isTimed: true,
                timingConfig: { timezone: 'UTC', windows: [] },
              },
            },
          ],
        },
      ],
      total: 2,
    });

    const result = await service.listCuisineItems('category-1', {
      restaurantId: 'restaurant-1',
      page: 1,
      limit: 10,
      sortBy: 'sortOrder',
      sortOrder: 'ASC',
    });

    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0].id).toBe('item-1');
  });

  it('includes menu items on cuisine list with the public item response shape', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: 'https://cdn.example.com/logo.png',
      coverImage: null,
      tagline: 'Fresh food fast',
      bio: null,
      supportContact: null,
      settings: {},
    });
    repository.listCuisineCategories.mockResolvedValue({
      items: [
        {
          id: 'category-1',
          name: 'Burgers',
          slug: 'burgers',
          description: null,
          imageUrl: 'https://cdn.example.com/category.png',
          sortOrder: 1,
          _count: { items: 1 },
          items: [itemFixture],
        },
      ],
      total: 1,
    });

    const result = await service.listCuisines({
      restaurantId: 'restaurant-1',
      page: 1,
      limit: 10,
      sortBy: 'sortOrder',
      sortOrder: 'ASC',
    });

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'category-1',
        itemCount: 1,
      }),
    );
    expect(result.data[0].items[0]).toEqual(
      expect.objectContaining({
        id: 'item-1',
        name: 'Zinger Burger',
        slug: 'zinger-burger',
        dietaryFlags: ['NON_ALCOHOLIC', 'VEGAN'],
        productLabels: [
          { value: 'NON_ALCOHOLIC', label: 'Non Alcoholic' },
          { value: 'VEGAN', label: 'Vegan' },
        ],
        modifierPriceOverrides: itemFixture.modifierPriceOverrides,
        modifiers: [
          expect.objectContaining({
            id: 'modifier-1',
            isRequired: true,
          }),
        ],
      }),
    );
    expect('modifierLinks' in result.data[0].items[0]).toBe(false);
    expect('modifierGroups' in result.data[0].items[0]).toBe(false);
  });

  it('fetches public item by slug without legacy modifier groups', async () => {
    const { service, repository } = makeService();
    repository.findPublicMenuItemBySlug.mockResolvedValue(itemFixture);

    const result = await service.getItemBySlug('zinger-burger', {
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });

    expect(repository.findPublicMenuItemBySlug).toHaveBeenCalledWith(
      'zinger-burger',
      {
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
    );
    expect(result.data.slug).toBe('zinger-burger');
    expect(result.data.ingredients).toBe('Chicken, bun, mayo');
    expect(result.data.nutritionalInformation).toBe('520 kcal');
    expect(result.data.prepTimeMinutes).toBe(15);
    expect(result.data.depositAmount).toBe(100);
    expect('modifierGroups' in result.data).toBe(false);
  });

  it('includes restaurant cover image on home-screen/public content responses', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: 'https://cdn.example.com/logo.png',
      coverImage: 'https://cdn.example.com/restaurant-cover.png',
      tagline: 'Fresh food fast',
      bio: 'Test bio',
      supportContact: null,
      branding: {
        primaryColor: '#FF0000',
        secondaryColor: '#000000',
        fontFamily: 'Inter',
      },
      settings: {},
    });
    repository.listCuisineCategories.mockResolvedValue({ items: [], total: 0 });
    repository.listPromotionalItems.mockResolvedValue([]);
    repository.findBranchPublicContent.mockResolvedValue({
      id: 'branch-1',
      name: 'Main Branch',
      coverImage: 'branch-cover.jpg',
      description: 'Downtown branch',
      settings: {
        tableReservationsEnabled: true,
      },
    });

    const result = await service.getHomeScreen({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      promotionLimit: 8,
      cuisineLimit: 12,
    });

    expect(result.data.restaurant.coverImage).toBe(
      'https://cdn.example.com/restaurant-cover.png',
    );
    expect(result.data.config).toEqual({
      currency: null,
      branding: {
        primaryColor: '#FF0000',
        secondaryColor: '#000000',
        fontFamily: 'Inter',
      },
    });
    expect(result.data.branch).toEqual({
      id: 'branch-1',
      name: 'Main Branch',
      logoUrl: null,
      coverImage: 'branch-cover.jpg',
      description: 'Downtown branch',
      tableReservationsEnabled: true,
    });
  });

  it('returns temporary closure popup on home screen', async () => {
    const { service, repository } = makeService();
    const closedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: null,
      coverImage: null,
      tagline: null,
      bio: null,
      supportContact: null,
      settings: {},
    });
    repository.listCuisineCategories.mockResolvedValue({ items: [], total: 0 });
    repository.listPromotionalItems.mockResolvedValue([]);
    repository.findBranchPublicContent.mockResolvedValue({
      id: 'branch-1',
      name: 'Main Branch',
      logoUrl: null,
      coverImage: null,
      description: null,
      settings: {
        temporaryClosure: {
          isClosed: true,
          closedAt: '2026-05-20T09:00:00.000Z',
          closedUntil,
          reason: 'Maintenance',
          message: 'We are closed for maintenance',
        },
      },
    });

    const result = await service.getHomeScreen({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      promotionLimit: 8,
      cuisineLimit: 12,
    });

    expect(result.data.landingPopup).toEqual({
      show: true,
      type: 'TEMPORARY_CLOSURE',
      title: 'Branch temporarily closed',
      message: 'We are closed for maintenance',
      period: {
        fromDate: '2026-05-20T09:00:00.000Z',
        toDate: closedUntil,
      },
      temporaryClosure: {
        isClosed: true,
        closedAt: '2026-05-20T09:00:00.000Z',
        closedUntil,
        reason: 'Maintenance',
        message: 'We are closed for maintenance',
      },
    });
  });

  it('returns holiday range popup on home screen', async () => {
    const { service, repository } = makeService();
    const today = new Date().toISOString().slice(0, 10);
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: null,
      coverImage: null,
      tagline: null,
      bio: null,
      supportContact: null,
      settings: {},
    });
    repository.listCuisineCategories.mockResolvedValue({ items: [], total: 0 });
    repository.listPromotionalItems.mockResolvedValue([]);
    repository.findBranchPublicContent.mockResolvedValue({
      id: 'branch-1',
      name: 'Main Branch',
      logoUrl: null,
      coverImage: null,
      description: null,
      settings: {
        holidayOpeningHours: [
          {
            fromDate: today,
            toDate: today,
            isClosed: true,
            note: 'Eid holiday',
          },
        ],
      },
    });

    const result = await service.getHomeScreen({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      promotionLimit: 8,
      cuisineLimit: 12,
    });

    expect(result.data.landingPopup).toMatchObject({
      show: true,
      type: 'HOLIDAY_CLOSURE',
      title: 'Holiday / vacation closure',
      message: 'Eid holiday',
      period: { fromDate: today, toDate: today },
    });
  });

  it('returns currency config on home screen when restaurant settings include it', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: null,
      coverImage: null,
      tagline: null,
      bio: null,
      supportContact: null,
      branding: null,
      settings: {
        customerApp: {
          currency: 'SAR',
        },
      },
    });
    repository.listCuisineCategories.mockResolvedValue({ items: [], total: 0 });
    repository.listPromotionalItems.mockResolvedValue([]);
    repository.findBranchPublicContent.mockResolvedValue(null);

    const result = await service.getHomeScreen({
      restaurantId: 'restaurant-1',
      promotionLimit: 8,
      cuisineLimit: 12,
    });

    expect(result.data.config).toEqual({ currency: 'SAR', branding: {} });
  });

  it('uses customer token restaurant scope for privacy policy when query restaurantId is omitted', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      coverImage: 'https://cdn.example.com/restaurant-cover.png',
      settings: { privacyPolicy: 'Privacy text' },
    });

    const result = await service.getPrivacyPolicy(
      {},
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        tid: 'tenant-1',
        role: UserRoleEnum.CUSTOMER,
      },
    );

    expect(repository.findRestaurantPublicContent).toHaveBeenCalledWith(
      'restaurant-1',
    );
    expect(result.data.content).toBe('Privacy text');
  });

  it('uses customer token restaurant scope for promotional items when query restaurantId is omitted', async () => {
    const { service, repository, couponsService } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: 'https://cdn.example.com/logo.png',
      coverImage: 'https://cdn.example.com/restaurant-cover.png',
      tagline: 'Fresh food fast',
      bio: null,
      supportContact: null,
      settings: {},
    });
    repository.listPromotionalItems.mockResolvedValue([itemFixture]);
    couponsService.getActiveAutoApplyPromotions.mockResolvedValue([
      {
        id: 'promo-1',
        title: 'Burger Deal',
        description: 'Auto discount',
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

    const result = await service.listPromotionalItems(
      { limit: 10 },
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        tid: 'tenant-1',
        role: UserRoleEnum.CUSTOMER,
      },
    );

    expect(repository.listPromotionalItems).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: 'restaurant-1', limit: 10 }),
      expect.objectContaining({ menuItemIds: ['item-1'] }),
    );
    expect(result.data).toHaveLength(1);
  });

  it('throws when public restaurant is missing', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue(null);

    await expect(
      service.getPrivacyPolicy({ restaurantId: 'missing-restaurant' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns loyalty points from loyalty wallet service', async () => {
    const { service, repository, loyaltyWalletService } = makeService();
    repository.findCustomerProfile.mockResolvedValue({
      id: 'customer-1',
      deletedAt: null,
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      profile: { metadata: {} },
    });
    loyaltyWalletService.getLoyaltySummary.mockResolvedValue({
      customerId: 'customer-1',
      availablePoints: 240,
      redeemedPoints: 60,
    });

    const result = await service.getLoyaltyPoints({
      uid: 'customer-1',
      rid: 'restaurant-1',
      tid: 'tenant-1',
      role: UserRoleEnum.CUSTOMER,
    });

    expect(loyaltyWalletService.getLoyaltySummary).toHaveBeenCalledWith({
      customerId: 'customer-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });
    expect(result.data).toEqual({
      customerId: 'customer-1',
      availablePoints: 240,
      redeemedPoints: 60,
    });
  });

  it('lists wallet history through loyalty wallet service', async () => {
    const { service, repository, loyaltyWalletService } = makeService();
    repository.findCustomerProfile.mockResolvedValue({
      id: 'customer-1',
      deletedAt: null,
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      profile: { metadata: {} },
    });
    loyaltyWalletService.listWalletHistory.mockResolvedValue({
      items: [
        {
          id: 'wallet-transaction-1',
          type: 'CREDIT',
          amount: 1000,
          balanceAfter: 1500,
          currency: 'PKR',
          createdAt: '2026-04-15T09:00:00.000Z',
        },
      ],
      total: 1,
    });

    const result = await service.getWalletHistory(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        tid: 'tenant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(loyaltyWalletService.listWalletHistory).toHaveBeenCalledWith(
      {
        customerId: 'customer-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );
    expect(result.data).toHaveLength(1);
    expect(result.meta?.total).toBe(1);
    expect(result.message).toBe('Wallet history fetched successfully');
  });

  it('redeems loyalty points through loyalty wallet service', async () => {
    const { service, repository, loyaltyWalletService } = makeService();
    repository.findCustomerProfile.mockResolvedValue({
      id: 'customer-1',
      deletedAt: null,
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      profile: { metadata: {} },
    });
    loyaltyWalletService.redeemPointsToWallet.mockResolvedValue({
      remainingPoints: 200,
    });

    const result = await service.redeemLoyaltyPoints(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        tid: 'tenant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      { points: 100, note: 'Checkout discount' },
    );

    expect(loyaltyWalletService.redeemPointsToWallet).toHaveBeenCalledWith(
      {
        customerId: 'customer-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      100,
      'Checkout discount',
      'customer-1',
    );
    expect(result.data.remainingPoints).toBe(200);
    expect(result.message).toBe('Loyalty points redeemed successfully');
  });

  it('lists admin table reservations with customer and branch details', async () => {
    const { service, repository } = makeService();
    repository.findCustomersForTableReservations.mockResolvedValue([
      {
        id: 'customer-1',
        email: 'customer@example.com',
        profile: {
          firstName: 'Bilal',
          lastName: 'Shah',
          phone: '03001234567',
          avatarUrl: 'avatar.jpg',
          metadata: {
            customerApp: {
              tableReservations: [
                {
                  id: 'reservation-1',
                  branchId: 'branch-1',
                  reservationDate: '2099-03-30T19:30:00.000Z',
                  guestCount: 4,
                  note: 'Window side',
                  status: 'REQUESTED',
                  createdAt: '2099-03-29T10:00:00.000Z',
                  cancelledAt: null,
                },
              ],
            },
          },
        },
      },
    ]);
    repository.findBranchesPublicContent.mockResolvedValue([
      {
        id: 'branch-1',
        name: 'Main Branch',
        coverImage: 'cover.jpg',
        description: 'Downtown branch',
      },
    ]);

    const result = await service.listAdminTableReservations(
      {
        uid: 'admin-1',
        rid: 'restaurant-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'DESC' } as never,
    );

    expect(repository.findCustomersForTableReservations).toHaveBeenCalledWith({
      restaurantId: 'restaurant-1',
      customerId: undefined,
      search: undefined,
    });
    expect(result.data[0]?.customer).toEqual({
      id: 'customer-1',
      email: 'customer@example.com',
      firstName: 'Bilal',
      lastName: 'Shah',
      phone: '03001234567',
      avatarUrl: 'avatar.jpg',
    });
    expect(result.data[0]?.branch).toEqual({
      id: 'branch-1',
      name: 'Main Branch',
      logoUrl: null,
      coverImage: 'cover.jpg',
      description: 'Downtown branch',
    });
  });

  it('forces branch-admin reservation fetches to stay within assigned branch', async () => {
    const { service, repository } = makeService();
    repository.findCustomersForTableReservations.mockResolvedValue([
      {
        id: 'customer-1',
        email: 'customer@example.com',
        profile: {
          firstName: 'Bilal',
          lastName: 'Shah',
          phone: '03001234567',
          avatarUrl: null,
          metadata: {
            customerApp: {
              tableReservations: [
                {
                  id: 'reservation-1',
                  branchId: 'branch-1',
                  reservationDate: '2099-03-30T19:30:00.000Z',
                  guestCount: 4,
                  note: null,
                  status: 'REQUESTED',
                  createdAt: '2099-03-29T10:00:00.000Z',
                  cancelledAt: null,
                },
                {
                  id: 'reservation-2',
                  branchId: 'branch-2',
                  reservationDate: '2099-03-31T19:30:00.000Z',
                  guestCount: 2,
                  note: null,
                  status: 'REQUESTED',
                  createdAt: '2099-03-29T11:00:00.000Z',
                  cancelledAt: null,
                },
              ],
            },
          },
        },
      },
    ]);
    repository.findBranchesPublicContent.mockResolvedValue([
      {
        id: 'branch-1',
        name: 'Main Branch',
        coverImage: 'cover.jpg',
        description: 'Downtown branch',
      },
    ]);

    const result = await service.listAdminTableReservations(
      {
        uid: 'branch-admin-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BRANCH_ADMIN,
      },
      { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'DESC' } as never,
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.branchId).toBe('branch-1');
  });

  it('updates table reservation status for business admins', async () => {
    const { service, repository } = makeService();
    repository.findCustomersForTableReservations.mockResolvedValue([
      {
        id: 'customer-1',
        email: 'customer@example.com',
        profile: {
          firstName: 'Bilal',
          lastName: 'Shah',
          phone: '03001234567',
          avatarUrl: null,
          metadata: {
            customerApp: {
              tableReservations: [
                {
                  id: 'reservation-1',
                  branchId: 'branch-1',
                  reservationDate: '2099-03-30T19:30:00.000Z',
                  guestCount: 4,
                  note: null,
                  status: 'REQUESTED',
                  createdAt: '2099-03-29T10:00:00.000Z',
                  cancelledAt: null,
                },
              ],
            },
          },
        },
      },
    ]);
    repository.findBranchesPublicContent.mockResolvedValue([
      {
        id: 'branch-1',
        name: 'Main Branch',
        coverImage: 'cover.jpg',
        description: 'Downtown branch',
      },
    ]);

    const result = await service.updateAdminTableReservationStatus(
      {
        uid: 'business-1',
        rid: 'restaurant-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'reservation-1',
      { status: 'CONFIRMED', customerId: 'customer-1' },
    );

    expect(repository.findCustomersForTableReservations).toHaveBeenCalledWith({
      restaurantId: 'restaurant-1',
      customerId: 'customer-1',
    });
    expect(repository.upsertCustomerProfile).toHaveBeenCalledWith(
      'customer-1',
      expect.any(Object),
    );
    expect(result.data?.status).toBe('CONFIRMED');
    expect(result.data?.branch).toEqual({
      id: 'branch-1',
      name: 'Main Branch',
      logoUrl: null,
      coverImage: 'cover.jpg',
      description: 'Downtown branch',
    });
    expect(result.message).toBe(
      'Table reservation status updated successfully',
    );
  });

  it('populates branch details in table reservations list', async () => {
    const { service, repository } = makeService();
    repository.findCustomerProfile.mockResolvedValue({
      id: 'customer-1',
      deletedAt: null,
      restaurantId: 'restaurant-1',
      profile: {
        metadata: {
          customerApp: {
            tableReservations: [
              {
                id: 'reservation-1',
                branchId: 'branch-1',
                reservationDate: '2099-03-30T19:30:00.000Z',
                guestCount: 4,
                note: 'Window side',
                status: 'REQUESTED',
                createdAt: '2099-03-29T10:00:00.000Z',
                cancelledAt: null,
              },
            ],
          },
        },
      },
    });
    repository.findBranchesPublicContent.mockResolvedValue([
      {
        id: 'branch-1',
        name: 'Main Branch',
        coverImage: 'cover.jpg',
        description: 'Downtown branch',
      },
    ]);

    const result = await service.listTableReservations(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        tid: 'tenant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'DESC' } as never,
    );

    expect(repository.findBranchesPublicContent).toHaveBeenCalledWith(
      ['branch-1'],
      'restaurant-1',
    );
    expect(result.data[0]?.branch).toEqual({
      id: 'branch-1',
      name: 'Main Branch',
      logoUrl: null,
      coverImage: 'cover.jpg',
      description: 'Downtown branch',
    });
  });

  it('creates a table reservation request in customer metadata', async () => {
    const { service, repository } = makeService();
    repository.findCustomerProfile.mockResolvedValue({
      id: 'customer-1',
      deletedAt: null,
      restaurantId: 'restaurant-1',
      profile: {
        metadata: {
          customerApp: {
            tableReservations: [],
          },
        },
      },
    });
    repository.findBranchPublicContent.mockResolvedValue({
      id: 'branch-1',
      name: 'Main Branch',
      settings: {
        tableReservationsEnabled: true,
      },
    });

    const result = await service.createTableReservation(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        tid: 'tenant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        branchId: 'branch-1',
        reservationDate: '2099-03-30T19:30:00.000Z',
        guestCount: 4,
        note: 'Window side',
      },
    );

    expect(repository.upsertCustomerProfile).toHaveBeenCalled();
    expect(result.data.branchId).toBe('branch-1');
    expect(result.message).toBe('Table reservation created successfully');
  });

  it('blocks table reservation creation when branch reservations are disabled', async () => {
    const { service, repository } = makeService();
    repository.findCustomerProfile.mockResolvedValue({
      id: 'customer-1',
      deletedAt: null,
      restaurantId: 'restaurant-1',
      profile: {
        metadata: {
          customerApp: {
            tableReservations: [],
          },
        },
      },
    });
    repository.findBranchPublicContent.mockResolvedValue({
      id: 'branch-1',
      name: 'Main Branch',
      settings: {
        tableReservationsEnabled: false,
      },
    });

    await expect(
      service.createTableReservation(
        {
          uid: 'customer-1',
          rid: 'restaurant-1',
          tid: 'tenant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          branchId: 'branch-1',
          reservationDate: '2099-03-30T19:30:00.000Z',
          guestCount: 4,
          note: 'Window side',
        },
      ),
    ).rejects.toThrow('Table reservations are not enabled for this branch');
  });

  it('cancels a table reservation in customer metadata', async () => {
    const { service, repository } = makeService();
    repository.findCustomerProfile.mockResolvedValue({
      id: 'customer-1',
      deletedAt: null,
      restaurantId: 'restaurant-1',
      profile: {
        metadata: {
          customerApp: {
            tableReservations: [
              {
                id: 'reservation-1',
                branchId: 'branch-1',
                reservationDate: '2099-03-30T19:30:00.000Z',
                guestCount: 4,
                note: 'Window side',
                status: 'REQUESTED',
                createdAt: '2099-03-29T10:00:00.000Z',
              },
            ],
          },
        },
      },
    });

    const result = await service.cancelTableReservation(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        tid: 'tenant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      'reservation-1',
    );

    expect(repository.upsertCustomerProfile).toHaveBeenCalled();
    expect(result.data?.status).toBe('CANCELLED');
    expect(result.message).toBe('Table reservation cancelled successfully');
  });
});
