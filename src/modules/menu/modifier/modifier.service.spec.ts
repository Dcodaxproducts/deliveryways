import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRoleEnum } from '../../../common/enums';
import { ModifierService } from './modifier.service';

describe('ModifierService', () => {
  const makeService = () => {
    const modifierRepository = {
      listGroups: jest.fn(),
      listModifiers: jest.fn(),
      findGroupById: jest.fn(),
      findGroupsByIds: jest.fn(),
      createGroup: jest.fn(),
      updateGroup: jest.fn(),
      findModifierByRestaurantAndName: jest.fn(),
      createModifier: jest.fn(),
      findModifierById: jest.fn(),
      updateModifier: jest.fn(),
      attachGroupToCategory: jest.fn(),
      listCategoryGroups: jest.fn(),
      listGroupCategories: jest.fn(),
      syncGroupCategories: jest.fn(),
      deleteGroupItemLinks: jest.fn(),
      deleteGroupCategoryLinks: jest.fn(),
      deleteGroupModifierLinks: jest.fn(),
      hardDeleteGroup: jest.fn(),
      hardDeleteModifier: jest.fn(),
      attachModifierToGroup: jest.fn(),
      syncModifierGroups: jest.fn(),
    };

    const prisma = {
      restaurant: {
        findFirst: jest.fn(),
      },
      menuCategory: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
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

  it('normalizes free modifier groups to optional single selection', async () => {
    const { service, modifierRepository } = makeService();
    modifierRepository.createGroup.mockResolvedValue({
      id: 'group-1',
      name: 'Sauces',
      description: null,
      minSelect: 0,
      maxSelect: 1,
      isRequired: false,
      sortOrder: 0,
      isActive: true,
    });

    const result = await service.createGroup(
      { uid: 'admin-1', role: UserRoleEnum.SUPER_ADMIN },
      {
        restaurantId: 'restaurant-1',
        name: 'Sauces',
        minSelect: 2,
        maxSelect: 5,
        isRequired: false,
      },
    );

    expect(modifierRepository.createGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        minSelect: 0,
        maxSelect: 1,
        isRequired: false,
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        minSelect: 0,
        maxSelect: 1,
        isRequired: false,
        selectionType: 'FREE',
      }),
    );
  });

  it('uses min and max only when modifier group is required', async () => {
    const { service, modifierRepository } = makeService();
    modifierRepository.createGroup.mockResolvedValue({
      id: 'group-1',
      name: 'Required Sides',
      description: null,
      minSelect: 1,
      maxSelect: 2,
      isRequired: true,
      sortOrder: 0,
      isActive: true,
    });

    const result = await service.createGroup(
      { uid: 'admin-1', role: UserRoleEnum.SUPER_ADMIN },
      {
        restaurantId: 'restaurant-1',
        name: 'Required Sides',
        minSelect: 1,
        maxSelect: 2,
        isRequired: true,
      },
    );

    expect(modifierRepository.createGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        minSelect: 1,
        maxSelect: 2,
        isRequired: true,
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        minSelect: 1,
        maxSelect: 2,
        isRequired: true,
        selectionType: 'REQUIRED',
      }),
    );
  });

  it('includes assigned category ids when listing modifier groups', async () => {
    const { service, modifierRepository } = makeService();
    modifierRepository.listGroups.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'group-1',
          name: 'Sauces',
          description: null,
          minSelect: 0,
          maxSelect: 2,
          isRequired: false,
          sortOrder: 0,
          isActive: true,
          modifierLinks: [],
          categoryLinks: [
            {
              categoryId: 'category-1',
              sortOrder: 2,
              category: {
                id: 'category-1',
                name: 'Burgers',
                slug: 'burgers',
              },
            },
          ],
        },
      ],
    });

    const result = await service.listGroups(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(result.data[0].categoryIds).toEqual(['category-1']);
    expect(result.data[0].categories).toEqual([
      {
        id: 'category-1',
        name: 'Burgers',
        slug: 'burgers',
        sortOrder: 2,
      },
    ]);
  });

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

  it('creates modifier without a modifier group id using explicit restaurantId', async () => {
    const { service, modifierRepository } = makeService();
    modifierRepository.findModifierByRestaurantAndName.mockResolvedValue(null);
    modifierRepository.createModifier.mockResolvedValue({
      id: 'modifier-1',
      name: 'Extra Cheese',
    });

    const result = await service.createModifier(
      {
        uid: 'admin-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      {
        restaurantId: 'restaurant-1',
        name: ' Extra Cheese ',
        priceDelta: 50,
      },
    );

    expect(modifierRepository.findGroupsByIds).not.toHaveBeenCalled();
    expect(
      modifierRepository.findModifierByRestaurantAndName,
    ).toHaveBeenCalledWith('restaurant-1', 'Extra Cheese');
    expect(modifierRepository.createModifier).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Extra Cheese',
        restaurant: { connect: { id: 'restaurant-1' } },
      }),
      expect.anything(),
    );
    expect(modifierRepository.syncModifierGroups).not.toHaveBeenCalled();
    expect(result.message).toBe('Modifier created successfully');
  });

  it('rejects duplicate modifier names in the same group before hitting the database', async () => {
    const { service, modifierRepository } = makeService();
    modifierRepository.findModifierByRestaurantAndName.mockResolvedValue({
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
          restaurantId: 'restaurant-1',
          name: ' Extra Cheese ',
          priceDelta: 50,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      modifierRepository.findModifierByRestaurantAndName,
    ).toHaveBeenCalledWith('restaurant-1', 'Extra Cheese');
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
    expect(modifierRepository.deleteGroupCategoryLinks).toHaveBeenCalledWith(
      'group-1',
      expect.anything(),
    );
    expect(modifierRepository.deleteGroupModifierLinks).toHaveBeenCalledWith(
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
      restaurantId: 'restaurant-1',
      groupLinks: [],
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

  it('creates modifier without assigning it to modifier groups', async () => {
    const { service, modifierRepository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    modifierRepository.findModifierByRestaurantAndName.mockResolvedValue(null);
    modifierRepository.createModifier.mockResolvedValue({
      id: 'modifier-1',
    });

    const result = await service.createModifier(
      {
        uid: 'admin-1',
        rid: 'restaurant-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        name: 'Extra Sauce',
        priceDelta: 50,
        sortOrder: 2,
      },
    );

    expect(modifierRepository.findGroupsByIds).not.toHaveBeenCalled();
    expect(modifierRepository.syncModifierGroups).not.toHaveBeenCalled();
    expect(result.message).toBe('Modifier created successfully');
  });

  it('duplicates a modifier by id with an auto-generated name', async () => {
    const { service, modifierRepository } = makeService();
    modifierRepository.findModifierById.mockResolvedValue({
      id: 'modifier-1',
      restaurantId: 'restaurant-1',
      name: 'Extra Sauce',
      priceDelta: 50,
      sortOrder: 2,
      groupLinks: [
        { modifierGroup: { id: 'group-1', restaurantId: 'restaurant-1' } },
      ],
      deletedAt: null,
    });
    modifierRepository.findModifierByRestaurantAndName.mockResolvedValue(null);
    modifierRepository.createModifier.mockResolvedValue({
      id: 'modifier-2',
    });

    const result = await service.duplicateModifier(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'modifier-1',
      {},
    );

    expect(modifierRepository.createModifier).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Extra Sauce Copy' }),
      expect.anything(),
    );
    expect(modifierRepository.syncModifierGroups).not.toHaveBeenCalled();
    expect(result.message).toBe('Modifier duplicated successfully');
  });

  it('updates modifier without syncing modifier group selection', async () => {
    const { service, modifierRepository } = makeService();
    modifierRepository.findModifierById.mockResolvedValue({
      id: 'modifier-1',
      restaurantId: 'restaurant-1',
      sortOrder: 3,
      groupLinks: [],
      deletedAt: null,
    });
    modifierRepository.updateModifier.mockResolvedValue({
      id: 'modifier-1',
      sortOrder: 3,
    });

    const result = await service.updateModifier(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'modifier-1',
      {
        sortOrder: 4,
      },
    );

    expect(modifierRepository.findGroupsByIds).not.toHaveBeenCalled();
    expect(modifierRepository.syncModifierGroups).not.toHaveBeenCalled();
    expect(result.message).toBe('Modifier updated successfully');
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

  it('lists categories assigned to a modifier group', async () => {
    const { service, modifierRepository } = makeService();
    modifierRepository.findGroupById.mockResolvedValue({
      id: 'group-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    modifierRepository.listGroupCategories.mockResolvedValue([
      {
        id: 'link-1',
        categoryId: 'category-1',
        modifierGroupId: 'group-1',
        sortOrder: 1,
        category: {
          id: 'category-1',
          name: 'Pizza',
          restaurantId: 'restaurant-1',
        },
      },
    ]);

    const result = await service.listGroupCategories(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      'group-1',
    );

    expect(modifierRepository.listGroupCategories).toHaveBeenCalledWith(
      'group-1',
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].category.name).toBe('Pizza');
    expect(result.message).toBe(
      'Modifier group categories fetched successfully',
    );
  });

  it('replaces modifier group category assignments', async () => {
    const { service, modifierRepository, prisma } = makeService();
    modifierRepository.findGroupById.mockResolvedValue({
      id: 'group-1',
      restaurantId: 'restaurant-1',
      deletedAt: null,
    });
    prisma.menuCategory.findMany.mockResolvedValue([
      { id: 'category-2' },
      { id: 'category-3' },
    ]);
    modifierRepository.syncGroupCategories.mockResolvedValue([
      {
        categoryId: 'category-2',
        modifierGroupId: 'group-1',
        sortOrder: 0,
      },
      {
        categoryId: 'category-3',
        modifierGroupId: 'group-1',
        sortOrder: 1,
      },
    ]);

    const result = await service.syncGroupCategories(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'group-1',
      { categoryIds: ['category-2', 'category-3'] },
    );

    expect(modifierRepository.syncGroupCategories).toHaveBeenCalledWith(
      'group-1',
      ['category-2', 'category-3'],
      expect.anything(),
    );
    expect(result.message).toBe(
      'Modifier group categories updated successfully',
    );
  });
});
