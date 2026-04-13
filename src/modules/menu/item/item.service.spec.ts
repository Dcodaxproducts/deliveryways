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
      softDelete: jest.fn(),
    };

    const prisma = {
      restaurant: {
        findFirst: jest.fn(),
      },
      menuCategory: {
        findFirst: jest.fn(),
      },
    };

    const service = new MenuItemService(
      itemRepository as never,
      prisma as never,
    );

    return { service, itemRepository, prisma };
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
});
