import { Prisma } from '@prisma/client';
import { GroupOrdersRepository } from './group-orders.repository';

describe('GroupOrdersRepository', () => {
  it('uses item-level variation price overrides when validating session menu items', async () => {
    const findFirst: jest.MockedFunction<(args: unknown) => Promise<unknown>> =
      jest.fn().mockResolvedValue({
        id: 'menu-1',
        category: {
          variations: [{ id: 'category-var', name: 'Category Size' }],
          variationLinks: [],
        },
        variationPriceOverrides: [
          {
            variation: { id: 'item-var', name: 'Item Size' },
            price: new Prisma.Decimal(40),
            pickupPrice: new Prisma.Decimal(35),
            displayText: 'from $40.00',
          },
        ],
        branchOverrides: [],
      });
    const prisma = {
      menuItem: {
        findFirst,
      },
    };
    const repository = new GroupOrdersRepository(prisma as never);

    const item = await repository.findMenuItemForSession(
      'menu-1',
      'restaurant-1',
      'branch-1',
    );

    const findFirstArgs = findFirst.mock.calls[0]?.[0] as {
      include?: { variationPriceOverrides?: unknown };
    };
    expect(findFirstArgs.include?.variationPriceOverrides).toBeDefined();
    expect(item?.variations).toEqual([
      expect.objectContaining({
        id: 'item-var',
        name: 'Item Size',
        price: new Prisma.Decimal(40),
        pickupPrice: new Prisma.Decimal(35),
        displayText: 'from $40.00',
      }),
    ]);
  });

  it('uses item-level variations in group-order response menu items', async () => {
    const findMany: jest.MockedFunction<(args: unknown) => Promise<unknown[]>> =
      jest.fn().mockResolvedValue([
        {
          id: 'menu-1',
          category: {
            variations: [{ id: 'category-var', name: 'Category Size' }],
            variationLinks: [],
          },
          variationPriceOverrides: [
            {
              variation: { id: 'item-var', name: 'Item Size' },
              price: new Prisma.Decimal(40),
              pickupPrice: null,
              displayText: null,
            },
          ],
          branchOverrides: [],
        },
      ]);
    const prisma = {
      menuItem: {
        findMany,
      },
    };
    const repository = new GroupOrdersRepository(prisma as never);

    const items = await repository.findMenuItemsForResponse(
      ['menu-1'],
      'restaurant-1',
      'branch-1',
    );

    const findManyArgs = findMany.mock.calls[0]?.[0] as {
      include?: { variationPriceOverrides?: unknown };
    };
    expect(findManyArgs.include?.variationPriceOverrides).toBeDefined();
    expect(items[0].variations).toEqual([
      expect.objectContaining({
        id: 'item-var',
        name: 'Item Size',
        price: new Prisma.Decimal(40),
      }),
    ]);
  });
});
