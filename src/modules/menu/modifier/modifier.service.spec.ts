import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRoleEnum } from '../../../common/enums';
import { ModifierService } from './modifier.service';

describe('ModifierService', () => {
  const makeService = () => {
    const modifierRepository = {
      listGroups: jest.fn(),
      listModifiers: jest.fn(),
      findGroupById: jest.fn(),
      findModifierByGroupAndName: jest.fn(),
      createModifier: jest.fn(),
      findModifierById: jest.fn(),
      updateModifier: jest.fn(),
      attachGroupToCategory: jest.fn(),
      listCategoryGroups: jest.fn(),
      deleteGroupItemLinks: jest.fn(),
      deleteGroupModifiers: jest.fn(),
      hardDeleteGroup: jest.fn(),
      hardDeleteModifier: jest.fn(),
    };

    const prisma = {
      restaurant: {
        findFirst: jest.fn(),
      },
      menuCategory: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(callback({})),
      ),
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

  it('rejects duplicate modifier names in the same group before hitting the database', async () => {
    const { service, modifierRepository } = makeService();
    modifierRepository.findGroupById.mockResolvedValue({
      id: 'group-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    modifierRepository.findModifierByGroupAndName.mockResolvedValue({
      id: 'modifier-1',
    });

    await expect(
      service.createModifier(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          rid: undefined,
          role: UserRoleEnum.SUPER_ADMIN,
        },
        {
          modifierGroupId: 'group-1',
          name: ' Extra Cheese ',
          priceDelta: 50,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(modifierRepository.findModifierByGroupAndName).toHaveBeenCalledWith(
      'group-1',
      'Extra Cheese',
    );
    expect(modifierRepository.createModifier).not.toHaveBeenCalled();
  });

  it('hard deletes modifier groups with linked config records', async () => {
    const { service, modifierRepository } = makeService();
    modifierRepository.findGroupById.mockResolvedValue({
      id: 'group-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    modifierRepository.hardDeleteGroup.mockResolvedValue({ id: 'group-1' });

    const result = await service.removeGroup(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'group-1',
    );

    expect(modifierRepository.deleteGroupItemLinks).toHaveBeenCalledWith(
      'group-1',
      expect.anything(),
    );
    expect(modifierRepository.deleteGroupModifiers).toHaveBeenCalledWith(
      'group-1',
      expect.anything(),
    );
    expect(modifierRepository.hardDeleteGroup).toHaveBeenCalledWith(
      'group-1',
      expect.anything(),
    );
    expect(result.message).toBe('Modifier group deleted successfully');
  });

  it('hard deletes modifiers directly', async () => {
    const { service, modifierRepository } = makeService();
    modifierRepository.findModifierById.mockResolvedValue({
      id: 'modifier-1',
      modifierGroupId: 'group-1',
      deletedAt: null,
    });
    modifierRepository.findGroupById.mockResolvedValue({
      id: 'group-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    modifierRepository.hardDeleteModifier.mockResolvedValue({
      id: 'modifier-1',
    });

    const result = await service.removeModifier(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'modifier-1',
    );

    expect(modifierRepository.hardDeleteModifier).toHaveBeenCalledWith(
      'modifier-1',
    );
    expect(result.message).toBe('Modifier deleted successfully');
  });

  it('attaches modifier group to category in same restaurant', async () => {
    const { service, modifierRepository, prisma } = makeService();
    prisma.menuCategory.findUnique.mockResolvedValue({
      id: 'category-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    modifierRepository.findGroupById.mockResolvedValue({
      id: 'group-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    modifierRepository.attachGroupToCategory.mockResolvedValue({
      id: 'link-1',
    });

    const result = await service.attachGroupToCategory(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'category-1',
      'group-1',
      { sortOrder: 1 },
    );

    expect(modifierRepository.attachGroupToCategory).toHaveBeenCalledWith(
      'category-1',
      'group-1',
      1,
    );
    expect(result.message).toBe(
      'Modifier group attached to category successfully',
    );
  });
});
