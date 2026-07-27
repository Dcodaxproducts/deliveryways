import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CouponDealSelectionMode, Prisma } from '@prisma/client';
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

  const makeService = (
    options: {
      notifications?: boolean;
      localizations?: boolean;
      contactSubmissions?: boolean;
    } = {},
  ) => {
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
      redeemGiftCardToWallet: jest.fn(),
      purchaseGiftCardFromWallet: jest.fn(),
      listPurchasedGiftCards: jest.fn(),
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

    const listCuisineCategories = jest.fn();

    const repository = {
      findCustomerProfile: jest.fn(),
      findActiveCustomer: jest.fn(),
      findCustomersForTableReservations: jest.fn(),
      findRestaurantScope: jest.fn(),
      findRestaurantDomainContext: jest.fn(),
      listPublicBranches: jest.fn(),
      countActiveBranches: jest.fn().mockResolvedValue(1),
      upsertCustomerProfile: jest.fn(),
      findFavoriteMenuItems: jest.fn(),
      findRestaurantPublicContent: jest.fn(),
      findBranchPublicContent: jest.fn(),
      findPublicAddress: jest.fn().mockResolvedValue(null),
      findBranchesPublicContent,
      listCuisineCategories,
      listMenuCategories: listCuisineCategories,
      findPublicCuisine: jest.fn(),
      listCuisineMenuItems: jest.fn(),
      listPublicMenuItems: jest.fn(),
      listPromotionalItems: jest.fn(),
      listPublicDealScopeMenuItems: jest.fn(),
      findPublicMenuItemBySlug: jest.fn(),
      getBranchPublicStats: jest.fn(),
      listPublicReviews: jest.fn(),
    };

    const couponsService = {
      getActiveAutoApplyPromotions: jest.fn().mockResolvedValue([]),
      getActiveCustomerCoupons: jest.fn().mockResolvedValue([]),
      getActiveHappyHours: jest.fn().mockResolvedValue([]),
    };

    const notificationsService = {
      notifyTableReservationAdmin: jest.fn(),
      notifyTableReservationCustomer: jest.fn(),
    };

    const localizationsService = {
      findActiveTranslations: jest.fn().mockResolvedValue([]),
    };

    const mailerService = {
      sendEmail: jest.fn(),
    };
    const globalSettingsService = {
      getDefaultCurrencyCode: jest.fn().mockResolvedValue('PKR'),
      getPaymentMethods: jest.fn().mockResolvedValue({
        data: [
          { code: 'COD', label: 'Cash', isActive: true },
          {
            code: 'CARD_ON_DELIVERY',
            label: 'Card on delivery',
            isActive: true,
          },
          { code: 'PAYPAL', label: 'PayPal', isActive: true },
          { code: 'WALLET', label: 'Wallet', isActive: true },
          { code: 'STRIPE', label: 'Stripe', isActive: false },
        ],
      }),
      getSettings: jest.fn().mockResolvedValue({
        data: { timezone: 'Europe/Berlin' },
      }),
    };
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    };
    const contactSubmissionsService = {
      createPublicSubmission: jest.fn().mockResolvedValue({
        id: 'contact-submission-1',
      }),
    };

    const service = new CustomerAppService(
      repository as never,
      storageService as never,
      loyaltyWalletService as never,
      paymentsService as never,
      couponsService as never,
      options.notifications ? (notificationsService as never) : undefined,
      options.localizations ? (localizationsService as never) : undefined,
      mailerService as never,
      globalSettingsService as never,
      configService as never,
      options.contactSubmissions
        ? (contactSubmissionsService as never)
        : undefined,
    );
    return {
      service,
      repository,
      loyaltyWalletService,
      paymentsService,
      couponsService,
      storageService,
      notificationsService,
      localizationsService,
      mailerService,
      globalSettingsService,
      configService,
      contactSubmissionsService,
    };
  };

  it('resolves the explicit restaurant subdomain from the request host', async () => {
    const { service, repository, configService } = makeService();
    configService.get.mockReturnValue('delivery-way.de');
    repository.findRestaurantDomainContext.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'Burger House',
      slug: 'internal-restaurant-slug',
      subdomain: 'burger-house',
      customDomain: null,
      customDomainVerifiedAt: null,
      logoUrl: null,
      branding: null,
      branches: [{ id: 'branch-1', name: 'Main Branch', isMain: true }],
    });

    const result = await service.resolveDomainContext(
      'Burger-House.delivery-way.de:443',
    );

    expect(repository.findRestaurantDomainContext).toHaveBeenCalledWith(
      'burger-house.delivery-way.de',
      'burger-house',
    );
    expect(result.data).toMatchObject({
      restaurantId: 'restaurant-1',
      restaurantSlug: 'internal-restaurant-slug',
      restaurantSubdomain: 'burger-house',
      subdomain: 'burger-house',
      customDomainVerified: false,
      branchId: 'branch-1',
    });
  });

  it('lists sanitized active branches for anonymous ordering', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantScope.mockResolvedValue({ id: 'restaurant-1' });
    repository.listPublicBranches.mockResolvedValue({
      items: [
        {
          id: 'branch-1',
          restaurantId: 'restaurant-1',
          name: 'Main Branch',
          isMain: true,
          isActive: true,
          address: {
            street: 'Main Street 1',
            area: null,
            postalCode: '10115',
            city: 'Berlin',
            state: 'Berlin',
            country: 'Germany',
            lat: null,
            lng: null,
          },
          settings: {
            allowedOrderTypes: ['DELIVERY', 'TAKEAWAY'],
            allowedPaymentMethods: ['COD', 'STRIPE', 'WALLET'],
            openingHours: [{ dayOfWeek: 'MONDAY' }],
            internalNote: 'must not be public',
          },
        },
      ],
      total: 1,
    });

    const result = await service.listPublicBranches({
      restaurantId: 'restaurant-1',
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    });

    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'branch-1',
        isOnlyBranch: true,
        settings: {
          allowedOrderTypes: ['DELIVERY', 'TAKEAWAY'],
          allowedPaymentMethods: [
            'COD',
            'STRIPE',
            'WALLET',
            'CARD_ON_DELIVERY',
            'PAYPAL',
          ],
          openingHours: [{ dayOfWeek: 'MONDAY' }],
          deliveryHours: [{ dayOfWeek: 'MONDAY' }],
          holidayOpeningHours: [],
          temporaryClosure: null,
          tableReservationsEnabled: false,
        },
      }),
    ]);
    expect(result.data[0]?.settings).not.toHaveProperty('internalNote');
    expect(result.meta).toMatchObject({ total: 1 });
  });

  it('uses safe checkout methods when legacy branch settings contain an empty array', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantScope.mockResolvedValue({ id: 'restaurant-1' });
    repository.listPublicBranches.mockResolvedValue({
      items: [
        {
          id: 'branch-1',
          restaurantId: 'restaurant-1',
          name: 'Main Branch',
          isMain: true,
          isActive: true,
          address: null,
          settings: {
            allowedOrderTypes: ['DELIVERY', 'TAKEAWAY'],
            allowedPaymentMethods: [],
          },
        },
      ],
      total: 1,
    });

    const result = await service.listPublicBranches({
      restaurantId: 'restaurant-1',
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    });

    expect(result.data[0]?.settings.allowedPaymentMethods).toEqual([
      'COD',
      'CARD_ON_DELIVERY',
      'PAYPAL',
      'WALLET',
    ]);
  });

  it('rejects public branch listing for an unknown restaurant', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantScope.mockResolvedValue(null);

    await expect(
      service.listPublicBranches({
        restaurantId: 'missing',
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      }),
    ).rejects.toThrow('Restaurant not found');
    expect(repository.listPublicBranches).not.toHaveBeenCalled();
  });

  it('uses opening hours as customer-app delivery-hours fallback', () => {
    const { service } = makeService();
    const readBranchScheduleHours = (
      service as unknown as {
        readBranchScheduleHours: (
          source: unknown,
          key: 'openingHours' | 'deliveryHours',
        ) => unknown[];
      }
    ).readBranchScheduleHours;

    const hours = readBranchScheduleHours.call(
      service,
      {
        openingHours: [
          {
            dayOfWeek: 'MONDAY',
            isClosed: false,
            openTime: '09:00',
            closeTime: '18:00',
          },
        ],
      },
      'deliveryHours',
    );

    expect(hours).toEqual([
      {
        dayOfWeek: 'MONDAY',
        isClosed: false,
        openTime: '09:00',
        closeTime: '18:00',
      },
    ]);
  });

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

  it('redeems gift card through wallet service', async () => {
    const { service, repository, loyaltyWalletService } = makeService();
    repository.findCustomerProfile.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@test.com',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      deletedAt: null,
      profile: { metadata: {} },
    });
    loyaltyWalletService.redeemGiftCardToWallet.mockResolvedValue({
      customerId: 'customer-1',
      creditedAmount: 1000,
      walletBalance: 1500,
      currency: 'PKR',
    });

    const result = await service.redeemGiftCard(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        tid: 'tenant-1',
        role: UserRoleEnum.CUSTOMER,
      } as never,
      { code: 'gift-123', branchId: 'branch-1' },
    );

    expect(loyaltyWalletService.redeemGiftCardToWallet).toHaveBeenCalledWith(
      {
        customerId: 'customer-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      'gift-123',
      'customer-1',
    );
    expect(result.message).toBe('Gift card redeemed successfully');
    expect(result.data.creditedAmount).toBe(1000);
  });

  it('purchases gift card through wallet service', async () => {
    const { service, repository, loyaltyWalletService } = makeService();
    repository.findCustomerProfile.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@test.com',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      deletedAt: null,
      profile: { metadata: {} },
    });
    loyaltyWalletService.purchaseGiftCardFromWallet.mockResolvedValue({
      customerId: 'customer-1',
      giftCardId: 'gift-1',
      code: 'GIFT-123',
      qrPayload: 'DWGC:GIFT-123',
      amount: 1000,
      walletBalance: 500,
      currency: 'PKR',
    });

    const result = await service.purchaseGiftCard(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        tid: 'tenant-1',
        role: UserRoleEnum.CUSTOMER,
      } as never,
      {
        amount: 1000,
        title: 'Birthday Gift',
        message: 'Enjoy your meal',
      },
    );

    expect(
      loyaltyWalletService.purchaseGiftCardFromWallet,
    ).toHaveBeenCalledWith(
      {
        customerId: 'customer-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      {
        amount: 1000,
        title: 'Birthday Gift',
        message: 'Enjoy your meal',
      },
      'customer-1',
    );
    expect(result.message).toBe('Gift card purchased successfully');
    expect(result.data.qrPayload).toBe('DWGC:GIFT-123');
  });

  it('lists customer-purchased gift cards', async () => {
    const { service, repository, loyaltyWalletService } = makeService();
    repository.findCustomerProfile.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@test.com',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      deletedAt: null,
      profile: { metadata: {} },
    });
    loyaltyWalletService.listPurchasedGiftCards.mockResolvedValue({
      items: [
        {
          id: 'gift-card-1',
          code: 'GIFT-123',
          qrPayload: 'DWGC:GIFT-123',
          amount: 1000,
        },
      ],
      total: 1,
    });

    const query = {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'DESC' as const,
    };
    const result = await service.listGiftCards(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        tid: 'tenant-1',
        role: UserRoleEnum.CUSTOMER,
      } as never,
      query,
    );

    expect(loyaltyWalletService.listPurchasedGiftCards).toHaveBeenCalledWith(
      {
        customerId: 'customer-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      query,
    );
    expect(result.data).toEqual([
      {
        id: 'gift-card-1',
        code: 'GIFT-123',
        qrPayload: 'DWGC:GIFT-123',
        amount: 1000,
      },
    ]);
    expect(result.message).toBe('Gift cards fetched successfully');
    expect(result.meta.total).toBe(1);
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

  it('submits public contact form to restaurant support email', async () => {
    const { service, repository, mailerService } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      name: 'DeliveryWays Kitchen',
      coverImage: null,
      supportContact: { email: 'support@restaurant.test' },
      settings: {},
    });
    repository.findBranchPublicContent.mockResolvedValue({
      id: 'branch-1',
      name: 'Main Branch',
      logoUrl: null,
      coverImage: null,
      settings: {},
    });

    const result = await service.submitContactForm(
      { restaurantId: 'restaurant-1', branchId: 'branch-1' },
      {
        name: '  Jane Customer  ',
        email: 'JANE@EXAMPLE.COM',
        subject: '  Delivery question  ',
        message: '  Please confirm delivery timing.  ',
      },
    );

    expect(mailerService.sendEmail).toHaveBeenCalledWith(
      'support@restaurant.test',
      'Contact form: Delivery question',
      expect.stringContaining('Email: jane@example.com'),
    );
    expect(mailerService.sendEmail).toHaveBeenCalledWith(
      'support@restaurant.test',
      'Contact form: Delivery question',
      expect.stringContaining('Branch: Main Branch (branch-1)'),
    );
    expect(result).toEqual({
      data: {
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        submitted: true,
        notifiedRecipients: 1,
      },
      message: 'Contact form submitted successfully',
    });
  });

  it('stores contact form submission when submission management is available', async () => {
    const { service, repository, contactSubmissionsService } = makeService({
      contactSubmissions: true,
    });
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      coverImage: null,
      supportContact: { email: 'support@restaurant.test' },
      settings: {},
    });
    repository.findBranchPublicContent.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      name: 'Main Branch',
      logoUrl: null,
      coverImage: null,
      settings: {},
    });

    const result = await service.submitContactForm(
      { restaurantId: 'restaurant-1', branchId: 'branch-1' },
      {
        name: 'Jane Customer',
        email: 'JANE@EXAMPLE.COM',
        subject: 'Delivery question',
        message: 'Please confirm delivery timing.',
      },
      {
        uid: 'customer-1',
        role: UserRoleEnum.CUSTOMER,
      } as never,
    );

    expect(
      contactSubmissionsService.createPublicSubmission,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        customerId: 'customer-1',
        name: 'Jane Customer',
        email: 'jane@example.com',
        subject: 'Delivery question',
      }),
    );
    expect(result.data.id).toBe('contact-submission-1');
  });

  it('copies configured superadmin contact recipients', async () => {
    const { service, repository, mailerService, configService } = makeService();
    configService.get.mockImplementation((key: string) =>
      key === 'CONTACT_FORM_SUPERADMIN_EMAILS'
        ? 'superadmin@deliveryways.test, support@restaurant.test'
        : undefined,
    );
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      name: 'DeliveryWays Kitchen',
      coverImage: null,
      supportContact: { email: 'support@restaurant.test' },
      settings: {},
    });

    const result = await service.submitContactForm(
      { restaurantId: 'restaurant-1' },
      {
        name: 'Jane Customer',
        email: 'jane@example.com',
        subject: 'Delivery question',
        message: 'Please confirm delivery timing.',
      },
    );

    expect(mailerService.sendEmail).toHaveBeenCalledTimes(2);
    expect(mailerService.sendEmail).toHaveBeenCalledWith(
      'support@restaurant.test',
      'Contact form: Delivery question',
      expect.stringContaining('Restaurant: DeliveryWays Kitchen'),
    );
    expect(mailerService.sendEmail).toHaveBeenCalledWith(
      'superadmin@deliveryways.test',
      'Contact form: Delivery question',
      expect.stringContaining('Restaurant: DeliveryWays Kitchen'),
    );
    expect(result.data.notifiedRecipients).toBe(2);
  });

  it('uses configured contact recipient when restaurant support email is missing', async () => {
    const { service, repository, mailerService, configService } = makeService();
    configService.get.mockImplementation((key: string) =>
      key === 'CONTACT_FORM_SUPPORT_EMAILS'
        ? 'support@deliveryways.test'
        : undefined,
    );
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      name: 'DeliveryWays Kitchen',
      coverImage: null,
      supportContact: null,
      settings: {},
    });

    const result = await service.submitContactForm(
      { restaurantId: 'restaurant-1' },
      {
        name: 'Jane Customer',
        email: 'jane@example.com',
        subject: 'Delivery question',
        message: 'Please confirm delivery timing.',
      },
    );

    expect(mailerService.sendEmail).toHaveBeenCalledWith(
      'support@deliveryways.test',
      'Contact form: Delivery question',
      expect.stringContaining('Email: jane@example.com'),
    );
    expect(result.data.notifiedRecipients).toBe(1);
  });

  it('rejects contact form when no recipient email is configured', async () => {
    const { service, repository, mailerService } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      name: 'DeliveryWays Kitchen',
      coverImage: null,
      supportContact: null,
      settings: {},
    });

    await expect(
      service.submitContactForm(
        { restaurantId: 'restaurant-1' },
        {
          name: 'Jane Customer',
          email: 'jane@example.com',
          subject: 'Delivery question',
          message: 'Please confirm delivery timing.',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mailerService.sendEmail).not.toHaveBeenCalled();
  });

  it('returns compact promotional item cards without relation graphs', async () => {
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

    expect(repository.listPromotionalItems).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId: 'restaurant-1',
        limit: 10,
      }),
      {
        menuItemIds: ['item-1'],
        categoryIds: [],
        includeDetails: false,
      },
    );
    expect(result.data[0].category).toEqual({
      id: 'category-1',
      name: 'Burgers',
      imageUrl: 'https://cdn.example.com/category.png',
    });
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
    expect(result.data[0]).not.toHaveProperty('restaurant');
    expect(result.data[0]).not.toHaveProperty('modifierLinks');
    expect(result.data[0]).not.toHaveProperty('modifierPriceOverrides');
    expect(result.data[0]).not.toHaveProperty('modifiers');
    expect(result.data[0].variations).toEqual([
      expect.objectContaining({
        id: 'variation-1',
        name: 'Large',
        price: new Prisma.Decimal(899),
      }),
    ]);
  });

  it('returns compact public item cards for menu browsing', async () => {
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
    repository.listPublicMenuItems.mockResolvedValue({
      items: [itemFixture],
      total: 1,
    });

    const result = await service.listItems({
      restaurantId: 'restaurant-1',
      categoryId: 'category-1',
      page: 1,
      limit: 12,
      sortBy: 'sortOrder',
      sortOrder: 'ASC',
    });

    expect(repository.listPublicMenuItems).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId: 'restaurant-1',
        categoryId: 'category-1',
      }),
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'item-1',
        restaurantId: 'restaurant-1',
        slug: 'zinger-burger',
        isActive: true,
        category: {
          id: 'category-1',
          name: 'Burgers',
          imageUrl: 'https://cdn.example.com/category.png',
        },
      }),
    );
    expect(result.data[0]).not.toHaveProperty('restaurant');
    expect(result.data[0]).not.toHaveProperty('modifierLinks');
    expect(result.data[0]).not.toHaveProperty('modifierPriceOverrides');
    expect(result.data[0]).not.toHaveProperty('modifiers');
    expect(result.data[0].variations).toEqual([
      expect.objectContaining({
        id: 'variation-1',
        name: 'Large',
        price: new Prisma.Decimal(899),
      }),
    ]);
  });

  it('omits exhausted auto-apply promotions from public item promotion payloads', async () => {
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
        maxUses: 10,
        usedCount: 10,
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

    expect(result.data).toEqual([]);
    expect(repository.listPromotionalItems).not.toHaveBeenCalled();
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

  it('lists active customer coupon codes for browsing and copying', async () => {
    const { service, repository, couponsService, storageService } =
      makeService();
    storageService.resolveViewUrl.mockImplementation(
      (value: string | null | undefined) =>
        value ? `https://signed.example/${value}` : null,
    );
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
    repository.findBranchPublicContent.mockResolvedValue({
      id: 'branch-1',
      name: 'Main Branch',
      coverImage: null,
      description: null,
      settings: {},
    });
    couponsService.getActiveCustomerCoupons.mockResolvedValue([
      {
        id: 'coupon-1',
        code: 'SAVE10',
        title: 'Save 10%',
        description: 'Use this code at checkout',
        imageUrl: 'coupon-thumb.jpg',
        applyMode: 'ORDER_TOTAL',
        discountType: 'PERCENTAGE',
        discountValue: new Prisma.Decimal(10),
        maxDiscountAmount: new Prisma.Decimal(100),
        minOrderAmount: new Prisma.Decimal(500),
        maxUses: 100,
        maxUsesPerCustomer: 1,
        usedCount: 5,
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
      },
    ]);

    const result = await service.listCoupons({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      limit: 10,
    });

    expect(couponsService.getActiveCustomerCoupons).toHaveBeenCalledWith(
      'restaurant-1',
      'branch-1',
    );
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'coupon-1',
        code: 'SAVE10',
        title: 'Save 10%',
        imageUrl: 'https://signed.example/coupon-thumb.jpg',
        thumbnailUrl: 'https://signed.example/coupon-thumb.jpg',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        maxDiscountAmount: 100,
        minOrderAmount: 500,
        maxUses: 100,
        maxUsesPerCustomer: 1,
        usedCount: 5,
      }),
    ]);
    expect(result.message).toBe('Coupons fetched successfully');
  });

  it('lists only fixed price promotions as public deals', async () => {
    const { service, repository, couponsService, storageService } =
      makeService();
    storageService.resolveViewUrl.mockImplementation(
      (value: string | null | undefined) =>
        value ? `https://signed.example/${value}` : null,
    );
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
        dealSelectionMode: CouponDealSelectionMode.FLEXIBLE_ITEMS,
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
        scopeCategories: [
          {
            itemLimit: 1,
            forcedVariationId: 'var-large',
            forcedVariation: { id: 'var-large', name: 'Large' },
            menuCategory: {
              id: 'cat-pizza',
              name: 'Pizza',
              imageUrl: null,
              variations: [],
              variationLinks: [],
              items: [
                {
                  id: 'item-large',
                  variationPriceOverrides: [{ variationId: 'var-large' }],
                },
                { id: 'item-small', variationPriceOverrides: [] },
              ],
            },
          },
        ],
      },
    ]);
    repository.listPublicDealScopeMenuItems.mockResolvedValue([
      itemFixture,
      { ...itemFixture, id: 'item-2', name: 'Cold Drink', slug: 'cold-drink' },
    ]);

    const result = await service.listDeals({
      restaurantId: 'restaurant-1',
      limit: 10,
    });

    expect(repository.listPublicDealScopeMenuItems).toHaveBeenCalledWith(
      {
        restaurantId: 'restaurant-1',
        branchId: undefined,
      },
      ['item-1', 'item-2'],
    );
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'deal-1',
        title: 'Burger Combo',
        imageUrl: 'https://signed.example/deal-thumb.jpg',
        thumbnailUrl: 'https://signed.example/deal-thumb.jpg',
        discountType: 'FIXED_PRICE',
        discountValue: 999,
        dealSelectionMode: CouponDealSelectionMode.FLEXIBLE_ITEMS,
        scopeCategoryRules: [
          expect.objectContaining({
            menuCategoryId: 'cat-pizza',
            variationId: 'var-large',
            eligibleMenuItemIds: ['item-large'],
            excludedMenuItemIds: ['item-small'],
          }),
        ],
        scopeMenuItems: [
          expect.objectContaining({
            id: 'item-1',
            name: 'Zinger Burger',
            imageUrl:
              'https://signed.example/https://cdn.example.com/zinger.png',
            basePrice: 799,
          }),
          expect.objectContaining({
            id: 'item-2',
            name: 'Cold Drink',
            imageUrl:
              'https://signed.example/https://cdn.example.com/zinger.png',
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

  it('uses active deal scope lookup for public deal items', async () => {
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
    repository.findBranchPublicContent.mockResolvedValue({
      id: 'branch-1',
      name: 'Main Branch',
      logoUrl: null,
      coverImage: null,
      address: null,
      phone: null,
      email: null,
      settings: {},
    });
    couponsService.getActiveAutoApplyPromotions.mockResolvedValue([
      {
        id: 'deal-1',
        title: 'Branch Combo',
        description: 'Fixed bundle',
        imageUrl: null,
        applyMode: 'SCOPED_ITEMS',
        discountType: 'FIXED_PRICE',
        discountValue: new Prisma.Decimal(999),
        dealSelectionMode: CouponDealSelectionMode.FIXED_ITEMS,
        maxDiscountAmount: null,
        minOrderAmount: null,
        startsAt: new Date('2026-05-20T00:00:00.000Z'),
        expiresAt: new Date('2026-05-25T00:00:00.000Z'),
        restaurant: null,
        branch: null,
        scopeMenuItem: null,
        scopeCategory: null,
        scopeCategories: [],
        scopeMenuItems: [
          {
            menuItem: {
              id: 'item-1',
              name: 'Zinger Burger',
              slug: 'zinger-burger',
              imageUrl: 'zinger.png',
              basePrice: new Prisma.Decimal(799),
            },
          },
          {
            menuItem: {
              id: 'item-2',
              name: 'Cold Drink',
              slug: 'cold-drink',
              imageUrl: 'drink.png',
              basePrice: new Prisma.Decimal(199),
            },
          },
        ],
      },
    ]);
    repository.listPublicDealScopeMenuItems.mockResolvedValue([
      { ...itemFixture, id: 'item-1', slug: 'zinger-burger' },
      { ...itemFixture, id: 'item-2', name: 'Cold Drink', slug: 'cold-drink' },
    ]);

    const result = await service.listDeals({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      limit: 10,
    });

    expect(repository.listPublicDealScopeMenuItems).toHaveBeenCalledWith(
      {
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      ['item-1', 'item-2'],
    );
    expect(result.data[0].scopeMenuItems).toEqual([
      expect.objectContaining({ id: 'item-1', slug: 'zinger-burger' }),
      expect.objectContaining({ id: 'item-2', slug: 'cold-drink' }),
    ]);
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
          categoryIds: ['category-1'],
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
      { categoryIds: ['category-1'], includeItems: false },
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

  it('attaches active happy hour pricing to customer cuisine items', async () => {
    const { service, repository, couponsService } = makeService();
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
    repository.findBranchPublicContent.mockResolvedValue({
      id: 'branch-1',
      name: 'Main Branch',
      logoUrl: null,
      coverImage: null,
      description: null,
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
    couponsService.getActiveHappyHours.mockResolvedValue([
      {
        id: 'happy-1',
        title: 'Lunch happy hour',
        description: '20% off burgers',
        imageUrl: 'happy.png',
        applyMode: 'SCOPED_ITEMS',
        discountType: 'PERCENTAGE',
        discountValue: new Prisma.Decimal(20),
        maxDiscountAmount: null,
        startsAt: new Date('2026-06-01T00:00:00.000Z'),
        expiresAt: new Date('2026-06-30T23:59:59.000Z'),
        activeDays: [1, 2, 3, 4, 5],
        dailyStartTime: '12:00',
        dailyEndTime: '14:00',
        scopeMenuItem: null,
        scopeMenuItems: [],
        scopeCategory: { id: 'category-1' },
        scopeCategories: [],
      },
    ]);

    const result = await service.listCuisineItems('category-1', {
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      page: 1,
      limit: 10,
      sortBy: 'sortOrder',
      sortOrder: 'ASC',
    });

    expect(couponsService.getActiveHappyHours).toHaveBeenCalledWith(
      'restaurant-1',
      'branch-1',
    );
    const item = result.data.items[0] as {
      happyHourDiscountedBasePrice: number | null;
      happyHour: {
        id: string;
        title: string;
        discountType: string;
        discountValue: number;
        originalPrice: number;
        discountedPrice: number;
        activeDays: number[];
        dailyStartTime: string | null;
        dailyEndTime: string | null;
        isCurrentlyActive: boolean;
      } | null;
      variations: Array<{
        happyHourDiscountedPrice: number | null;
        happyHour: {
          id: string;
          originalPrice: number;
          discountedPrice: number;
        } | null;
      }>;
    };

    expect(item.happyHourDiscountedBasePrice).toBe(639.2);
    expect(item.happyHour).toMatchObject({
      id: 'happy-1',
      title: 'Lunch happy hour',
      discountType: 'PERCENTAGE',
      discountValue: 20,
      originalPrice: 799,
      discountedPrice: 639.2,
      activeDays: [1, 2, 3, 4, 5],
      dailyStartTime: '12:00',
      dailyEndTime: '14:00',
      isCurrentlyActive: true,
    });
    expect(item.variations[0]?.happyHourDiscountedPrice).toBe(719.2);
    expect(item.variations[0]?.happyHour).toMatchObject({
      id: 'happy-1',
      originalPrice: 899,
      discountedPrice: 719.2,
    });
  });

  it('applies active translations to public cuisine item responses', async () => {
    const { service, repository, localizationsService } = makeService({
      localizations: true,
    });
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
      description: 'Default category',
      imageUrl: 'https://cdn.example.com/category.png',
    });
    repository.listCuisineMenuItems.mockResolvedValue({
      items: [itemFixture],
      total: 1,
    });
    localizationsService.findActiveTranslations.mockResolvedValue([
      {
        entityType: 'CUISINE',
        entityId: 'category-1',
        fields: { name: 'Burger DE', description: 'Kategorie DE' },
      },
      {
        entityType: 'MENU_CATEGORY',
        entityId: 'category-1',
        fields: { name: 'Kategorie DE' },
      },
      {
        entityType: 'MENU_ITEM',
        entityId: 'item-1',
        fields: { name: 'Zinger DE', description: 'Beschreibung DE' },
      },
      {
        entityType: 'RESTAURANT',
        entityId: 'restaurant-1',
        fields: { name: 'Kueche DE' },
      },
      {
        entityType: 'MENU_ITEM_VARIATION',
        entityId: 'variation-1',
        fields: { name: 'Gross' },
      },
      {
        entityType: 'MODIFIER',
        entityId: 'modifier-1',
        fields: { name: 'Extra Kaese' },
      },
    ]);

    const result = await service.listCuisineItems('category-1', {
      restaurantId: 'restaurant-1',
      locale: 'de',
      page: 1,
      limit: 10,
      sortBy: 'sortOrder',
      sortOrder: 'ASC',
    });

    expect(localizationsService.findActiveTranslations).toHaveBeenCalledWith(
      'restaurant-1',
      'de',
      expect.arrayContaining([
        { entityType: 'CUISINE', entityId: 'category-1' },
        { entityType: 'MENU_ITEM', entityId: 'item-1' },
        { entityType: 'MENU_CATEGORY', entityId: 'category-1' },
        { entityType: 'RESTAURANT', entityId: 'restaurant-1' },
        { entityType: 'MENU_ITEM_VARIATION', entityId: 'variation-1' },
        { entityType: 'MODIFIER', entityId: 'modifier-1' },
      ]),
    );
    expect(result.data.cuisine).toEqual(
      expect.objectContaining({
        name: 'Burger DE',
        description: 'Kategorie DE',
      }),
    );
    const translatedItem = result.data.items[0] as {
      restaurant: { name: string } | null;
      category: { name: string } | null;
      variations: Array<{ id: string; name: string }>;
      modifiers: Array<{ id: string; name: string }>;
    };

    expect(translatedItem).toEqual(
      expect.objectContaining({
        name: 'Zinger DE',
        description: 'Beschreibung DE',
        variations: [
          expect.objectContaining({
            id: 'variation-1',
            name: 'Gross',
          }),
        ],
        modifiers: [
          expect.objectContaining({
            id: 'modifier-1',
            name: 'Extra Kaese',
          }),
        ],
      }),
    );
    expect(translatedItem.restaurant?.name).toBe('Kueche DE');
    expect(translatedItem.category?.name).toBe('Kategorie DE');
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

  it('returns slim cuisine cards without embedded menu items', async () => {
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
    expect(result.data[0]).not.toHaveProperty('items');
    expect(repository.listCuisineCategories).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: 'restaurant-1' }),
      { includeItems: false },
    );
  });

  it('fetches public item details with inherited category add-on groups', async () => {
    const { service, repository } = makeService();
    repository.findPublicMenuItemBySlug.mockResolvedValue({
      ...itemFixture,
      modifierLinks: [],
      category: {
        ...itemFixture.category,
        modifierLinks: [
          {
            id: 'category-group-link-1',
            sortOrder: 2,
            selectionType: 'MULTIPLE',
            minSelect: 0,
            maxSelect: 3,
            modifierGroup: {
              id: 'category-group-1',
              name: 'Extras',
              description: 'Choose your extras',
              minSelect: 0,
              maxSelect: 3,
              isRequired: false,
              sortOrder: 2,
              isActive: true,
              modifierLinks: [
                {
                  id: 'category-modifier-link-1',
                  sortOrder: 1,
                  modifier: {
                    id: 'modifier-2',
                    name: 'Extra Sauce',
                    priceDelta: new Prisma.Decimal(50),
                    sortOrder: 1,
                    isActive: true,
                    itemPriceOverrides: [],
                    variationPriceOverrides: [],
                  },
                },
              ],
            },
          },
        ],
      },
    });

    const result = await service.getItemBySlug(' Zinger-Burger ', {
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });

    expect(repository.findPublicMenuItemBySlug).toHaveBeenCalledWith(
      'Zinger-Burger',
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
    expect(result.data.modifierGroups).toEqual([
      expect.objectContaining({
        id: 'category-group-1',
        name: 'Extras',
        selectionType: 'MULTIPLE',
        minSelect: 0,
        maxSelect: 3,
        modifiers: [
          expect.objectContaining({
            id: 'modifier-2',
            name: 'Extra Sauce',
            priceDelta: 50,
          }),
        ],
      }),
    ]);
  });

  it('includes restaurant cover image on home-screen/public content responses', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-04T00:00:00.000Z'));
    const { service, repository } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: 'https://cdn.example.com/logo.png',
      coverImage: 'https://cdn.example.com/restaurant-cover.png',
      tagline: 'Fresh food fast',
      bio: 'Test bio',
      socialMedia: {
        instagram: 'https://instagram.example/deliveryways',
      },
      supportContact: {
        phone: '+923001111111',
        whatsapp: '+923002222222',
        email: 'support@deliveryways.test',
      },
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
        contact: {
          phone: '+923003333333',
          email: 'branch@deliveryways.test',
        },
        deliveryIntervalMinutes: 20,
        pickupIntervalMinutes: 10,
        tableReservationsEnabled: true,
        openingHours: [
          {
            dayOfWeek: 'MONDAY',
            isClosed: false,
            openTime: '09:00',
            closeTime: '18:00',
          },
        ],
        deliveryHours: [
          {
            dayOfWeek: 'MONDAY',
            isClosed: false,
            openTime: '12:00',
            closeTime: '22:00',
          },
        ],
        holidayOpeningHours: [
          {
            date: '2026-06-09',
            isClosed: false,
            openTime: '18:00',
            closeTime: '20:00',
            note: 'Custom date hours',
          },
        ],
      },
    });
    repository.findPublicAddress
      .mockResolvedValueOnce({
        street: 'Restaurant Street',
        area: 'HQ 1',
        postalCode: '46000',
        city: 'Rawalpindi',
        state: 'Punjab',
        country: 'Pakistan',
        lat: new Prisma.Decimal('33.6000000'),
        lng: new Prisma.Decimal('73.0500000'),
      })
      .mockResolvedValueOnce({
        street: 'Branch Street',
        area: 'Shop 8',
        postalCode: '54000',
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
        lat: new Prisma.Decimal('31.5204000'),
        lng: new Prisma.Decimal('74.3587000'),
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
    expect(result.data.restaurant.socialMediaLinks).toEqual({
      instagram: 'https://instagram.example/deliveryways',
    });
    expect(result.data.restaurant.contactInfo).toEqual({
      phone: '+923001111111',
      whatsapp: '+923002222222',
      email: 'support@deliveryways.test',
    });
    expect(result.data.restaurant.address).toEqual({
      street: 'Restaurant Street',
      shopNumber: 'HQ 1',
      area: 'HQ 1',
      postalCode: '46000',
      city: 'Rawalpindi',
      state: 'Punjab',
      country: 'Pakistan',
      addressLines: ['Restaurant Street - HQ 1', '46000 - Rawalpindi'],
      lat: 33.6,
      lng: 73.05,
    });
    expect(result.data.config).toEqual({
      currency: 'PKR',
      timezone: 'Europe/Berlin',
      branding: {
        primaryColor: '#FF0000',
        secondaryColor: '#000000',
        fontFamily: 'Inter',
      },
    });
    expect(result.data.branch).toMatchObject({
      id: 'branch-1',
      name: 'Main Branch',
      logoUrl: null,
      coverImage: 'branch-cover.jpg',
      description: 'Downtown branch',
      contactInfo: {
        phone: '+923003333333',
        whatsapp: '+923002222222',
        email: 'branch@deliveryways.test',
      },
      phone: '+923003333333',
      whatsapp: '+923002222222',
      email: 'branch@deliveryways.test',
      address: {
        street: 'Branch Street',
        shopNumber: 'Shop 8',
        area: 'Shop 8',
        postalCode: '54000',
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
        addressLines: ['Branch Street - Shop 8', '54000 - Lahore'],
        lat: 31.5204,
        lng: 74.3587,
      },
      isOpen: false,
      isOnlyBranch: true,
      settings: {
        allowedOrderTypes: [],
        allowedPaymentMethods: ['COD', 'CARD_ON_DELIVERY', 'PAYPAL', 'WALLET'],
      },
      scheduleTimings: {
        timezone: 'Europe/Berlin',
        openingHours: [
          {
            dayOfWeek: 'MONDAY',
            isClosed: false,
            openTime: '09:00',
            closeTime: '18:00',
          },
        ],
        deliveryHours: [
          {
            dayOfWeek: 'MONDAY',
            isClosed: false,
            openTime: '12:00',
            closeTime: '22:00',
          },
        ],
        holidayOpeningHours: [
          {
            date: '2026-06-09',
            isClosed: false,
            openTime: '18:00',
            closeTime: '20:00',
            note: 'Custom date hours',
          },
        ],
        deliveryIntervalMinutes: 20,
        pickupIntervalMinutes: 10,
      },
      tableReservationsEnabled: true,
    });
    jest.useRealTimers();
  });

  it('keeps home screen cuisine and promotion payloads compact', async () => {
    const { service, repository, couponsService } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: null,
      coverImage: null,
      tagline: null,
      bio: null,
      socialMedia: null,
      supportContact: null,
      branding: null,
      settings: {},
    });
    repository.findBranchPublicContent.mockResolvedValue(null);
    repository.listCuisineCategories.mockResolvedValue({
      items: [
        {
          id: 'cuisine-1',
          name: 'American',
          slug: 'american',
          description: null,
          imageUrl: 'cuisine.png',
          sortOrder: 0,
          _count: { items: 3 },
          categoryIds: ['category-1'],
        },
      ],
      total: 1,
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

    const result = await service.getHomeScreen({
      restaurantId: 'restaurant-1',
      promotionLimit: 8,
      cuisineLimit: 12,
    });

    expect(repository.listCuisineCategories).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId: 'restaurant-1',
        page: 1,
        limit: 12,
      }),
      { includeItems: false },
    );
    expect(result.data.cuisines[0]).toEqual(
      expect.objectContaining({
        id: 'cuisine-1',
        name: 'American',
        itemCount: 3,
      }),
    );
    expect(result.data.cuisines[0]).not.toHaveProperty('items');
    expect(result.data.promotionalItems[0]).toEqual(
      expect.objectContaining({
        id: 'item-1',
        name: 'Zinger Burger',
        slug: 'zinger-burger',
        discountedBasePrice: 719.1,
        category: {
          id: 'category-1',
          name: 'Burgers',
          imageUrl: 'https://cdn.example.com/category.png',
        },
      }),
    );
    expect(result.data.promotionalItems[0]).not.toHaveProperty('modifiers');
    expect(result.data.promotionalItems[0].variations).toEqual([
      expect.objectContaining({
        id: 'variation-1',
        name: 'Large',
        price: new Prisma.Decimal(899),
      }),
    ]);
    expect(result.data.promotionalItems[0].variations[0]).not.toHaveProperty(
      'itemPriceOverrides',
    );
    expect(result.data.promotionalItems[0]).not.toHaveProperty('restaurant');
  });

  it('loads broad happy hour items on the home screen', async () => {
    const { service, repository, couponsService } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: null,
      coverImage: null,
      tagline: null,
      bio: null,
      socialMedia: null,
      supportContact: null,
      branding: null,
      settings: {},
    });
    repository.findBranchPublicContent.mockResolvedValue(null);
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
    repository.listPromotionalItems.mockResolvedValue([itemFixture]);
    couponsService.getActiveHappyHours.mockResolvedValue([
      {
        id: 'happy-1',
        kind: 'HAPPY_HOUR',
        title: 'All items happy hour',
        description: '20% off everything',
        imageUrl: 'happy.png',
        applyMode: 'SCOPED_ITEMS',
        discountType: 'PERCENTAGE',
        discountValue: new Prisma.Decimal(20),
        maxDiscountAmount: null,
        startsAt: new Date('2026-06-01T00:00:00.000Z'),
        expiresAt: new Date('2026-06-30T23:59:59.000Z'),
        activeDays: [0, 1, 2, 3, 4, 5, 6],
        dailyStartTime: '12:00',
        dailyEndTime: '14:00',
        scopeMenuItem: null,
        scopeMenuItems: [],
        scopeCategory: null,
        scopeCategories: [],
      },
    ]);

    const result = await service.getHomeScreen({
      restaurantId: 'restaurant-1',
      promotionLimit: 8,
      cuisineLimit: 12,
    });

    expect(repository.listPromotionalItems).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: 'restaurant-1' }),
      { menuItemIds: [], categoryIds: [], includeDetails: false },
    );
    const [promotionalItem] = result.data.promotionalItems as Array<{
      id: string;
      happyHourDiscountedBasePrice: number | null;
      happyHour: {
        id: string;
        title: string;
        originalPrice: number;
        discountedPrice: number;
      } | null;
    }>;
    expect(promotionalItem).toMatchObject({
      id: 'item-1',
      happyHourDiscountedBasePrice: 639.2,
    });
    expect(promotionalItem?.happyHour).toMatchObject({
      id: 'happy-1',
      title: 'All items happy hour',
      originalPrice: 799,
      discountedPrice: 639.2,
    });

    const [cuisine] = result.data.cuisines as Array<{
      id: string;
      happyHour: { id: string } | null;
    }>;
    expect(cuisine).toMatchObject({ id: 'category-1' });
    expect(cuisine?.happyHour).toMatchObject({ id: 'happy-1' });
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

  it('uses global currency config on home screen when restaurant settings include another currency', async () => {
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

    expect(result.data.config).toEqual({
      currency: 'PKR',
      timezone: 'Europe/Berlin',
      branding: {},
    });
  });

  it('includes schedule timezone on customer app home screen', async () => {
    const { service, repository, globalSettingsService } = makeService();
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
      settings: {},
    });
    repository.findBranchPublicContent.mockResolvedValue({
      id: 'branch-1',
      name: 'Main Branch',
      logoUrl: null,
      coverImage: null,
      description: null,
      settings: {
        openingHours: [],
        deliveryHours: [],
      },
    });
    repository.listCuisineCategories.mockResolvedValue({ items: [], total: 0 });
    repository.listPromotionalItems.mockResolvedValue([]);
    globalSettingsService.getSettings.mockResolvedValue({
      data: { timezone: 'Europe/Berlin' },
    });

    const result = await service.getHomeScreen({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      promotionLimit: 8,
      cuisineLimit: 12,
    });

    expect(result.data.config.timezone).toBe('Europe/Berlin');
    expect(result.data.branch?.scheduleTimings.timezone).toBe('Europe/Berlin');
  });

  it('falls back to global default currency on home screen', async () => {
    const { service, repository, globalSettingsService } = makeService();
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
      settings: {},
    });
    repository.listCuisineCategories.mockResolvedValue({ items: [], total: 0 });
    repository.listPromotionalItems.mockResolvedValue([]);
    repository.findBranchPublicContent.mockResolvedValue(null);
    globalSettingsService.getDefaultCurrencyCode.mockResolvedValue('AED');

    const result = await service.getHomeScreen({
      restaurantId: 'restaurant-1',
      promotionLimit: 8,
      cuisineLimit: 12,
    });

    expect(result.data.config).toEqual({
      currency: 'AED',
      timezone: 'Europe/Berlin',
      branding: {},
    });
  });

  it('returns public branch stats for customer web', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: null,
      coverImage: null,
      settings: {},
    });
    repository.findBranchPublicContent.mockResolvedValue({
      id: 'branch-1',
      name: 'Main Branch',
      logoUrl: null,
      coverImage: null,
      settings: {},
    });
    repository.getBranchPublicStats.mockResolvedValue({
      completedOrders: 120,
      activeMenuItems: 45,
      reviewCount: 18,
      averageRating: 4.72,
      fiveStarReviews: 14,
    });

    const result = await service.getBranchStats({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });

    expect(repository.getBranchPublicStats).toHaveBeenCalledWith(
      'restaurant-1',
      'branch-1',
    );
    expect(result.data).toEqual({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      branchName: 'Main Branch',
      completedOrders: 120,
      activeMenuItems: 45,
      reviewCount: 18,
      averageRating: 4.72,
      fiveStarReviews: 14,
    });
  });

  it('lists public reviews with pagination summary', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: null,
      coverImage: null,
      settings: {},
    });
    repository.listPublicReviews.mockResolvedValue({
      items: [
        {
          id: 'review-1',
          rating: 5,
          order: {
            id: 'order-1',
            items: [
              {
                id: 'order-item-1',
                menuItemName: 'Zinger Burger',
                quantity: 2,
              },
            ],
          },
        },
      ],
      total: 1,
      summary: { reviewCount: 1, averageRating: 5 },
    });

    const result = await service.listPublicReviews({
      restaurantId: 'restaurant-1',
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    });

    expect(repository.listPublicReviews).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: 'restaurant-1' }),
    );
    expect(result.data).toEqual({
      items: [
        {
          id: 'review-1',
          rating: 5,
          order: {
            id: 'order-1',
            items: [
              {
                id: 'order-item-1',
                menuItemName: 'Zinger Burger',
                quantity: 2,
              },
            ],
          },
        },
      ],
      summary: { reviewCount: 1, averageRating: 5 },
    });
    expect(result.meta).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });
  });

  it('uses customer token restaurant scope for privacy policy when query restaurantId is omitted', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      tenant: { id: 'tenant-1', name: 'Tenant Kitchen Group' },
      name: 'DeliveryWays Kitchen',
      coverImage: 'https://cdn.example.com/restaurant-cover.png',
      settings: {
        privacyPolicy: 'Privacy text',
        legalProfile: {
          businessAddress: {
            street: 'Street 12',
            area: 'Shop 4',
            city: 'Lahore',
            state: 'Punjab',
            country: 'Pakistan',
          },
        },
      },
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
    expect(result.data.restaurantName).toBe('DeliveryWays Kitchen');
    expect(result.data.tenantId).toBe('tenant-1');
    expect(result.data.tenantName).toBe('Tenant Kitchen Group');
    expect(result.data.legalProfile).toEqual({
      ownerName: 'Tenant Kitchen Group',
      legalBusinessName: null,
      taxNumber: null,
      businessAddress: {
        street: 'Street 12',
        area: 'Shop 4',
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
        shopNumber: 'Shop 4',
      },
      contractText: null,
    });
    expect(result.data.policyLink).toBe(
      '/api/v1/public-content/privacy-policy?restaurantId=restaurant-1',
    );
  });

  it('fetches restaurant-managed about us content for customer web', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      tenant: { id: 'tenant-1', name: 'Tenant Kitchen Group' },
      name: 'DeliveryWays Kitchen',
      coverImage: 'https://cdn.example.com/restaurant-cover.png',
      settings: {
        customerApp: {
          aboutUs: '<p>Fresh food from local chefs.</p>',
        },
      },
    });

    const result = await service.getAboutUs({ restaurantId: 'restaurant-1' });

    expect(repository.findRestaurantPublicContent).toHaveBeenCalledWith(
      'restaurant-1',
    );
    expect(result).toEqual({
      data: {
        restaurantId: 'restaurant-1',
        restaurantName: 'DeliveryWays Kitchen',
        tenantId: 'tenant-1',
        tenantName: 'Tenant Kitchen Group',
        restaurantCoverImage: 'https://cdn.example.com/restaurant-cover.png',
        title: 'About Us',
        content: '<p>Fresh food from local chefs.</p>',
      },
      message: 'About us fetched successfully',
    });
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
        settings: {
          tableCount: 2,
        },
      },
    ] as never);

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
    const { service, repository, notificationsService } = makeService({
      notifications: true,
    });
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
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        name: 'Main Branch',
        coverImage: 'cover.jpg',
        description: 'Downtown branch',
        settings: {
          tableCount: 2,
        },
      },
    ] as never);

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
    expect(
      notificationsService.notifyTableReservationCustomer,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        branchName: 'Main Branch',
        customerId: 'customer-1',
        reservationId: 'reservation-1',
        status: 'CONFIRMED',
        source: 'STATUS_UPDATED',
      }),
    );
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
    const { service, repository, notificationsService } = makeService({
      notifications: true,
    });
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
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
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
    expect(notificationsService.notifyTableReservationAdmin).toHaveBeenCalled();
    expect(
      notificationsService.notifyTableReservationCustomer,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        branchName: 'Main Branch',
        customerId: 'customer-1',
        reservationId: result.data.id,
        status: 'REQUESTED',
        source: 'CREATED',
      }),
    );
    expect(result.data.branchId).toBe('branch-1');
    expect(result.message).toBe('Table reservation created successfully');
  });

  it('falls back to token restaurant scope for legacy customer reservations', async () => {
    const { service, repository } = makeService();
    repository.findCustomerProfile.mockResolvedValue({
      id: 'customer-1',
      deletedAt: null,
      tenantId: null,
      restaurantId: null,
      branchId: null,
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
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
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
        guestCount: 2,
      },
    );

    expect(repository.findBranchPublicContent).toHaveBeenCalledWith(
      'branch-1',
      'restaurant-1',
    );
    expect(result.data.branchId).toBe('branch-1');
    expect(result.message).toBe('Table reservation created successfully');
  });

  it('auto-confirms table reservations when enabled and capacity is available', async () => {
    const { service, repository } = makeService();
    repository.findCustomerProfile.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@example.com',
      deletedAt: null,
      restaurantId: 'restaurant-1',
      profile: {
        firstName: 'Bilal',
        lastName: 'Shah',
        metadata: {
          customerApp: {
            tableReservations: [],
          },
        },
      },
    });
    repository.findBranchPublicContent.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      name: 'Main Branch',
      settings: {
        tableReservationsEnabled: true,
        tableReservationAutoAccept: true,
        tableCount: 2,
      },
    });
    repository.findCustomersForTableReservations.mockResolvedValue([
      {
        id: 'customer-2',
        email: 'other@example.com',
        profile: {
          firstName: 'Other',
          lastName: 'Customer',
          phone: null,
          avatarUrl: null,
          metadata: {
            customerApp: {
              tableReservations: [
                {
                  id: 'reservation-existing',
                  branchId: 'branch-1',
                  reservationDate: '2099-03-30T19:30:00.000Z',
                  guestCount: 2,
                  note: null,
                  status: 'CONFIRMED',
                  createdAt: '2099-03-29T10:00:00.000Z',
                  cancelledAt: null,
                },
              ],
            },
          },
        },
      },
    ]);

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
      },
    );

    expect(result.data.status).toBe('CONFIRMED');
  });

  it('keeps auto-accept reservations requested when table capacity is full', async () => {
    const { service, repository } = makeService();
    repository.findCustomerProfile.mockResolvedValue({
      id: 'customer-1',
      deletedAt: null,
      restaurantId: 'restaurant-1',
      profile: { metadata: { customerApp: { tableReservations: [] } } },
    });
    repository.findBranchPublicContent.mockResolvedValue({
      id: 'branch-1',
      name: 'Main Branch',
      settings: {
        tableReservationsEnabled: true,
        tableReservationAutoAccept: true,
        tableCount: 1,
      },
    });
    repository.findCustomersForTableReservations.mockResolvedValue([
      {
        id: 'customer-2',
        email: 'other@example.com',
        profile: {
          metadata: {
            customerApp: {
              tableReservations: [
                {
                  id: 'reservation-existing',
                  branchId: 'branch-1',
                  reservationDate: '2099-03-30T19:30:00.000Z',
                  guestCount: 2,
                  status: 'CONFIRMED',
                  createdAt: '2099-03-29T10:00:00.000Z',
                },
              ],
            },
          },
        },
      },
    ]);

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
      },
    );

    expect(result.data.status).toBe('REQUESTED');
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
