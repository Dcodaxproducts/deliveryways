import {
  OrderType,
  PaymentMethod,
  PosActorType,
  PosOrderDraftStatus,
  UserRole,
} from '@prisma/client';
import { TestingModule, Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database';
import { GlobalSettingsService } from '../src/modules/global-settings/global-settings.service';
import { PosRepository } from '../src/modules/pos/pos.repository';
import { PosService } from '../src/modules/pos/pos.service';
import { MenuItemRepository } from '../src/modules/menu/item/item.repository';
import { MenuCategoryRepository } from '../src/modules/menu/category/category.repository';

describe('P0 POS checkout claim lifecycle (isolated database)', () => {
  let moduleFixture: TestingModule;
  let prisma: PrismaService;
  let repository: PosRepository;
  let service: PosService;
  let globalSettingsService: GlobalSettingsService;
  let menuItemRepository: MenuItemRepository;
  let menuCategoryRepository: MenuCategoryRepository;
  const runId = `${Date.now()}-${process.pid}`;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleFixture.get(PrismaService);
    repository = moduleFixture.get(PosRepository);
    service = moduleFixture.get(PosService);
    globalSettingsService = moduleFixture.get(GlobalSettingsService);
    menuItemRepository = moduleFixture.get(MenuItemRepository);
    menuCategoryRepository = moduleFixture.get(MenuCategoryRepository);
  }, 60_000);

  afterAll(async () => {
    await moduleFixture.close();
  });

  it('fences concurrent claims, replays finalization, and recovers expired owners', async () => {
    const tenant = await prisma.tenant.create({
      data: { name: `POS claim ${runId}`, slug: `pos-claim-${runId}` },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        tenantId: tenant.id,
        name: `POS claim ${runId}`,
        slug: `pos-claim-restaurant-${runId}`,
        subdomain: `pos-claim-${runId}`,
      },
    });
    const branch = await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        name: 'POS Claim Branch',
      },
    });
    const createDraft = () =>
      prisma.posOrderDraft.create({
        data: {
          tenantId: tenant.id,
          restaurantId: restaurant.id,
          branchId: branch.id,
          createdByActorId: 'acceptance-actor',
          createdByActorType: PosActorType.STAFF,
          orderType: OrderType.TAKEAWAY,
          paymentMethod: PaymentMethod.COD,
        },
      });

    const draft = await createDraft();
    const now = new Date();
    const requestHash = 'a'.repeat(64);
    const claim = (claimToken: string) =>
      repository.claimCheckout({
        id: draft.id,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        requestHash,
        claimToken,
        expectedUpdatedAt: draft.updatedAt,
        claimedAt: now,
        leaseExpiresAt: new Date(now.getTime() + 30_000),
      });
    const claims = await Promise.all([claim('token-a'), claim('token-b')]);
    expect(claims.filter(({ state }) => state === 'CLAIMED')).toHaveLength(1);
    expect(claims.filter(({ state }) => state === 'BUSY')).toHaveLength(1);
    const owner = claims.find(({ state }) => state === 'CLAIMED');
    const ownerToken =
      owner?.state === 'CLAIMED' ? owner.draft.checkoutClaimToken : null;
    expect(ownerToken).toBeTruthy();

    await expect(
      repository.finalizeCheckout({
        id: draft.id,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        requestHash,
        claimToken: ownerToken!,
        finalOrderId: 'acceptance-order-1',
        checkedOutAt: new Date(),
      }),
    ).resolves.toMatchObject({
      status: PosOrderDraftStatus.CHECKED_OUT,
      finalOrderId: 'acceptance-order-1',
      checkoutAttempt: 1,
    });
    await expect(claim('token-retry')).resolves.toMatchObject({
      state: 'FINALIZED',
    });
    await expect(
      repository.claimCheckout({
        id: draft.id,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        requestHash: 'b'.repeat(64),
        claimToken: 'token-mismatch',
        expectedUpdatedAt: draft.updatedAt,
        claimedAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + 30_000),
      }),
    ).resolves.toMatchObject({ state: 'HASH_MISMATCH' });

    const abandoned = await createDraft();
    const expiredAt = new Date(Date.now() - 60_000);
    await expect(
      repository.claimCheckout({
        id: abandoned.id,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        requestHash,
        claimToken: 'stale-owner',
        expectedUpdatedAt: abandoned.updatedAt,
        claimedAt: expiredAt,
        leaseExpiresAt: new Date(expiredAt.getTime() + 1_000),
      }),
    ).resolves.toMatchObject({ state: 'CLAIMED' });
    await expect(
      repository.claimCheckout({
        id: abandoned.id,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        requestHash,
        claimToken: 'recovery-owner',
        expectedUpdatedAt: abandoned.updatedAt,
        claimedAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + 30_000),
      }),
    ).resolves.toMatchObject({
      state: 'CLAIMED',
      draft: { checkoutAttempt: 2, checkoutClaimToken: 'recovery-owner' },
    });
    await expect(
      repository.finalizeCheckout({
        id: abandoned.id,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        requestHash,
        claimToken: 'stale-owner',
        finalOrderId: 'stale-order',
        checkedOutAt: new Date(),
      }),
    ).resolves.toBeNull();
    await expect(
      repository.finalizeCheckout({
        id: abandoned.id,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        requestHash,
        claimToken: 'recovery-owner',
        finalOrderId: 'recovered-order',
        checkedOutAt: new Date(),
      }),
    ).resolves.toMatchObject({
      status: PosOrderDraftStatus.CHECKED_OUT,
      finalOrderId: 'recovered-order',
    });
  });

  it('preserves claimed and finalized POS snapshots during menu cleanup', async () => {
    const scope = `cleanup-${runId}`;
    const tenant = await prisma.tenant.create({
      data: { name: scope, slug: scope },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        tenantId: tenant.id,
        name: scope,
        slug: `restaurant-${scope}`,
        subdomain: scope,
      },
    });
    const branch = await prisma.branch.create({
      data: { tenantId: tenant.id, restaurantId: restaurant.id, name: scope },
    });
    const category = await prisma.menuCategory.create({
      data: { restaurantId: restaurant.id, name: scope, slug: scope },
    });
    const [singleItem, categoryItem] = await Promise.all(
      ['single', 'category'].map((name) =>
        prisma.menuItem.create({
          data: {
            restaurantId: restaurant.id,
            categoryId: category.id,
            name: `${scope}-${name}`,
            slug: `${scope}-${name}`,
            basePrice: 10,
          },
        }),
      ),
    );
    const createDraft = (data: {
      status?: PosOrderDraftStatus;
      checkoutClaimToken?: string;
      finalOrderId?: string;
    }) =>
      prisma.posOrderDraft.create({
        data: {
          tenantId: tenant.id,
          restaurantId: restaurant.id,
          branchId: branch.id,
          createdByActorId: 'cleanup-actor',
          createdByActorType: PosActorType.STAFF,
          orderType: OrderType.TAKEAWAY,
          paymentMethod: PaymentMethod.COD,
          status: data.status,
          checkoutClaimToken: data.checkoutClaimToken,
          checkoutRequestHash: data.checkoutClaimToken
            ? 'c'.repeat(64)
            : undefined,
          finalOrderId: data.finalOrderId,
          items: {
            create: [
              { menuItemId: singleItem.id, quantity: 1 },
              { menuItemId: categoryItem.id, quantity: 1 },
            ],
          },
        },
      });
    const [openDraft, claimedDraft, finalizedDraft] = await Promise.all([
      createDraft({}),
      createDraft({ checkoutClaimToken: 'active-claim' }),
      createDraft({
        status: PosOrderDraftStatus.CHECKED_OUT,
        finalOrderId: 'durable-order-snapshot',
      }),
    ]);
    const originalOpenUpdatedAt = openDraft.updatedAt;

    await prisma.$transaction(async (tx) => {
      await menuItemRepository.deletePosDraftItems(singleItem.id, tx);
      await menuCategoryRepository.deletePosDraftItemsForMenuItems(
        [categoryItem.id],
        tx,
      );
    });

    await expect(
      prisma.posOrderDraftItem.count({ where: { draftId: openDraft.id } }),
    ).resolves.toBe(0);
    const refreshedOpen = await prisma.posOrderDraft.findUniqueOrThrow({
      where: { id: openDraft.id },
    });
    expect(refreshedOpen.updatedAt.getTime()).toBeGreaterThan(
      originalOpenUpdatedAt.getTime(),
    );
    await expect(
      prisma.posOrderDraftItem.count({ where: { draftId: claimedDraft.id } }),
    ).resolves.toBe(2);
    await expect(
      prisma.posOrderDraftItem.count({ where: { draftId: finalizedDraft.id } }),
    ).resolves.toBe(2);
  });

  it('creates one order and one payment effect for concurrent POS service checkout', async () => {
    await globalSettingsService.getCartExpiryMinutes();
    const tenant = await prisma.tenant.create({
      data: { name: `POS service ${runId}`, slug: `pos-service-${runId}` },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        tenantId: tenant.id,
        name: `POS service ${runId}`,
        slug: `pos-service-restaurant-${runId}`,
        subdomain: `pos-service-${runId}`,
      },
    });
    const branch = await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        name: 'POS Service Branch',
        settings: {
          automation: { autoAcceptOrders: true, estimatedPrepTime: 5 },
        },
      },
    });
    await prisma.loyaltyProgram.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        isActive: true,
        pointsPerCurrencyUnit: 1,
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: `pos-service-${runId}@example.test`,
        password: 'not-used',
        role: UserRole.CUSTOMER,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        isVerified: true,
        isApproved: true,
      },
    });
    const category = await prisma.menuCategory.create({
      data: {
        restaurantId: restaurant.id,
        name: 'POS Service',
        slug: `pos-service-${runId}`,
      },
    });
    const menuItem = await prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: category.id,
        name: 'POS concurrent item',
        slug: `pos-concurrent-item-${runId}`,
        basePrice: 12,
      },
    });
    const draft = await prisma.posOrderDraft.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        createdByActorId: 'acceptance-staff',
        createdByActorType: PosActorType.STAFF,
        customerId: customer.id,
        orderType: OrderType.TAKEAWAY,
        paymentMethod: PaymentMethod.COD,
        items: { create: { menuItemId: menuItem.id, quantity: 2 } },
      },
      include: { items: true },
    });
    const actor = {
      uid: 'acceptance-staff',
      tid: tenant.id,
      rid: restaurant.id,
      bid: branch.id,
      role: UserRole.STAFF,
    };

    const [first, second] = await Promise.all([
      service.checkout(actor as never, draft.id),
      service.checkout(actor as never, draft.id),
    ]);
    expect(first.data.order.id).toBe(second.data.order.id);
    const orderId = first.data.order.id;
    await expect(
      prisma.order.count({
        where: { sourceKey: `POS_DRAFT:${draft.id}` },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.paymentTransaction.count({ where: { orderId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.walletTransaction.count({ where: { orderId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.loyaltyTransaction.count({ where: { orderId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
    ).resolves.toMatchObject({
      status: 'CONFIRMED',
      loyaltyPointsAwarded: 24,
    });
    await expect(
      prisma.orderPostCommitEffect.count({
        where: { orderId, completedAt: { not: null } },
      }),
    ).resolves.toBe(4);
    await expect(
      prisma.orderItem.findMany({
        where: { orderId },
        select: { menuItemId: true, quantity: true },
      }),
    ).resolves.toEqual([{ menuItemId: menuItem.id, quantity: 2 }]);

    await prisma.orderPostCommitEffect.update({
      where: {
        orderId_effectType: { orderId, effectType: 'LOYALTY' },
      },
      data: { completedAt: null },
    });
    const recovered = await service.checkout(actor as never, draft.id);
    expect(recovered.data.order.id).toBe(orderId);
    await expect(
      prisma.loyaltyTransaction.count({ where: { orderId } }),
    ).resolves.toBe(1);
    const recoveredLoyaltyEffect =
      await prisma.orderPostCommitEffect.findUniqueOrThrow({
        where: {
          orderId_effectType: { orderId, effectType: 'LOYALTY' },
        },
      });
    expect(recoveredLoyaltyEffect.completedAt).toBeInstanceOf(Date);
    expect(recoveredLoyaltyEffect.attempts).toBe(2);

    await prisma.posOrderDraftItem.update({
      where: { id: draft.items[0].id },
      data: { quantity: 3 },
    });
    await expect(service.checkout(actor as never, draft.id)).rejects.toThrow(
      'different contents',
    );
    await expect(
      prisma.order.count({
        where: { sourceKey: `POS_DRAFT:${draft.id}` },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.paymentTransaction.count({ where: { orderId } }),
    ).resolves.toBe(1);
  });
});
