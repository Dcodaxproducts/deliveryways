import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRoleEnum } from '../../common/enums';
import { CustomerAppService } from './customer-app.service';

describe('CustomerAppService', () => {
  const makeService = () => {
    const repository = {
      findCustomerProfile: jest.fn(),
      findActiveCustomer: jest.fn(),
      upsertCustomerProfile: jest.fn(),
      findFavoriteMenuItems: jest.fn(),
      findRestaurantPublicContent: jest.fn(),
      findBranchPublicContent: jest.fn(),
      listCuisineCategories: jest.fn(),
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

  it('throws when public restaurant is missing', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantPublicContent.mockResolvedValue(null);

    await expect(
      service.getPrivacyPolicy({ restaurantId: 'missing-restaurant' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
