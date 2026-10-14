import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  LoyaltyTransactionType,
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
    return { tenant, restaurant, customer };
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
