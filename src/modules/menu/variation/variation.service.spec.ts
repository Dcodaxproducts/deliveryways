import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRoleEnum } from '../../../common/enums';
import { MenuVariationService } from './variation.service';

describe('MenuVariationService', () => {
  const makeService = () => {
    const variationRepository = {
      resetDefaults: jest.fn(),
      create: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };

    const prisma = {
      menuItem: { findUnique: jest.fn() },
      restaurant: { findFirst: jest.fn() },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(callback({})),
      ),
    };

    const service = new MenuVariationService(
      variationRepository as never,
      prisma as never,
    );

    return { service, variationRepository, prisma };
  };

  it('allows business admin to create variation for a tenant restaurant even when token rid is null', async () => {
    const { service, variationRepository, prisma } = makeService();
    prisma.menuItem.findUnique.mockResolvedValue({
      id: 'item-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    variationRepository.create.mockResolvedValue({ id: 'variation-1' });

    const result = await service.create(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        menuItemId: 'item-1',
        name: 'Large',
        price: 100,
      },
    );

    expect(prisma.restaurant.findFirst).toHaveBeenCalledWith({
      where: { id: 'restaurant-1', tenantId: 'tenant-1', deletedAt: null },
      select: { id: true },
    });
    expect(variationRepository.create).toHaveBeenCalled();
    expect(result.message).toBe('Menu variation created successfully');
  });

  it('blocks business admin variation write outside tenant restaurants', async () => {
    const { service, prisma } = makeService();
    prisma.menuItem.findUnique.mockResolvedValue({
      id: 'item-1',
      restaurantId: 'restaurant-2',
      deletedAt: null,
    });
    prisma.restaurant.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        {
          menuItemId: 'item-1',
          name: 'Large',
          price: 100,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws when menu item is missing', async () => {
    const { service, prisma } = makeService();
    prisma.menuItem.findUnique.mockResolvedValue(null);

    await expect(
      service.create(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        {
          menuItemId: 'missing-item',
          name: 'Large',
          price: 100,
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
