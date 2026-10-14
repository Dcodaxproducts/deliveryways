import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  OrderType,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  RestaurantWalletTransactionType,
  UserRole,
} from '@prisma/client';
import { UserRoleEnum } from '../src/common/enums';
import { DatabaseModule, PrismaService } from '../src/database';
import {
  FinancialLedgerModule,
  FinancialLedgerRepository,
} from '../src/modules/financial-ledger';
import { PaymentsRepository } from '../src/modules/payments/payments.repository';
import { PaymentsService } from '../src/modules/payments/payments.service';

describe('P0 refund provider lifecycle (isolated PostgreSQL)', () => {
  let fixture: TestingModule;
  let prisma: PrismaService;
  let ledger: FinancialLedgerRepository;
  let stripe: {
    refundPaymentIntent: jest.Mock;
    constructWebhookEvent: jest.Mock;
  };
  let service: PaymentsService;
  const runId = Date.now() + '-' + process.pid;
  const actor = { uid: 'p0-super', role: UserRoleEnum.SUPER_ADMIN } as never;

  beforeAll(async () => {
    fixture = await Test.createTestingModule({
      imports: [DatabaseModule, FinancialLedgerModule],
    }).compile();
    await fixture.init();
    prisma = fixture.get(PrismaService);
    ledger = fixture.get(FinancialLedgerRepository);
    stripe = {
      refundPaymentIntent: jest.fn(),
      constructWebhookEvent: jest.fn(),
    };
    service = new PaymentsService(
      new PaymentsRepository(prisma),
      prisma,
      {
        notifyPaymentStatusChanged: jest.fn().mockResolvedValue(undefined),
      } as never,
      stripe as never,
      {} as never,
      {
        decrypt: jest.fn().mockReturnValue({
          secretKey: 'sk_test',
          publishableKey: 'pk_test',
          webhookSecret: 'whsec_test',
        }),
      } as never,
      { restoreOrderBenefits: jest.fn().mockResolvedValue(undefined) } as never,
      {
        getPayoutProviderSettings: jest.fn().mockResolvedValue({
          configurations: {
            STRIPE: {
              enabled: true,
              encryptedCredentials: 'encrypted',
              updatedAt: '2026-10-14T00:00:00.000Z',
              updatedBy: 'p0',
              publicDetails: {},
            },
          },
        }),
      } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ledger,
    );
  }, 60_000);

  afterAll(async () => fixture.close(), 30_000);

  async function createCharge(label: string) {
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
      },
    });
    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        customerId: customer.id,
        orderType: OrderType.TAKEAWAY,
        paymentMethod: PaymentMethod.STRIPE,
        subtotal: new Prisma.Decimal(100),
        totalAmount: new Prisma.Decimal(100),
        paymentStatus: PaymentStatus.PAID,
      },
    });
    const charge = await prisma.paymentTransaction.create({
      data: {
        orderId: order.id,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        paymentMethod: PaymentMethod.STRIPE,
        type: PaymentTransactionType.CHARGE,
        status: PaymentStatus.PAID,
        amount: new Prisma.Decimal(100),
        currency: 'EUR',
        providerRef: 'pi_' + label + '_' + runId,
      },
    });
    await ledger.applyRestaurantWalletDelta({
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      branchId: branch.id,
      orderId: order.id,
      paymentTransactionId: charge.id,
      operationKey: 'seed-credit:' + charge.id,
      requestHash: FinancialLedgerRepository.createCanonicalRequestHash({
        chargeId: charge.id,
      }),
      allowNegative: false,
      source: 'PLATFORM_COLLECTED_ORDER_PAYMENT',
      delta: new Prisma.Decimal(100),
      currency: 'EUR',
      type: RestaurantWalletTransactionType.ORDER_CREDIT,
    });
    return { charge, order, restaurant };
  }

  async function walletBalance(restaurantId: string) {
    const wallet = await prisma.restaurantWalletAccount.findUniqueOrThrow({
      where: { restaurantId },
    });
    return wallet.balance.toFixed(2);
  }

  function successfulRefund(chargeId: string, providerRef: string) {
    return {
      id: providerRef,
      payment_intent: chargeId,
      amount: 1000,
      currency: 'eur',
      status: 'succeeded',
    };
  }

  function webhook(
    refund: Awaited<
      ReturnType<typeof prisma.paymentTransaction.findFirstOrThrow>
    >,
    sourceRef: string,
    status: string,
  ) {
    return {
      id: refund.providerRef ?? 're_' + refund.id,
      payment_intent: sourceRef,
      amount: refund.amount.mul(100).toNumber(),
      currency: refund.currency.toLowerCase(),
      status,
      metadata: {
        refundTransactionId: refund.id,
        tenantId: refund.tenantId,
        restaurantId: refund.restaurantId,
        sourcePaymentReference: sourceRef,
        orderId: refund.orderId,
        customerId: '',
        amount: refund.amount.toFixed(2),
        currency: refund.currency,
      },
    };
  }

  it('releases liability on definitive failure and keeps one provider idempotency key', async () => {
    const scope = await createCharge('refund-definitive');
    stripe.refundPaymentIntent.mockRejectedValueOnce({
      type: 'StripeInvalidRequestError',
      message: 'definitive rejection',
    });
    await expect(
      service.refund(actor, scope.charge.id, {
        amount: 10,
        idempotencyKey: 'definitive-' + runId,
      }),
    ).rejects.toBeDefined();
    const refund = await prisma.paymentTransaction.findFirstOrThrow({
      where: { sourcePaymentTransactionId: scope.charge.id },
    });
    expect(refund).toMatchObject({
      status: PaymentStatus.FAILED,
      refundLifecycleStatus: 'FAILED_RELEASED',
      providerIdempotencyKey: 'refund:' + refund.id,
    });
    expect(await walletBalance(scope.restaurant.id)).toBe('100.00');
  });

  it('reconciles ambiguous outcomes to success/failure and deduplicates callbacks', async () => {
    const successScope = await createCharge('refund-ambiguous-success');
    stripe.refundPaymentIntent.mockRejectedValueOnce(new Error('timeout'));
    await expect(
      service.refund(actor, successScope.charge.id, {
        amount: 10,
        idempotencyKey: 'ambiguous-success-' + runId,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    let refund = await prisma.paymentTransaction.findFirstOrThrow({
      where: { sourcePaymentTransactionId: successScope.charge.id },
    });
    const successPayload = webhook(
      refund,
      successScope.charge.providerRef!,
      'succeeded',
    );
    successPayload.metadata.customerId = (
      await prisma.order.findUniqueOrThrow({
        where: { id: successScope.order.id },
      })
    ).customerId;
    stripe.constructWebhookEvent.mockReturnValue({
      type: 'refund.updated',
      data: { object: successPayload },
    });
    await service.handleStripeWebhook(Buffer.from('{}'), 'sig');
    await service.handleStripeWebhook(Buffer.from('{}'), 'sig-duplicate');
    refund = await prisma.paymentTransaction.findUniqueOrThrow({
      where: { id: refund.id },
    });
    expect(refund.refundLifecycleStatus).toBe('COMPLETED');
    expect(await walletBalance(successScope.restaurant.id)).toBe('90.00');
    await expect(
      prisma.restaurantWalletTransaction.count({
        where: { paymentTransactionId: refund.id },
      }),
    ).resolves.toBe(1);

    const failureScope = await createCharge('refund-ambiguous-failure');
    stripe.refundPaymentIntent.mockRejectedValueOnce(new Error('timeout'));
    await expect(
      service.refund(actor, failureScope.charge.id, {
        amount: 10,
        idempotencyKey: 'ambiguous-failure-' + runId,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    const failed = await prisma.paymentTransaction.findFirstOrThrow({
      where: { sourcePaymentTransactionId: failureScope.charge.id },
    });
    const failurePayload = webhook(
      failed,
      failureScope.charge.providerRef!,
      'failed',
    );
    failurePayload.metadata.customerId = (
      await prisma.order.findUniqueOrThrow({
        where: { id: failureScope.order.id },
      })
    ).customerId;
    stripe.constructWebhookEvent.mockReturnValue({
      type: 'refund.updated',
      data: { object: failurePayload },
    });
    await service.handleStripeWebhook(Buffer.from('{}'), 'sig-failed');
    await expect(
      prisma.paymentTransaction.findUniqueOrThrow({ where: { id: failed.id } }),
    ).resolves.toMatchObject({ refundLifecycleStatus: 'FAILED_RELEASED' });
    expect(await walletBalance(failureScope.restaurant.id)).toBe('100.00');
  });

  it('recovers provider success after local crash and fences a stale lease', async () => {
    const scope = await createCharge('refund-provider-crash');
    const providerKeys: string[] = [];
    stripe.refundPaymentIntent.mockImplementation(
      (
        sourceRef: string,
        _amount: number,
        _credentials: unknown,
        key: string,
      ) => {
        providerKeys.push(key);
        return Promise.resolve(
          successfulRefund(sourceRef, 're_crash_' + runId),
        );
      },
    );
    const internals = service as unknown as {
      finalizeProviderSucceededRefund: (...args: unknown[]) => Promise<unknown>;
    };
    const finalize = jest
      .spyOn(internals, 'finalizeProviderSucceededRefund')
      .mockRejectedValueOnce(new Error('simulated local crash'));
    const dto = { amount: 10, idempotencyKey: 'provider-crash-' + runId };
    await expect(service.refund(actor, scope.charge.id, dto)).rejects.toThrow(
      'simulated local crash',
    );
    let refund = await prisma.paymentTransaction.findFirstOrThrow({
      where: { sourcePaymentTransactionId: scope.charge.id },
    });
    expect(refund.refundLifecycleStatus).toBe('PROVIDER_SUCCEEDED');
    finalize.mockRestore();
    await expect(
      service.refund(actor, scope.charge.id, dto),
    ).resolves.toMatchObject({
      data: { refundLifecycleStatus: 'COMPLETED' },
    });
    expect(providerKeys).toEqual(['refund:' + refund.id]);

    const staleScope = await createCharge('refund-stale-lease');
    stripe.refundPaymentIntent.mockRejectedValueOnce(new Error('timeout'));
    await expect(
      service.refund(actor, staleScope.charge.id, {
        amount: 10,
        idempotencyKey: 'stale-' + runId,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    refund = await prisma.paymentTransaction.findFirstOrThrow({
      where: { sourcePaymentTransactionId: staleScope.charge.id },
    });
    await prisma.paymentTransaction.update({
      where: { id: refund.id },
      data: {
        refundLifecycleStatus: 'PROCESSING',
        refundLeaseToken: 'stale-worker',
        refundLeaseExpiresAt: new Date(Date.now() - 1000),
      },
    });
    stripe.refundPaymentIntent.mockResolvedValueOnce(
      successfulRefund(staleScope.charge.providerRef!, 're_stale_' + runId),
    );
    await service.refund(actor, staleScope.charge.id, {
      amount: 10,
      idempotencyKey: 'stale-' + runId,
    });
    const staleMutation = await prisma.paymentTransaction.updateMany({
      where: { id: refund.id, refundLeaseToken: 'stale-worker' },
      data: { note: 'must-not-write' },
    });
    expect(staleMutation.count).toBe(0);
  });
});
