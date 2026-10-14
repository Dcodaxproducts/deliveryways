import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Prisma,
  RestaurantPayoutRequestStatus,
  RestaurantWalletTransactionType,
  UserRole,
} from '@prisma/client';
import { DatabaseModule, PrismaService } from '../src/database';
import {
  FinancialLedgerModule,
  FinancialLedgerRepository,
} from '../src/modules/financial-ledger';
import { PayoutIntegrityRepository } from '../src/modules/payments/payout-integrity.repository';
import { PackagePlansRepository } from '../src/modules/package-plans/package-plans.repository';

describe('P0 payout integrity lifecycle (isolated PostgreSQL)', () => {
  let fixture: TestingModule;
  let prisma: PrismaService;
  let ledger: FinancialLedgerRepository;
  let payouts: PayoutIntegrityRepository;
  let packagePlans: PackagePlansRepository;
  const runId = Date.now() + '-' + process.pid;

  beforeAll(async () => {
    fixture = await Test.createTestingModule({
      imports: [DatabaseModule, FinancialLedgerModule],
      providers: [PayoutIntegrityRepository, PackagePlansRepository],
    }).compile();
    await fixture.init();
    prisma = fixture.get(PrismaService);
    ledger = fixture.get(FinancialLedgerRepository);
    payouts = fixture.get(PayoutIntegrityRepository);
    packagePlans = fixture.get(PackagePlansRepository);
  }, 60_000);

  afterAll(async () => fixture.close(), 30_000);

  async function createScope(label: string, balance = '100.00') {
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
    const seeded = await ledger.applyRestaurantWalletDelta({
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      operationKey: 'payout-seed:' + label + ':' + runId,
      requestHash: hash({ label, balance }),
      allowNegative: false,
      source: 'P0_PAYOUT_SEED',
      delta: new Prisma.Decimal(balance),
      currency: 'PKR',
      type: RestaurantWalletTransactionType.ORDER_CREDIT,
    });
    return {
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      walletAccountId: seeded.transaction.walletAccountId,
      actorId: 'p0-worker',
      entitlementAmount: new Prisma.Decimal(balance),
    };
  }

  function hash(value: Record<string, string>) {
    return FinancialLedgerRepository.createCanonicalRequestHash(value);
  }

  function reserve(
    scope: Awaited<ReturnType<typeof createScope>>,
    key: string,
    amount: string,
  ) {
    return payouts.reserve({
      ...scope,
      amount: new Prisma.Decimal(amount),
      currency: 'PKR',
      operationIdentity: 'payout:' + scope.restaurantId + ':' + key,
      requestHash: hash({ key, amount, currency: 'PKR' }),
      provider: 'STRIPE',
      bankDetails: { accountId: 'acct_p0', provider: 'STRIPE' },
      autoApprove: true,
    });
  }

  async function balance(restaurantId: string) {
    return (
      await prisma.restaurantWalletAccount.findUniqueOrThrow({
        where: { restaurantId },
      })
    ).balance;
  }

  it('aggregates high-cardinality payout availability in one database query', async () => {
    const scope = await createScope('payout-aggregate', '100000.00');
    const branch = await prisma.branch.create({
      data: {
        tenantId: scope.tenantId,
        restaurantId: scope.restaurantId,
        name: 'Aggregate branch',
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: `aggregate-${runId}@example.com`,
        password: 'not-used',
        role: UserRole.CUSTOMER,
        tenantId: scope.tenantId,
        restaurantId: scope.restaurantId,
        branchId: branch.id,
      },
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "orders" (
        "id", "tenant_id", "restaurant_id", "branch_id", "customer_id",
        "order_type", "payment_method", "status", "subtotal", "total_amount",
        "payment_status", "transaction_fee_amount", "transaction_fee_payer",
        "paid_at", "created_at", "updated_at"
      )
      SELECT 'aggregate-order-' || ${runId} || '-' || value,
             ${scope.tenantId}, ${scope.restaurantId}, ${branch.id}, ${customer.id},
             'DELIVERY', 'STRIPE', 'DELIVERED', 100, 100, 'PAID', 2,
             'RESTAURANT', now(), now(), now()
      FROM generate_series(1, 1000) value
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "payment_transactions" (
        "id", "order_id", "tenant_id", "restaurant_id", "branch_id",
        "payment_method", "type", "status", "amount", "currency",
        "processed_at", "created_at", "updated_at"
      )
      SELECT 'aggregate-payment-' || ${runId} || '-' || value,
             'aggregate-order-' || ${runId} || '-' || value,
             ${scope.tenantId}, ${scope.restaurantId}, ${branch.id},
             'STRIPE', 'CHARGE', 'PAID', 100, 'PKR', now(), now(), now()
      FROM generate_series(1, 1000) value
    `);
    const query = jest.spyOn(prisma, '$queryRaw');
    const rows = await packagePlans.getRestaurantPayoutAvailabilityAggregates(
      scope.restaurantId,
      new Date(Date.now() - 60_000),
      new Date(Date.now() + 60_000),
      new Prisma.Decimal(3),
      new Prisma.Decimal(5),
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].ordersCount).toBe(BigInt(1000));
    expect(rows[0].periodOrdersCount).toBe(BigInt(1000));
    expect(rows[0].totalOrderAmount).toEqual(new Prisma.Decimal(100000));
    expect(rows[0].platformCollectedAmount).toEqual(new Prisma.Decimal(100000));
    expect(rows[0].restaurantTransactionFeeAmount).toEqual(
      new Prisma.Decimal(2000),
    );
    expect(rows[0].fixedCommissionAmount).toEqual(new Prisma.Decimal(3000));
    query.mockRestore();
  }, 60_000);

  it('serializes concurrent payouts and payout versus other debits', async () => {
    const entitlementScope = {
      ...(await createScope('payout-entitlement', '1000.00')),
      entitlementAmount: new Prisma.Decimal('600.00'),
    };
    const entitlementRace = await Promise.allSettled([
      reserve(entitlementScope, 'entitlement-a', '400.00'),
      reserve(entitlementScope, 'entitlement-b', '400.00'),
    ]);
    expect(
      entitlementRace.filter((item) => item.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      entitlementRace.filter((item) => item.status === 'rejected'),
    ).toHaveLength(1);
    expect(await balance(entitlementScope.restaurantId)).toEqual(
      new Prisma.Decimal('600.00'),
    );

    const first = await createScope('payout-concurrent');
    const requests = await Promise.allSettled([
      reserve(first, 'concurrent-a', '70.00'),
      reserve(first, 'concurrent-b', '70.00'),
    ]);
    expect(requests.filter((item) => item.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(requests.filter((item) => item.status === 'rejected')).toHaveLength(
      1,
    );
    expect(await balance(first.restaurantId)).toEqual(
      new Prisma.Decimal('30.00'),
    );

    const second = await createScope('payout-contention');
    const contention = await Promise.allSettled([
      reserve(second, 'contention-payout', '70.00'),
      ledger.applyRestaurantWalletDelta({
        tenantId: second.tenantId,
        restaurantId: second.restaurantId,
        operationKey: 'contention-refund',
        requestHash: hash({ key: 'contention-refund', amount: '-70.00' }),
        allowNegative: false,
        source: 'P0_REFUND',
        delta: new Prisma.Decimal('-70.00'),
        currency: 'PKR',
        type: RestaurantWalletTransactionType.REFUND_DEBIT,
      }),
    ]);
    expect(
      contention.filter((item) => item.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      contention.filter((item) => item.status === 'rejected'),
    ).toHaveLength(1);
    expect(await balance(second.restaurantId)).toEqual(
      new Prisma.Decimal('30.00'),
    );

    const third = await createScope('payout-subscription-contention');
    const subscriptionContention = await Promise.allSettled([
      reserve(third, 'subscription-payout', '70.00'),
      ledger.applyRestaurantWalletDelta({
        tenantId: third.tenantId,
        restaurantId: third.restaurantId,
        operationKey: 'subscription-debit',
        requestHash: hash({ key: 'subscription-debit', amount: '-70.00' }),
        allowNegative: false,
        source: 'P0_SUBSCRIPTION',
        delta: new Prisma.Decimal('-70.00'),
        currency: 'PKR',
        type: RestaurantWalletTransactionType.ADJUSTMENT,
        subscriptionInvoiceKey: 'p0-subscription-' + runId,
      }),
    ]);
    expect(
      subscriptionContention.filter((item) => item.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(await balance(third.restaurantId)).toEqual(
      new Prisma.Decimal('30.00'),
    );
  });

  it('replays the same operation and rejects a mismatched request', async () => {
    const scope = await createScope('payout-replay');
    const first = await reserve(scope, 'stable', '25.00');
    const replay = await reserve(scope, 'stable', '25.00');
    expect(replay.request.id).toBe(first.request.id);
    expect(replay.replayed).toBe(true);
    await expect(reserve(scope, 'stable', '26.00')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await balance(scope.restaurantId)).toEqual(
      new Prisma.Decimal('75.00'),
    );
  });

  it('uses one durable provider idempotency key for logical retries', async () => {
    const scope = await createScope('payout-provider-idempotency');
    const provider = jest.fn(
      (input: { idempotencyKey: string | null }): Promise<{ id: string }> => {
        if (!input.idempotencyKey) {
          throw new Error('Provider idempotency key is required');
        }
        return Promise.resolve({ id: 'tr_logical_once' });
      },
    );
    const execute = async () => {
      const reserved = await reserve(scope, 'provider-once', '20.00');
      if (reserved.request.status === RestaurantPayoutRequestStatus.COMPLETED) {
        return reserved.request;
      }
      const claim = await payouts.claim(reserved.request.id);
      await provider({
        idempotencyKey: claim.request.providerIdempotencyKey,
      });
      return payouts.recordProviderSuccess(
        claim.request.id,
        claim.claimToken!,
        'tr_logical_once',
        'SUCCEEDED',
      );
    };
    const first = await execute();
    const replay = await execute();
    expect(replay.id).toBe(first.id);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(first.providerIdempotencyKey).toMatch(/^ff-payout-[a-f0-9]{64}$/);
  });

  it('recovers reservation crashes, fences stale workers, and finalizes once', async () => {
    const scope = await createScope('payout-fence');
    const reserved = await reserve(scope, 'fence', '30.00');
    expect(reserved.request.status).toBe(
      RestaurantPayoutRequestStatus.RESERVED,
    );
    expect(await balance(scope.restaurantId)).toEqual(
      new Prisma.Decimal('70.00'),
    );

    const first = await payouts.claim(reserved.request.id);
    await prisma.restaurantPayoutRequest.update({
      where: { id: reserved.request.id },
      data: { leaseExpiresAt: new Date(0) },
    });
    const takeover = await payouts.claim(reserved.request.id);
    await expect(
      payouts.recordProviderSuccess(
        reserved.request.id,
        first.claimToken!,
        'tr_stale',
        'SUCCEEDED',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const completed = await payouts.recordProviderSuccess(
      reserved.request.id,
      takeover.claimToken!,
      'tr_winner',
      'SUCCEEDED',
    );
    expect(completed.status).toBe(RestaurantPayoutRequestStatus.COMPLETED);
    const replay = await payouts.complete(reserved.request.id);
    expect(replay.id).toBe(completed.id);
    expect(await balance(scope.restaurantId)).toEqual(
      new Prisma.Decimal('70.00'),
    );

    const crash = await reserve(scope, 'provider-success-crash', '10.00');
    const crashClaim = await payouts.claim(crash.request.id);
    await prisma.restaurantPayoutRequest.update({
      where: { id: crash.request.id },
      data: {
        status: RestaurantPayoutRequestStatus.PROVIDER_SUCCEEDED,
        providerReference: 'tr_crash_recovery',
        providerSucceededAt: new Date(),
        claimToken: crashClaim.claimToken,
      },
    });
    const recovered = await payouts.complete(
      crash.request.id,
      crashClaim.claimToken!,
    );
    expect(recovered.status).toBe(RestaurantPayoutRequestStatus.COMPLETED);
  });

  it('releases definitive failures once but retains ambiguous reservations', async () => {
    const scope = await createScope('payout-failure');
    const definitive = await reserve(scope, 'definitive', '20.00');
    const claim = await payouts.claim(definitive.request.id);
    const released = await payouts.release(
      definitive.request.id,
      scope.actorId,
      'provider rejected',
      claim.claimToken!,
    );
    expect(released.status).toBe(RestaurantPayoutRequestStatus.RELEASED);
    await payouts.release(definitive.request.id, scope.actorId, 'duplicate');
    expect(await balance(scope.restaurantId)).toEqual(
      new Prisma.Decimal('100.00'),
    );

    const ambiguous = await reserve(scope, 'ambiguous', '30.00');
    const uncertain = await payouts.claim(ambiguous.request.id);
    await payouts.recordAmbiguousFailure(
      ambiguous.request.id,
      uncertain.claimToken!,
      'network timeout',
    );
    expect(await balance(scope.restaurantId)).toEqual(
      new Prisma.Decimal('70.00'),
    );
    const retry = await payouts.claim(ambiguous.request.id);
    const completed = await payouts.recordProviderSuccess(
      ambiguous.request.id,
      retry.claimToken!,
      'tr_after_timeout',
      'SUCCEEDED',
    );
    expect(completed.status).toBe(RestaurantPayoutRequestStatus.COMPLETED);
    const duplicateWebhook = await payouts.reconcileSuccess(
      ambiguous.request.id,
      'tr_after_timeout',
      'SUCCEEDED',
    );
    expect(duplicateWebhook.id).toBe(completed.id);
    expect(await balance(scope.restaurantId)).toEqual(
      new Prisma.Decimal('70.00'),
    );
  });

  it('makes cancellation race-safe and adopts an unambiguous legacy request', async () => {
    const scope = await createScope('payout-cancel-legacy');
    const cancellable = await reserve(scope, 'cancel', '15.00');
    const cancellation = await Promise.allSettled([
      payouts.release(
        cancellable.request.id,
        scope.actorId,
        'cancelled',
        undefined,
        true,
      ),
      payouts.claim(cancellable.request.id),
    ]);
    expect(
      cancellation.filter((item) => item.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(await balance(scope.restaurantId)).toEqual(
      new Prisma.Decimal(
        cancellation[0].status === 'fulfilled' ? '100.00' : '85.00',
      ),
    );

    const legacy = await prisma.restaurantPayoutRequest.create({
      data: {
        walletAccountId: scope.walletAccountId,
        tenantId: scope.tenantId,
        restaurantId: scope.restaurantId,
        requestedBy: scope.actorId,
        status: RestaurantPayoutRequestStatus.APPROVED,
        amount: new Prisma.Decimal('10.00'),
        currency: 'PKR',
        bankDetails: { bankName: 'P0', accountNumber: '1' },
      },
    });
    await ledger.applyRestaurantWalletDelta({
      tenantId: scope.tenantId,
      restaurantId: scope.restaurantId,
      operationKey: 'legacy-exact-' + legacy.id,
      requestHash: hash({ key: 'legacy-exact', amount: '-10.00' }),
      allowNegative: false,
      source: 'P0_LEGACY_PAYOUT',
      delta: new Prisma.Decimal('-10.00'),
      currency: 'PKR',
      type: RestaurantWalletTransactionType.PAYOUT_DEBIT,
      payoutRequestId: legacy.id,
    });
    const adopted = await payouts.adoptAndReserveLegacy(
      legacy.id,
      scope.actorId,
    );
    const replay = await payouts.adoptAndReserveLegacy(
      legacy.id,
      scope.actorId,
    );
    expect(replay.walletTransactionId).toBe(adopted.walletTransactionId);

    const missing = await prisma.restaurantPayoutRequest.create({
      data: {
        walletAccountId: scope.walletAccountId,
        tenantId: scope.tenantId,
        restaurantId: scope.restaurantId,
        requestedBy: scope.actorId,
        status: RestaurantPayoutRequestStatus.APPROVED,
        amount: new Prisma.Decimal('5.00'),
        currency: 'PKR',
        bankDetails: { bankName: 'P0', accountNumber: '2' },
      },
    });
    await expect(
      payouts.adoptAndReserveLegacy(missing.id, scope.actorId),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      prisma.restaurantPayoutRequest.findUniqueOrThrow({
        where: { id: missing.id },
      }),
    ).resolves.toMatchObject({
      status: RestaurantPayoutRequestStatus.NEEDS_RECONCILIATION,
    });

    const mismatched = await prisma.restaurantPayoutRequest.create({
      data: {
        walletAccountId: scope.walletAccountId,
        tenantId: scope.tenantId,
        restaurantId: scope.restaurantId,
        status: RestaurantPayoutRequestStatus.APPROVED,
        amount: new Prisma.Decimal('5.00'),
        currency: 'PKR',
        bankDetails: {},
      },
    });
    await ledger.applyRestaurantWalletDelta({
      tenantId: scope.tenantId,
      restaurantId: scope.restaurantId,
      operationKey: 'legacy-mismatch-' + mismatched.id,
      requestHash: hash({ key: 'legacy-mismatch', amount: '-4.00' }),
      allowNegative: false,
      source: 'P0_LEGACY_PAYOUT',
      delta: new Prisma.Decimal('-4.00'),
      currency: 'PKR',
      type: RestaurantWalletTransactionType.PAYOUT_DEBIT,
      payoutRequestId: mismatched.id,
    });
    await expect(
      payouts.adoptAndReserveLegacy(mismatched.id, scope.actorId),
    ).rejects.toBeInstanceOf(ConflictException);

    const multiple = await prisma.restaurantPayoutRequest.create({
      data: {
        walletAccountId: scope.walletAccountId,
        tenantId: scope.tenantId,
        restaurantId: scope.restaurantId,
        status: RestaurantPayoutRequestStatus.APPROVED,
        amount: new Prisma.Decimal('2.00'),
        currency: 'PKR',
        bankDetails: {},
      },
    });
    for (const suffix of ['a', 'b']) {
      await ledger.applyRestaurantWalletDelta({
        tenantId: scope.tenantId,
        restaurantId: scope.restaurantId,
        operationKey: 'legacy-multiple-' + multiple.id + '-' + suffix,
        requestHash: hash({
          key: 'legacy-multiple-' + suffix,
          amount: '-2.00',
        }),
        allowNegative: false,
        source: 'P0_LEGACY_PAYOUT',
        delta: new Prisma.Decimal('-2.00'),
        currency: 'PKR',
        type: RestaurantWalletTransactionType.PAYOUT_DEBIT,
        payoutRequestId: multiple.id,
      });
    }
    await expect(
      payouts.adoptAndReserveLegacy(multiple.id, scope.actorId),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
