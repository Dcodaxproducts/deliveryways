import { AddressRefType, Prisma, PrismaClient } from '@prisma/client';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const db = new PrismaClient();
const RUN_KEY = 'qa-partner-branch-v1-20260925';
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
type JsonRecord = Record<string, Prisma.JsonValue>;
interface Manifest {
  runKey: string;
  tenantId: string;
  restaurantId: string;
  ids: typeof ids;
  snapshot: {
    tagline: string | null;
    bio: string | null;
    branding: Prisma.JsonValue | null;
  };
}
function object(value: Prisma.JsonValue | null): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}
function requireScope(): void {
  if (!tenantId || !restaurantId)
    throw new Error('QA_TENANT_ID and QA_RESTAURANT_ID are required');
}
async function getRestaurant() {
  requireScope();
  const row = await db.restaurant.findFirst({
    where: { id: restaurantId, tenantId, deletedAt: null },
    select: { id: true, tagline: true, bio: true, branding: true },
  });
  if (!row) throw new Error('Explicit tenant/restaurant scope was not found');
  return row;
}
async function saveManifest(value: Manifest) {
  await mkdir(dirname(manifestPath), { recursive: true });
  try {
    await writeFile(manifestPath, JSON.stringify(value, null, 2) + '\n', {
      flag: 'wx',
    });
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error ? String(error.code) : '';
    if (code !== 'EEXIST') throw error;
    const old = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
    if (
      old.runKey !== RUN_KEY ||
      old.tenantId !== tenantId ||
      old.restaurantId !== restaurantId
    )
      throw new Error('Existing manifest scope mismatch');
  }
}
async function apply() {
  const restaurant = await getRestaurant();
  const manifest: Manifest = {
    runKey: RUN_KEY,
    tenantId,
    restaurantId,
    ids,
    snapshot: {
      tagline: restaurant.tagline,
      bio: restaurant.bio,
      branding: restaurant.branding,
    },
  };
  await saveManifest(manifest);
  await db.$transaction(async (tx) => {
    await tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        tagline: 'Synthetic neighborhood dining QA',
        bio: 'Synthetic fixture for Partner branch workflow testing.',
        branding: {
          ...object(restaurant.branding),
          qaFixture: { runKey: RUN_KEY, synthetic: true },
        } as Prisma.InputJsonValue,
      },
    });
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
          description: 'Synthetic QA fixture',
          settings: { qaFixtureRunKey: RUN_KEY },
        },
        update: {
          ...row,
          tenantId,
          restaurantId,
          isMain: false,
          deletedAt: null,
          description: 'Synthetic QA fixture',
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
          city: 'Test City',
          state: 'Test State',
          country: 'Test Country',
          postalCode: 'QA-0001',
        },
        update: {
          tenantId,
          referenceId: row.branch,
          street: row.street,
          deletedAt: null,
          isActive: true,
        },
      });
    for (const row of [
      {
        id: ids.allDay,
        name: 'QA All Day',
        slug: 'qa-partner-all-day-20260925',
        sortOrder: 10,
      },
      {
        id: ids.evening,
        name: 'QA Evening',
        slug: 'qa-partner-evening-20260925',
        sortOrder: 20,
      },
    ])
      await tx.restaurantMenu.upsert({
        where: { id: row.id },
        create: { ...row, restaurantId, description: 'Synthetic QA fixture' },
        update: { ...row, restaurantId, isActive: true, deletedAt: null },
      });
    await tx.menuCategory.upsert({
      where: { id: ids.category },
      create: {
        id: ids.category,
        restaurantId,
        name: 'QA Favorites',
        slug: 'qa-partner-favorites-20260925',
      },
      update: {
        restaurantId,
        name: 'QA Favorites',
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
        basePrice: new Prisma.Decimal('12.50'),
      },
      update: {
        restaurantId,
        categoryId: ids.category,
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
        update: {
          tenantId,
          restaurantId,
          isDefault: row.isDefault,
          isActive: true,
        },
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
        tenantId,
        restaurantId,
        branchId: ids.north,
        metadata: { runKey: RUN_KEY, synthetic: true },
      },
    });
  });
}
async function verify() {
  await getRestaurant();
  const [branches, menus, assignments, contacts] = await Promise.all([
    db.branch.count({
      where: { id: { in: [ids.north, ids.riverside] }, tenantId, restaurantId },
    }),
    db.restaurantMenu.count({
      where: { id: { in: [ids.allDay, ids.evening] }, restaurantId },
    }),
    db.branchMenuAssignment.count({
      where: {
        id: { in: [ids.northAllDay, ids.northEvening, ids.riversideAllDay] },
        tenantId,
        restaurantId,
      },
    }),
    db.contactSubmission.count({
      where: { id: ids.contact, tenantId, restaurantId },
    }),
  ]);
  if (branches !== 2 || menus !== 2 || assignments !== 3 || contacts !== 1)
    throw new Error(JSON.stringify({ branches, menus, assignments, contacts }));
  console.log(
    JSON.stringify(
      {
        verified: true,
        runKey: RUN_KEY,
        branches,
        menus,
        assignments,
        contacts,
        orders: 'omitted because an existing customer is required',
      },
      null,
      2,
    ),
  );
}
async function rollback() {
  await getRestaurant();
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  if (
    manifest.runKey !== RUN_KEY ||
    manifest.tenantId !== tenantId ||
    manifest.restaurantId !== restaurantId
  )
    throw new Error('Manifest scope mismatch');
  const current = await db.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { branding: true },
  });
  const marker = object(object(current.branding).qaFixture).runKey;
  if (marker !== RUN_KEY) throw new Error('Restaurant run-key marker mismatch');
  await db.$transaction(async (tx) => {
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
      },
    });
    await tx.branchMenuItemOverride.deleteMany({
      where: { id: ids.itemOverride, branchId: ids.riverside },
    });
    await tx.branchCategoryOverride.deleteMany({
      where: { id: ids.categoryOverride, branchId: ids.riverside },
    });
    await tx.address.deleteMany({
      where: { id: { in: [ids.northAddress, ids.riversideAddress] }, tenantId },
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
        slug: 'qa-partner-garden-bowl-20260925',
      },
    });
    await tx.menuCategory.deleteMany({
      where: {
        id: ids.category,
        restaurantId,
        slug: 'qa-partner-favorites-20260925',
      },
    });
    await tx.restaurantMenu.deleteMany({
      where: { id: { in: [ids.allDay, ids.evening] }, restaurantId },
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
async function main() {
  requireScope();
  if (mode === 'dry-run') {
    await getRestaurant();
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
