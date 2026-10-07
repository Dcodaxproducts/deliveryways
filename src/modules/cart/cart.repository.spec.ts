import { CartRepository } from './cart.repository';

describe('CartRepository cart response memory bounds', () => {
  const emptyQuery = () => jest.fn().mockResolvedValue([]);

  const makeRepository = () => {
    const queries = {
      menuItemFindMany: jest.fn().mockResolvedValue([]),
      menuCategoryFindMany: jest.fn().mockResolvedValue([]),
      itemVariationOverrideFindMany: emptyQuery(),
      categoryVariationFindMany: emptyQuery(),
      itemModifierGroupFindMany: emptyQuery(),
      categoryModifierGroupFindMany: emptyQuery(),
      itemModifierOverrideFindMany: emptyQuery(),
      variationFindMany: emptyQuery(),
      groupModifierFindMany: emptyQuery(),
      modifierFindMany: emptyQuery(),
    };
    const repository = new CartRepository({
      menuItem: { findMany: queries.menuItemFindMany },
      menuCategory: { findMany: queries.menuCategoryFindMany },
      menuItemVariationPriceOverride: {
        findMany: queries.itemVariationOverrideFindMany,
      },
      menuCategoryVariation: {
        findMany: queries.categoryVariationFindMany,
      },
      menuItemModifierGroup: {
        findMany: queries.itemModifierGroupFindMany,
      },
      menuCategoryModifierGroup: {
        findMany: queries.categoryModifierGroupFindMany,
      },
      menuItemModifierPriceOverride: {
        findMany: queries.itemModifierOverrideFindMany,
      },
      menuItemVariation: { findMany: queries.variationFindMany },
      modifierGroupModifier: { findMany: queries.groupModifierFindMany },
      modifier: { findMany: queries.modifierFindMany },
    } as never);

    return { repository, queries };
  };

  const menuItemRow = (index: number) => ({
    id: 'item-' + index,
    restaurantId: 'restaurant-1',
    categoryId: 'pizza-category',
    name: 'Pizza ' + index,
    slug: 'pizza-' + index,
    description: null,
    imageUrl: null,
    pricingMode: 'VARIATION',
    basePrice: 10,
    deliveryPriceAdjustment: 0,
    takeawayPriceAdjustment: 0,
    prepTimeMinutes: 15,
    dietaryFlags: { splitPizza: true },
    depositAmount: null,
    isRequired: false,
    minSelect: 0,
    maxSelect: null,
    minQuantity: 1,
    maxQuantity: null,
    category: { id: 'pizza-category', name: 'Pizza', imageUrl: null },
    categoryLinks: [],
    branchOverrides: [],
  });

  it('does not load a category item list for normal cart rows', async () => {
    const { repository, queries } = makeRepository();

    await repository.findMenuItemsForResponse(
      ['cart-item-1', 'cart-item-2'],
      'restaurant-1',
      'branch-1',
    );

    const serializedQuery = JSON.stringify(queries.menuItemFindMany.mock.calls);
    expect(queries.menuItemFindMany).toHaveBeenCalledTimes(1);
    expect(serializedQuery).toContain('cart-item-1');
    expect(serializedQuery).toContain('cart-item-2');
    expect(serializedQuery).toContain('restaurant-1');
    expect(serializedQuery).not.toContain('"items"');
    expect(queries.menuCategoryFindMany).not.toHaveBeenCalled();
  });

  it('keeps repeated Pizzeria-sized hydration at fixed query and object cardinality', async () => {
    const { repository, queries } = makeRepository();
    const cartRows = Array.from({ length: 40 }, (_, index) =>
      menuItemRow(index + 1),
    );
    const categoryVariations = Array.from({ length: 120 }, (_, index) => ({
      categoryId: 'pizza-category',
      id: 'variation-' + (index + 1),
      name: 'Size ' + (index + 1),
      description: null,
      price: index + 1,
      sortOrder: index,
      isDefault: index === 0,
      isActive: true,
    }));
    queries.menuItemFindMany.mockResolvedValue(cartRows);
    queries.variationFindMany.mockResolvedValue(categoryVariations);

    const itemIds = cartRows.map((item) => item.id);
    let result: Awaited<
      ReturnType<CartRepository['findMenuItemsForResponse']>
    > = [];
    for (let iteration = 0; iteration < 25; iteration += 1) {
      result = await repository.findMenuItemsForResponse(
        itemIds,
        'restaurant-1',
        'branch-1',
      );
    }

    expect(result).toHaveLength(40);
    expect(result[0].variations).toHaveLength(120);
    expect(new Set(result.map((item) => item.category)).size).toBe(1);
    expect(new Set(result.map((item) => item.variations)).size).toBe(1);
    expect(queries.menuItemFindMany).toHaveBeenCalledTimes(25);
    expect(queries.itemVariationOverrideFindMany).toHaveBeenCalledTimes(25);
    expect(queries.categoryVariationFindMany).toHaveBeenCalledTimes(25);
    expect(queries.itemModifierGroupFindMany).toHaveBeenCalledTimes(25);
    expect(queries.categoryModifierGroupFindMany).toHaveBeenCalledTimes(25);
    expect(queries.itemModifierOverrideFindMany).toHaveBeenCalledTimes(25);
    expect(queries.variationFindMany).toHaveBeenCalledTimes(25);
    expect(queries.groupModifierFindMany).not.toHaveBeenCalled();
    expect(queries.modifierFindMany).not.toHaveBeenCalled();

    for (const query of [
      queries.itemVariationOverrideFindMany,
      queries.itemModifierGroupFindMany,
      queries.itemModifierOverrideFindMany,
    ]) {
      expect(JSON.stringify(query.mock.calls)).toContain(
        JSON.stringify({ menuItemId: { in: itemIds } }),
      );
    }
  });

  it('scopes modifier overrides to current item and variation ids', async () => {
    const { repository, queries } = makeRepository();
    queries.menuItemFindMany.mockResolvedValue([menuItemRow(1)]);
    queries.itemVariationOverrideFindMany.mockResolvedValue([
      {
        menuItemId: 'item-1',
        variationId: 'variation-1',
        price: 15,
        pickupPrice: 14,
        displayText: 'Large',
        variation: {
          id: 'variation-1',
          name: 'Large',
          description: null,
          price: 12,
          sortOrder: 0,
          isDefault: true,
          isActive: true,
        },
      },
    ]);
    queries.itemModifierGroupFindMany.mockResolvedValue([
      {
        menuItemId: 'item-1',
        sortOrder: 0,
        selectionType: 'MULTIPLE',
        minSelect: 0,
        maxSelect: 3,
        modifierGroup: {
          id: 'group-1',
          name: 'Toppings',
          minSelect: 0,
          maxSelect: 3,
          includedSelect: 0,
          isRequired: false,
        },
      },
    ]);
    queries.groupModifierFindMany.mockResolvedValue([
      { modifierGroupId: 'group-1', modifierId: 'modifier-1', sortOrder: 0 },
    ]);
    queries.modifierFindMany.mockResolvedValue([
      {
        id: 'modifier-1',
        name: 'Olives',
        priceDelta: 1,
        itemPriceOverrides: [{ menuItemId: 'item-1', priceDelta: 2 }],
        variationPriceOverrides: [
          {
            menuItemId: 'item-1',
            variationId: 'variation-1',
            priceDelta: 3,
          },
        ],
      },
    ]);

    const [result] = await repository.findMenuItemsForResponse(
      ['item-1'],
      'restaurant-1',
      'branch-1',
    );

    expect(result.variations).toHaveLength(1);
    expect(result.modifierLinks[0].modifierGroup.modifierLinks).toHaveLength(1);
    const serializedModifierQuery = JSON.stringify(
      queries.modifierFindMany.mock.calls,
    );
    expect(serializedModifierQuery).toContain(
      JSON.stringify({ menuItemId: { in: ['item-1'] } }),
    );
    expect(serializedModifierQuery).toContain(
      '"variationId":{"in":["variation-1"]}',
    );
    expect(serializedModifierQuery).toContain(
      '"OR":[{"menuItemId":{"in":["item-1"]}},{"menuItemId":null}]',
    );
  });

  it('loads flavor metadata with one narrow category query when split pizza needs it', async () => {
    const { repository, queries } = makeRepository();
    const pizzeriaFlavors = Array.from({ length: 120 }, (_, index) => ({
      id: 'flavor-' + (index + 1),
      name: 'Pizza ' + (index + 1),
      slug: 'pizza-' + (index + 1),
    }));
    queries.menuCategoryFindMany.mockResolvedValue([
      { id: 'pizza-category', items: pizzeriaFlavors },
    ]);

    await expect(
      repository.findSplitFlavorCategories(['pizza-category'], 'restaurant-1'),
    ).resolves.toEqual([{ id: 'pizza-category', items: pizzeriaFlavors }]);
    expect(queries.menuCategoryFindMany).toHaveBeenCalledTimes(1);
    expect(queries.menuCategoryFindMany).toHaveBeenCalledWith({
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
