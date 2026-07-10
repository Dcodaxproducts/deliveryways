import { MenuCategoryRepository } from './category.repository';

describe('MenuCategoryRepository', () => {
  const createRepository = () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      menuCategory: { findMany, count },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };

    return {
      repository: new MenuCategoryRepository(prisma as never),
      findMany,
    };
  };

  it.each([
    ['ASC', [{ sortOrder: 'asc' }, { createdAt: 'desc' }]],
    ['DESC', [{ sortOrder: 'desc' }, { createdAt: 'desc' }]],
  ] as const)(
    'orders menu categories by sortOrder %s',
    async (sortOrder, orderBy) => {
      const { repository, findMany } = createRepository();

      await repository.list('restaurant-1', {
        page: 1,
        limit: 10,
        sortBy: 'sortOrder',
        sortOrder,
      } as never);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy }),
      );
    },
  );
});
