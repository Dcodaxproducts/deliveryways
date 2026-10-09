import {
  AddressRefType,
  MenuItemPricingMode,
  ModifierSelectionType,
  Prisma,
  PrismaClient,
} from '@prisma/client';

export const DEVELOPMENT_FIXTURE_CONFIRMATION =
  'I_UNDERSTAND_THIS_MUTATES_A_DEVELOPMENT_DATABASE';
export const DEVELOPMENT_FIXTURE_TAG = 'dw-dev-pizza-20261009-v1';
export const DEVELOPMENT_FIXTURE_ID_PREFIX = 'devfx_dw_pizza_v1_';
export const DEVELOPMENT_FIXTURE_SUBDOMAIN = 'dev-pizza-fixture';

const taggedId = (suffix: string): string =>
  `${DEVELOPMENT_FIXTURE_ID_PREFIX}${suffix}`;

export const DEVELOPMENT_FIXTURE_IDS = {
  tenant: taggedId('tenant'),
  restaurant: taggedId('restaurant'),
  branch: taggedId('branch'),
  address: taggedId('address'),
  menu: taggedId('menu'),
  pizzaCategory: taggedId('category_pizza'),
  burgerCategory: taggedId('category_burger'),
  schinken: taggedId('item_pizza_schinken'),
  margherita: taggedId('item_pizza_margherita'),
  classicBurger: taggedId('item_burger_classic'),
  cheeseburger: taggedId('item_burger_cheese'),
  smallVariation: taggedId('variation_small'),
  largeVariation: taggedId('variation_large'),
  modifierCategory: taggedId('modifier_category_extras'),
  modifierGroup: taggedId('modifier_group_extras'),
  mushroomModifier: taggedId('modifier_mushrooms'),
  jalapenoModifier: taggedId('modifier_jalapenos'),
} as const;

export const DEVELOPMENT_FIXTURE_COUNTS = {
  tenants: 1,
  restaurants: 1,
  branches: 1,
  addresses: 1,
  menus: 1,
  categories: 2,
  items: 4,
  variations: 2,
  modifierCategories: 1,
  modifierGroups: 1,
  modifiers: 2,
} as const;

const IMAGE_BASE = 'https://placehold.co/1200x800/png';
const openingHours = [
  { day: 'MONDAY', isOpen: true, open: '11:00', close: '22:00' },
  { day: 'TUESDAY', isOpen: true, open: '11:00', close: '22:00' },
  { day: 'WEDNESDAY', isOpen: true, open: '11:00', close: '22:00' },
  { day: 'THURSDAY', isOpen: true, open: '11:00', close: '22:00' },
  { day: 'FRIDAY', isOpen: true, open: '11:00', close: '23:00' },
  { day: 'SATURDAY', isOpen: true, open: '11:00', close: '23:00' },
  { day: 'SUNDAY', isOpen: true, open: '12:00', close: '21:00' },
];

export interface DevelopmentFixtureSafetyInput {
  nodeEnv?: string;
  confirmation?: string;
  databaseUrl?: string;
}

export interface DevelopmentFixtureSummary {
  fixtureTag: string;
  counts: typeof DEVELOPMENT_FIXTURE_COUNTS;
  restaurantId: string;
  branchId: string;
  host: string;
  expectedUrl: string;
}

export function assertDevelopmentFixtureSafety(
  input: DevelopmentFixtureSafetyInput,
): URL {
  const environment = input.nodeEnv?.trim().toLowerCase();
  if (environment !== 'development' && environment !== 'test') {
    throw new Error(
      'Development fixture refused: NODE_ENV must be development or test.',
    );
  }

  if (input.confirmation !== DEVELOPMENT_FIXTURE_CONFIRMATION) {
    throw new Error(
      'Development fixture refused: explicit confirmation flag is missing or invalid.',
    );
  }

  if (!input.databaseUrl) {
    throw new Error('Development fixture refused: DATABASE_URL is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(input.databaseUrl);
  } catch {
    throw new Error('Development fixture refused: DATABASE_URL is invalid.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(
      'Development fixture refused: only PostgreSQL URLs are supported.',
    );
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const safetySurface = [
    parsed.hostname,
    databaseName,
    decodeURIComponent(parsed.username),
    parsed.search,
    input.databaseUrl,
  ]
    .join(' ')
    .toLowerCase();
  const productionMarker =
    /(^|[^a-z])(prod|production|live|primary)([^a-z]|$)/i;
  if (productionMarker.test(safetySurface)) {
    throw new Error(
      'Development fixture refused: DATABASE_URL contains a production marker.',
    );
  }

  return parsed;
}

export function getDevelopmentFixtureSummary(
  customerAppBaseDomain = 'localhost',
): DevelopmentFixtureSummary {
  const baseDomain = customerAppBaseDomain
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const host = `${DEVELOPMENT_FIXTURE_SUBDOMAIN}.${baseDomain || 'localhost'}`;
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const port = host.includes('localhost') && !host.includes(':') ? ':3000' : '';
  return {
    fixtureTag: DEVELOPMENT_FIXTURE_TAG,
    counts: DEVELOPMENT_FIXTURE_COUNTS,
    restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
    branchId: DEVELOPMENT_FIXTURE_IDS.branch,
    host,
    expectedUrl: `${protocol}://${host}${port}`,
  };
}

const categoryIds = [
  DEVELOPMENT_FIXTURE_IDS.pizzaCategory,
  DEVELOPMENT_FIXTURE_IDS.burgerCategory,
];
const itemIds = [
  DEVELOPMENT_FIXTURE_IDS.schinken,
  DEVELOPMENT_FIXTURE_IDS.margherita,
  DEVELOPMENT_FIXTURE_IDS.classicBurger,
  DEVELOPMENT_FIXTURE_IDS.cheeseburger,
];

export async function applyDevelopmentPizzaFixture(
  prisma: PrismaClient,
): Promise<DevelopmentFixtureSummary> {
  await prisma.$transaction(async (tx) => {
    await tx.tenant.upsert({
      where: { id: DEVELOPMENT_FIXTURE_IDS.tenant },
      update: {
        name: '[DEV FIXTURE] Pizza & Burger Tenant',
        slug: DEVELOPMENT_FIXTURE_TAG,
        settings: { fixtureTag: DEVELOPMENT_FIXTURE_TAG },
        isActive: true,
        deletedAt: null,
      },
      create: {
        id: DEVELOPMENT_FIXTURE_IDS.tenant,
        name: '[DEV FIXTURE] Pizza & Burger Tenant',
        slug: DEVELOPMENT_FIXTURE_TAG,
        settings: { fixtureTag: DEVELOPMENT_FIXTURE_TAG },
        isActive: true,
      },
    });

    await tx.restaurant.upsert({
      where: { id: DEVELOPMENT_FIXTURE_IDS.restaurant },
      update: {
        tenantId: DEVELOPMENT_FIXTURE_IDS.tenant,
        name: '[DEV FIXTURE] Pizza & Burger',
        slug: DEVELOPMENT_FIXTURE_TAG,
        subdomain: DEVELOPMENT_FIXTURE_SUBDOMAIN,
        logoUrl: `${IMAGE_BASE}?text=DEV+Pizza+Burger+Logo`,
        coverImage: `${IMAGE_BASE}?text=DEV+Pizza+Burger`,
        tagline: 'Compact development-only menu fixture',
        branding: {
          fixtureTag: DEVELOPMENT_FIXTURE_TAG,
          primaryColor: '#C2410C',
          secondaryColor: '#F59E0B',
        },
        settings: {
          fixtureTag: DEVELOPMENT_FIXTURE_TAG,
          currency: 'EUR',
          defaultCurrency: 'EUR',
          taxPercentage: 7,
          allowedOrderTypes: ['DELIVERY', 'TAKEAWAY'],
          allowedPaymentMethods: ['COD'],
        },
        isActive: true,
        deletedAt: null,
      },
      create: {
        id: DEVELOPMENT_FIXTURE_IDS.restaurant,
        tenantId: DEVELOPMENT_FIXTURE_IDS.tenant,
        name: '[DEV FIXTURE] Pizza & Burger',
        slug: DEVELOPMENT_FIXTURE_TAG,
        subdomain: DEVELOPMENT_FIXTURE_SUBDOMAIN,
        logoUrl: `${IMAGE_BASE}?text=DEV+Pizza+Burger+Logo`,
        coverImage: `${IMAGE_BASE}?text=DEV+Pizza+Burger`,
        tagline: 'Compact development-only menu fixture',
        branding: {
          fixtureTag: DEVELOPMENT_FIXTURE_TAG,
          primaryColor: '#C2410C',
          secondaryColor: '#F59E0B',
        },
        settings: {
          fixtureTag: DEVELOPMENT_FIXTURE_TAG,
          currency: 'EUR',
          defaultCurrency: 'EUR',
          taxPercentage: 7,
          allowedOrderTypes: ['DELIVERY', 'TAKEAWAY'],
          allowedPaymentMethods: ['COD'],
        },
        isActive: true,
      },
    });

    await tx.branch.upsert({
      where: { id: DEVELOPMENT_FIXTURE_IDS.branch },
      update: {
        tenantId: DEVELOPMENT_FIXTURE_IDS.tenant,
        restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
        name: '[DEV FIXTURE] Main Branch',
        description: DEVELOPMENT_FIXTURE_TAG,
        settings: {
          fixtureTag: DEVELOPMENT_FIXTURE_TAG,
          allowedOrderTypes: ['DELIVERY', 'TAKEAWAY'],
          allowedPaymentMethods: ['COD'],
          openingHours,
          deliveryHours: openingHours,
          tableReservationsEnabled: false,
        },
        isMain: true,
        isActive: true,
        deletedAt: null,
      },
      create: {
        id: DEVELOPMENT_FIXTURE_IDS.branch,
        tenantId: DEVELOPMENT_FIXTURE_IDS.tenant,
        restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
        name: '[DEV FIXTURE] Main Branch',
        description: DEVELOPMENT_FIXTURE_TAG,
        settings: {
          fixtureTag: DEVELOPMENT_FIXTURE_TAG,
          allowedOrderTypes: ['DELIVERY', 'TAKEAWAY'],
          allowedPaymentMethods: ['COD'],
          openingHours,
          deliveryHours: openingHours,
          tableReservationsEnabled: false,
        },
        isMain: true,
        isActive: true,
      },
    });

    await tx.address.upsert({
      where: { id: DEVELOPMENT_FIXTURE_IDS.address },
      update: {
        tenantId: DEVELOPMENT_FIXTURE_IDS.tenant,
        referenceId: DEVELOPMENT_FIXTURE_IDS.branch,
        refType: AddressRefType.BRANCH,
        street: '[DEV FIXTURE] Musterstrasse 1',
        postalCode: '10115',
        city: 'Berlin',
        state: 'Berlin',
        country: 'DE',
        isActive: true,
        deletedAt: null,
      },
      create: {
        id: DEVELOPMENT_FIXTURE_IDS.address,
        tenantId: DEVELOPMENT_FIXTURE_IDS.tenant,
        referenceId: DEVELOPMENT_FIXTURE_IDS.branch,
        refType: AddressRefType.BRANCH,
        street: '[DEV FIXTURE] Musterstrasse 1',
        postalCode: '10115',
        city: 'Berlin',
        state: 'Berlin',
        country: 'DE',
      },
    });

    await tx.restaurantMenu.upsert({
      where: { id: DEVELOPMENT_FIXTURE_IDS.menu },
      update: {
        restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
        name: '[DEV FIXTURE] Main Menu',
        slug: DEVELOPMENT_FIXTURE_TAG,
        description: DEVELOPMENT_FIXTURE_TAG,
        isActive: true,
        deletedAt: null,
      },
      create: {
        id: DEVELOPMENT_FIXTURE_IDS.menu,
        restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
        name: '[DEV FIXTURE] Main Menu',
        slug: DEVELOPMENT_FIXTURE_TAG,
        description: DEVELOPMENT_FIXTURE_TAG,
      },
    });

    const categories = [
      {
        id: DEVELOPMENT_FIXTURE_IDS.pizzaCategory,
        name: 'Pizza',
        slug: `${DEVELOPMENT_FIXTURE_TAG}-pizza`,
        description: `Pizza · ${DEVELOPMENT_FIXTURE_TAG}`,
        imageUrl: `${IMAGE_BASE}?text=DEV+Pizza`,
        sortOrder: 1,
      },
      {
        id: DEVELOPMENT_FIXTURE_IDS.burgerCategory,
        name: 'Burger',
        slug: `${DEVELOPMENT_FIXTURE_TAG}-burger`,
        description: `Burger · ${DEVELOPMENT_FIXTURE_TAG}`,
        imageUrl: `${IMAGE_BASE}?text=DEV+Burger`,
        sortOrder: 2,
      },
    ];
    for (const category of categories) {
      await tx.menuCategory.upsert({
        where: { id: category.id },
        update: {
          ...category,
          restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
          isActive: true,
          deletedAt: null,
        },
        create: {
          ...category,
          restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
        },
      });
    }

    const items = [
      {
        id: DEVELOPMENT_FIXTURE_IDS.schinken,
        categoryId: DEVELOPMENT_FIXTURE_IDS.pizzaCategory,
        name: 'Pizza Schinken',
        slug: `${DEVELOPMENT_FIXTURE_TAG}-pizza-schinken`,
        sku: 'DEVFX-PIZZA-SCHINKEN',
        description: `Tomato, mozzarella and ham · ${DEVELOPMENT_FIXTURE_TAG}`,
        imageUrl: `${IMAGE_BASE}?text=DEV+Pizza+Schinken`,
        pricingMode: MenuItemPricingMode.MULTIPLE,
        basePrice: new Prisma.Decimal('9.90'),
        dietaryFlags: {
          fixtureTag: DEVELOPMENT_FIXTURE_TAG,
          splitPizza: true,
        },
        sortOrder: 1,
      },
      {
        id: DEVELOPMENT_FIXTURE_IDS.margherita,
        categoryId: DEVELOPMENT_FIXTURE_IDS.pizzaCategory,
        name: 'Pizza Margherita',
        slug: `${DEVELOPMENT_FIXTURE_TAG}-pizza-margherita`,
        sku: 'DEVFX-PIZZA-MARGHERITA',
        description: `Tomato, mozzarella and basil · ${DEVELOPMENT_FIXTURE_TAG}`,
        imageUrl: `${IMAGE_BASE}?text=DEV+Pizza+Margherita`,
        pricingMode: MenuItemPricingMode.SINGLE,
        basePrice: new Prisma.Decimal('8.50'),
        dietaryFlags: { fixtureTag: DEVELOPMENT_FIXTURE_TAG },
        sortOrder: 2,
      },
      {
        id: DEVELOPMENT_FIXTURE_IDS.classicBurger,
        categoryId: DEVELOPMENT_FIXTURE_IDS.burgerCategory,
        name: 'Classic Burger',
        slug: `${DEVELOPMENT_FIXTURE_TAG}-classic-burger`,
        sku: 'DEVFX-BURGER-CLASSIC',
        description: `Beef, lettuce and house sauce · ${DEVELOPMENT_FIXTURE_TAG}`,
        imageUrl: `${IMAGE_BASE}?text=DEV+Classic+Burger`,
        pricingMode: MenuItemPricingMode.SINGLE,
        basePrice: new Prisma.Decimal('10.50'),
        dietaryFlags: { fixtureTag: DEVELOPMENT_FIXTURE_TAG },
        sortOrder: 1,
      },
      {
        id: DEVELOPMENT_FIXTURE_IDS.cheeseburger,
        categoryId: DEVELOPMENT_FIXTURE_IDS.burgerCategory,
        name: 'Cheeseburger',
        slug: `${DEVELOPMENT_FIXTURE_TAG}-cheeseburger`,
        sku: 'DEVFX-BURGER-CHEESE',
        description: `Beef and cheddar · ${DEVELOPMENT_FIXTURE_TAG}`,
        imageUrl: `${IMAGE_BASE}?text=DEV+Cheeseburger`,
        pricingMode: MenuItemPricingMode.SINGLE,
        basePrice: new Prisma.Decimal('11.50'),
        dietaryFlags: { fixtureTag: DEVELOPMENT_FIXTURE_TAG },
        sortOrder: 2,
      },
    ];
    for (const item of items) {
      await tx.menuItem.upsert({
        where: { id: item.id },
        update: {
          ...item,
          restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
          taxTypeCode: 'REDUCED_FOOD',
          taxPercentage: new Prisma.Decimal('7.00'),
          prepTimeMinutes: 15,
          isActive: true,
          deletedAt: null,
        },
        create: {
          ...item,
          restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
          taxTypeCode: 'REDUCED_FOOD',
          taxPercentage: new Prisma.Decimal('7.00'),
          prepTimeMinutes: 15,
        },
      });
    }

    for (const [index, categoryId] of categoryIds.entries()) {
      await tx.restaurantMenuCategory.upsert({
        where: { id: taggedId(`menu_category_${index + 1}`) },
        update: {
          restaurantMenuId: DEVELOPMENT_FIXTURE_IDS.menu,
          menuCategoryId: categoryId,
          sortOrder: index + 1,
        },
        create: {
          id: taggedId(`menu_category_${index + 1}`),
          restaurantMenuId: DEVELOPMENT_FIXTURE_IDS.menu,
          menuCategoryId: categoryId,
          sortOrder: index + 1,
        },
      });
    }

    for (const [index, menuItemId] of itemIds.entries()) {
      const item = items[index];
      await tx.menuItemCategory.upsert({
        where: { id: taggedId(`item_category_${index + 1}`) },
        update: {
          menuItemId,
          menuCategoryId: item.categoryId,
          sortOrder: item.sortOrder,
        },
        create: {
          id: taggedId(`item_category_${index + 1}`),
          menuItemId,
          menuCategoryId: item.categoryId,
          sortOrder: item.sortOrder,
        },
      });
      await tx.restaurantMenuItem.upsert({
        where: { id: taggedId(`menu_item_${index + 1}`) },
        update: {
          restaurantMenuId: DEVELOPMENT_FIXTURE_IDS.menu,
          menuItemId,
          sortOrder: index + 1,
          isActive: true,
        },
        create: {
          id: taggedId(`menu_item_${index + 1}`),
          restaurantMenuId: DEVELOPMENT_FIXTURE_IDS.menu,
          menuItemId,
          sortOrder: index + 1,
        },
      });
      await tx.branchMenuItemOverride.upsert({
        where: { id: taggedId(`branch_item_${index + 1}`) },
        update: {
          branchId: DEVELOPMENT_FIXTURE_IDS.branch,
          menuItemId,
          isAvailable: true,
        },
        create: {
          id: taggedId(`branch_item_${index + 1}`),
          branchId: DEVELOPMENT_FIXTURE_IDS.branch,
          menuItemId,
          isAvailable: true,
        },
      });
    }

    for (const [index, menuCategoryId] of categoryIds.entries()) {
      await tx.branchCategoryOverride.upsert({
        where: { id: taggedId(`branch_category_${index + 1}`) },
        update: {
          branchId: DEVELOPMENT_FIXTURE_IDS.branch,
          menuCategoryId,
          isVisible: true,
        },
        create: {
          id: taggedId(`branch_category_${index + 1}`),
          branchId: DEVELOPMENT_FIXTURE_IDS.branch,
          menuCategoryId,
          isVisible: true,
        },
      });
    }

    const variations = [
      {
        id: DEVELOPMENT_FIXTURE_IDS.smallVariation,
        name: '[DEV FIXTURE] Small 26 cm',
        price: new Prisma.Decimal('0.00'),
        sortOrder: 1,
        isDefault: true,
      },
      {
        id: DEVELOPMENT_FIXTURE_IDS.largeVariation,
        name: '[DEV FIXTURE] Large 32 cm',
        price: new Prisma.Decimal('3.00'),
        sortOrder: 2,
        isDefault: false,
      },
    ];
    for (const variation of variations) {
      await tx.menuItemVariation.upsert({
        where: { id: variation.id },
        update: {
          ...variation,
          restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
          categoryId: DEVELOPMENT_FIXTURE_IDS.pizzaCategory,
          description: DEVELOPMENT_FIXTURE_TAG,
          isActive: true,
          deletedAt: null,
        },
        create: {
          ...variation,
          restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
          categoryId: DEVELOPMENT_FIXTURE_IDS.pizzaCategory,
          description: DEVELOPMENT_FIXTURE_TAG,
        },
      });
    }

    for (const [index, variation] of variations.entries()) {
      await tx.menuCategoryVariation.upsert({
        where: { id: taggedId(`category_variation_${index + 1}`) },
        update: {
          categoryId: DEVELOPMENT_FIXTURE_IDS.pizzaCategory,
          variationId: variation.id,
          sortOrder: variation.sortOrder,
          isDefault: variation.isDefault,
          isActive: true,
        },
        create: {
          id: taggedId(`category_variation_${index + 1}`),
          categoryId: DEVELOPMENT_FIXTURE_IDS.pizzaCategory,
          variationId: variation.id,
          sortOrder: variation.sortOrder,
          isDefault: variation.isDefault,
        },
      });
      await tx.menuItemVariationPriceOverride.upsert({
        where: { id: taggedId(`schinken_variation_${index + 1}`) },
        update: {
          menuItemId: DEVELOPMENT_FIXTURE_IDS.schinken,
          variationId: variation.id,
          price: new Prisma.Decimal(index === 0 ? '9.90' : '12.90'),
          displayText: DEVELOPMENT_FIXTURE_TAG,
        },
        create: {
          id: taggedId(`schinken_variation_${index + 1}`),
          menuItemId: DEVELOPMENT_FIXTURE_IDS.schinken,
          variationId: variation.id,
          price: new Prisma.Decimal(index === 0 ? '9.90' : '12.90'),
          displayText: DEVELOPMENT_FIXTURE_TAG,
        },
      });
    }

    await tx.modifierCategory.upsert({
      where: { id: DEVELOPMENT_FIXTURE_IDS.modifierCategory },
      update: {
        restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
        name: '[DEV FIXTURE] Pizza Extras',
        slug: `${DEVELOPMENT_FIXTURE_TAG}-pizza-extras`,
        description: DEVELOPMENT_FIXTURE_TAG,
        isActive: true,
        deletedAt: null,
      },
      create: {
        id: DEVELOPMENT_FIXTURE_IDS.modifierCategory,
        restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
        name: '[DEV FIXTURE] Pizza Extras',
        slug: `${DEVELOPMENT_FIXTURE_TAG}-pizza-extras`,
        description: DEVELOPMENT_FIXTURE_TAG,
      },
    });
    await tx.modifierGroup.upsert({
      where: { id: DEVELOPMENT_FIXTURE_IDS.modifierGroup },
      update: {
        restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
        name: '[DEV FIXTURE] Optional Pizza Extras',
        description: DEVELOPMENT_FIXTURE_TAG,
        minSelect: 0,
        maxSelect: 2,
        includedSelect: 0,
        isRequired: false,
        isActive: true,
        deletedAt: null,
      },
      create: {
        id: DEVELOPMENT_FIXTURE_IDS.modifierGroup,
        restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
        name: '[DEV FIXTURE] Optional Pizza Extras',
        description: DEVELOPMENT_FIXTURE_TAG,
        minSelect: 0,
        maxSelect: 2,
        includedSelect: 0,
        isRequired: false,
      },
    });

    const modifiers = [
      {
        id: DEVELOPMENT_FIXTURE_IDS.mushroomModifier,
        name: '[DEV FIXTURE] Mushrooms',
        priceDelta: new Prisma.Decimal('1.00'),
        sortOrder: 1,
      },
      {
        id: DEVELOPMENT_FIXTURE_IDS.jalapenoModifier,
        name: '[DEV FIXTURE] Jalapeños',
        priceDelta: new Prisma.Decimal('0.80'),
        sortOrder: 2,
      },
    ];
    for (const modifier of modifiers) {
      await tx.modifier.upsert({
        where: { id: modifier.id },
        update: {
          ...modifier,
          restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
          categoryId: DEVELOPMENT_FIXTURE_IDS.modifierCategory,
          isActive: true,
          deletedAt: null,
        },
        create: {
          ...modifier,
          restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
          categoryId: DEVELOPMENT_FIXTURE_IDS.modifierCategory,
        },
      });
    }
    for (const [index, modifier] of modifiers.entries()) {
      await tx.modifierGroupModifier.upsert({
        where: { id: taggedId(`group_modifier_${index + 1}`) },
        update: {
          modifierGroupId: DEVELOPMENT_FIXTURE_IDS.modifierGroup,
          modifierId: modifier.id,
          sortOrder: modifier.sortOrder,
        },
        create: {
          id: taggedId(`group_modifier_${index + 1}`),
          modifierGroupId: DEVELOPMENT_FIXTURE_IDS.modifierGroup,
          modifierId: modifier.id,
          sortOrder: modifier.sortOrder,
        },
      });
    }
    await tx.menuItemModifierGroup.upsert({
      where: { id: taggedId('schinken_modifier_group') },
      update: {
        menuItemId: DEVELOPMENT_FIXTURE_IDS.schinken,
        modifierGroupId: DEVELOPMENT_FIXTURE_IDS.modifierGroup,
        selectionType: ModifierSelectionType.MULTIPLE,
        minSelect: 0,
        maxSelect: 2,
      },
      create: {
        id: taggedId('schinken_modifier_group'),
        menuItemId: DEVELOPMENT_FIXTURE_IDS.schinken,
        modifierGroupId: DEVELOPMENT_FIXTURE_IDS.modifierGroup,
        selectionType: ModifierSelectionType.MULTIPLE,
        minSelect: 0,
        maxSelect: 2,
      },
    });
  });

  return getDevelopmentFixtureSummary(
    process.env.CUSTOMER_APP_BASE_DOMAIN ?? 'localhost',
  );
}

export async function verifyDevelopmentPizzaFixture(
  prisma: PrismaClient,
): Promise<DevelopmentFixtureSummary> {
  const [tenant, restaurant, branch, menu, categories, items, variations] =
    await Promise.all([
      prisma.tenant.findUnique({
        where: { id: DEVELOPMENT_FIXTURE_IDS.tenant },
      }),
      prisma.restaurant.findUnique({
        where: { id: DEVELOPMENT_FIXTURE_IDS.restaurant },
      }),
      prisma.branch.findUnique({
        where: { id: DEVELOPMENT_FIXTURE_IDS.branch },
      }),
      prisma.restaurantMenu.findUnique({
        where: { id: DEVELOPMENT_FIXTURE_IDS.menu },
      }),
      prisma.menuCategory.findMany({
        where: {
          restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
          isActive: true,
          deletedAt: null,
        },
      }),
      prisma.menuItem.findMany({
        where: {
          restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
          isActive: true,
          deletedAt: null,
        },
        include: {
          category: true,
          menuLinks: true,
          categoryLinks: true,
          variationPriceOverrides: { include: { variation: true } },
          modifierLinks: {
            include: {
              modifierGroup: {
                include: { modifierLinks: { include: { modifier: true } } },
              },
            },
          },
        },
      }),
      prisma.menuItemVariation.findMany({
        where: {
          restaurantId: DEVELOPMENT_FIXTURE_IDS.restaurant,
          isActive: true,
          deletedAt: null,
        },
      }),
    ]);

  if (!tenant || !restaurant || !branch || !menu) {
    throw new Error(
      'Development fixture verification failed: context is missing.',
    );
  }
  if (
    categories.length !== 2 ||
    items.length !== 4 ||
    variations.length !== 2
  ) {
    throw new Error(
      `Development fixture verification failed: expected 2 categories, 4 items, and 2 variations; got ${categories.length}, ${items.length}, and ${variations.length}.`,
    );
  }
  if (
    categories
      .map((category) => category.name)
      .sort()
      .join(',') !== 'Burger,Pizza'
  ) {
    throw new Error(
      'Development fixture verification failed: categories must be Pizza and Burger.',
    );
  }
  const schinken = items.find(
    (item) => item.id === DEVELOPMENT_FIXTURE_IDS.schinken,
  );
  if (
    !schinken ||
    schinken.variationPriceOverrides.length !== 2 ||
    schinken.modifierLinks.length !== 1 ||
    schinken.modifierLinks[0].modifierGroup.modifierLinks.length !== 2
  ) {
    throw new Error(
      'Development fixture verification failed: Schinken customization graph is incomplete.',
    );
  }
  if (
    items.some(
      (item) => item.menuLinks.length !== 1 || item.categoryLinks.length !== 1,
    )
  ) {
    throw new Error(
      'Development fixture verification failed: storefront menu relationships are incomplete.',
    );
  }

  return getDevelopmentFixtureSummary(
    process.env.CUSTOMER_APP_BASE_DOMAIN ?? 'localhost',
  );
}

export async function cleanupDevelopmentPizzaFixture(
  prisma: PrismaClient,
): Promise<void> {
  const tagged = { id: { startsWith: DEVELOPMENT_FIXTURE_ID_PREFIX } };
  await prisma.$transaction(async (tx) => {
    await tx.cartItem.deleteMany({ where: tagged });
    await tx.cart.deleteMany({ where: tagged });
    await tx.menuVariationModifierPriceOverride.deleteMany({ where: tagged });
    await tx.menuItemModifierPriceOverride.deleteMany({ where: tagged });
    await tx.menuItemModifierGroup.deleteMany({ where: tagged });
    await tx.modifierGroupModifier.deleteMany({ where: tagged });
    await tx.restaurantMenuItem.deleteMany({ where: tagged });
    await tx.restaurantMenuCategory.deleteMany({ where: tagged });
    await tx.branchMenuItemOverride.deleteMany({ where: tagged });
    await tx.branchCategoryOverride.deleteMany({ where: tagged });
    await tx.menuItemVariationPriceOverride.deleteMany({ where: tagged });
    await tx.menuCategoryVariation.deleteMany({ where: tagged });
    await tx.menuItemCategory.deleteMany({ where: tagged });
    await tx.modifier.deleteMany({ where: tagged });
    await tx.modifierGroup.deleteMany({ where: tagged });
    await tx.modifierCategory.deleteMany({ where: tagged });
    await tx.menuItemVariation.deleteMany({ where: tagged });
    await tx.menuItem.deleteMany({ where: tagged });
    await tx.menuCategory.deleteMany({ where: tagged });
    await tx.restaurantMenu.deleteMany({ where: tagged });
    await tx.address.deleteMany({ where: tagged });
    await tx.branch.deleteMany({ where: tagged });
    await tx.restaurant.deleteMany({ where: tagged });
    await tx.tenant.deleteMany({ where: tagged });
  });
}
