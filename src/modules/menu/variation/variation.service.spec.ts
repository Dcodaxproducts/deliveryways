import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
      menuCategory: { findUnique: jest.fn() },
      modifier: { count: jest.fn() },
      restaurant: { findFirst: jest.fn() },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            menuVariationModifierPriceOverride: {
              deleteMany: jest.fn(),
              createMany: jest.fn(),
            },
            menuItem: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            menuItemVariationPriceOverride: {
              createMany: jest.fn(),
            },
          }),
        ),
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
    prisma.menuCategory.findUnique.mockResolvedValue({
      id: 'category-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    prisma.modifier.count.mockResolvedValue(0);
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    variationRepository.create.mockResolvedValue({ id: 'variation-1' });

    const result = await service.create(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        categoryId: 'category-1',
        name: 'Large',
        description: 'Best for sharing',
        price: 100,
      },
    );

    expect(prisma.restaurant.findFirst).toHaveBeenCalledWith({
      where: { id: 'restaurant-1', tenantId: 'tenant-1', deletedAt: null },
      select: { id: true },
    });
    expect(variationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Large',
        description: 'Best for sharing',
      }),
      expect.anything(),
    );
    expect(result.message).toBe('Menu variation created successfully');
  });

  it('stores variation-based modifier price overrides during create', async () => {
    const { service, variationRepository, prisma } = makeService();
    const deleteMany = jest.fn();
    const createMany = jest.fn();

    prisma.menuCategory.findUnique.mockResolvedValue({
      id: 'category-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    prisma.modifier.count.mockResolvedValue(2);
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            menuVariationModifierPriceOverride: {
              deleteMany,
              createMany,
            },
            menuItem: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            menuItemVariationPriceOverride: {
              createMany: jest.fn(),
            },
          }),
        ),
    );
    variationRepository.create.mockResolvedValue({ id: 'variation-1' });

    await service.create(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        categoryId: 'category-1',
        name: 'Large',
        price: 100,
        modifierPriceOverrides: [
          { modifierId: 'modifier-1', priceDelta: 50 },
          { modifierId: 'modifier-2', priceDelta: 80 },
        ],
      },
    );

    expect(prisma.modifier.count).toHaveBeenCalledWith({
      where: {
        id: { in: ['modifier-1', 'modifier-2'] },
        deletedAt: null,
        restaurantId: 'restaurant-1',
        groupLinks: {
          some: {
            modifierGroup: {
              restaurantId: 'restaurant-1',
              deletedAt: null,
            },
          },
        },
      },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { variationId: 'variation-1' },
    });
    expect(createMany).toHaveBeenCalledTimes(1);
    const [createManyArg] = createMany.mock.calls[0] as [
      {
        data: Array<{
          variationId: string;
          modifierId: string;
          priceDelta: unknown;
        }>;
      },
    ];
    expect(createManyArg.data).toHaveLength(2);
    expect(createManyArg.data[0]).toMatchObject({
      variationId: 'variation-1',
      modifierId: 'modifier-1',
    });
    expect(createManyArg.data[1]).toMatchObject({
      variationId: 'variation-1',
      modifierId: 'modifier-2',
    });
  });

  it('stores percentage-based variation pricing during create', async () => {
    const { service, variationRepository, prisma } = makeService();

    prisma.menuCategory.findUnique.mockResolvedValue({
      id: 'category-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    prisma.modifier.count.mockResolvedValue(0);
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    variationRepository.create.mockResolvedValue({
      id: 'variation-1',
      pricingMode: 'PERCENTAGE_ADJUSTMENT',
      price: new Prisma.Decimal(100),
      adjustmentValue: new Prisma.Decimal(10),
    });

    const result = await service.create(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        categoryId: 'category-1',
        name: 'Large',
        pricingMode: 'PERCENTAGE_ADJUSTMENT',
        adjustmentValue: 10,
      },
    );

    const createCalls = variationRepository.create.mock.calls as Array<
      [
        {
          pricingMode: string;
          adjustmentValue: Prisma.Decimal;
        },
      ]
    >;
    const [createInput] = createCalls[0];

    expect(createInput.pricingMode).toBe('PERCENTAGE_ADJUSTMENT');
    expect(createInput.adjustmentValue).toBeInstanceOf(Prisma.Decimal);
    expect(result.data.price).toBeNull();
  });

  it('hides raw price for non-fixed variations in list responses', async () => {
    const { service, variationRepository, prisma } = makeService();

    prisma.menuCategory.findUnique.mockResolvedValue({
      id: 'category-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    variationRepository.list.mockResolvedValue({
      items: [
        {
          id: 'variation-1',
          pricingMode: 'FLAT_ADJUSTMENT',
          price: new Prisma.Decimal(100),
          adjustmentValue: new Prisma.Decimal(50),
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
        categoryId: 'category-1',
        page: 1,
        limit: 10,
        sortBy: 'sortOrder',
        sortOrder: 'asc',
      },
    );

    expect(result.data[0].price).toBeNull();
  });

  it('blocks business admin variation write outside tenant restaurants', async () => {
    const { service, prisma } = makeService();
    prisma.menuCategory.findUnique.mockResolvedValue({
      id: 'category-1',
      restaurantId: 'restaurant-2',
      deletedAt: null,
    });
    prisma.modifier.count.mockResolvedValue(0);
    prisma.restaurant.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        {
          categoryId: 'category-1',
          name: 'Large',
          price: 100,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws when menu item is missing', async () => {
    const { service, prisma } = makeService();
    prisma.menuCategory.findUnique.mockResolvedValue(null);

    await expect(
      service.create(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        {
          categoryId: 'missing-category',
          name: 'Large',
          price: 100,
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
