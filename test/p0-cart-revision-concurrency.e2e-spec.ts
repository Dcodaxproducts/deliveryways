import { TestingModule, Test } from '@nestjs/testing';
import { OrderType, UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database';
import { CartService } from '../src/modules/cart/cart.service';
import { MenuItemRepository } from '../src/modules/menu/item/item.repository';

describe('P0 cart revision serialization (isolated database)', () => {
  let moduleFixture: TestingModule;
  let prisma: PrismaService;
  let cartService: CartService;
  let menuItemRepository: MenuItemRepository;
  const runId = `${Date.now()}-${process.pid}`;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleFixture.get(PrismaService);
    cartService = moduleFixture.get(CartService);
    menuItemRepository = moduleFixture.get(MenuItemRepository);
  }, 60_000);

  afterAll(async () => {
    await moduleFixture.close();
  });

  it('serializes equivalent adds, absolute deal updates, and menu cleanup races', async () => {
    const tenant = await prisma.tenant.create({
      data: { name: `Cart CAS ${runId}`, slug: `cart-cas-${runId}` },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        tenantId: tenant.id,
        name: `Cart CAS ${runId}`,
        slug: `cart-cas-restaurant-${runId}`,
        subdomain: `cart-cas-${runId}`,
      },
    });
    const branch = await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        name: 'Cart CAS Branch',
      },
    });
    const category = await prisma.menuCategory.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Concurrency',
        slug: `concurrency-${runId}`,
      },
    });
    const menuItems = await Promise.all(
      ['equivalent', 'deal-a', 'deal-b', 'cleanup'].map((name) =>
        prisma.menuItem.create({
          data: {
            restaurantId: restaurant.id,
            categoryId: category.id,
            name,
            slug: `${name}-${runId}`,
            basePrice: 10,
          },
        }),
      ),
    );
    const customers = await Promise.all(
      ['equivalent', 'deal', 'cleanup'].map((scope) =>
        prisma.user.create({
          data: {
            email: `cart-cas-${scope}-${runId}@example.test`,
            password: 'not-used',
            role: UserRole.CUSTOMER,
            tenantId: tenant.id,
            restaurantId: restaurant.id,
            branchId: branch.id,
            isVerified: true,
            isApproved: true,
          },
        }),
      ),
    );

    const equivalentCart = await prisma.cart.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        customerId: customers[0].id,
        orderType: OrderType.TAKEAWAY,
      },
    });
    const addEquivalent = () =>
      cartService.addItem(
        {
          uid: customers[0].id,
          tid: tenant.id,
          rid: restaurant.id,
          role: UserRole.CUSTOMER,
        } as never,
        {
          branchId: branch.id,
          menuItemId: menuItems[0].id,
          quantity: 1,
          orderType: OrderType.TAKEAWAY,
        } as never,
        undefined,
        undefined,
        true,
      );
    const equivalentResults = await Promise.allSettled([
      addEquivalent(),
      addEquivalent(),
    ]);
    const equivalentSuccesses = equivalentResults.filter(
      ({ status }) => status === 'fulfilled',
    );
    if (equivalentSuccesses.length !== 2) {
      const reasons = equivalentResults
        .filter(
          (result): result is PromiseRejectedResult =>
            result.status === 'rejected',
        )
        .map(({ reason }) =>
          reason instanceof Error ? reason.message : String(reason),
        );
      throw new Error(
        `Expected both equivalent adds to serialize; failures: ${reasons.join(' | ')}`,
      );
    }
    await expect(
      prisma.cart.findUniqueOrThrow({ where: { id: equivalentCart.id } }),
    ).resolves.toMatchObject({ revision: 2 });
    await expect(
      prisma.cartItem.findMany({ where: { cartId: equivalentCart.id } }),
    ).resolves.toMatchObject([{ menuItemId: menuItems[0].id, quantity: 2 }]);

    const dealCart = await prisma.cart.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        customerId: customers[1].id,
        orderType: OrderType.TAKEAWAY,
        items: {
          create: menuItems.slice(1, 3).map((item) => ({
            menuItemId: item.id,
            quantity: 1,
            modifiers: { dealId: 'concurrent-deal' },
          })),
        },
      },
      include: { items: true },
    });
    const updateDealQuantity = (quantity: number) =>
      cartService.updateDeal(
        {
          uid: customers[1].id,
          tid: tenant.id,
          rid: restaurant.id,
          role: UserRole.CUSTOMER,
        } as never,
        'concurrent-deal',
        { quantity },
      );
    const dealResults = await Promise.allSettled([
      updateDealQuantity(2),
      updateDealQuantity(3),
    ]);
    expect(
      dealResults.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(2);
    const finalDealCart = await prisma.cart.findUniqueOrThrow({
      where: { id: dealCart.id },
      include: { items: { orderBy: { id: 'asc' } } },
    });
    expect(finalDealCart.revision).toBe(2);
    expect(new Set(finalDealCart.items.map((item) => item.quantity)).size).toBe(
      1,
    );
    expect([2, 3]).toContain(finalDealCart.items[0].quantity);

    const cleanupCart = await prisma.cart.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        customerId: customers[2].id,
        orderType: OrderType.TAKEAWAY,
      },
    });
    const addDuringCleanup = () =>
      cartService.addItem(
        {
          uid: customers[2].id,
          tid: tenant.id,
          rid: restaurant.id,
          role: UserRole.CUSTOMER,
        } as never,
        {
          branchId: branch.id,
          menuItemId: menuItems[3].id,
          quantity: 1,
          orderType: OrderType.TAKEAWAY,
        } as never,
        undefined,
        undefined,
        true,
      );
    const cleanupMenuItem = () =>
      prisma.$transaction(async (tx) => {
        await menuItemRepository.deleteCartItems(menuItems[3].id, tx);
        await tx.menuItem.update({
          where: { id: menuItems[3].id },
          data: { isActive: false, deletedAt: new Date() },
        });
      });
    const cleanupResults = await Promise.allSettled([
      addDuringCleanup(),
      cleanupMenuItem(),
    ]);
    expect(
      cleanupResults.filter(({ status }) => status === 'fulfilled').length,
    ).toBeGreaterThanOrEqual(1);
    await expect(
      prisma.cartItem.count({
        where: { cartId: cleanupCart.id, menuItemId: menuItems[3].id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.menuItem.findUniqueOrThrow({ where: { id: menuItems[3].id } }),
    ).resolves.toMatchObject({ isActive: false });
    const finalCleanupCart = await prisma.cart.findUniqueOrThrow({
      where: { id: cleanupCart.id },
    });
    const addWon = cleanupResults[0].status === 'fulfilled';
    expect(finalCleanupCart.revision).toBe(addWon ? 2 : 0);
  });
});
