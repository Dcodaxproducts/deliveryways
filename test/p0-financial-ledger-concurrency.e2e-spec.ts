import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  LoyaltyTransactionType,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  RestaurantWalletTransactionType,
  UserRole,
  WalletTransactionType,
} from '@prisma/client';
import { DatabaseModule, PrismaService } from '../src/database';
import {
  FinancialLedgerModule,
  FinancialLedgerRepository,
} from '../src/modules/financial-ledger';

describe('P0 canonical financial ledger concurrency (isolated database)', () => {
  let moduleFixture: TestingModule;
  let prisma: PrismaService;
  let ledger: FinancialLedgerRepository;
  const runId = Date.now() + '-' + process.pid;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [DatabaseModule, FinancialLedgerModule],
    }).compile();
    await moduleFixture.init();
    prisma = moduleFixture.get(PrismaService);
    ledger = moduleFixture.get(FinancialLedgerRepository);
  }, 60_000);

  afterAll(async () => moduleFixture.close(), 30_000);

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
        name: label + ' main',
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
        isVerified: true,
        isApproved: true,
      },
    });
    return { tenant, restaurant, branch, customer };
  }

  function requestHash(payload: Record<string, string | number | boolean>) {
    return FinancialLedgerRepository.createCanonicalRequestHash(payload);
  }

  it('serializes 20 credits, guarded debits, replay, mismatch, and contiguous outcomes', async () => {
    const scope = await createScope('ledger-customer');
    const base = {
      tenantId: scope.tenant.id,
      restaurantId: scope.restaurant.id,
      customerId: scope.customer.id,
      allowNegative: false,
      source: 'P0_CUSTOMER_CREDIT',
      currency: 'PKR',
      type: WalletTransactionType.CREDIT,
    };
    const credits = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        ledger.applyCustomerWalletDelta({
          ...base,
          operationKey: 'customer-credit-' + runId + '-' + index,
          requestHash: requestHash({ index, amount: 1 }),
          delta: new Prisma.Decimal(1),
        }),
      ),
    );
    expect(credits.every(({ replayed }) => !replayed)).toBe(true);
    const account = await prisma.walletAccount.findUniqueOrThrow({
      where: {
        restaurantId_customerId: {
          restaurantId: scope.restaurant.id,
          customerId: scope.customer.id,
        },
      },
    });
    expect(account.balance).toEqual(new Prisma.Decimal(20));
    const history = await prisma.walletTransaction.findMany({
      where: { walletAccountId: account.id },
      orderBy: { balanceAfter: 'asc' },
    });
    expect(history.map((entry) => entry.balanceAfter.toNumber())).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );

    const debits = await Promise.allSettled(
      ['a', 'b'].map((suffix) =>
        ledger.applyCustomerWalletDelta({
          ...base,
          type: WalletTransactionType.DEBIT,
          source: 'P0_GUARDED_DEBIT',
          operationKey: 'customer-debit-' + runId + '-' + suffix,
          requestHash: requestHash({ suffix, amount: -15 }),
          delta: new Prisma.Decimal(-15),
        }),
      ),
    );
    expect(debits.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(debits.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    await expect(
      prisma.walletAccount.findUniqueOrThrow({ where: { id: account.id } }),
    ).resolves.toMatchObject({
      balance: new Prisma.Decimal(5),
    });

    const replayInput = {
      ...base,
      operationKey: 'customer-replay-' + runId,
      requestHash: requestHash({ amount: 2, source: 'replay' }),
      delta: new Prisma.Decimal(2),
    };
    const first = await ledger.applyCustomerWalletDelta(replayInput);
    const replay = await ledger.applyCustomerWalletDelta(replayInput);
    expect(replay).toEqual({ transaction: first.transaction, replayed: true });
    await expect(
      ledger.applyCustomerWalletDelta({
        ...replayInput,
        requestHash: 'f'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const otherCustomer = await prisma.user.create({
      data: {
        email: 'other-' + runId + '@example.test',
        password: 'not-used',
        role: UserRole.CUSTOMER,
        tenantId: scope.tenant.id,
        restaurantId: scope.restaurant.id,
      },
    });
    await expect(
      ledger.applyCustomerWalletDelta({
        ...replayInput,
        customerId: otherCustomer.id,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates loyalty and restaurant accounts safely and commits balances with ledgers atomically', async () => {
    const scope = await createScope('ledger-other-kinds');
    const loyaltyInput = {
      tenantId: scope.tenant.id,
      restaurantId: scope.restaurant.id,
      customerId: scope.customer.id,
      operationKey: 'loyalty-credit-' + runId,
      requestHash: requestHash({ points: 30 }),
      allowNegative: false,
      source: 'P0_LOYALTY',
      delta: 30,
      lifetimeEarnedDelta: 30,
      type: LoyaltyTransactionType.EARN,
    };
    const loyalty = await ledger.applyLoyaltyDelta(loyaltyInput);
    expect(loyalty.transaction.balanceAfter).toBe(30);
    const loyaltyAccount = await prisma.loyaltyAccount.findUniqueOrThrow({
      where: {
        restaurantId_customerId: {
          restaurantId: scope.restaurant.id,
          customerId: scope.customer.id,
        },
      },
    });
    expect(loyaltyAccount).toMatchObject({
      availablePoints: 30,
      lifetimeEarnedPoints: 30,
    });

    const legacyKey = FinancialLedgerRepository.createOperationKey(
      'legacy-loyalty-' + runId,
    );
    await prisma.loyaltyTransaction.create({
      data: {
        loyaltyAccountId: loyaltyAccount.id,
        tenantId: scope.tenant.id,
        restaurantId: scope.restaurant.id,
        customerId: scope.customer.id,
        type: LoyaltyTransactionType.ADJUSTMENT,
        points: 4,
        balanceAfter: 34,
        metadata: { source: 'LEGACY_SOURCE' },
        idempotencyKey: legacyKey,
      },
    });
    await prisma.loyaltyAccount.update({
      where: { id: loyaltyAccount.id },
      data: { availablePoints: 34 },
    });
    await expect(
      ledger.applyLoyaltyDelta({
        ...loyaltyInput,
        operationKey: 'legacy-loyalty-' + runId,
        requestHash: requestHash({ legacy: true }),
        source: 'LEGACY_SOURCE',
        delta: 4,
        lifetimeEarnedDelta: 0,
        type: LoyaltyTransactionType.ADJUSTMENT,
      }),
    ).resolves.toMatchObject({ replayed: true });
    await expect(
      ledger.applyLoyaltyDelta({
        ...loyaltyInput,
        operationKey: 'legacy-loyalty-' + runId,
        requestHash: requestHash({ legacy: true }),
        source: 'CHANGED_SOURCE',
        delta: 4,
        lifetimeEarnedDelta: 0,
        type: LoyaltyTransactionType.ADJUSTMENT,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const restaurantBase = {
      tenantId: scope.tenant.id,
      restaurantId: scope.restaurant.id,
      allowNegative: false,
      source: 'P0_RESTAURANT',
      currency: 'PKR',
      type: RestaurantWalletTransactionType.ORDER_CREDIT,
    };
    await ledger.applyRestaurantWalletDelta({
      ...restaurantBase,
      operationKey: 'restaurant-first-' + runId,
      requestHash: requestHash({ amount: 12 }),
      delta: new Prisma.Decimal(12),
      paymentTransactionId: 'payment-key-' + runId,
    });
    await expect(
      ledger.applyRestaurantWalletDelta({
        ...restaurantBase,
        operationKey: 'restaurant-rollback-' + runId,
        requestHash: requestHash({ amount: 7 }),
        delta: new Prisma.Decimal(7),
        paymentTransactionId: 'payment-key-' + runId,
      }),
    ).rejects.toThrow();
    const restaurantAccount =
      await prisma.restaurantWalletAccount.findUniqueOrThrow({
        where: { restaurantId: scope.restaurant.id },
      });
    expect(restaurantAccount.balance).toEqual(new Prisma.Decimal(12));
    await expect(
      prisma.restaurantWalletTransaction.count({
        where: { walletAccountId: restaurantAccount.id },
      }),
    ).resolves.toBe(1);
  });

  it('adopts pre-migration top-up and restaurant payment rows without duplicating balances', async () => {
    const scope = await createScope('ledger-legacy-replay');
    const payment = await prisma.paymentTransaction.create({
      data: {
        tenantId: scope.tenant.id,
        restaurantId: scope.restaurant.id,
        branchId: scope.branch.id,
        paymentMethod: PaymentMethod.STRIPE,
        type: PaymentTransactionType.CHARGE,
        status: PaymentStatus.PAID,
        amount: new Prisma.Decimal(50),
        currency: 'PKR',
      },
    });
    const wallet = await prisma.walletAccount.create({
      data: {
        tenantId: scope.tenant.id,
        restaurantId: scope.restaurant.id,
        customerId: scope.customer.id,
        balance: new Prisma.Decimal(50),
        currency: 'PKR',
      },
    });
    const legacyWallet = await prisma.walletTransaction.create({
      data: {
        walletAccountId: wallet.id,
        tenantId: scope.tenant.id,
        restaurantId: scope.restaurant.id,
        branchId: scope.branch.id,
        customerId: scope.customer.id,
        paymentTransactionId: payment.id,
        type: WalletTransactionType.CREDIT,
        amount: new Prisma.Decimal(50),
        balanceAfter: new Prisma.Decimal(50),
        currency: 'PKR',
        metadata: { source: 'WALLET_TOP_UP' },
        idempotencyKey: null,
      },
    });
    const topUpHash = requestHash({ payment: payment.id, amount: 50 });
    const topUpReplay = await ledger.applyCustomerWalletDelta({
      tenantId: scope.tenant.id,
      restaurantId: scope.restaurant.id,
      branchId: scope.branch.id,
      customerId: scope.customer.id,
      paymentTransactionId: payment.id,
      operationKey: 'wallet-top-up:' + payment.id,
      requestHash: topUpHash,
      allowNegative: false,
      source: 'WALLET_TOP_UP',
      delta: new Prisma.Decimal(50),
      currency: 'PKR',
      type: WalletTransactionType.CREDIT,
    });
    expect(topUpReplay).toMatchObject({
      replayed: true,
      transaction: { id: legacyWallet.id, requestHash: topUpHash },
    });
    await expect(
      prisma.walletAccount.findUniqueOrThrow({ where: { id: wallet.id } }),
    ).resolves.toMatchObject({ balance: new Prisma.Decimal(50) });

    const restaurantWallet = await prisma.restaurantWalletAccount.create({
      data: {
        tenantId: scope.tenant.id,
        restaurantId: scope.restaurant.id,
        balance: new Prisma.Decimal(50),
        currency: 'PKR',
      },
    });
    const legacyRestaurant = await prisma.restaurantWalletTransaction.create({
      data: {
        walletAccountId: restaurantWallet.id,
        tenantId: scope.tenant.id,
        restaurantId: scope.restaurant.id,
        branchId: scope.branch.id,
        paymentTransactionId: payment.id,
        type: RestaurantWalletTransactionType.ORDER_CREDIT,
        amount: new Prisma.Decimal(50),
        balanceAfter: new Prisma.Decimal(50),
        currency: 'PKR',
        metadata: { source: 'PLATFORM_COLLECTED_ORDER_PAYMENT' },
        idempotencyKey: null,
      },
    });
    const creditHash = requestHash({ payment: payment.id, amount: 50 });
    const creditReplay = await ledger.applyRestaurantWalletDelta({
      tenantId: scope.tenant.id,
      restaurantId: scope.restaurant.id,
      branchId: scope.branch.id,
      paymentTransactionId: payment.id,
      operationKey: 'restaurant-payment-credit:' + payment.id,
      requestHash: creditHash,
      allowNegative: false,
      source: 'PLATFORM_COLLECTED_ORDER_PAYMENT',
      delta: new Prisma.Decimal(50),
      currency: 'PKR',
      type: RestaurantWalletTransactionType.ORDER_CREDIT,
    });
    expect(creditReplay).toMatchObject({
      replayed: true,
      transaction: { id: legacyRestaurant.id, requestHash: creditHash },
    });
    await expect(
      prisma.restaurantWalletAccount.findUniqueOrThrow({
        where: { id: restaurantWallet.id },
      }),
    ).resolves.toMatchObject({ balance: new Prisma.Decimal(50) });
  });

  it('finds an exact legacy replay after broad rows and rejects exact duplicates', async () => {
    const scope = await createScope('ledger-late-exact-replay');
    const payment = await prisma.paymentTransaction.create({
      data: {
        tenantId: scope.tenant.id,
        restaurantId: scope.restaurant.id,
        branchId: scope.branch.id,
        paymentMethod: PaymentMethod.STRIPE,
        type: PaymentTransactionType.CHARGE,
        status: PaymentStatus.PAID,
        amount: new Prisma.Decimal(75),
        currency: 'PKR',
      },
    });
    const wallet = await prisma.walletAccount.create({
      data: {
        tenantId: scope.tenant.id,
        restaurantId: scope.restaurant.id,
        customerId: scope.customer.id,
        balance: new Prisma.Decimal(75),
        currency: 'PKR',
      },
    });
    await prisma.walletTransaction.createMany({
      data: Array.from({ length: 25 }, (_, index) => ({
        id: 'legacy-broad-' + runId + '-' + String(index).padStart(2, '0'),
        walletAccountId: wallet.id,
        tenantId: scope.tenant.id,
        restaurantId: scope.restaurant.id,
        customerId: scope.customer.id,
        paymentTransactionId: payment.id,
        type: WalletTransactionType.DEBIT,
        amount: new Prisma.Decimal(-1),
        balanceAfter: new Prisma.Decimal(75),
        currency: 'PKR',
        metadata: { source: 'INCOMPATIBLE_' + index },
        idempotencyKey: null,
      })),
    });
    const exact = await prisma.walletTransaction.create({
      data: {
        id: 'legacy-late-exact-' + runId,
        walletAccountId: wallet.id,
        tenantId: scope.tenant.id,
        restaurantId: scope.restaurant.id,
        branchId: scope.branch.id,
        customerId: scope.customer.id,
        paymentTransactionId: payment.id,
        type: WalletTransactionType.CREDIT,
        amount: new Prisma.Decimal(75),
        balanceAfter: new Prisma.Decimal(75),
        currency: 'PKR',
        metadata: { source: 'LATE_EXACT' },
        idempotencyKey: null,
      },
    });
    const input = {
      tenantId: scope.tenant.id,
      restaurantId: scope.restaurant.id,
      branchId: scope.branch.id,
      customerId: scope.customer.id,
      paymentTransactionId: payment.id,
      operationKey: 'late-exact:' + runId,
      requestHash: requestHash({ payment: payment.id, amount: 75 }),
      allowNegative: false,
      source: 'LATE_EXACT',
      delta: new Prisma.Decimal(75),
      currency: 'PKR',
      type: WalletTransactionType.CREDIT,
    };
    await expect(ledger.applyCustomerWalletDelta(input)).resolves.toMatchObject(
      {
        replayed: true,
        transaction: { id: exact.id },
      },
    );
    await prisma.walletTransaction.create({
      data: {
        walletAccountId: wallet.id,
        tenantId: scope.tenant.id,
        restaurantId: scope.restaurant.id,
        branchId: scope.branch.id,
        customerId: scope.customer.id,
        paymentTransactionId: payment.id,
        type: WalletTransactionType.CREDIT,
        amount: new Prisma.Decimal(75),
        balanceAfter: new Prisma.Decimal(75),
        currency: 'PKR',
        metadata: { source: 'LATE_EXACT' },
        idempotencyKey: null,
      },
    });
    await expect(
      ledger.applyCustomerWalletDelta({
        ...input,
        operationKey: 'late-exact-duplicate:' + runId,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses a bounded indexed existence query with 5,000 unlinked legacy refunds', async () => {
    const scope = await createScope('ledger-large-refund-capacity');
    const prefix = 'large-refund-' + runId;
    await prisma.$executeRaw(
      Prisma.sql`
        WITH generated AS (
          SELECT generate_series(1, 5000) AS sequence
        ), inserted_orders AS (
          INSERT INTO "orders" (
            "id", "tenant_id", "restaurant_id", "branch_id", "customer_id",
            "order_type", "payment_method", "subtotal", "total_amount",
            "created_at", "updated_at"
          )
          SELECT
            ${prefix} || ':order:' || sequence,
            ${scope.tenant.id},
            ${scope.restaurant.id},
            ${scope.branch.id},
            ${scope.customer.id},
            ${OrderType.TAKEAWAY}::"OrderType",
            ${PaymentMethod.STRIPE}::"PaymentMethod",
            1.00,
            1.00,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          FROM generated
          RETURNING "id"
        )
        INSERT INTO "payment_transactions" (
          "id", "order_id", "tenant_id", "restaurant_id", "branch_id",
          "payment_method", "type", "status", "amount", "currency",
          "created_at", "updated_at"
        )
        SELECT
          ${prefix} || ':payment:' || substring("id" from '[^:]+$'),
          "id",
          ${scope.tenant.id},
          ${scope.restaurant.id},
          ${scope.branch.id},
          ${PaymentMethod.STRIPE}::"PaymentMethod",
          ${PaymentTransactionType.REFUND}::"PaymentTransactionType",
          ${PaymentStatus.REFUNDED}::"PaymentStatus",
          1.00,
          'PKR',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        FROM inserted_orders
      `,
    );
    await prisma.$executeRaw(Prisma.sql`ANALYZE "payment_transactions"`);

    const targetOrderId = prefix + ':order:5000';
    const legacyRefund = await prisma.paymentTransaction.findFirst({
      where: {
        orderId: targetOrderId,
        sourcePaymentTransactionId: null,
        type: PaymentTransactionType.REFUND,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.REFUNDED] },
      },
      select: { id: true },
    });
    expect(legacyRefund).toEqual({ id: prefix + ':payment:5000' });

    const plan = await prisma.$queryRaw<
      Array<{ 'QUERY PLAN': Prisma.JsonValue }>
    >(
      Prisma.sql`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT "id"
        FROM "payment_transactions"
        WHERE "order_id" = ${targetOrderId}
          AND "source_payment_transaction_id" IS NULL
          AND "type" = 'REFUND'
          AND "status" IN ('PENDING', 'REFUNDED')
        LIMIT 1
      `,
    );
    expect(JSON.stringify(plan)).toContain(
      'payment_transactions_legacy_refund_capacity_idx',
    );
  }, 60_000);

  it('acquires multi-account locks in sorted order without deadlock', async () => {
    const scope = await createScope('ledger-sorted-locks');
    const second = await prisma.user.create({
      data: {
        email: 'sorted-second-' + runId + '@example.test',
        password: 'not-used',
        role: UserRole.CUSTOMER,
        tenantId: scope.tenant.id,
        restaurantId: scope.restaurant.id,
      },
    });
    const scopes = [scope.customer.id, second.id].map((customerId) => ({
      tenantId: scope.tenant.id,
      restaurantId: scope.restaurant.id,
      customerId,
      accountKind: 'CUSTOMER_WALLET' as const,
    }));
    const mutate = (
      label: string,
      orderedCustomerIds: string[],
      orderedScopes: typeof scopes,
    ) =>
      ledger.withFinancialLedgerTransaction(orderedScopes, async (tx) => {
        for (const customerId of orderedCustomerIds) {
          await ledger.applyCustomerWalletDelta(
            {
              tenantId: scope.tenant.id,
              restaurantId: scope.restaurant.id,
              customerId,
              operationKey: 'sorted-' + runId + '-' + label + '-' + customerId,
              requestHash: requestHash({ label, customerId }),
              allowNegative: false,
              source: 'P0_SORTED_LOCK',
              delta: new Prisma.Decimal(1),
              currency: 'PKR',
              type: WalletTransactionType.CREDIT,
            },
            tx,
          );
        }
      });
    await expect(
      Promise.all([
        mutate('forward', [scope.customer.id, second.id], scopes),
        mutate(
          'reverse',
          [second.id, scope.customer.id],
          [...scopes].reverse(),
        ),
      ]),
    ).resolves.toEqual([undefined, undefined]);
    const accounts = await prisma.walletAccount.findMany({
      where: { restaurantId: scope.restaurant.id },
      orderBy: { customerId: 'asc' },
    });
    expect(accounts).toHaveLength(2);
    expect(accounts.map(({ balance }) => balance.toNumber())).toEqual([2, 2]);
  });
});
