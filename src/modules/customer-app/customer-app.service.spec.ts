import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    restaurant: {
      id: 'restaurant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: 'https://cdn.example.com/logo.png',
      tagline: 'Fresh food fast',
    },
    category: {
      id: 'category-1',
      name: 'Burgers',
      imageUrl: 'https://cdn.example.com/category.png',
    },
    variations: [],
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

    const service = new CustomerAppService(
      repository as never,
      storageService as never,
      loyaltyWalletService as never,
      paymentsService as never,
    );
    return { service, repository, loyaltyWalletService, paymentsService };
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
    const { service, repository } = makeService();
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

    const result = await service.listPromotionalItems({
      restaurantId: 'restaurant-1',
      limit: 10,
    });

    expect(result.data[0].restaurant).toEqual(itemFixture.restaurant);
    expect(result.data[0].depositAmount).toBe(100);
    expect('modifierGroups' in result.data[0]).toBe(false);
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
    expect(result.data.config).toEqual({ currency: null });
    expect(result.data.branch).toEqual({
      id: 'branch-1',
      name: 'Main Branch',
      logoUrl: null,
      coverImage: 'branch-cover.jpg',
      description: 'Downtown branch',
      tableReservationsEnabled: true,
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

    expect(result.data.config).toEqual({ currency: 'SAR' });
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
    const { service, repository } = makeService();
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
