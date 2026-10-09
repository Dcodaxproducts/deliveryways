import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole } from '@prisma/client';
import {
  applyDevelopmentPizzaFixture,
  assertDevelopmentFixtureSafety,
  cleanupDevelopmentPizzaFixture,
  DEVELOPMENT_FIXTURE_CONFIRMATION,
  DEVELOPMENT_FIXTURE_ID_PREFIX,
  DEVELOPMENT_FIXTURE_IDS,
  DEVELOPMENT_FIXTURE_SUBDOMAIN,
  verifyDevelopmentPizzaFixture,
} from '../prisma/fixtures/development-pizza.fixture';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const sentinelTenantId = 'fixture_scope_sentinel_tenant';
const customerId = DEVELOPMENT_FIXTURE_ID_PREFIX + 'test_customer';
const cartId = DEVELOPMENT_FIXTURE_ID_PREFIX + 'test_cart';
const cartItemId = DEVELOPMENT_FIXTURE_ID_PREFIX + 'test_cart_item';

describe('development Pizza/Burger fixture (disposable database)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!testDatabaseUrl) {
      throw new Error('TEST_DATABASE_URL must point to a disposable database.');
    }
    assertDevelopmentFixtureSafety({
      nodeEnv: 'test',
      confirmation: DEVELOPMENT_FIXTURE_CONFIRMATION,
      databaseUrl: testDatabaseUrl,
    });
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
    });
    await cleanupDevelopmentPizzaFixture(prisma);
    await prisma.tenant.deleteMany({ where: { id: sentinelTenantId } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await cleanupDevelopmentPizzaFixture(prisma);
    await prisma.user.deleteMany({ where: { id: customerId } });
    await prisma.tenant.deleteMany({ where: { id: sentinelTenantId } });
    await prisma.$disconnect();
  });

  it('refuses production environment and production URL markers', () => {
    expect(() =>
      assertDevelopmentFixtureSafety({
        nodeEnv: 'production',
        confirmation: DEVELOPMENT_FIXTURE_CONFIRMATION,
        databaseUrl: 'postgresql://fixture:fixture@localhost/dev_test',
      }),
    ).toThrow('NODE_ENV');
    expect(() =>
      assertDevelopmentFixtureSafety({
        nodeEnv: 'test',
        confirmation: DEVELOPMENT_FIXTURE_CONFIRMATION,
        databaseUrl: 'postgresql://fixture:fixture@prod-db/deliveryways_live',
      }),
    ).toThrow('production marker');
    expect(() =>
      assertDevelopmentFixtureSafety({
        nodeEnv: 'test',
        confirmation: 'yes',
        databaseUrl: 'postgresql://fixture:fixture@localhost/dev_test',
      }),
    ).toThrow('confirmation');
  });

  it('creates exact counts and relationships and is idempotent', async () => {
    await applyDevelopmentPizzaFixture(prisma);
    await applyDevelopmentPizzaFixture(prisma);
    await expect(verifyDevelopmentPizzaFixture(prisma)).resolves.toMatchObject({
      counts: { categories: 2, items: 4, variations: 2 },
    });

    const [categories, items, menuLinks, branchOverrides] = await Promise.all([
      prisma.menuCategory.findMany({
        where: { id: { startsWith: DEVELOPMENT_FIXTURE_ID_PREFIX } },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.menuItem.findMany({
        where: { id: { startsWith: DEVELOPMENT_FIXTURE_ID_PREFIX } },
      }),
      prisma.restaurantMenuItem.count({
        where: { id: { startsWith: DEVELOPMENT_FIXTURE_ID_PREFIX } },
      }),
      prisma.branchMenuItemOverride.count({
        where: { id: { startsWith: DEVELOPMENT_FIXTURE_ID_PREFIX } },
      }),
    ]);
    expect(categories.map((category) => category.name)).toEqual([
      'Pizza',
      'Burger',
    ]);
    expect(items).toHaveLength(4);
    expect(menuLinks).toBe(4);
    expect(branchOverrides).toBe(4);
  });

  it('supports domain, storefront, item-detail, and cart-read contracts', async () => {
    const domainContext = await prisma.restaurant.findFirst({
      where: {
        subdomain: DEVELOPMENT_FIXTURE_SUBDOMAIN,
        isActive: true,
        deletedAt: null,
      },
      include: {
        branches: {
          where: { isActive: true, deletedAt: null },
          orderBy: { isMain: 'desc' },
        },
      },
    });
    expect(domainContext?.branches).toHaveLength(1);

    const storefrontCategories = await prisma.menuCategory.findMany({
      where: {
        restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
        isActive: true,
        deletedAt: null,
        overrides: {
          some: {
            branchId: DEVELOPMENT_FIXTURE_IDS.branch,
            isVisible: true,
          },
        },
      },
      include: {
        itemLinks: {
          include: { menuItem: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    expect(storefrontCategories).toHaveLength(2);
    expect(
      storefrontCategories.flatMap((category) => category.itemLinks),
    ).toHaveLength(4);

    const schinken = await prisma.menuItem.findUnique({
      where: { id: DEVELOPMENT_FIXTURE_IDS.schinken },
      include: {
        variationPriceOverrides: { include: { variation: true } },
        modifierLinks: {
          include: {
            modifierGroup: {
              include: { modifierLinks: { include: { modifier: true } } },
            },
          },
        },
      },
    });
    expect(schinken?.variationPriceOverrides).toHaveLength(2);
    expect(schinken?.modifierLinks[0].minSelect).toBe(0);
    expect(schinken?.modifierLinks[0].modifierGroup.modifierLinks).toHaveLength(
      2,
    );

    await prisma.user.create({
      data: {
        id: customerId,
        email: 'fixture-cart-customer@dev.invalid',
        password: 'not-a-login-credential',
        role: UserRole.CUSTOMER,
        tenantId: DEVELOPMENT_FIXTURE_IDS.tenant,
        restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
        branchId: DEVELOPMENT_FIXTURE_IDS.branch,
        isVerified: true,
        isApproved: true,
      },
    });
    await prisma.cart.create({
      data: {
        id: cartId,
        tenantId: DEVELOPMENT_FIXTURE_IDS.tenant,
        restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
        branchId: DEVELOPMENT_FIXTURE_IDS.branch,
        customerId,
        restaurantMenuId: DEVELOPMENT_FIXTURE_IDS.menu,
        items: {
          create: {
            id: cartItemId,
            menuItemId: DEVELOPMENT_FIXTURE_IDS.schinken,
            variationId: DEVELOPMENT_FIXTURE_IDS.largeVariation,
            quantity: 1,
            modifiers: [
              { modifierId: DEVELOPMENT_FIXTURE_IDS.mushroomModifier },
            ],
          },
        },
      },
    });
    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: { items: true, restaurantMenu: true, branch: true },
    });
    expect(cart?.items[0]).toMatchObject({
      menuItemId: DEVELOPMENT_FIXTURE_IDS.schinken,
      variationId: DEVELOPMENT_FIXTURE_IDS.largeVariation,
    });
    expect(cart?.restaurantMenuId).toBe(DEVELOPMENT_FIXTURE_IDS.menu);
    expect(cart?.branchId).toBe(DEVELOPMENT_FIXTURE_IDS.branch);
  });

  it('cleanup removes only tagged records', async () => {
    await prisma.tenant.create({
      data: {
        id: sentinelTenantId,
        name: 'Disposable test sentinel',
        slug: sentinelTenantId,
      },
    });
    await cleanupDevelopmentPizzaFixture(prisma);

    expect(
      await prisma.tenant.findUnique({ where: { id: sentinelTenantId } }),
    ).not.toBeNull();
    expect(
      await prisma.tenant.count({
        where: { id: { startsWith: DEVELOPMENT_FIXTURE_ID_PREFIX } },
      }),
    ).toBe(0);
    expect(
      await prisma.menuItem.count({
        where: { id: { startsWith: DEVELOPMENT_FIXTURE_ID_PREFIX } },
      }),
    ).toBe(0);
  });
});
