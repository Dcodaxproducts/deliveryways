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
      countChildren: jest.fn(),
      countItems: jest.fn(),
      clearCouponScopes: jest.fn(),
      deleteBranchOverrides: jest.fn(),
      hardDelete: jest.fn(),
    };

    const prisma = {
      restaurant: {
        findFirst: jest.fn(),
      },
      menuCategory: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(callback({})),
      ),
    };

    const storageService = {
      resolveMediaUrlsDeep: jest.fn((value) => Promise.resolve(value)),
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

  it('hard deletes category after clearing simple references', async () => {
    const { service, categoryRepository } = makeService();
    categoryRepository.findById.mockResolvedValue({
      id: 'category-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    categoryRepository.countChildren.mockResolvedValue(0);
    categoryRepository.countItems.mockResolvedValue(0);
    categoryRepository.hardDelete.mockResolvedValue({ id: 'category-1' });

    const result = await service.remove(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'category-1',
    );

    expect(categoryRepository.clearCouponScopes).toHaveBeenCalledWith(
      'category-1',
      expect.anything(),
    );
    expect(categoryRepository.deleteBranchOverrides).toHaveBeenCalledWith(
      'category-1',
      expect.anything(),
    );
    expect(categoryRepository.hardDelete).toHaveBeenCalledWith(
      'category-1',
      expect.anything(),
    );
    expect(result.message).toBe('Menu category deleted successfully');
  });

  it('blocks permanent category delete when items exist', async () => {
    const { service, categoryRepository } = makeService();
    categoryRepository.findById.mockResolvedValue({
      id: 'category-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    categoryRepository.countChildren.mockResolvedValue(0);
    categoryRepository.countItems.mockResolvedValue(2);

    await expect(
      service.remove(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.SUPER_ADMIN,
        },
        'category-1',
      ),
    ).rejects.toThrow(
      'Menu category cannot be permanently deleted while menu items exist',
    );
  });

  it('includes category-level modifier groups in list responses', async () => {
    const { service, categoryRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    categoryRepository.list.mockResolvedValue({
      items: [
        {
          id: 'category-1',
          name: 'Burgers',
          slug: 'burgers',
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
                modifiers: [
                  {
                    id: 'modifier-1',
                    name: 'Large',
                    priceDelta: 0,
                  },
                ],
              },
            },
          ],
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
        modifierGroups: [
          expect.objectContaining({
            id: 'group-1',
            name: 'Size',
          }),
        ],
      }),
    );
  });
});
