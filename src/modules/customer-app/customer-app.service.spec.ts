import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRoleEnum } from '../../common/enums';
import { CustomerAppService } from './customer-app.service';

describe('CustomerAppService', () => {
  const itemFixture = {
    id: 'item-1',
    name: 'Zinger Burger',
    slug: 'zinger-burger',
    description: 'Crispy chicken burger',
    imageUrl: 'https://cdn.example.com/zinger.png',
    basePrice: 799,
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
          modifiers: [
            {
              id: 'modifier-1',
              name: 'Extra Cheese',
              priceDelta: 100,
            },
          ],
        },
      },
    ],
    branchOverrides: [],
  };

  const makeService = () => {
    const repository = {
      findCustomerProfile: jest.fn(),
      findActiveCustomer: jest.fn(),
      upsertCustomerProfile: jest.fn(),
      findFavoriteMenuItems: jest.fn(),
      findRestaurantPublicContent: jest.fn(),
      findBranchPublicContent: jest.fn(),
      listCuisineCategories: jest.fn(),
      findPublicCuisine: jest.fn(),
      listCuisineMenuItems: jest.fn(),
      listPromotionalItems: jest.fn(),
      findPublicMenuItemBySlug: jest.fn(),
    };

    const service = new CustomerAppService(repository as never);
    return { service, repository };
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
          { question: 'Restaurant question', answer: 'Restaurant answer' },
        ],
      },
    });
    repository.findBranchPublicContent.mockResolvedValue({
      id: 'branch-1',
      settings: {
        faqs: [{ question: 'Branch question', answer: 'Branch answer' }],
      },
    });

    const result = await service.getFaqs({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });

    expect(result.data.items).toEqual([
      { question: 'Branch question', answer: 'Branch answer' },
    ]);
    expect(result.data.restaurantCoverImage).toBe(
      'https://cdn.example.com/restaurant-cover.png',
    );
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
    expect(result.data[0].modifierGroups).toEqual([
      {
        id: 'group-1',
        name: 'Toppings',
        minSelect: 0,
        maxSelect: 3,
        isRequired: false,
        sortOrder: 1,
        modifiers: [
          {
            id: 'modifier-1',
            name: 'Extra Cheese',
            priceDelta: 100,
          },
        ],
      },
    ]);
  });

  it('fetches public item by slug with modifier groups', async () => {
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
    expect(result.data.modifierGroups).toHaveLength(1);
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
    repository.findBranchPublicContent.mockResolvedValue(null);

    const result = await service.getHomeScreen({
      restaurantId: 'restaurant-1',
      promotionLimit: 8,
      cuisineLimit: 12,
    });

    expect(result.data.restaurant.coverImage).toBe(
      'https://cdn.example.com/restaurant-cover.png',
    );
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

  it('returns loyalty points from customer profile metadata', async () => {
    const { service, repository } = makeService();
    repository.findCustomerProfile.mockResolvedValue({
      id: 'customer-1',
      deletedAt: null,
      profile: {
        metadata: {
          customerApp: {
            loyaltyPoints: 240,
            loyaltyRedeemedPoints: 60,
          },
        },
      },
    });

    const result = await service.getLoyaltyPoints({
      uid: 'customer-1',
      rid: 'restaurant-1',
      tid: 'tenant-1',
      role: UserRoleEnum.CUSTOMER,
    });

    expect(result.data).toEqual({
      customerId: 'customer-1',
      availablePoints: 240,
      redeemedPoints: 60,
    });
  });

  it('redeems loyalty points and updates metadata', async () => {
    const { service, repository } = makeService();
    repository.findCustomerProfile.mockResolvedValue({
      id: 'customer-1',
      deletedAt: null,
      restaurantId: 'restaurant-1',
      profile: {
        metadata: {
          customerApp: {
            loyaltyPoints: 300,
            loyaltyRedeemedPoints: 20,
          },
        },
      },
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

    expect(repository.upsertCustomerProfile).toHaveBeenCalled();
    expect(result.data.remainingPoints).toBe(200);
    expect(result.message).toBe('Loyalty points redeemed successfully');
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
