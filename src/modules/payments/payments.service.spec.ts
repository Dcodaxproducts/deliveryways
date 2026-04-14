import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { UserRoleEnum } from '../../common/enums';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const makeService = () => {
    const paymentsRepository = {
      create: jest.fn(),
      updateStatus: jest.fn(),
      updateOrderPaymentStatus: jest.fn(),
      updateOrderState: jest.fn(),
      findByProviderRef: jest.fn(),
      findLatestPendingChargeByOrderId: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
      sumSuccessfulRefunds: jest.fn(),
    };

    const prisma = {
      order: {
        findUnique: jest.fn(),
      },
      restaurant: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback({}),
      ),
    };

    const notificationsService = {
      notifyPaymentAttemptCreated: jest.fn(),
      notifyPaymentStatusChanged: jest.fn(),
    };

    const stripePaymentsService = {
      getDefaultCurrency: jest.fn().mockReturnValue('PKR'),
      getPublishableKey: jest.fn().mockReturnValue('pk_test_123'),
      createPaymentIntent: jest.fn(),
      constructWebhookEvent: jest.fn(),
      cancelPaymentIntent: jest.fn(),
      refundPaymentIntent: jest.fn(),
    };

    const loyaltyWalletService = {
      awardPointsForPaidOrder: jest.fn(),
      restoreOrderBenefits: jest.fn(),
    };

    const service = new PaymentsService(
      paymentsRepository as never,
      prisma as never,
      notificationsService as never,
      stripePaymentsService as never,
      loyaltyWalletService as never,
    );

    return {
      service,
      paymentsRepository,
      prisma,
      notificationsService,
      stripePaymentsService,
      loyaltyWalletService,
    };
  };

  it('creates a Stripe payment intent for stripe attempts', async () => {
    const {
      service,
      prisma,
      paymentsRepository,
      stripePaymentsService,
      notificationsService,
    } = makeService();

    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      totalAmount: new Prisma.Decimal(1250),
      paymentMethod: PaymentMethod.STRIPE,
      paymentStatus: PaymentStatus.PENDING,
    });
    paymentsRepository.findLatestPendingChargeByOrderId.mockResolvedValue({
      id: 'payment-1',
      orderId: 'order-1',
    });
    stripePaymentsService.createPaymentIntent.mockResolvedValue({
      id: 'pi_123',
      client_secret: 'pi_123_secret_abc',
    });
    paymentsRepository.updateStatus.mockResolvedValue({
      id: 'payment-1',
      orderId: 'order-1',
      providerRef: 'pi_123',
      providerData: {},
    });

    const result = await service.createAttempt(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      } as never,
      'order-1',
      { paymentMethod: PaymentMethod.STRIPE },
    );

    expect(stripePaymentsService.createPaymentIntent).toHaveBeenCalled();
    expect(result.paymentSession).toEqual({
      provider: 'stripe',
      clientSecret: 'pi_123_secret_abc',
      publishableKey: 'pk_test_123',
      paymentIntentId: 'pi_123',
    });
    expect(notificationsService.notifyPaymentAttemptCreated).toHaveBeenCalledWith(
      'payment-1',
    );
    expect(paymentsRepository.create).not.toHaveBeenCalled();
  });

  it('marks payment paid from stripe webhook success', async () => {
    const {
      service,
      stripePaymentsService,
      paymentsRepository,
      loyaltyWalletService,
      notificationsService,
    } = makeService();

    stripePaymentsService.constructWebhookEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
          metadata: { paymentTransactionId: 'payment-1' },
        },
      },
    });
    paymentsRepository.findByProviderRef.mockResolvedValue({
      id: 'payment-1',
      orderId: 'order-1',
      status: PaymentStatus.PENDING,
    });

    const result = await service.handleStripeWebhook(
      Buffer.from('{}'),
      'sig_123',
    );

    expect(paymentsRepository.updateStatus).toHaveBeenCalledWith(
      'payment-1',
      expect.objectContaining({
        status: PaymentStatus.PAID,
        providerRef: 'pi_123',
      }),
      expect.anything(),
    );
    expect(loyaltyWalletService.awardPointsForPaidOrder).toHaveBeenCalledWith(
      'order-1',
      'payment-1',
      'stripe:webhook',
    );
    expect(notificationsService.notifyPaymentStatusChanged).toHaveBeenCalledWith(
      'payment-1',
    );
    expect(result.received).toBe(true);
  });
});
