import { Test, TestingModule } from '@nestjs/testing';
import {
  CouponApplyMode,
  CouponCampaignKind,
  CouponDiscountType,
  CouponStatus,
  LoyaltyTransactionType,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  UserRole,
  WalletTransactionType,
} from '@prisma/client';
import { DatabaseModule, PrismaService } from '../src/database';
import {
  FinancialLedgerModule,
  FinancialLedgerRepository,
} from '../src/modules/financial-ledger';
import { LoyaltyWalletRepository } from '../src/modules/loyalty-wallet/loyalty-wallet.repository';
import { LoyaltyWalletService } from '../src/modules/loyalty-wallet/loyalty-wallet.service';

describe('P0 customer financial workflows (isolated PostgreSQL)', () => {
  let fixture: TestingModule;
  let prisma: PrismaService;
  let ledger: FinancialLedgerRepository;
  let service: LoyaltyWalletService;
  const runId = Date.now() + '-' + process.pid;

  beforeAll(async () => {
    fixture = await Test.createTestingModule({
      imports: [DatabaseModule, FinancialLedgerModule],
      providers: [LoyaltyWalletRepository],
    }).compile();
    await fixture.init();
    prisma = fixture.get(PrismaService);
    ledger = fixture.get(FinancialLedgerRepository);
    service = new LoyaltyWalletService(
      fixture.get(LoyaltyWalletRepository),
      prisma,
      ledger,
    );
  }, 60_000);

  afterAll(async () => fixture.close(), 30_000);

  async function createScope(label: string) {
    const tenant = await prisma.tenant.create({
      data: { name: label, slug: label + '-' + runId },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        tenantId: tenant.id,
        name: label,
        slug: 'restaurant-' + label + '-' + runId,
        subdomain: label + '-' + runId,
      },
    });
    const branch = await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        name: label + ' branch',
        isMain: true,
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: label + '-' + runId + '@example.test',
        password: 'not-used',
        role: UserRole.CUSTOMER,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        isVerified: true,
        isApproved: true,
      },
    });
    const program = await prisma.loyaltyProgram.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        pointsPerCurrencyUnit: new Prisma.Decimal(1),
        redemptionValuePerPoint: new Prisma.Decimal(1),
        minimumRedeemPoints: 1,
        allowWalletConversion: true,
        allowOrderDiscount: true,
      },
    });
    return { tenant, restaurant, branch, customer, program };
  }

  function context(scope: Awaited<ReturnType<typeof createScope>>) {
    return {
      tenantId: scope.tenant.id,
      restaurantId: scope.restaurant.id,
      branchId: scope.branch.id,
      customerId: scope.customer.id,
    };
  }

  async function seedWallet(
    scope: Awaited<ReturnType<typeof createScope>>,
    amount: number,
  ) {
    await ledger.applyCustomerWalletDelta({
      ...context(scope),
      operationKey: 'seed-wallet-' + scope.customer.id,
      requestHash: FinancialLedgerRepository.createCanonicalRequestHash({
        amount,
      }),
      allowNegative: false,
      source: 'P0_SEED',
      delta: new Prisma.Decimal(amount),
      currency: 'PKR',
      type: WalletTransactionType.CREDIT,
    });
  }

  async function seedLoyalty(
    scope: Awaited<ReturnType<typeof createScope>>,
    points: number,
  ) {
    await ledger.applyLoyaltyDelta({
      ...context(scope),
      operationKey: 'seed-loyalty-' + scope.customer.id,
      requestHash: FinancialLedgerRepository.createCanonicalRequestHash({
        points,
      }),
      allowNegative: false,
      source: 'P0_SEED',
      delta: points,
      lifetimeEarnedDelta: points,
      loyaltyProgramId: scope.program.id,
      type: LoyaltyTransactionType.EARN,
    });
  }

  it('converts loyalty to wallet concurrently without deadlock or lost deltas', async () => {
    const scope = await createScope('customer-conversion');
    await seedLoyalty(scope, 200);
    await expect(
      Promise.all([
        service.redeemPointsToWallet(
          context(scope),
          50,
          undefined,
          scope.customer.id,
          'conversion-a-' + runId,
        ),
        service.redeemPointsToWallet(
          context(scope),
          50,
          undefined,
          scope.customer.id,
          'conversion-b-' + runId,
        ),
      ]),
    ).resolves.toHaveLength(2);
    const [loyalty, wallet] = await Promise.all([
      prisma.loyaltyAccount.findUniqueOrThrow({
        where: {
          restaurantId_customerId: {
            restaurantId: scope.restaurant.id,
            customerId: scope.customer.id,
          },
        },
      }),
      prisma.walletAccount.findUniqueOrThrow({
        where: {
          restaurantId_customerId: {
            restaurantId: scope.restaurant.id,
            customerId: scope.customer.id,
          },
        },
      }),
    ]);
    expect(loyalty.availablePoints).toBe(100);
    expect(wallet.balance.toNumber()).toBe(100);
  });

  it('redeems one gift card exactly once under concurrent retries', async () => {
    const scope = await createScope('customer-gift-redeem');
    const gift = await prisma.coupon.create({
      data: {
        tenantId: scope.tenant.id,
        restaurantId: scope.restaurant.id,
        code: 'P0-GIFT-' + runId,
        title: 'P0 gift',
        kind: CouponCampaignKind.GIFT_CARD,
        status: CouponStatus.ACTIVE,
        applyMode: CouponApplyMode.ORDER_TOTAL,
        discountType: CouponDiscountType.FLAT,
        discountValue: new Prisma.Decimal(75),
        maxUses: 1,
        maxUsesPerCustomer: 1,
        startsAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() + 86_400_000),
        isActive: true,
      },
    });
    const results = await Promise.all([
      service.redeemGiftCardToWallet(
        context(scope),
        gift.code,
        scope.customer.id,
      ),
      service.redeemGiftCardToWallet(
        context(scope),
        gift.code,
        scope.customer.id,
      ),
    ]);
    expect(results[0].walletTransactionId).toBe(results[1].walletTransactionId);
    const [updated, usages, transactions, account] = await Promise.all([
      prisma.coupon.findUniqueOrThrow({ where: { id: gift.id } }),
      prisma.couponUsage.count({ where: { couponId: gift.id } }),
      prisma.walletTransaction.count({
        where: {
          restaurantId: scope.restaurant.id,
          customerId: scope.customer.id,
        },
      }),
      prisma.walletAccount.findUniqueOrThrow({
        where: {
          restaurantId_customerId: {
            restaurantId: scope.restaurant.id,
            customerId: scope.customer.id,
          },
        },
      }),
    ]);
    expect(updated.usedCount).toBe(1);
    expect(usages).toBe(1);
    expect(transactions).toBe(1);
    expect(account.balance.toNumber()).toBe(75);
  });

  it('prevents concurrent wallet gift purchases from overspending', async () => {
    const scope = await createScope('customer-gift-purchase');
    await seedWallet(scope, 100);
    const attempts = await Promise.allSettled([
      service.purchaseGiftCardFromWallet(
        context(scope),
        { amount: 80, idempotencyKey: 'gift-buy-a-' + runId },
        scope.customer.id,
      ),
      service.purchaseGiftCardFromWallet(
        context(scope),
        { amount: 80, idempotencyKey: 'gift-buy-b-' + runId },
        scope.customer.id,
      ),
    ]);
    expect(
      attempts.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    const [account, gifts] = await Promise.all([
      prisma.walletAccount.findUniqueOrThrow({
        where: {
          restaurantId_customerId: {
            restaurantId: scope.restaurant.id,
            customerId: scope.customer.id,
          },
        },
      }),
      prisma.coupon.count({
        where: {
          restaurantId: scope.restaurant.id,
          kind: CouponCampaignKind.GIFT_CARD,
        },
      }),
    ]);
    expect(account.balance.toNumber()).toBe(20);
    expect(gifts).toBe(1);
  });

  it('converges admin and webhook top-up retries on the payment operation', async () => {
    const scope = await createScope('customer-top-up-retry');
    const payment = await prisma.paymentTransaction.create({
      data: {
        tenantId: scope.tenant.id,
        restaurantId: scope.restaurant.id,
        branchId: scope.branch.id,
        paymentMethod: PaymentMethod.WALLET,
        status: PaymentStatus.PAID,
        amount: new Prisma.Decimal(25),
        currency: 'PKR',
      },
    });
    const adminResult = await service.applyWalletTopUp(
      context(scope),
      25,
      payment.id,
      'Wallet top-up marked as paid by admin',
      'admin-actor',
    );
    const webhookResult = await service.applyWalletTopUp(
      context(scope),
      25,
      payment.id,
      'Wallet top-up via Stripe',
      'stripe:webhook',
    );
    expect(webhookResult.walletBalance).toBe(adminResult.walletBalance);
    await expect(
      prisma.walletTransaction.count({
        where: { paymentTransactionId: payment.id },
      }),
    ).resolves.toBe(1);
  });

  it('keeps checkout debit, paid award, and restore ledgers contiguous and replay-safe', async () => {
    const scope = await createScope('customer-order-chain');
    await Promise.all([seedWallet(scope, 50), seedLoyalty(scope, 100)]);
    const order = await prisma.order.create({
      data: {
        tenantId: scope.tenant.id,
        restaurantId: scope.restaurant.id,
        branchId: scope.branch.id,
        customerId: scope.customer.id,
        orderType: OrderType.TAKEAWAY,
        paymentMethod: PaymentMethod.COD,
        subtotal: new Prisma.Decimal(100),
        walletAppliedAmount: new Prisma.Decimal(20),
        loyaltyDiscountAmount: new Prisma.Decimal(30),
        loyaltyPointsRedeemed: 30,
        totalAmount: new Prisma.Decimal(80),
        paymentStatus: PaymentStatus.PAID,
      },
    });
    await prisma.$transaction((tx) =>
      service.applyOrderBenefits(tx, context(scope), order, scope.customer.id),
    );
    await Promise.all([
      service.awardPointsForPaidOrder(order.id, undefined, scope.customer.id),
      service.awardPointsForPaidOrder(order.id, undefined, scope.customer.id),
    ]);
    await Promise.all([
      service.restoreOrderBenefits(order.id, 'REFUND', scope.customer.id),
      service.restoreOrderBenefits(order.id, 'REFUND', scope.customer.id),
    ]);
    const [wallet, loyalty, walletChain, loyaltyChain] = await Promise.all([
      prisma.walletAccount.findUniqueOrThrow({
        where: {
          restaurantId_customerId: {
            restaurantId: scope.restaurant.id,
            customerId: scope.customer.id,
          },
        },
      }),
      prisma.loyaltyAccount.findUniqueOrThrow({
        where: {
          restaurantId_customerId: {
            restaurantId: scope.restaurant.id,
            customerId: scope.customer.id,
          },
        },
      }),
      prisma.walletTransaction.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.loyaltyTransaction.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    expect(wallet.balance.toNumber()).toBe(50);
    expect(loyalty.availablePoints).toBe(200);
    expect(
      walletChain.map(({ balanceAfter }) => balanceAfter.toNumber()),
    ).toEqual([30, 50]);
    expect(loyaltyChain.map(({ balanceAfter }) => balanceAfter)).toEqual([
      70, 170, 200,
    ]);
  });
});
