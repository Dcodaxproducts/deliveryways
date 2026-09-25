import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { AddressRefType, Prisma, PrismaClient } from '@prisma/client';
import {
  RecoverableManifest,
  RecoveryInspection,
  runRecoverableApply,
  runRecoverableRollback,
  verifyRecoverableManifest,
} from '../../src/modules/branches/qa-partner-manifest.protocol';

const db = new PrismaClient();
const RUN_KEY = 'qa-partner-branch-v1-20260925';
const OWNER = 'Synthetic QA fixture [' + RUN_KEY + ']';
const mode = process.argv[2] ?? 'dry-run';
const tenantId = process.env.QA_TENANT_ID ?? '';
const restaurantId = process.env.QA_RESTAURANT_ID ?? '';
const manifestPath = resolve(
  process.env.QA_MANIFEST_PATH ?? '.qa-manifests/' + RUN_KEY + '.json',
);
const ids = {
  north: 'qa_pbv1_north_branch_20260925',
  riverside: 'qa_pbv1_riverside_branch_20260925',
  northAddress: 'qa_pbv1_north_address_20260925',
  riversideAddress: 'qa_pbv1_riverside_address_20260925',
  allDay: 'qa_pbv1_all_day_menu_20260925',
  evening: 'qa_pbv1_evening_menu_20260925',
  category: 'qa_pbv1_category_20260925',
  item: 'qa_pbv1_item_20260925',
  itemOverride: 'qa_pbv1_item_override_20260925',
  categoryOverride: 'qa_pbv1_category_override_20260925',
  northAllDay: 'qa_pbv1_north_all_day_20260925',
  northEvening: 'qa_pbv1_north_evening_20260925',
  riversideAllDay: 'qa_pbv1_riverside_all_day_20260925',
  contact: 'qa_pbv1_contact_20260925',
};
const menuSlugs = [
  'qa-partner-all-day-20260925',
  'qa-partner-evening-20260925',
];
type JsonRecord = Record<string, Prisma.JsonValue>;
type RestaurantState = {
  tagline: string | null;
  bio: string | null;
  branding: Prisma.JsonValue | null;
};
interface Manifest extends RecoverableManifest {
  runKey: string;
  tenantId: string;
  restaurantId: string;
  ids: typeof ids;
  snapshot: RestaurantState;
  snapshotHash: string;
  applied: RestaurantState;
  appliedHash: string;
  fixtureHash: string;
}
async function lockFixtureRows(tx: Prisma.TransactionClient): Promise<void> {
  const fixtureIds = Object.values(ids);
  for (const table of [
    'branches',
    'addresses',
    'restaurant_menus',
    'menu_categories',
    'menu_items',
    'branch_menu_item_overrides',
    'branch_category_overrides',
    'branch_menu_assignments',
    'contact_submissions',
  ])
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "' +
        table +
        '" WHERE "id" = ANY($1::text[]) ORDER BY "id" FOR UPDATE',
      fixtureIds,
    );
}
async function fixtureState(tx: Prisma.TransactionClient) {
  const [
    branches,
    addresses,
    menus,
    categories,
    items,
    itemOverrides,
    categoryOverrides,
    assignments,
    contacts,
  ] = await Promise.all([
    tx.branch.findMany({
      where: { id: { in: [ids.north, ids.riverside] } },
      orderBy: { id: 'asc' },
    }),
    tx.address.findMany({
      where: { id: { in: [ids.northAddress, ids.riversideAddress] } },
      orderBy: { id: 'asc' },
    }),
    tx.restaurantMenu.findMany({
      where: {
        OR: [
          { id: { in: [ids.allDay, ids.evening] } },
          { restaurantId, slug: { in: menuSlugs } },
        ],
      },
      orderBy: { id: 'asc' },
    }),
    tx.menuCategory.findMany({
      where: {
        OR: [
          { id: ids.category },
          { restaurantId, slug: 'qa-partner-favorites-20260925' },
        ],
      },
      orderBy: { id: 'asc' },
    }),
    tx.menuItem.findMany({
      where: {
        OR: [
          { id: ids.item },
          { restaurantId, slug: 'qa-partner-garden-bowl-20260925' },
        ],
      },
      orderBy: { id: 'asc' },
    }),
    tx.branchMenuItemOverride.findMany({
      where: {
        OR: [
          { id: ids.itemOverride },
          { branchId: ids.riverside, menuItemId: ids.item },
        ],
      },
      orderBy: { id: 'asc' },
    }),
    tx.branchCategoryOverride.findMany({
      where: {
        OR: [
          { id: ids.categoryOverride },
          { branchId: ids.riverside, menuCategoryId: ids.category },
        ],
      },
      orderBy: { id: 'asc' },
    }),
    tx.branchMenuAssignment.findMany({
      where: {
        OR: [
          {
            id: {
              in: [ids.northAllDay, ids.northEvening, ids.riversideAllDay],
            },
          },
          {
            branchId: { in: [ids.north, ids.riverside] },
            restaurantMenuId: { in: [ids.allDay, ids.evening] },
          },
        ],
      },
      orderBy: { id: 'asc' },
    }),
    tx.contactSubmission.findMany({
      where: { id: ids.contact },
      orderBy: { id: 'asc' },
    }),
  ]);
  return {
    branches,
    addresses,
    menus,
    categories,
    items,
    itemOverrides,
    categoryOverrides,
    assignments,
    contacts,
  };
}
function fixtureIsEmpty(
  state: Awaited<ReturnType<typeof fixtureState>>,
): boolean {
  return Object.values(state).every((rows) => rows.length === 0);
}
function object(value: Prisma.JsonValue | null | undefined): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
function hash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
function fixtureFingerprint(
  state: Awaited<ReturnType<typeof fixtureState>>,
): unknown {
  return {
    branches: state.branches.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      restaurantId: row.restaurantId,
      name: row.name,
      description: row.description,
      settings: row.settings,
      isMain: row.isMain,
      isActive: row.isActive,
      deletedAt: row.deletedAt,
    })),
    addresses: state.addresses.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      referenceId: row.referenceId,
      refType: row.refType,
      street: row.street,
      area: row.area,
      postalCode: row.postalCode,
      city: row.city,
      state: row.state,
      country: row.country,
      isActive: row.isActive,
      deletedAt: row.deletedAt,
    })),
    menus: state.menus.map((row) => ({
      id: row.id,
      restaurantId: row.restaurantId,
      name: row.name,
      slug: row.slug,
      description: row.description,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      deletedAt: row.deletedAt,
    })),
    categories: state.categories.map((row) => ({
      id: row.id,
      restaurantId: row.restaurantId,
      name: row.name,
      slug: row.slug,
      description: row.description,
      isActive: row.isActive,
      deletedAt: row.deletedAt,
    })),
    items: state.items.map((row) => ({
      id: row.id,
      restaurantId: row.restaurantId,
      categoryId: row.categoryId,
      name: row.name,
      slug: row.slug,
      description: row.description,
      basePrice: row.basePrice.toString(),
      isActive: row.isActive,
      deletedAt: row.deletedAt,
    })),
    itemOverrides: state.itemOverrides.map((row) => ({
      id: row.id,
      branchId: row.branchId,
      menuItemId: row.menuItemId,
      isAvailable: row.isAvailable,
      priceOverride: row.priceOverride,
    })),
    categoryOverrides: state.categoryOverrides.map((row) => ({
      id: row.id,
      branchId: row.branchId,
      menuCategoryId: row.menuCategoryId,
      isVisible: row.isVisible,
    })),
    assignments: state.assignments.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      restaurantId: row.restaurantId,
      branchId: row.branchId,
      restaurantMenuId: row.restaurantMenuId,
      isDefault: row.isDefault,
      isActive: row.isActive,
    })),
    contacts: state.contacts.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      restaurantId: row.restaurantId,
      branchId: row.branchId,
      name: row.name,
      email: row.email,
      subject: row.subject,
      message: row.message,
      metadata: row.metadata,
    })),
  };
}
function expectedFixtureFingerprint(): unknown {
  const byId = <T extends { id: string }>(rows: T[]) =>
    rows.sort((left, right) => left.id.localeCompare(right.id));
  return {
    branches: byId([
      {
        id: ids.north,
        tenantId,
        restaurantId,
        name: 'QA North',
        description: OWNER,
        settings: { qaFixtureRunKey: RUN_KEY },
        isMain: false,
        isActive: true,
        deletedAt: null,
      },
      {
        id: ids.riverside,
        tenantId,
        restaurantId,
        name: 'QA Riverside',
        description: OWNER,
        settings: { qaFixtureRunKey: RUN_KEY },
        isMain: false,
        isActive: false,
        deletedAt: null,
      },
    ]),
    addresses: byId([
      {
        id: ids.northAddress,
        tenantId,
        referenceId: ids.north,
        refType: AddressRefType.BRANCH,
        street: '100 QA North Street',
        area: RUN_KEY,
        postalCode: 'QA-0001',
        city: 'Test City',
        state: 'Test State',
        country: 'Test Country',
        isActive: true,
        deletedAt: null,
      },
      {
        id: ids.riversideAddress,
        tenantId,
        referenceId: ids.riverside,
        refType: AddressRefType.BRANCH,
        street: '200 QA Riverside Street',
        area: RUN_KEY,
        postalCode: 'QA-0001',
        city: 'Test City',
        state: 'Test State',
        country: 'Test Country',
        isActive: true,
        deletedAt: null,
      },
    ]),
    menus: byId([
      {
        id: ids.allDay,
        restaurantId,
        name: 'QA All Day',
        slug: menuSlugs[0],
        description: OWNER,
        sortOrder: 10,
        isActive: true,
        deletedAt: null,
      },
      {
        id: ids.evening,
        restaurantId,
        name: 'QA Evening',
        slug: menuSlugs[1],
        description: OWNER,
        sortOrder: 20,
        isActive: true,
        deletedAt: null,
      },
    ]),
    categories: [
      {
        id: ids.category,
        restaurantId,
        name: 'QA Favorites',
        slug: 'qa-partner-favorites-20260925',
        description: OWNER,
        isActive: true,
        deletedAt: null,
      },
    ],
    items: [
      {
        id: ids.item,
        restaurantId,
        categoryId: ids.category,
        name: 'QA Garden Bowl',
        slug: 'qa-partner-garden-bowl-20260925',
        description: OWNER,
        basePrice: '12.5',
        isActive: true,
        deletedAt: null,
      },
    ],
    itemOverrides: [
      {
        id: ids.itemOverride,
        branchId: ids.riverside,
        menuItemId: ids.item,
        isAvailable: false,
        priceOverride: null,
      },
    ],
    categoryOverrides: [
      {
        id: ids.categoryOverride,
        branchId: ids.riverside,
        menuCategoryId: ids.category,
        isVisible: true,
      },
    ],
    assignments: byId([
      {
        id: ids.northAllDay,
        tenantId,
        restaurantId,
        branchId: ids.north,
        restaurantMenuId: ids.allDay,
        isDefault: true,
        isActive: true,
      },
      {
        id: ids.northEvening,
        tenantId,
        restaurantId,
        branchId: ids.north,
        restaurantMenuId: ids.evening,
        isDefault: false,
        isActive: true,
      },
      {
        id: ids.riversideAllDay,
        tenantId,
        restaurantId,
        branchId: ids.riverside,
        restaurantMenuId: ids.allDay,
        isDefault: true,
        isActive: true,
      },
    ]),
    contacts: [
      {
        id: ids.contact,
        tenantId,
        restaurantId,
        branchId: ids.north,
        name: 'Synthetic QA Guest',
        email: 'qa-partner-branch@example.invalid',
        subject: 'Synthetic QA contact',
        message: 'Partner workflow fixture.',
        metadata: { runKey: RUN_KEY, synthetic: true },
      },
    ],
  };
}
function expectedFixtureHash(): string {
  return hash(expectedFixtureFingerprint());
}
function injectFault(
  point: 'pre-transaction' | 'transaction' | 'post-commit',
): void {
  if (process.env.QA_FIXTURE_FAULT === point)
    throw new Error('Injected fixture fault: ' + point);
}
function requireScope(): void {
  if (!tenantId || !restaurantId)
    throw new Error('QA_TENANT_ID and QA_RESTAURANT_ID are required');
}
function hasRunMarker(value: Prisma.JsonValue | null | undefined): boolean {
  return object(value).qaFixtureRunKey === RUN_KEY;
}
function assertOwned(label: string, valid: boolean): void {
  if (!valid)
    throw new Error(label + ' collides with data not owned by run ' + RUN_KEY);
}
function appliedState(snapshot: RestaurantState): RestaurantState {
  return {
    tagline: 'Synthetic neighborhood dining QA',
    bio: 'Synthetic fixture for Partner branch workflow testing.',
    branding: {
      ...object(snapshot.branding),
      qaFixture: { runKey: RUN_KEY, synthetic: true },
    },
  };
}
async function getRestaurant(
  client: PrismaClient | Prisma.TransactionClient = db,
) {
  requireScope();
  const row = await client.restaurant.findFirst({
    where: { id: restaurantId, tenantId, deletedAt: null },
    select: { id: true, tagline: true, bio: true, branding: true },
  });
  if (!row) throw new Error('Explicit tenant/restaurant scope was not found');
  return row;
}
async function assertFixtureOwnership(
  tx: Prisma.TransactionClient,
  requireAll: boolean,
): Promise<void> {
  const branches = await tx.branch.findMany({
    where: { id: { in: [ids.north, ids.riverside] } },
    select: { id: true, tenantId: true, restaurantId: true, settings: true },
  });
  for (const row of branches)
    assertOwned(
      'Branch ' + row.id,
      row.tenantId === tenantId &&
        row.restaurantId === restaurantId &&
        hasRunMarker(row.settings),
    );
  const addresses = await tx.address.findMany({
    where: { id: { in: [ids.northAddress, ids.riversideAddress] } },
    select: { id: true, tenantId: true, referenceId: true, area: true },
  });
  for (const row of addresses)
    assertOwned(
      'Address ' + row.id,
      row.tenantId === tenantId &&
        row.area === RUN_KEY &&
        ((row.id === ids.northAddress && row.referenceId === ids.north) ||
          (row.id === ids.riversideAddress &&
            row.referenceId === ids.riverside)),
    );
  const menus = await tx.restaurantMenu.findMany({
    where: {
      OR: [
        { id: { in: [ids.allDay, ids.evening] } },
        { restaurantId, slug: { in: menuSlugs } },
      ],
    },
    select: { id: true, restaurantId: true, slug: true, description: true },
  });
  for (const row of menus)
    assertOwned(
      'Menu ' + row.id,
      row.restaurantId === restaurantId &&
        row.description === OWNER &&
        ((row.id === ids.allDay && row.slug === menuSlugs[0]) ||
          (row.id === ids.evening && row.slug === menuSlugs[1])),
    );
  const categories = await tx.menuCategory.findMany({
    where: {
      OR: [
        { id: ids.category },
        { restaurantId, slug: 'qa-partner-favorites-20260925' },
      ],
    },
    select: { id: true, restaurantId: true, slug: true, description: true },
  });
  for (const row of categories)
    assertOwned(
      'Category ' + row.id,
      row.id === ids.category &&
        row.restaurantId === restaurantId &&
        row.slug === 'qa-partner-favorites-20260925' &&
        row.description === OWNER,
    );
  const items = await tx.menuItem.findMany({
    where: {
      OR: [
        { id: ids.item },
        { restaurantId, slug: 'qa-partner-garden-bowl-20260925' },
      ],
    },
    select: {
      id: true,
      restaurantId: true,
      categoryId: true,
      slug: true,
      description: true,
    },
  });
  for (const row of items)
    assertOwned(
      'Item ' + row.id,
      row.id === ids.item &&
        row.restaurantId === restaurantId &&
        row.categoryId === ids.category &&
        row.slug === 'qa-partner-garden-bowl-20260925' &&
        row.description === OWNER,
    );
  const itemOverrides = await tx.branchMenuItemOverride.findMany({
    where: {
      OR: [
        { id: ids.itemOverride },
        { branchId: ids.riverside, menuItemId: ids.item },
      ],
    },
    select: { id: true, branchId: true, menuItemId: true },
  });
  for (const row of itemOverrides)
    assertOwned(
      'Item override ' + row.id,
      row.id === ids.itemOverride &&
        row.branchId === ids.riverside &&
        row.menuItemId === ids.item &&
        branches.some((branch) => branch.id === ids.riverside),
    );
  const categoryOverrides = await tx.branchCategoryOverride.findMany({
    where: {
      OR: [
        { id: ids.categoryOverride },
        { branchId: ids.riverside, menuCategoryId: ids.category },
      ],
    },
    select: { id: true, branchId: true, menuCategoryId: true },
  });
  for (const row of categoryOverrides)
    assertOwned(
      'Category override ' + row.id,
      row.id === ids.categoryOverride &&
        row.branchId === ids.riverside &&
        row.menuCategoryId === ids.category &&
        branches.some((branch) => branch.id === ids.riverside),
    );
  const assignmentIds = [
    ids.northAllDay,
    ids.northEvening,
    ids.riversideAllDay,
  ];
  const assignments = await tx.branchMenuAssignment.findMany({
    where: {
      OR: [
        { id: { in: assignmentIds } },
        {
          branchId: { in: [ids.north, ids.riverside] },
          restaurantMenuId: { in: [ids.allDay, ids.evening] },
        },
      ],
    },
    select: {
      id: true,
      tenantId: true,
      restaurantId: true,
      branchId: true,
      restaurantMenuId: true,
    },
  });
  const expectedAssignments = new Map([
    [ids.northAllDay, ids.north + ':' + ids.allDay],
    [ids.northEvening, ids.north + ':' + ids.evening],
    [ids.riversideAllDay, ids.riverside + ':' + ids.allDay],
  ]);
  for (const row of assignments)
    assertOwned(
      'Assignment ' + row.id,
      row.tenantId === tenantId &&
        row.restaurantId === restaurantId &&
        expectedAssignments.get(row.id) ===
          row.branchId + ':' + row.restaurantMenuId &&
        branches.some((branch) => branch.id === row.branchId) &&
        menus.some((menu) => menu.id === row.restaurantMenuId),
    );
  const contacts = await tx.contactSubmission.findMany({
    where: { id: ids.contact },
    select: { id: true, tenantId: true, restaurantId: true, metadata: true },
  });
  for (const row of contacts)
    assertOwned(
      'Contact ' + row.id,
      row.tenantId === tenantId &&
        row.restaurantId === restaurantId &&
        object(row.metadata).runKey === RUN_KEY,
    );
  if (requireAll)
    assertOwned(
      'Fixture completeness',
      branches.length === 2 &&
        addresses.length === 2 &&
        menus.length === 2 &&
        categories.length === 1 &&
        items.length === 1 &&
        itemOverrides.length === 1 &&
        categoryOverrides.length === 1 &&
        assignments.length === 3 &&
        contacts.length === 1,
    );
}
function validateManifest(manifest: Manifest): void {
  assertOwned(
    'Manifest',
    manifest.protocolVersion === 1 &&
      manifest.operationId.length > 0 &&
      ['PENDING', 'FINALIZED'].includes(manifest.status) &&
      manifest.runKey === RUN_KEY &&
      manifest.tenantId === tenantId &&
      manifest.restaurantId === restaurantId &&
      hash(manifest.ids) === hash(ids) &&
      manifest.snapshotHash === hash(manifest.snapshot) &&
      manifest.appliedHash === hash(manifest.applied) &&
      manifest.fixtureHash === expectedFixtureHash(),
  );
}
async function createPendingManifest(): Promise<Manifest> {
  const restaurant = await getRestaurant();
  const marker = object(object(restaurant.branding).qaFixture).runKey;
  if (marker && marker !== RUN_KEY)
    throw new Error('Restaurant is owned by a different QA run');
  const snapshot: RestaurantState = {
    tagline: restaurant.tagline,
    bio: restaurant.bio,
    branding: restaurant.branding,
  };
  const applied = appliedState(snapshot);
  return {
    protocolVersion: 1,
    operationId: randomUUID(),
    status: 'PENDING',
    runKey: RUN_KEY,
    tenantId,
    restaurantId,
    ids,
    snapshot,
    snapshotHash: hash(snapshot),
    applied,
    appliedHash: hash(applied),
    fixtureHash: expectedFixtureHash(),
  };
}
async function inspectManifest(
  manifest: Manifest,
): Promise<RecoveryInspection> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "restaurants" WHERE "id" = ${restaurantId} AND "tenant_id" = ${tenantId} FOR UPDATE`,
    );
    await lockFixtureRows(tx);
    const restaurant = await getRestaurant(tx);
    const restaurantState: RestaurantState = {
      tagline: restaurant.tagline,
      bio: restaurant.bio,
      branding: restaurant.branding,
    };
    const fixture = await fixtureState(tx);
    if (fixtureIsEmpty(fixture))
      return hash(restaurantState) === manifest.snapshotHash
        ? 'CLEAN'
        : 'RETRYABLE_COLLISION';
    try {
      await assertFixtureOwnership(tx, true);
      if (hash(fixtureFingerprint(fixture)) === manifest.fixtureHash)
        return hash(restaurantState) === manifest.appliedHash
          ? 'APPLIED'
          : 'COLLISION';
    } catch {
      // A pre-transaction foreign collision is safe to abandon, never delete.
    }
    return hash(restaurantState) === manifest.appliedHash
      ? 'COLLISION'
      : 'RETRYABLE_COLLISION';
  });
}
async function apply(): Promise<void> {
  await runRecoverableApply({
    path: manifestPath,
    createPending: createPendingManifest,
    validate: validateManifest,
    inspect: inspectManifest,
    prepareFinalized: (manifest) => manifest,
    transaction: applyFixtureTransaction,
    afterPending: () => injectFault('pre-transaction'),
    afterCommit: () => injectFault('post-commit'),
  });
}
async function applyFixtureTransaction(manifest: Manifest): Promise<void> {
  const applied = manifest.applied;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "restaurants" WHERE "id" = ${restaurantId} AND "tenant_id" = ${tenantId} FOR UPDATE`,
    );
    await lockFixtureRows(tx);
    const current = await getRestaurant(tx);
    const currentState: RestaurantState = {
      tagline: current.tagline,
      bio: current.bio,
      branding: current.branding,
    };
    if (hash(currentState) !== manifest.snapshotHash)
      throw new Error(
        'Restaurant branding changed before apply; refusing overwrite',
      );
    const before = await fixtureState(tx);
    if (!fixtureIsEmpty(before))
      throw new Error('Fixture collision preflight failed');
    await assertFixtureOwnership(tx, false);
    await tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        tagline: applied.tagline,
        bio: applied.bio,
        branding: applied.branding as Prisma.InputJsonValue,
      },
    });
    injectFault('transaction');
    for (const row of [
      { id: ids.north, name: 'QA North', isActive: true },
      { id: ids.riverside, name: 'QA Riverside', isActive: false },
    ])
      await tx.branch.upsert({
        where: { id: row.id },
        create: {
          ...row,
          tenantId,
          restaurantId,
          isMain: false,
          description: OWNER,
          settings: { qaFixtureRunKey: RUN_KEY },
        },
        update: {
          name: row.name,
          isMain: false,
          isActive: row.isActive,
          deletedAt: null,
          description: OWNER,
          settings: { qaFixtureRunKey: RUN_KEY },
        },
      });
    for (const row of [
      {
        id: ids.northAddress,
        branch: ids.north,
        street: '100 QA North Street',
      },
      {
        id: ids.riversideAddress,
        branch: ids.riverside,
        street: '200 QA Riverside Street',
      },
    ])
      await tx.address.upsert({
        where: { id: row.id },
        create: {
          id: row.id,
          tenantId,
          referenceId: row.branch,
          refType: AddressRefType.BRANCH,
          street: row.street,
          area: RUN_KEY,
          city: 'Test City',
          state: 'Test State',
          country: 'Test Country',
          postalCode: 'QA-0001',
        },
        update: {
          street: row.street,
          area: RUN_KEY,
          deletedAt: null,
          isActive: true,
        },
      });
    for (const row of [
      { id: ids.allDay, name: 'QA All Day', slug: menuSlugs[0], sortOrder: 10 },
      {
        id: ids.evening,
        name: 'QA Evening',
        slug: menuSlugs[1],
        sortOrder: 20,
      },
    ])
      await tx.restaurantMenu.upsert({
        where: { id: row.id },
        create: { ...row, restaurantId, description: OWNER },
        update: {
          name: row.name,
          sortOrder: row.sortOrder,
          description: OWNER,
          isActive: true,
          deletedAt: null,
        },
      });
    await tx.menuCategory.upsert({
      where: { id: ids.category },
      create: {
        id: ids.category,
        restaurantId,
        name: 'QA Favorites',
        slug: 'qa-partner-favorites-20260925',
        description: OWNER,
      },
      update: {
        name: 'QA Favorites',
        description: OWNER,
        isActive: true,
        deletedAt: null,
      },
    });
    await tx.menuItem.upsert({
      where: { id: ids.item },
      create: {
        id: ids.item,
        restaurantId,
        categoryId: ids.category,
        name: 'QA Garden Bowl',
        slug: 'qa-partner-garden-bowl-20260925',
        description: OWNER,
        basePrice: new Prisma.Decimal('12.50'),
      },
      update: {
        name: 'QA Garden Bowl',
        description: OWNER,
        isActive: true,
        deletedAt: null,
      },
    });
    await tx.branchMenuItemOverride.upsert({
      where: {
        branchId_menuItemId: { branchId: ids.riverside, menuItemId: ids.item },
      },
      create: {
        id: ids.itemOverride,
        branchId: ids.riverside,
        menuItemId: ids.item,
        isAvailable: false,
      },
      update: { isAvailable: false },
    });
    await tx.branchCategoryOverride.upsert({
      where: {
        branchId_menuCategoryId: {
          branchId: ids.riverside,
          menuCategoryId: ids.category,
        },
      },
      create: {
        id: ids.categoryOverride,
        branchId: ids.riverside,
        menuCategoryId: ids.category,
        isVisible: true,
      },
      update: { isVisible: true },
    });
    for (const row of [
      {
        id: ids.northAllDay,
        branchId: ids.north,
        restaurantMenuId: ids.allDay,
        isDefault: true,
      },
      {
        id: ids.northEvening,
        branchId: ids.north,
        restaurantMenuId: ids.evening,
        isDefault: false,
      },
      {
        id: ids.riversideAllDay,
        branchId: ids.riverside,
        restaurantMenuId: ids.allDay,
        isDefault: true,
      },
    ])
      await tx.branchMenuAssignment.upsert({
        where: {
          branchId_restaurantMenuId: {
            branchId: row.branchId,
            restaurantMenuId: row.restaurantMenuId,
          },
        },
        create: { ...row, tenantId, restaurantId },
        update: { isDefault: row.isDefault, isActive: true },
      });
    await tx.contactSubmission.upsert({
      where: { id: ids.contact },
      create: {
        id: ids.contact,
        tenantId,
        restaurantId,
        branchId: ids.north,
        name: 'Synthetic QA Guest',
        email: 'qa-partner-branch@example.invalid',
        subject: 'Synthetic QA contact',
        message: 'Partner workflow fixture.',
        metadata: { runKey: RUN_KEY, synthetic: true },
      },
      update: {
        branchId: ids.north,
        metadata: { runKey: RUN_KEY, synthetic: true },
      },
    });
    await assertFixtureOwnership(tx, true);
    if (
      hash(fixtureFingerprint(await fixtureState(tx))) !== manifest.fixtureHash
    )
      throw new Error('Applied fixture does not match pending manifest hash');
  });
}
async function verify(): Promise<void> {
  await verifyRecoverableManifest({
    path: manifestPath,
    validate: validateManifest,
    inspect: inspectManifest,
    prepareFinalized: (manifest) => manifest,
  });
  console.log(
    JSON.stringify(
      {
        verified: true,
        runKey: RUN_KEY,
        tenantId,
        restaurantId,
        orders: 'omitted because an existing customer is required',
      },
      null,
      2,
    ),
  );
}
async function rollbackFixtureTransaction(manifest: Manifest): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "restaurants" WHERE "id" = ${restaurantId} AND "tenant_id" = ${tenantId} FOR UPDATE`,
    );
    await lockFixtureRows(tx);
    if (
      hash(fixtureFingerprint(await fixtureState(tx))) !== manifest.fixtureHash
    )
      throw new Error('Fixture changed after apply; refusing unsafe rollback');
    const current = await getRestaurant(tx);
    const state: RestaurantState = {
      tagline: current.tagline,
      bio: current.bio,
      branding: current.branding,
    };
    if (hash(state) !== manifest.appliedHash)
      throw new Error(
        'Restaurant branding changed after apply; refusing rollback restoration',
      );
    await assertFixtureOwnership(tx, true);
    await tx.contactSubmission.deleteMany({
      where: {
        id: ids.contact,
        tenantId,
        restaurantId,
        metadata: { path: ['runKey'], equals: RUN_KEY },
      },
    });
    await tx.branchMenuAssignment.deleteMany({
      where: {
        id: { in: [ids.northAllDay, ids.northEvening, ids.riversideAllDay] },
        tenantId,
        restaurantId,
        branch: {
          tenantId,
          restaurantId,
          settings: { path: ['qaFixtureRunKey'], equals: RUN_KEY },
        },
        restaurantMenu: { restaurantId, description: OWNER },
      },
    });
    await tx.branchMenuItemOverride.deleteMany({
      where: {
        id: ids.itemOverride,
        branchId: ids.riverside,
        branch: {
          tenantId,
          restaurantId,
          settings: { path: ['qaFixtureRunKey'], equals: RUN_KEY },
        },
        menuItem: { restaurantId, description: OWNER },
      },
    });
    await tx.branchCategoryOverride.deleteMany({
      where: {
        id: ids.categoryOverride,
        branchId: ids.riverside,
        branch: {
          tenantId,
          restaurantId,
          settings: { path: ['qaFixtureRunKey'], equals: RUN_KEY },
        },
        menuCategory: { restaurantId, description: OWNER },
      },
    });
    await tx.address.deleteMany({
      where: {
        id: { in: [ids.northAddress, ids.riversideAddress] },
        tenantId,
        area: RUN_KEY,
        referenceId: { in: [ids.north, ids.riverside] },
      },
    });
    await tx.branch.deleteMany({
      where: {
        id: { in: [ids.north, ids.riverside] },
        tenantId,
        restaurantId,
        settings: { path: ['qaFixtureRunKey'], equals: RUN_KEY },
      },
    });
    await tx.menuItem.deleteMany({
      where: {
        id: ids.item,
        restaurantId,
        restaurant: { id: restaurantId, tenantId },
        slug: 'qa-partner-garden-bowl-20260925',
        description: OWNER,
      },
    });
    await tx.menuCategory.deleteMany({
      where: {
        id: ids.category,
        restaurantId,
        restaurant: { id: restaurantId, tenantId },
        slug: 'qa-partner-favorites-20260925',
        description: OWNER,
      },
    });
    await tx.restaurantMenu.deleteMany({
      where: {
        id: { in: [ids.allDay, ids.evening] },
        restaurantId,
        restaurant: { id: restaurantId, tenantId },
        slug: { in: menuSlugs },
        description: OWNER,
      },
    });
    await tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        tagline: manifest.snapshot.tagline,
        bio: manifest.snapshot.bio,
        branding:
          manifest.snapshot.branding === null
            ? Prisma.JsonNull
            : (manifest.snapshot.branding as Prisma.InputJsonValue),
      },
    });
  });
}
async function rollback(): Promise<void> {
  await runRecoverableRollback({
    path: manifestPath,
    validate: validateManifest,
    inspect: inspectManifest,
    prepareFinalized: (manifest) => manifest,
    transaction: rollbackFixtureTransaction,
  });
}
async function main(): Promise<void> {
  requireScope();
  if (mode === 'dry-run') {
    await getRestaurant();
    await db.$transaction((tx) => assertFixtureOwnership(tx, false));
    console.log(
      JSON.stringify(
        { mode, mutation: false, runKey: RUN_KEY, tenantId, restaurantId, ids },
        null,
        2,
      ),
    );
  } else if (mode === 'apply') await apply();
  else if (mode === 'verify') await verify();
  else if (mode === 'rollback') await rollback();
  else throw new Error('Mode must be dry-run, apply, verify, or rollback');
}
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
