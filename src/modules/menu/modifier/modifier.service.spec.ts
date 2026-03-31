import { ForbiddenException } from '@nestjs/common';
import { UserRoleEnum } from '../../../common/enums';
import { ModifierService } from './modifier.service';

describe('ModifierService', () => {
  const makeService = () => {
    const modifierRepository = {
      listGroups: jest.fn(),
      listModifiers: jest.fn(),
    };

    const prisma = {
      restaurant: {
        findFirst: jest.fn(),
      },
    };

    const service = new ModifierService(
      modifierRepository as never,
      prisma as never,
    );

    return { service, modifierRepository, prisma };
  };

  it('lists modifiers for business admin using requested restaurantId in tenant', async () => {
    const { service, modifierRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    modifierRepository.listModifiers.mockResolvedValue({
      items: [{ id: 'modifier-1', name: 'Extra Cheese' }],
      total: 1,
    });

    const result = await service.listModifiers(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        rid: undefined,
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

    expect(modifierRepository.listModifiers).toHaveBeenCalledWith(
      'restaurant-1',
      expect.objectContaining({ restaurantId: 'restaurant-1' }),
    );
    expect(result.message).toBe('Modifiers fetched successfully');
    expect(result.data).toHaveLength(1);
  });

  it('blocks customer from listing modifiers outside their restaurant scope', async () => {
    const { service } = makeService();

    await expect(
      service.listModifiers(
        {
          uid: 'customer-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          restaurantId: 'restaurant-2',
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
