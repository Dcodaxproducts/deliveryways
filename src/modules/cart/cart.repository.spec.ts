import { CartRepository } from './cart.repository';

describe('CartRepository cart response query shape', () => {
  const makeRepository = () => {
    const menuItemFindMany = jest.fn().mockResolvedValue([]);
    const menuCategoryFindMany = jest.fn().mockResolvedValue([]);
    const repository = new CartRepository({
      menuItem: { findMany: menuItemFindMany },
      menuCategory: { findMany: menuCategoryFindMany },
    } as never);

    return { repository, menuItemFindMany, menuCategoryFindMany };
  };

  it('does not load a Pizzeria-sized category item list for normal cart rows', async () => {
    const { repository, menuItemFindMany, menuCategoryFindMany } =
      makeRepository();

    await repository.findMenuItemsForResponse(
      ['cart-item-1', 'cart-item-2'],
      'restaurant-1',
      'branch-1',
    );

    const serializedQuery = JSON.stringify(menuItemFindMany.mock.calls);
    expect(menuItemFindMany).toHaveBeenCalledTimes(1);
    expect(serializedQuery).toContain('cart-item-1');
    expect(serializedQuery).toContain('cart-item-2');
    expect(serializedQuery).toContain('restaurant-1');
    expect(serializedQuery).not.toContain('"items"');
    expect(menuCategoryFindMany).not.toHaveBeenCalled();
  });

  it('loads flavor metadata with one narrow category query when split pizza needs it', async () => {
    const { repository, menuCategoryFindMany } = makeRepository();
    const pizzeriaFlavors = Array.from({ length: 120 }, (_, index) => ({
      id: 'flavor-' + (index + 1),
      name: 'Pizza ' + (index + 1),
      slug: 'pizza-' + (index + 1),
    }));
    menuCategoryFindMany.mockResolvedValue([
      { id: 'pizza-category', items: pizzeriaFlavors },
    ]);

    await expect(
      repository.findSplitFlavorCategories(['pizza-category'], 'restaurant-1'),
    ).resolves.toEqual([{ id: 'pizza-category', items: pizzeriaFlavors }]);
    expect(menuCategoryFindMany).toHaveBeenCalledTimes(1);
    expect(menuCategoryFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['pizza-category'] },
        restaurantId: 'restaurant-1',
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        items: {
          where: { deletedAt: null, isActive: true },
          select: { id: true, name: true, slug: true },
          orderBy: [{ createdAt: 'asc' }],
        },
      },
    });
  });
});
