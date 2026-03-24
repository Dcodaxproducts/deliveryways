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
  });

  it('populates restaurant on promotional items', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'DeliveryWays Kitchen',
      logoUrl: 'https://cdn.example.com/logo.png',
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
});
