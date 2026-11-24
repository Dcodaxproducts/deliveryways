import {
  AddressRefType,
  CouponApplyMode,
  CouponAudience,
  CouponCampaignKind,
  CouponDiscountType,
  CouponDealSelectionMode,
  CouponStatus,
  LoyaltyTransactionType,
  MenuItemPricingMode,
  ModifierSelectionType,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  PrismaClient,
  UserRole,
} from '@prisma/client';

export const PARTNER_FIXTURE_CONFIRMATION =
  'I_UNDERSTAND_THIS_MUTATES_A_DEVELOPMENT_DATABASE';
export const PARTNER_FIXTURE_TAG = 'dw-dev-partner-20261124-v1';
export const PARTNER_FIXTURE_PREFIX = 'devfx_dw_partner_v1_';

const id = (suffix: string): string => PARTNER_FIXTURE_PREFIX + suffix;
const day = 24 * 60 * 60 * 1000;

export const PARTNER_FIXTURE_IDS = {
  menu: id('menu'),
  categories: ['starters', 'mains', 'drinks'].map(id),
  items: ['wings', 'burger', 'pizza', 'pasta', 'lemonade', 'coffee'].map(id),
  variations: ['regular', 'large'].map(id),
  modifierCategory: id('modifier_category'),
  modifierGroup: id('modifier_group'),
  modifiers: ['cheese', 'jalapeno', 'fries', 'sauce'].map(id),
  customers: ['customer_1', 'customer_2', 'customer_3', 'customer_4'].map(id),
  profiles: ['profile_1', 'profile_2', 'profile_3', 'profile_4'].map(id),
  addresses: ['address_1', 'address_2', 'address_3', 'address_4'].map(id),
  coupons: ['coupon_welcome', 'coupon_deal'].map(id),
  orders: Array.from({ length: 8 }, (_, index) => id('order_' + (index + 1))),
  orderItems: Array.from({ length: 8 }, (_, index) =>
    id('order_item_' + (index + 1)),
  ),
  payments: Array.from({ length: 6 }, (_, index) =>
    id('payment_' + (index + 1)),
  ),
  reservations: Array.from({ length: 4 }, (_, index) =>
    id('reservation_' + (index + 1)),
  ),
  loyaltyProgram: id('loyalty_program'),
  loyaltyAccounts: [
    'loyalty_account_1',
    'loyalty_account_2',
    'loyalty_account_3',
    'loyalty_account_4',
  ].map(id),
  loyaltyTransactions: [
    'loyalty_tx_1',
    'loyalty_tx_2',
    'loyalty_tx_3',
    'loyalty_tx_4',
  ].map(id),
} as const;

export const PARTNER_FIXTURE_COUNTS = {
  menus: 1,
  categories: 3,
  items: 6,
  variations: 2,
  modifierCategories: 1,
  modifierGroups: 1,
  modifiers: 4,
  customers: 4,
  profiles: 4,
  addresses: 4,
  coupons: 2,
  orders: 8,
  orderItems: 8,
  paymentTransactions: 6,
  reservations: 4,
  loyaltyAccounts: 4,
  loyaltyTransactions: 4,
} as const;

export interface PartnerFixtureTarget {
  tenantId: string;
  restaurantId: string;
  partnerEmail: string;
}

export interface PartnerFixtureSafetyInput {
  nodeEnv?: string;
  confirmation?: string;
  databaseUrl?: string;
}

export interface PartnerFixtureContext extends PartnerFixtureTarget {
  branchId: string;
  partnerUserId: string;
  loyaltyProgramId?: string;
  loyaltyProgramOwned: boolean;
}

export function assertPartnerFixtureSafety(
  input: PartnerFixtureSafetyInput,
): URL {
  if (!['development', 'test'].includes(input.nodeEnv ?? '')) {
    throw new Error(
      'Partner fixture refused: NODE_ENV must be development or test.',
    );
  }
  if (input.confirmation !== PARTNER_FIXTURE_CONFIRMATION) {
    throw new Error(
      'Partner fixture refused: exact DELIVERYWAYS_DEV_FIXTURE_CONFIRM is required.',
    );
  }
  if (!input.databaseUrl) {
    throw new Error('Partner fixture refused: DATABASE_URL is required.');
  }
  let parsed: URL;
  try {
    parsed = new URL(input.databaseUrl);
  } catch {
    throw new Error('Partner fixture refused: DATABASE_URL is invalid.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(
      'Partner fixture refused: DATABASE_URL must use PostgreSQL.',
    );
  }
  const comparable = [parsed.hostname, parsed.pathname, parsed.username]
    .map((value) => decodeURIComponent(value).toLowerCase())
    .join(' ');
  if (/(^|[._/-])(prod|production|live|staging)([._/-]|$)/i.test(comparable)) {
    throw new Error(
      'Partner fixture refused: DATABASE_URL contains a production-like marker.',
    );
  }
  const databaseName = decodeURIComponent(
    parsed.pathname.replace(/^\//, ''),
  ).toLowerCase();
  if (!/(dev|development|test|local|sandbox)/.test(databaseName)) {
    throw new Error(
      'Partner fixture refused: database name must contain dev, development, test, local, or sandbox.',
    );
  }
  return parsed;
}

export function validatePartnerFixtureTarget(
  target: PartnerFixtureTarget,
): PartnerFixtureTarget {
  const tenantId = target.tenantId.trim();
  const restaurantId = target.restaurantId.trim();
  const partnerEmail = target.partnerEmail.trim().toLowerCase();
  if (!tenantId || !restaurantId || !partnerEmail) {
    throw new Error(
      'Partner fixture requires --tenant-id, --restaurant-id, and --partner-email.',
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(partnerEmail)) {
    throw new Error('Partner fixture refused: partner email is invalid.');
  }
  return { tenantId, restaurantId, partnerEmail };
}

export function getPartnerFixtureSummary(
  target: PartnerFixtureTarget,
): Record<string, unknown> {
  return {
    fixtureTag: PARTNER_FIXTURE_TAG,
    target,
    counts: PARTNER_FIXTURE_COUNTS,
    financeAndPayouts: 'not created',
  };
}

async function rejectUniqueCollisions(
  prisma: PrismaClient,
  target: PartnerFixtureTarget,
): Promise<void> {
  const customerEmails = Array.from(
    { length: 4 },
    (_, index) =>
      'dev-partner-fixture+' + (index + 1) + '@deliveryways.invalid',
  );
  const [menu, categories, items, coupons, customers] = await Promise.all([
    prisma.restaurantMenu.findFirst({
      where: {
        restaurantId: target.restaurantId,
        slug: 'dev-partner-fixture-v1',
        NOT: { id: PARTNER_FIXTURE_IDS.menu },
      },
      select: { id: true },
    }),
    prisma.menuCategory.findMany({
      where: {
        restaurantId: target.restaurantId,
        slug: {
          in: [
            'dev-fixture-starters-v1',
            'dev-fixture-mains-v1',
            'dev-fixture-drinks-v1',
          ],
        },
        id: { notIn: [...PARTNER_FIXTURE_IDS.categories] },
      },
      select: { id: true },
    }),
    prisma.menuItem.findMany({
      where: {
        restaurantId: target.restaurantId,
        slug: {
          in: [
            'dev-wings-v1',
            'dev-burger-v1',
            'dev-pizza-v1',
            'dev-pasta-v1',
            'dev-lemonade-v1',
            'dev-coffee-v1',
          ],
        },
        id: { notIn: [...PARTNER_FIXTURE_IDS.items] },
      },
      select: { id: true },
    }),
    prisma.coupon.findMany({
      where: {
        restaurantId: target.restaurantId,
        code: { in: ['DEVWELCOME25V1', 'DEVMEALDEALV1'] },
        id: { notIn: [...PARTNER_FIXTURE_IDS.coupons] },
      },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: {
        restaurantId: target.restaurantId,
        email: { in: customerEmails },
        id: { notIn: [...PARTNER_FIXTURE_IDS.customers] },
      },
      select: { id: true },
    }),
  ]);
  const foreignIdCounts = await Promise.all([
    prisma.restaurantMenu.count({
      where: {
        id: PARTNER_FIXTURE_IDS.menu,
        NOT: { restaurantId: target.restaurantId },
      },
    }),
    prisma.menuCategory.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.categories] },
        NOT: { restaurantId: target.restaurantId },
      },
    }),
    prisma.menuItem.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.items] },
        NOT: { restaurantId: target.restaurantId },
      },
    }),
    prisma.menuItemVariation.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.variations] },
        NOT: { restaurantId: target.restaurantId },
      },
    }),
    prisma.modifierCategory.count({
      where: {
        id: PARTNER_FIXTURE_IDS.modifierCategory,
        NOT: { restaurantId: target.restaurantId },
      },
    }),
    prisma.modifierGroup.count({
      where: {
        id: PARTNER_FIXTURE_IDS.modifierGroup,
        NOT: { restaurantId: target.restaurantId },
      },
    }),
    prisma.modifier.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.modifiers] },
        NOT: { restaurantId: target.restaurantId },
      },
    }),
    prisma.coupon.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.coupons] },
        NOT: { restaurantId: target.restaurantId },
      },
    }),
    prisma.user.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.customers] },
        OR: [
          { tenantId: { not: target.tenantId } },
          { restaurantId: { not: target.restaurantId } },
        ],
      },
    }),
    prisma.order.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.orders] },
        OR: [
          { tenantId: { not: target.tenantId } },
          { restaurantId: { not: target.restaurantId } },
        ],
      },
    }),
  ]);
  if (
    menu ||
    categories.length ||
    items.length ||
    coupons.length ||
    customers.length ||
    foreignIdCounts.some((count) => count > 0)
  ) {
    throw new Error(
      'Partner fixture refused: fixture keys or deterministic IDs belong to non-fixture/other-target records.',
    );
  }
}

export async function inspectPartnerFixtureTarget(
  prisma: PrismaClient,
  rawTarget: PartnerFixtureTarget,
): Promise<PartnerFixtureContext> {
  const target = validatePartnerFixtureTarget(rawTarget);
  const [tenant, restaurant, partner, branch, loyaltyProgram] =
    await Promise.all([
      prisma.tenant.findUnique({
        where: { id: target.tenantId },
        select: { id: true, isActive: true, deletedAt: true },
      }),
      prisma.restaurant.findUnique({
        where: { id: target.restaurantId },
        select: { id: true, tenantId: true, isActive: true, deletedAt: true },
      }),
      prisma.user.findFirst({
        where: {
          email: target.partnerEmail,
          restaurantId: target.restaurantId,
        },
        select: {
          id: true,
          tenantId: true,
          restaurantId: true,
          role: true,
          isActive: true,
          deletedAt: true,
        },
      }),
      prisma.branch.findFirst({
        where: {
          tenantId: target.tenantId,
          restaurantId: target.restaurantId,
          isMain: true,
          isActive: true,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }),
      prisma.loyaltyProgram.findUnique({
        where: { restaurantId: target.restaurantId },
        select: { id: true },
      }),
    ]);
  if (!tenant || !tenant.isActive || tenant.deletedAt)
    throw new Error('Partner fixture refused: active tenant not found.');
  if (
    !restaurant ||
    restaurant.tenantId !== target.tenantId ||
    !restaurant.isActive ||
    restaurant.deletedAt
  )
    throw new Error(
      'Partner fixture refused: restaurant is not active or does not belong to tenant.',
    );
  if (
    !partner ||
    partner.role !== UserRole.BUSINESS_ADMIN ||
    partner.tenantId !== target.tenantId ||
    partner.restaurantId !== target.restaurantId ||
    !partner.isActive ||
    partner.deletedAt
  ) {
    throw new Error(
      'Partner fixture refused: partner must be an active BUSINESS_ADMIN linked to the tenant and restaurant.',
    );
  }
  if (!branch)
    throw new Error(
      'Partner fixture refused: active main branch not found for restaurant.',
    );
  await rejectUniqueCollisions(prisma, target);
  return {
    ...target,
    branchId: branch.id,
    partnerUserId: partner.id,
    loyaltyProgramId: loyaltyProgram?.id,
    loyaltyProgramOwned:
      loyaltyProgram?.id === PARTNER_FIXTURE_IDS.loyaltyProgram,
  };
}

const categoryData = [
  {
    name: 'Dev Starters',
    slug: 'dev-fixture-starters-v1',
    description: 'Fixture starters',
    sortOrder: 10,
  },
  {
    name: 'Dev Mains',
    slug: 'dev-fixture-mains-v1',
    description: 'Fixture main courses',
    sortOrder: 20,
  },
  {
    name: 'Dev Drinks',
    slug: 'dev-fixture-drinks-v1',
    description: 'Fixture beverages',
    sortOrder: 30,
  },
];
const itemData = [
  {
    name: 'Smoky Wings',
    slug: 'dev-wings-v1',
    category: 0,
    price: '790.00',
    sku: 'DEV-WINGS-V1',
  },
  {
    name: 'Classic Stack Burger',
    slug: 'dev-burger-v1',
    category: 1,
    price: '1290.00',
    sku: 'DEV-BURGER-V1',
  },
  {
    name: 'Garden Pizza',
    slug: 'dev-pizza-v1',
    category: 1,
    price: '1590.00',
    sku: 'DEV-PIZZA-V1',
  },
  {
    name: 'Creamy Herb Pasta',
    slug: 'dev-pasta-v1',
    category: 1,
    price: '1390.00',
    sku: 'DEV-PASTA-V1',
  },
  {
    name: 'Mint Lemonade',
    slug: 'dev-lemonade-v1',
    category: 2,
    price: '390.00',
    sku: 'DEV-LEMONADE-V1',
  },
  {
    name: 'Roasted Coffee',
    slug: 'dev-coffee-v1',
    category: 2,
    price: '450.00',
    sku: 'DEV-COFFEE-V1',
  },
];

export async function applyPartnerFixture(
  prisma: PrismaClient,
  rawTarget: PartnerFixtureTarget,
): Promise<Record<string, unknown>> {
  const context = await inspectPartnerFixtureTarget(prisma, rawTarget);
  let loyaltyProgramId = context.loyaltyProgramId;
  await prisma.$transaction(
    async (tx) => {
      await tx.restaurantMenu.upsert({
        where: { id: PARTNER_FIXTURE_IDS.menu },
        create: {
          id: PARTNER_FIXTURE_IDS.menu,
          restaurantId: context.restaurantId,
          name: 'Development Partner Menu',
          slug: 'dev-partner-fixture-v1',
          description: PARTNER_FIXTURE_TAG,
          sortOrder: 900,
          isActive: true,
        },
        update: {
          name: 'Development Partner Menu',
          description: PARTNER_FIXTURE_TAG,
          isActive: true,
          deletedAt: null,
        },
      });
      for (let index = 0; index < categoryData.length; index += 1) {
        const data = categoryData[index];
        const categoryId = PARTNER_FIXTURE_IDS.categories[index];
        await tx.menuCategory.upsert({
          where: { id: categoryId },
          create: {
            id: categoryId,
            restaurantId: context.restaurantId,
            ...data,
            isActive: true,
          },
          update: { ...data, isActive: true, deletedAt: null },
        });
        await tx.restaurantMenuCategory.upsert({
          where: {
            restaurantMenuId_menuCategoryId: {
              restaurantMenuId: PARTNER_FIXTURE_IDS.menu,
              menuCategoryId: categoryId,
            },
          },
          create: {
            id: id('menu_category_' + (index + 1)),
            restaurantMenuId: PARTNER_FIXTURE_IDS.menu,
            menuCategoryId: categoryId,
            sortOrder: data.sortOrder,
          },
          update: { sortOrder: data.sortOrder },
        });
      }
      for (let index = 0; index < itemData.length; index += 1) {
        const data = itemData[index];
        const itemId = PARTNER_FIXTURE_IDS.items[index];
        const categoryId = PARTNER_FIXTURE_IDS.categories[data.category];
        const values = {
          name: data.name,
          slug: data.slug,
          categoryId,
          description: 'Development fixture item: ' + data.name,
          sku: data.sku,
          sortOrder: (index + 1) * 10,
          pricingMode:
            index === 2
              ? MenuItemPricingMode.MULTIPLE
              : MenuItemPricingMode.SINGLE,
          basePrice: new Prisma.Decimal(data.price),
          prepTimeMinutes: 15,
          isActive: true,
        };
        await tx.menuItem.upsert({
          where: { id: itemId },
          create: { id: itemId, restaurantId: context.restaurantId, ...values },
          update: { ...values, deletedAt: null },
        });
        await tx.restaurantMenuItem.upsert({
          where: {
            restaurantMenuId_menuItemId: {
              restaurantMenuId: PARTNER_FIXTURE_IDS.menu,
              menuItemId: itemId,
            },
          },
          create: {
            id: id('menu_item_' + (index + 1)),
            restaurantMenuId: PARTNER_FIXTURE_IDS.menu,
            menuItemId: itemId,
            sortOrder: (index + 1) * 10,
            isActive: true,
          },
          update: { sortOrder: (index + 1) * 10, isActive: true },
        });
      }
      for (
        let index = 0;
        index < PARTNER_FIXTURE_IDS.variations.length;
        index += 1
      ) {
        const variationId = PARTNER_FIXTURE_IDS.variations[index];
        const name = index === 0 ? 'Regular' : 'Large';
        await tx.menuItemVariation.upsert({
          where: { id: variationId },
          create: {
            id: variationId,
            restaurantId: context.restaurantId,
            categoryId: PARTNER_FIXTURE_IDS.categories[1],
            name,
            price: new Prisma.Decimal(index === 0 ? '1590.00' : '2090.00'),
            sortOrder: index * 10,
            isDefault: index === 0,
            isActive: true,
          },
          update: {
            name,
            isDefault: index === 0,
            isActive: true,
            deletedAt: null,
          },
        });
        await tx.menuCategoryVariation.upsert({
          where: {
            categoryId_variationId: {
              categoryId: PARTNER_FIXTURE_IDS.categories[1],
              variationId,
            },
          },
          create: {
            id: id('category_variation_' + (index + 1)),
            categoryId: PARTNER_FIXTURE_IDS.categories[1],
            variationId,
            sortOrder: index * 10,
            isDefault: index === 0,
          },
          update: {
            sortOrder: index * 10,
            isDefault: index === 0,
            isActive: true,
          },
        });
        await tx.menuItemVariationPriceOverride.upsert({
          where: {
            menuItemId_variationId: {
              menuItemId: PARTNER_FIXTURE_IDS.items[2],
              variationId,
            },
          },
          create: {
            id: id('item_variation_' + (index + 1)),
            menuItemId: PARTNER_FIXTURE_IDS.items[2],
            variationId,
            price: new Prisma.Decimal(index === 0 ? '1590.00' : '2090.00'),
          },
          update: {
            price: new Prisma.Decimal(index === 0 ? '1590.00' : '2090.00'),
          },
        });
      }
      await tx.modifierCategory.upsert({
        where: { id: PARTNER_FIXTURE_IDS.modifierCategory },
        create: {
          id: PARTNER_FIXTURE_IDS.modifierCategory,
          restaurantId: context.restaurantId,
          name: 'Dev Extras',
          slug: 'dev-extras-v1',
          description: PARTNER_FIXTURE_TAG,
          sortOrder: 900,
        },
        update: {
          name: 'Dev Extras',
          description: PARTNER_FIXTURE_TAG,
          isActive: true,
          deletedAt: null,
        },
      });
      await tx.modifierGroup.upsert({
        where: { id: PARTNER_FIXTURE_IDS.modifierGroup },
        create: {
          id: PARTNER_FIXTURE_IDS.modifierGroup,
          restaurantId: context.restaurantId,
          name: 'Development Extras v1',
          description: PARTNER_FIXTURE_TAG,
          minSelect: 0,
          maxSelect: 3,
          sortOrder: 900,
        },
        update: {
          description: PARTNER_FIXTURE_TAG,
          minSelect: 0,
          maxSelect: 3,
          isActive: true,
          deletedAt: null,
        },
      });
      const modifierNames = [
        'Extra cheese',
        'Jalapeño',
        'Seasoned fries',
        'House sauce',
      ];
      const modifierPrices = ['190.00', '90.00', '290.00', '120.00'];
      for (let index = 0; index < modifierNames.length; index += 1) {
        const modifierId = PARTNER_FIXTURE_IDS.modifiers[index];
        await tx.modifier.upsert({
          where: { id: modifierId },
          create: {
            id: modifierId,
            restaurantId: context.restaurantId,
            categoryId: PARTNER_FIXTURE_IDS.modifierCategory,
            name: modifierNames[index],
            priceDelta: new Prisma.Decimal(modifierPrices[index]),
            sortOrder: index * 10,
          },
          update: {
            name: modifierNames[index],
            priceDelta: new Prisma.Decimal(modifierPrices[index]),
            isActive: true,
            deletedAt: null,
          },
        });
        await tx.modifierGroupModifier.upsert({
          where: {
            modifierGroupId_modifierId: {
              modifierGroupId: PARTNER_FIXTURE_IDS.modifierGroup,
              modifierId,
            },
          },
          create: {
            id: id('group_modifier_' + (index + 1)),
            modifierGroupId: PARTNER_FIXTURE_IDS.modifierGroup,
            modifierId,
            sortOrder: index * 10,
          },
          update: { sortOrder: index * 10 },
        });
      }
      for (const menuItemId of [
        PARTNER_FIXTURE_IDS.items[1],
        PARTNER_FIXTURE_IDS.items[2],
      ]) {
        await tx.menuItemModifierGroup.upsert({
          where: {
            menuItemId_modifierGroupId: {
              menuItemId,
              modifierGroupId: PARTNER_FIXTURE_IDS.modifierGroup,
            },
          },
          create: {
            id: id('item_modifier_' + menuItemId.slice(-8)),
            menuItemId,
            modifierGroupId: PARTNER_FIXTURE_IDS.modifierGroup,
            sortOrder: 10,
            selectionType: ModifierSelectionType.MULTIPLE,
            minSelect: 0,
            maxSelect: 3,
          },
          update: {
            sortOrder: 10,
            selectionType: ModifierSelectionType.MULTIPLE,
            minSelect: 0,
            maxSelect: 3,
          },
        });
      }
      const names = [
        ['Ayesha', 'Khan'],
        ['Hamza', 'Ali'],
        ['Sara', 'Ahmed'],
        ['Omar', 'Malik'],
      ];
      for (let index = 0; index < names.length; index += 1) {
        const customerId = PARTNER_FIXTURE_IDS.customers[index];
        const email =
          'dev-partner-fixture+' + (index + 1) + '@deliveryways.invalid';
        await tx.user.upsert({
          where: { id: customerId },
          create: {
            id: customerId,
            email,
            password: '!fixture-login-disabled!',
            role: UserRole.CUSTOMER,
            tenantId: context.tenantId,
            restaurantId: context.restaurantId,
            branchId: context.branchId,
            isVerified: true,
            isApproved: true,
            isActive: true,
          },
          update: {
            email,
            tenantId: context.tenantId,
            restaurantId: context.restaurantId,
            branchId: context.branchId,
            role: UserRole.CUSTOMER,
            isVerified: true,
            isApproved: true,
            isActive: true,
            deletedAt: null,
          },
        });
        await tx.profile.upsert({
          where: { userId: customerId },
          create: {
            id: PARTNER_FIXTURE_IDS.profiles[index],
            userId: customerId,
            firstName: names[index][0],
            lastName: names[index][1],
            phone: '+9230011100' + (index + 1),
            metadata: { fixtureTag: PARTNER_FIXTURE_TAG },
          },
          update: {
            firstName: names[index][0],
            lastName: names[index][1],
            phone: '+9230011100' + (index + 1),
            metadata: { fixtureTag: PARTNER_FIXTURE_TAG },
            isActive: true,
            deletedAt: null,
          },
        });
        await tx.address.upsert({
          where: { id: PARTNER_FIXTURE_IDS.addresses[index] },
          create: {
            id: PARTNER_FIXTURE_IDS.addresses[index],
            tenantId: context.tenantId,
            referenceId: customerId,
            refType: AddressRefType.USER,
            street: index + 10 + ' Development Lane',
            area: 'Fixture District',
            city: 'Lahore',
            state: 'Punjab',
            country: 'Pakistan',
            postalCode: '54000',
          },
          update: {
            referenceId: customerId,
            street: index + 10 + ' Development Lane',
            area: 'Fixture District',
            city: 'Lahore',
            state: 'Punjab',
            country: 'Pakistan',
            isActive: true,
            deletedAt: null,
          },
        });
      }
      const now = new Date();
      const couponValues = [
        {
          code: 'DEVWELCOME25V1',
          title: 'Development Welcome 25%',
          kind: CouponCampaignKind.PROMOTION,
          applyMode: CouponApplyMode.ORDER_TOTAL,
          discountType: CouponDiscountType.PERCENTAGE,
          discountValue: '25.00',
          scopeMenuItemId: null,
          scopeCategoryId: null,
          dealSelectionMode: null,
          dealRequiredQuantity: null,
        },
        {
          code: 'DEVMEALDEALV1',
          title: 'Development Burger Deal',
          kind: CouponCampaignKind.PROMOTION,
          applyMode: CouponApplyMode.SCOPED_ITEMS,
          discountType: CouponDiscountType.FIXED_PRICE,
          discountValue: '999.00',
          scopeMenuItemId: PARTNER_FIXTURE_IDS.items[1],
          scopeCategoryId: null,
          dealSelectionMode: CouponDealSelectionMode.FIXED_ITEMS,
          dealRequiredQuantity: 1,
        },
      ];
      for (let index = 0; index < couponValues.length; index += 1) {
        const value = couponValues[index];
        await tx.coupon.upsert({
          where: { id: PARTNER_FIXTURE_IDS.coupons[index] },
          create: {
            id: PARTNER_FIXTURE_IDS.coupons[index],
            tenantId: context.tenantId,
            restaurantId: context.restaurantId,
            branchId: context.branchId,
            ...value,
            description: PARTNER_FIXTURE_TAG,
            audience: CouponAudience.BOTH,
            status: CouponStatus.ACTIVE,
            allowedOrderTypes: [
              OrderType.DELIVERY,
              OrderType.TAKEAWAY,
              OrderType.DINE_IN,
            ],
            maxUses: 100,
            maxUsesPerCustomer: 5,
            startsAt: new Date(now.getTime() - 30 * day),
            expiresAt: new Date(now.getTime() + 180 * day),
            isActive: true,
          },
          update: {
            ...value,
            description: PARTNER_FIXTURE_TAG,
            status: CouponStatus.ACTIVE,
            startsAt: new Date(now.getTime() - 30 * day),
            expiresAt: new Date(now.getTime() + 180 * day),
            isActive: true,
            deletedAt: null,
          },
        });
      }
      const statuses = [
        OrderStatus.PLACED,
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.READY_FOR_PICKUP,
        OrderStatus.DELIVERED,
        OrderStatus.SERVED,
        OrderStatus.CANCELLED,
        OrderStatus.REJECTED,
      ];
      const methods = [
        PaymentMethod.COD,
        PaymentMethod.CARD_ON_DELIVERY,
        PaymentMethod.STRIPE,
        PaymentMethod.EASYPAISA,
        PaymentMethod.JAZZCASH,
        PaymentMethod.BANK_TRANSFER,
        PaymentMethod.COD,
        PaymentMethod.PAYPAL,
      ];
      const orderTypes = [
        OrderType.DELIVERY,
        OrderType.TAKEAWAY,
        OrderType.DINE_IN,
        OrderType.TAKEAWAY,
        OrderType.DELIVERY,
        OrderType.DINE_IN,
        OrderType.DELIVERY,
        OrderType.TAKEAWAY,
      ];
      for (
        let index = 0;
        index < PARTNER_FIXTURE_IDS.orders.length;
        index += 1
      ) {
        const createdAt = new Date(now.getTime() - (index + 1) * 4 * day);
        const total = new Prisma.Decimal((1290 + index * 100).toFixed(2));
        const completed =
          statuses[index] === OrderStatus.DELIVERED ||
          statuses[index] === OrderStatus.SERVED;
        const cancelled =
          statuses[index] === OrderStatus.CANCELLED ||
          statuses[index] === OrderStatus.REJECTED;
        await tx.order.upsert({
          where: { id: PARTNER_FIXTURE_IDS.orders[index] },
          create: {
            id: PARTNER_FIXTURE_IDS.orders[index],
            tenantId: context.tenantId,
            restaurantId: context.restaurantId,
            branchId: context.branchId,
            customerId: PARTNER_FIXTURE_IDS.customers[index % 4],
            couponId: index === 4 ? PARTNER_FIXTURE_IDS.coupons[0] : null,
            deliveryAddressId:
              orderTypes[index] === OrderType.DELIVERY
                ? PARTNER_FIXTURE_IDS.addresses[index % 4]
                : null,
            orderType: orderTypes[index],
            paymentMethod: methods[index],
            orderTime: createdAt,
            status: statuses[index],
            subtotal: total,
            taxAmount: new Prisma.Decimal('0'),
            deliveryFee:
              orderTypes[index] === OrderType.DELIVERY
                ? new Prisma.Decimal('150.00')
                : new Prisma.Decimal('0'),
            totalAmount:
              orderTypes[index] === OrderType.DELIVERY ? total.add(150) : total,
            paymentStatus: completed
              ? PaymentStatus.PAID
              : cancelled
                ? PaymentStatus.CANCELLED
                : PaymentStatus.PENDING,
            paidAt: completed ? createdAt : null,
            deliveredAt:
              statuses[index] === OrderStatus.DELIVERED ? createdAt : null,
            cancelledAt: cancelled ? createdAt : null,
            customerNote: PARTNER_FIXTURE_TAG,
            createdAt,
          },
          update: {
            status: statuses[index],
            paymentMethod: methods[index],
            paymentStatus: completed
              ? PaymentStatus.PAID
              : cancelled
                ? PaymentStatus.CANCELLED
                : PaymentStatus.PENDING,
            customerNote: PARTNER_FIXTURE_TAG,
          },
        });
        await tx.orderItem.upsert({
          where: { id: PARTNER_FIXTURE_IDS.orderItems[index] },
          create: {
            id: PARTNER_FIXTURE_IDS.orderItems[index],
            orderId: PARTNER_FIXTURE_IDS.orders[index],
            menuItemId: PARTNER_FIXTURE_IDS.items[index % 6],
            menuItemName: itemData[index % 6].name,
            unitPrice: total,
            quantity: 1,
            lineTotal: total,
            note: PARTNER_FIXTURE_TAG,
            snapshotModifiers:
              index % 2 === 0 ? [{ name: 'House sauce', priceDelta: 120 }] : [],
          },
          update: {
            menuItemName: itemData[index % 6].name,
            unitPrice: total,
            quantity: 1,
            lineTotal: total,
            note: PARTNER_FIXTURE_TAG,
          },
        });
        if (index < 6) {
          const paid = completed;
          await tx.paymentTransaction.upsert({
            where: { id: PARTNER_FIXTURE_IDS.payments[index] },
            create: {
              id: PARTNER_FIXTURE_IDS.payments[index],
              orderId: PARTNER_FIXTURE_IDS.orders[index],
              tenantId: context.tenantId,
              restaurantId: context.restaurantId,
              branchId: context.branchId,
              paymentMethod: methods[index],
              type: PaymentTransactionType.CHARGE,
              status: paid ? PaymentStatus.PAID : PaymentStatus.PENDING,
              amount: total,
              currency: 'PKR',
              providerRef: PARTNER_FIXTURE_TAG + '-' + (index + 1),
              note: PARTNER_FIXTURE_TAG,
              processedAt: paid ? createdAt : null,
              createdAt,
            },
            update: {
              status: paid ? PaymentStatus.PAID : PaymentStatus.PENDING,
              amount: total,
              note: PARTNER_FIXTURE_TAG,
            },
          });
        }
      }
      const reservationStatuses = [
        'REQUESTED',
        'CONFIRMED',
        'SEATED',
        'CANCELLED',
      ];
      for (
        let index = 0;
        index < PARTNER_FIXTURE_IDS.reservations.length;
        index += 1
      ) {
        const reservationDate = new Date(now.getTime() + (index + 1) * day);
        await tx.tableReservation.upsert({
          where: { id: PARTNER_FIXTURE_IDS.reservations[index] },
          create: {
            id: PARTNER_FIXTURE_IDS.reservations[index],
            tenantId: context.tenantId,
            restaurantId: context.restaurantId,
            branchId: context.branchId,
            customerId: PARTNER_FIXTURE_IDS.customers[index],
            reservationDate,
            durationMinutes: 60,
            guestCount: index + 2,
            note: PARTNER_FIXTURE_TAG,
            status: reservationStatuses[index],
            guestName: ['Ayesha Khan', 'Hamza Ali', 'Sara Ahmed', 'Omar Malik'][
              index
            ],
            guestEmail:
              'dev-partner-fixture+' + (index + 1) + '@deliveryways.invalid',
            guestPhone: '+9230011100' + (index + 1),
            idempotencyScope: PARTNER_FIXTURE_TAG,
            clientRequestId:
              '00000000-0000-4000-8000-00000000000' + (index + 1),
            requestFingerprint: String(index + 1).repeat(64),
            cancelledAt: index === 3 ? now : null,
          },
          update: {
            reservationDate,
            status: reservationStatuses[index],
            note: PARTNER_FIXTURE_TAG,
          },
        });
      }
      if (!loyaltyProgramId) {
        await tx.loyaltyProgram.create({
          data: {
            id: PARTNER_FIXTURE_IDS.loyaltyProgram,
            tenantId: context.tenantId,
            restaurantId: context.restaurantId,
            isActive: true,
            pointsPerCurrencyUnit: new Prisma.Decimal('0.10'),
            currencyAmountPerPoint: new Prisma.Decimal('10.00'),
            redemptionValuePerPoint: new Prisma.Decimal('1.00'),
            minimumRedeemPoints: 100,
            createdBy: context.partnerUserId,
            updatedBy: context.partnerUserId,
          },
        });
        loyaltyProgramId = PARTNER_FIXTURE_IDS.loyaltyProgram;
      }
      for (
        let index = 0;
        index < PARTNER_FIXTURE_IDS.loyaltyAccounts.length;
        index += 1
      ) {
        const points = 100 + index * 50;
        await tx.loyaltyAccount.upsert({
          where: { id: PARTNER_FIXTURE_IDS.loyaltyAccounts[index] },
          create: {
            id: PARTNER_FIXTURE_IDS.loyaltyAccounts[index],
            tenantId: context.tenantId,
            restaurantId: context.restaurantId,
            customerId: PARTNER_FIXTURE_IDS.customers[index],
            availablePoints: points,
            lifetimeEarnedPoints: points,
          },
          update: { availablePoints: points, lifetimeEarnedPoints: points },
        });
        await tx.loyaltyTransaction.upsert({
          where: { id: PARTNER_FIXTURE_IDS.loyaltyTransactions[index] },
          create: {
            id: PARTNER_FIXTURE_IDS.loyaltyTransactions[index],
            loyaltyAccountId: PARTNER_FIXTURE_IDS.loyaltyAccounts[index],
            loyaltyProgramId,
            tenantId: context.tenantId,
            restaurantId: context.restaurantId,
            branchId: context.branchId,
            customerId: PARTNER_FIXTURE_IDS.customers[index],
            orderId: PARTNER_FIXTURE_IDS.orders[index + 4],
            type: LoyaltyTransactionType.EARN,
            points,
            balanceAfter: points,
            note: PARTNER_FIXTURE_TAG,
            metadata: { fixtureTag: PARTNER_FIXTURE_TAG },
            createdBy: context.partnerUserId,
            updatedBy: context.partnerUserId,
          },
          update: { points, balanceAfter: points, note: PARTNER_FIXTURE_TAG },
        });
      }
    },
    { timeout: 60_000 },
  );
  return verifyPartnerFixture(prisma, rawTarget);
}

export async function verifyPartnerFixture(
  prisma: PrismaClient,
  rawTarget: PartnerFixtureTarget,
): Promise<Record<string, unknown>> {
  const context = await inspectPartnerFixtureTarget(prisma, rawTarget);
  const [
    menus,
    categories,
    items,
    variations,
    modifierCategories,
    modifierGroups,
    modifiers,
    customers,
    profiles,
    addresses,
    orders,
    orderItems,
    payments,
    reservations,
    coupons,
    loyaltyAccounts,
    loyaltyTransactions,
  ] = await Promise.all([
    prisma.restaurantMenu.count({
      where: {
        id: PARTNER_FIXTURE_IDS.menu,
        restaurantId: context.restaurantId,
      },
    }),
    prisma.menuCategory.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.categories] },
        restaurantId: context.restaurantId,
      },
    }),
    prisma.menuItem.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.items] },
        restaurantId: context.restaurantId,
      },
    }),
    prisma.menuItemVariation.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.variations] },
        restaurantId: context.restaurantId,
      },
    }),
    prisma.modifierCategory.count({
      where: {
        id: PARTNER_FIXTURE_IDS.modifierCategory,
        restaurantId: context.restaurantId,
      },
    }),
    prisma.modifierGroup.count({
      where: {
        id: PARTNER_FIXTURE_IDS.modifierGroup,
        restaurantId: context.restaurantId,
      },
    }),
    prisma.modifier.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.modifiers] },
        restaurantId: context.restaurantId,
      },
    }),
    prisma.user.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.customers] },
        tenantId: context.tenantId,
        restaurantId: context.restaurantId,
        role: UserRole.CUSTOMER,
      },
    }),
    prisma.profile.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.profiles] },
        userId: { in: [...PARTNER_FIXTURE_IDS.customers] },
      },
    }),
    prisma.address.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.addresses] },
        tenantId: context.tenantId,
        referenceId: { in: [...PARTNER_FIXTURE_IDS.customers] },
      },
    }),
    prisma.order.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.orders] },
        tenantId: context.tenantId,
        restaurantId: context.restaurantId,
        branchId: context.branchId,
      },
    }),
    prisma.orderItem.count({
      where: { id: { in: [...PARTNER_FIXTURE_IDS.orderItems] } },
    }),
    prisma.paymentTransaction.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.payments] },
        restaurantId: context.restaurantId,
      },
    }),
    prisma.tableReservation.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.reservations] },
        restaurantId: context.restaurantId,
        branchId: context.branchId,
      },
    }),
    prisma.coupon.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.coupons] },
        restaurantId: context.restaurantId,
      },
    }),
    prisma.loyaltyAccount.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.loyaltyAccounts] },
        restaurantId: context.restaurantId,
      },
    }),
    prisma.loyaltyTransaction.count({
      where: {
        id: { in: [...PARTNER_FIXTURE_IDS.loyaltyTransactions] },
        restaurantId: context.restaurantId,
      },
    }),
  ]);
  const actual = {
    menus,
    categories,
    items,
    variations,
    modifierCategories,
    modifierGroups,
    modifiers,
    customers,
    profiles,
    addresses,
    orders,
    orderItems,
    paymentTransactions: payments,
    reservations,
    coupons,
    loyaltyAccounts,
    loyaltyTransactions,
  };
  const expected = {
    menus: 1,
    categories: 3,
    items: 6,
    variations: 2,
    modifierCategories: 1,
    modifierGroups: 1,
    modifiers: 4,
    customers: 4,
    profiles: 4,
    addresses: 4,
    orders: 8,
    orderItems: 8,
    paymentTransactions: 6,
    reservations: 4,
    coupons: 2,
    loyaltyAccounts: 4,
    loyaltyTransactions: 4,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key as keyof typeof actual] !== value)
      throw new Error('Partner fixture verification failed for ' + key + '.');
  }
  return {
    fixtureTag: PARTNER_FIXTURE_TAG,
    target: rawTarget,
    branchId: context.branchId,
    counts: actual,
    loyaltyProgramOwned:
      (context.loyaltyProgramId ?? PARTNER_FIXTURE_IDS.loyaltyProgram) ===
      PARTNER_FIXTURE_IDS.loyaltyProgram,
  };
}

export async function cleanupPartnerFixture(
  prisma: PrismaClient,
  rawTarget: PartnerFixtureTarget,
): Promise<Record<string, unknown>> {
  const context = await inspectPartnerFixtureTarget(prisma, rawTarget);
  await prisma.$transaction(
    async (tx) => {
      await tx.couponUsage.deleteMany({
        where: { couponId: { in: [...PARTNER_FIXTURE_IDS.coupons] } },
      });
      await tx.loyaltyTransaction.deleteMany({
        where: { id: { in: [...PARTNER_FIXTURE_IDS.loyaltyTransactions] } },
      });
      await tx.loyaltyAccount.deleteMany({
        where: { id: { in: [...PARTNER_FIXTURE_IDS.loyaltyAccounts] } },
      });
      await tx.paymentTransaction.deleteMany({
        where: { id: { in: [...PARTNER_FIXTURE_IDS.payments] } },
      });
      await tx.tableReservation.deleteMany({
        where: { id: { in: [...PARTNER_FIXTURE_IDS.reservations] } },
      });
      await tx.orderItem.deleteMany({
        where: { id: { in: [...PARTNER_FIXTURE_IDS.orderItems] } },
      });
      await tx.order.deleteMany({
        where: { id: { in: [...PARTNER_FIXTURE_IDS.orders] } },
      });
      await tx.couponScopeMenuItem.deleteMany({
        where: { couponId: { in: [...PARTNER_FIXTURE_IDS.coupons] } },
      });
      await tx.couponScopeCategory.deleteMany({
        where: { couponId: { in: [...PARTNER_FIXTURE_IDS.coupons] } },
      });
      await tx.coupon.deleteMany({
        where: { id: { in: [...PARTNER_FIXTURE_IDS.coupons] } },
      });
      await tx.menuItemModifierGroup.deleteMany({
        where: {
          menuItemId: { in: [...PARTNER_FIXTURE_IDS.items] },
          modifierGroupId: PARTNER_FIXTURE_IDS.modifierGroup,
        },
      });
      await tx.modifierGroupModifier.deleteMany({
        where: {
          modifierGroupId: PARTNER_FIXTURE_IDS.modifierGroup,
          modifierId: { in: [...PARTNER_FIXTURE_IDS.modifiers] },
        },
      });
      await tx.modifier.deleteMany({
        where: { id: { in: [...PARTNER_FIXTURE_IDS.modifiers] } },
      });
      await tx.modifierGroup.deleteMany({
        where: { id: PARTNER_FIXTURE_IDS.modifierGroup },
      });
      await tx.modifierCategory.deleteMany({
        where: { id: PARTNER_FIXTURE_IDS.modifierCategory },
      });
      await tx.menuItemVariationPriceOverride.deleteMany({
        where: {
          menuItemId: { in: [...PARTNER_FIXTURE_IDS.items] },
          variationId: { in: [...PARTNER_FIXTURE_IDS.variations] },
        },
      });
      await tx.menuCategoryVariation.deleteMany({
        where: {
          categoryId: { in: [...PARTNER_FIXTURE_IDS.categories] },
          variationId: { in: [...PARTNER_FIXTURE_IDS.variations] },
        },
      });
      await tx.menuItemVariation.deleteMany({
        where: { id: { in: [...PARTNER_FIXTURE_IDS.variations] } },
      });
      await tx.restaurantMenuItem.deleteMany({
        where: {
          restaurantMenuId: PARTNER_FIXTURE_IDS.menu,
          menuItemId: { in: [...PARTNER_FIXTURE_IDS.items] },
        },
      });
      await tx.restaurantMenuCategory.deleteMany({
        where: {
          restaurantMenuId: PARTNER_FIXTURE_IDS.menu,
          menuCategoryId: { in: [...PARTNER_FIXTURE_IDS.categories] },
        },
      });
      await tx.menuItem.deleteMany({
        where: { id: { in: [...PARTNER_FIXTURE_IDS.items] } },
      });
      await tx.menuCategory.deleteMany({
        where: { id: { in: [...PARTNER_FIXTURE_IDS.categories] } },
      });
      await tx.restaurantMenu.deleteMany({
        where: { id: PARTNER_FIXTURE_IDS.menu },
      });
      await tx.address.deleteMany({
        where: { id: { in: [...PARTNER_FIXTURE_IDS.addresses] } },
      });
      await tx.profile.deleteMany({
        where: { id: { in: [...PARTNER_FIXTURE_IDS.profiles] } },
      });
      await tx.user.deleteMany({
        where: { id: { in: [...PARTNER_FIXTURE_IDS.customers] } },
      });
      if (context.loyaltyProgramId === PARTNER_FIXTURE_IDS.loyaltyProgram)
        await tx.loyaltyProgram.delete({
          where: { id: PARTNER_FIXTURE_IDS.loyaltyProgram },
        });
    },
    { timeout: 60_000 },
  );
  return { fixtureTag: PARTNER_FIXTURE_TAG, cleaned: true };
}
