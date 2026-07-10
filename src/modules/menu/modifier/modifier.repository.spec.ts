import { ModifierRepository } from './modifier.repository';

describe('ModifierRepository', () => {
  const createRepository = () => {
    const modifierCategoryFindMany = jest.fn().mockResolvedValue([]);
    const modifierCategoryCount = jest.fn().mockResolvedValue(0);
    const modifierGroupFindMany = jest.fn().mockResolvedValue([]);
    const modifierGroupCount = jest.fn().mockResolvedValue(0);
    const modifierFindMany = jest.fn().mockResolvedValue([]);
    const modifierCount = jest.fn().mockResolvedValue(0);
    const prisma = {
      modifierCategory: {
        findMany: modifierCategoryFindMany,
        count: modifierCategoryCount,
      },
      modifierGroup: {
        findMany: modifierGroupFindMany,
        count: modifierGroupCount,
      },
      modifier: { findMany: modifierFindMany, count: modifierCount },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };

    return {
      repository: new ModifierRepository(prisma as never),
      modifierCategoryFindMany,
      modifierGroupFindMany,
      modifierFindMany,
    };
  };

  const sortQueries = [
    ['ASC', [{ sortOrder: 'asc' }, { createdAt: 'desc' }]],
    ['DESC', [{ sortOrder: 'desc' }, { createdAt: 'desc' }]],
  ] as const;

  it.each(sortQueries)(
    'orders modifier categories by sortOrder %s',
    async (sortOrder, orderBy) => {
      const { repository, modifierCategoryFindMany } = createRepository();

      await repository.listCategories('restaurant-1', {
        page: 1,
        limit: 10,
        sortBy: 'sortOrder',
        sortOrder,
      } as never);

      expect(modifierCategoryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy }),
      );
    },
  );

  it.each(sortQueries)(
    'orders modifier groups by sortOrder %s',
    async (sortOrder, orderBy) => {
      const { repository, modifierGroupFindMany } = createRepository();

      await repository.listGroups('restaurant-1', {
        page: 1,
        limit: 10,
        sortBy: 'sortOrder',
        sortOrder,
      } as never);

      expect(modifierGroupFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy }),
      );
    },
  );

  it.each(sortQueries)(
    'orders modifiers by sortOrder %s',
    async (sortOrder, orderBy) => {
      const { repository, modifierFindMany } = createRepository();

      await repository.listModifiers('restaurant-1', {
        page: 1,
        limit: 10,
        sortBy: 'sortOrder',
        sortOrder,
      } as never);

      expect(modifierFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy }),
      );
    },
  );
});
