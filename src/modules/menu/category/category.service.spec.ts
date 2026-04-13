import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRoleEnum } from '../../../common/enums';
import { MenuCategoryService } from './category.service';

describe('MenuCategoryService', () => {
  const makeService = () => {
    const categoryRepository = {
      create: jest.fn(),
      createMany: jest.fn(),
      findById: jest.fn(),
      findByRestaurantAndSlug: jest.fn(),
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

    const storageService = {
      resolveMediaUrlsDeep: jest.fn(async (value) => value),
    };

    const service = new MenuCategoryService(
      categoryRepository as never,
      prisma as never,
      storageService as never,
    );

    return { service, categoryRepository, prisma };
  };

  it('rejects duplicate category slug before hitting the database', async () => {
    const { service, categoryRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    categoryRepository.findByRestaurantAndSlug.mockResolvedValue({
      id: 'category-1',
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
          name: 'Burgers',
          slug: ' burgers ',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(categoryRepository.findByRestaurantAndSlug).toHaveBeenCalledWith(
      'restaurant-1',
      'burgers',
      undefined,
    );
    expect(categoryRepository.create).not.toHaveBeenCalled();
  });

  it('allows updating a category with its own slug', async () => {
    const { service, categoryRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    categoryRepository.findById.mockResolvedValue({
      id: 'category-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    categoryRepository.findByRestaurantAndSlug.mockResolvedValue(null);
    categoryRepository.update.mockResolvedValue({
      id: 'category-1',
      restaurantId: 'restaurant-1',
      slug: 'burgers',
    });

    await expect(
      service.update(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        'category-1',
        {
          slug: ' burgers ',
        },
      ),
    ).resolves.toEqual({
      data: {
        id: 'category-1',
        restaurantId: 'restaurant-1',
        slug: 'burgers',
      },
      message: 'Menu category updated successfully',
    });

    expect(categoryRepository.findByRestaurantAndSlug).toHaveBeenCalledWith(
      'restaurant-1',
      'burgers',
      'category-1',
    );
  });

  it('surfaces soft-deleted category slug conflicts clearly', async () => {
    const { service, categoryRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    categoryRepository.findByRestaurantAndSlug.mockResolvedValue({
      id: 'category-2',
      deletedAt: new Date('2026-04-13T00:00:00.000Z'),
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
          name: 'Burgers',
          slug: 'burgers',
        },
      ),
    ).rejects.toThrow(
      'A menu category with this slug already exists in this restaurant, including a deleted category',
    );
  });

  it('blocks customer writes outside category permissions', async () => {
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
          name: 'Burgers',
          slug: 'burgers',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
