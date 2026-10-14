import { Test, TestingModule } from '@nestjs/testing';
import {
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  RestaurantWalletTransactionType,
} from '@prisma/client';
import { DatabaseModule, PrismaService } from '../src/database';
import {
  FinancialLedgerModule,
  FinancialLedgerRepository,
} from '../src/modules/financial-ledger';

describe('P0 restaurant financial ledger (isolated PostgreSQL)', () => {
  let fixture: TestingModule;
  let prisma: PrismaService;
  let ledger: FinancialLedgerRepository;
  const runId = Date.now() + '-' + process.pid;

  beforeAll(async () => {
    fixture = await Test.createTestingModule({
      imports: [DatabaseModule, FinancialLedgerModule],
    }).compile();
    await fixture.init();
    prisma = fixture.get(PrismaService);
    ledger = fixture.get(FinancialLedgerRepository);
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
    return {
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      branchId: branch.id,
    };
  }

  function requestHash(label: string, amount: string) {
    return FinancialLedgerRepository.createCanonicalRequestHash({
      label,
      amount,
    });
  }

  it('preserves distinct concurrent payment credits and replays a duplicate once', async () => {
    const scope = await createScope('restaurant-credit');
    const apply = (key: string, amount: string) =>
      ledger.applyRestaurantWalletDelta({
        ...scope,
        operationKey: key,
        requestHash: requestHash(key, amount),
        allowNegative: false,
        source: 'P0_ORDER_PAYMENT',
        delta: new Prisma.Decimal(amount),
        currency: 'PKR',
        type: RestaurantWalletTransactionType.ORDER_CREDIT,
      });

    await Promise.all([
      apply('payment-a', '25.00'),
      apply('payment-b', '35.00'),
    ]);
    const [first, replay] = await Promise.all([
      apply('payment-replay', '10.00'),
      apply('payment-replay', '10.00'),
    ]);

    const wallet = await prisma.restaurantWalletAccount.findUniqueOrThrow({
      where: { restaurantId: scope.restaurantId },
    });
    expect(wallet.balance).toEqual(new Prisma.Decimal('70.00'));
    expect([first.replayed, replay.replayed].sort()).toEqual([false, true]);
  });

  it('serializes concurrent partial refund capacity on the source charge', async () => {
    const scope = await createScope('refund-capacity');
    const charge = await prisma.paymentTransaction.create({
      data: {
        ...scope,
        paymentMethod: PaymentMethod.STRIPE,
        type: PaymentTransactionType.CHARGE,
        status: PaymentStatus.PAID,
        amount: new Prisma.Decimal('100.00'),
        currency: 'PKR',
      },
    });
    const reserve = (key: string) =>
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "payment_transactions" WHERE "id" = ${charge.id} FOR UPDATE`,
        );
        const aggregate = await tx.paymentTransaction.aggregate({
          where: {
            sourcePaymentTransactionId: charge.id,
            type: PaymentTransactionType.REFUND,
            status: { in: [PaymentStatus.PENDING, PaymentStatus.REFUNDED] },
          },
          _sum: { amount: true },
        });
        const amount = new Prisma.Decimal('60.00');
        if (
          (aggregate._sum.amount ?? new Prisma.Decimal(0))
            .plus(amount)
            .greaterThan(charge.amount)
        ) {
          throw new Error('refund-capacity-exceeded');
        }
        return tx.paymentTransaction.create({
          data: {
            ...scope,
            paymentMethod: charge.paymentMethod,
            type: PaymentTransactionType.REFUND,
            status: PaymentStatus.PENDING,
            amount,
            currency: charge.currency,
            sourcePaymentTransactionId: charge.id,
            idempotencyKey: FinancialLedgerRepository.createOperationKey(key),
            requestHash: requestHash(key, amount.toFixed(2)),
          },
        });
      });

    const results = await Promise.allSettled([
      reserve('partial-refund-a'),
      reserve('partial-refund-b'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const reserved = await prisma.paymentTransaction.aggregate({
      where: { sourcePaymentTransactionId: charge.id },
      _sum: { amount: true },
    });
    expect(reserved._sum.amount).toEqual(new Prisma.Decimal('60.00'));
  });

  it('serializes refund and subscription debits without overdrawing', async () => {
    const scope = await createScope('restaurant-debit');
    await ledger.applyRestaurantWalletDelta({
      ...scope,
      operationKey: 'seed-restaurant-wallet',
      requestHash: requestHash('seed', '50.00'),
      allowNegative: false,
      source: 'P0_SEED',
      delta: new Prisma.Decimal('50.00'),
      currency: 'PKR',
      type: RestaurantWalletTransactionType.ORDER_CREDIT,
    });
    const debit = (key: string, source: string) =>
      ledger.applyRestaurantWalletDelta({
        ...scope,
        operationKey: key,
        requestHash: requestHash(key, '-40.00'),
        allowNegative: false,
        source,
        delta: new Prisma.Decimal('-40.00'),
        currency: 'PKR',
        type:
          source === 'P0_REFUND'
            ? RestaurantWalletTransactionType.REFUND_DEBIT
            : RestaurantWalletTransactionType.ADJUSTMENT,
        subscriptionInvoiceKey: source === 'P0_SUBSCRIPTION' ? key : undefined,
      });

    const settled = await Promise.allSettled([
      debit('refund-debit', 'P0_REFUND'),
      debit('subscription-debit', 'P0_SUBSCRIPTION'),
    ]);
    expect(
      settled.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      settled.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const wallet = await prisma.restaurantWalletAccount.findUniqueOrThrow({
      where: { restaurantId: scope.restaurantId },
    });
    expect(wallet.balance).toEqual(new Prisma.Decimal('10.00'));
  });
});
