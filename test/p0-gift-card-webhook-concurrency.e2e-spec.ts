import { Test, TestingModule } from '@nestjs/testing';
import {
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
} from '@prisma/client';
import { DatabaseModule, PrismaService } from '../src/database';
import { PaymentsRepository } from '../src/modules/payments/payments.repository';
import { PaymentsService } from '../src/modules/payments/payments.service';

describe('P0 Stripe gift-card webhook concurrency (isolated PostgreSQL)', () => {
  let fixture: TestingModule;
  let prisma: PrismaService;
  const runId = Date.now() + '-' + process.pid;

  beforeAll(async () => {
    fixture = await Test.createTestingModule({
      imports: [DatabaseModule],
    }).compile();
    await fixture.init();
    prisma = fixture.get(PrismaService);
  }, 60_000);

  afterAll(async () => fixture.close(), 30_000);

  it('issues one card and replays the same card under concurrent webhooks', async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'Gift webhook ' + runId, slug: 'gift-webhook-' + runId },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        tenantId: tenant.id,
        name: 'Gift webhook restaurant',
        slug: 'gift-webhook-restaurant-' + runId,
        subdomain: 'gift-webhook-' + runId,
      },
    });
    const branch = await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        name: 'Gift webhook branch',
        isMain: true,
      },
    });
    const providerRef = 'pi_gift_concurrent_' + runId;
    const buyerEmail = 'buyer-' + runId + '@example.test';
    const recipientEmail = 'recipient-' + runId + '@example.test';
    const payment = await prisma.paymentTransaction.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        paymentMethod: PaymentMethod.STRIPE,
        type: PaymentTransactionType.CHARGE,
        status: PaymentStatus.PENDING,
        amount: new Prisma.Decimal(50),
        currency: 'EUR',
        providerRef,
        providerData: {
          target: 'GUEST_GIFT_CARD_PURCHASE',
          buyerEmail,
          recipientEmail,
        },
      },
    });
    const paymentIntent = {
      id: providerRef,
      status: 'succeeded',
      amount_received: 5000,
      currency: 'eur',
      metadata: {
        paymentTransactionId: payment.id,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        product: 'GUEST_GIFT_CARD_PURCHASE',
        giftCardPurchase: 'true',
        customerId: buyerEmail,
        recipientEmail,
      },
    };
    const stripePaymentsService = {
      constructWebhookEvent: jest.fn().mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: paymentIntent },
      }),
    };
    const notificationsService = {
      notifyPaymentStatusChanged: jest.fn().mockResolvedValue(undefined),
    };
    const mailerService = {
      sendTransactionalEmail: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PaymentsService(
      new PaymentsRepository(prisma),
      prisma,
      notificationsService as never,
      stripePaymentsService as never,
      {} as never,
      {} as never,
      undefined,
      {
        getPayoutProviderSettings: jest.fn().mockResolvedValue({
          configurations: {},
        }),
      } as never,
      mailerService as never,
    );

    await expect(
      Promise.all([
        service.handleStripeWebhook(Buffer.from('{}'), 'sig-a'),
        service.handleStripeWebhook(Buffer.from('{}'), 'sig-b'),
      ]),
    ).resolves.toEqual([
      { received: true, eventType: 'payment_intent.succeeded' },
      { received: true, eventType: 'payment_intent.succeeded' },
    ]);

    const firstCard = await prisma.coupon.findUniqueOrThrow({
      where: { sourcePaymentTransactionId: payment.id },
    });
    await expect(
      service.handleStripeWebhook(Buffer.from('{}'), 'sig-replay'),
    ).resolves.toEqual({
      received: true,
      eventType: 'payment_intent.succeeded',
    });
    const cards = await prisma.coupon.findMany({
      where: { sourcePaymentTransactionId: payment.id },
      select: { id: true, code: true },
    });
    const fulfilledPayment = await prisma.paymentTransaction.findUniqueOrThrow({
      where: { id: payment.id },
    });

    expect(cards).toEqual([{ id: firstCard.id, code: firstCard.code }]);
    expect(fulfilledPayment.status).toBe(PaymentStatus.PAID);
    expect(fulfilledPayment.providerData).toEqual(
      expect.objectContaining({
        giftCardId: firstCard.id,
        giftCardCode: firstCard.code,
      }),
    );
  });
});
