import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
        restaurantId: 'restaurant-1',
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
        restaurantId: 'restaurant-1',
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
      },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { variationId: 'variation-1', menuItemId: null },
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

  it('stores exact variation price during create', async () => {
    const { service, variationRepository, prisma } = makeService();

    prisma.modifier.count.mockResolvedValue(0);
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    variationRepository.create.mockResolvedValue({
      id: 'variation-1',
      price: new Prisma.Decimal(250),
    });

    const result = await service.create(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        restaurantId: 'restaurant-1',
        name: 'Large',
        price: 250,
      },
    );

    const createCalls = variationRepository.create.mock.calls as Array<
      [
        {
          price: Prisma.Decimal;
        },
      ]
    >;
    const [createInput] = createCalls[0];

    expect(createInput.price).toBeInstanceOf(Prisma.Decimal);
    expect(Number(createInput.price)).toBe(250);
    expect(Number(result.data.price)).toBe(250);
  });

  it('returns exact variation prices in list responses', async () => {
    const { service, variationRepository, prisma } = makeService();

    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    variationRepository.list.mockResolvedValue({
      items: [
        {
          id: 'variation-1',
          price: new Prisma.Decimal(300),
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
        sortBy: 'sortOrder',
        sortOrder: 'asc',
      },
    );

    expect(Number(result.data[0].price)).toBe(300);
  });

  it('blocks business admin variation write outside tenant restaurants', async () => {
    const { service, prisma } = makeService();
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
          restaurantId: 'restaurant-1',
          name: 'Large',
          price: 100,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws when restaurant context is missing', async () => {
    const { service } = makeService();
    await expect(
      service.create(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        {
          name: 'Large',
          price: 100,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
