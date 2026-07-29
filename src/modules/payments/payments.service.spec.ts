import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  RestaurantPayoutRequestStatus,
  RestaurantWalletTransactionType,
} from '@prisma/client';
import { UserRoleEnum } from '../../common/enums';
import { PaypalPayoutEnvironment, RestaurantPayoutProvider } from './dto';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  type RestaurantStripeSettingsUpdateArgs = {
    where: { id: string };
    data: {
      settings: {
        payments: {
          stripe: {
            accountId?: string | null;
            payoutsEnabled?: boolean;
            chargesEnabled?: boolean;
            onboardingComplete?: boolean;
            note?: string | null;
            updatedBy?: string | null;
            lastTransfer?: {
              id?: string;
              amount?: number;
              currency?: string;
              destinationAccountId?: string;
              createdBy?: string;
            };
          };
          methods?: {
            allowedPaymentMethods?: string[];
            walletEnabled?: boolean;
            note?: string | null;
            updatedBy?: string | null;
          };
        };
      };
    };
  };

  const makeService = () => {
    const paymentsRepository = {
      create: jest.fn(),
      createUnchecked: jest.fn(),
      updateStatus: jest.fn(),
      updateChargePaymentMethod: jest.fn(),
      updateOrderPaymentStatus: jest.fn(),
      updateOrderState: jest.fn(),
      findByProviderRef: jest.fn(),
      findLatestPendingChargeByOrderId: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
      listRestaurantTransactions: jest.fn(),
      summarizeRestaurantTransactions: jest.fn(),
      summarizeRestaurantWallets: jest.fn(),
      sumSuccessfulRefunds: jest.fn(),
    };

    const transactionTx = {
      order: {
        update: jest.fn(),
      },
      tenantSubscription: {
        update: jest.fn(),
      },
    };

    const prisma = {
      order: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      tenantSubscription: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      branch: {
        findFirst: jest.fn(),
      },
      restaurant: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      restaurantWalletAccount: {
        upsert: jest.fn(),
        update: jest.fn(),
      },
      restaurantWalletTransaction: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      restaurantPayoutRequest: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((input: unknown) => {
        if (Array.isArray(input)) {
          return Promise.all(input);
        }

        return Promise.resolve(
          (input as (tx: unknown) => unknown)(transactionTx),
        );
      }),
    };

    const notificationsService = {
      notifyPaymentAttemptCreated: jest.fn(),
      notifyPaymentStatusChanged: jest.fn(),
      notifyOrderPlaced: jest.fn(),
    };

    const stripePaymentsService = {
      getDefaultCurrency: jest.fn().mockReturnValue('PKR'),
      getPublishableKey: jest.fn().mockReturnValue('pk_test_123'),
      isConfigured: jest.fn().mockReturnValue(true),
      createPaymentIntent: jest.fn(),
      createTransfer: jest.fn(),
      constructWebhookEvent: jest.fn(),
      cancelPaymentIntent: jest.fn(),
      refundPaymentIntent: jest.fn(),
    };
    const paypalPayoutsService = {
      createPayout: jest.fn(),
      verifyCredentials: jest.fn(),
    };
    const payoutCredentialsService = {
      encrypt: jest.fn().mockReturnValue('encrypted-credentials'),
      decrypt: jest.fn(),
    };

    const loyaltyWalletService = {
      awardPointsForPaidOrder: jest.fn(),
      restoreOrderBenefits: jest.fn(),
      applyWalletTopUp: jest.fn(),
      applyOrderBenefits: jest.fn(),
    };
    const globalSettingsService = {
      getDefaultCurrencyCode: jest.fn().mockResolvedValue('PKR'),
      getPaymentMethods: jest.fn().mockResolvedValue({
        data: [
          { code: PaymentMethod.COD, label: 'Cash', isActive: true },
          { code: PaymentMethod.STRIPE, label: 'Stripe', isActive: true },
          { code: PaymentMethod.WALLET, label: 'Wallet', isActive: true },
          { code: PaymentMethod.BANK_TRANSFER, label: 'Bank', isActive: false },
        ],
      }),
    };

    const service = new PaymentsService(
      paymentsRepository as never,
      prisma as never,
      notificationsService as never,
      stripePaymentsService as never,
      paypalPayoutsService as never,
      payoutCredentialsService as never,
      loyaltyWalletService as never,
      globalSettingsService as never,
    );

    return {
      service,
      paymentsRepository,
      prisma,
      notificationsService,
      stripePaymentsService,
      paypalPayoutsService,
      payoutCredentialsService,
      loyaltyWalletService,
      globalSettingsService,
      transactionTx,
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
      status: OrderStatus.PAYMENT_PENDING,
      branch: { settings: { allowedPaymentMethods: [PaymentMethod.STRIPE] } },
      restaurant: { settings: {} },
    });
    prisma.restaurant.findUnique.mockResolvedValue({
      settings: { currency: 'USD' },
    });
    paymentsRepository.findLatestPendingChargeByOrderId.mockResolvedValue({
      id: 'payment-1',
      orderId: 'order-1',
    });
    paymentsRepository.updateChargePaymentMethod.mockResolvedValue({
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
    expect(paymentsRepository.updateStatus).toHaveBeenCalledWith(
      'payment-1',
      expect.objectContaining({
        providerRef: 'pi_123',
      }),
    );
    expect(stripePaymentsService.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'PKR' }),
    );
    expect(result.paymentSession).toEqual({
      provider: 'stripe',
      clientSecret: 'pi_123_secret_abc',
      publishableKey: 'pk_test_123',
      paymentIntentId: 'pi_123',
    });
    expect(
      notificationsService.notifyPaymentAttemptCreated,
    ).toHaveBeenCalledWith('payment-1');
    expect(paymentsRepository.create).not.toHaveBeenCalled();
  });

  it('switches a payment-pending Stripe order to COD', async () => {
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
      status: OrderStatus.PAYMENT_PENDING,
      branch: { settings: { allowedPaymentMethods: [PaymentMethod.COD] } },
      restaurant: { settings: {} },
    });
    prisma.restaurant.findUnique.mockResolvedValue({ settings: {} });
    paymentsRepository.findLatestPendingChargeByOrderId.mockResolvedValue({
      id: 'payment-1',
      orderId: 'order-1',
      paymentMethod: PaymentMethod.STRIPE,
      providerRef: 'pi_123',
    });
    paymentsRepository.updateChargePaymentMethod.mockResolvedValue({
      id: 'payment-1',
      orderId: 'order-1',
      paymentMethod: PaymentMethod.COD,
      status: PaymentStatus.PENDING,
    });

    const result = await service.createAttempt(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      } as never,
      'order-1',
      { paymentMethod: PaymentMethod.COD },
    );

    expect(stripePaymentsService.cancelPaymentIntent).toHaveBeenCalledWith(
      'pi_123',
    );
    expect(paymentsRepository.updateChargePaymentMethod).toHaveBeenCalledWith(
      'payment-1',
      expect.objectContaining({
        paymentMethod: PaymentMethod.COD,
        status: PaymentStatus.PENDING,
        providerRef: null,
        providerData: null,
      }),
      expect.anything(),
    );
    expect(paymentsRepository.updateOrderState).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({
        paymentMethod: PaymentMethod.COD,
        status: OrderStatus.PLACED,
        paymentStatus: PaymentStatus.PENDING,
      }),
      expect.anything(),
    );
    expect(notificationsService.notifyOrderPlaced).toHaveBeenCalledWith(
      'order-1',
    );
    expect(result.message).toBe('Order payment method updated successfully');
  });

  it('switches a payment-pending Stripe order to wallet when wallet covers total', async () => {
    const {
      service,
      prisma,
      paymentsRepository,
      loyaltyWalletService,
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
      status: OrderStatus.PAYMENT_PENDING,
      branch: { settings: { allowedPaymentMethods: [PaymentMethod.WALLET] } },
      restaurant: { settings: {} },
    });
    prisma.restaurant.findUnique.mockResolvedValue({ settings: {} });
    paymentsRepository.findLatestPendingChargeByOrderId.mockResolvedValue(null);
    paymentsRepository.create.mockResolvedValue({
      id: 'payment-1',
      orderId: 'order-1',
      paymentMethod: PaymentMethod.WALLET,
      status: PaymentStatus.PAID,
    });

    await service.createAttempt(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      } as never,
      'order-1',
      { paymentMethod: PaymentMethod.WALLET },
    );

    expect(loyaltyWalletService.applyOrderBenefits).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ customerId: 'customer-1' }),
      expect.objectContaining({
        id: 'order-1',
        walletAppliedAmount: new Prisma.Decimal(1250),
      }),
      'customer-1',
    );
    expect(paymentsRepository.updateOrderState).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({
        paymentMethod: PaymentMethod.WALLET,
        status: OrderStatus.PLACED,
        paymentStatus: PaymentStatus.PAID,
        walletAppliedAmount: { increment: new Prisma.Decimal(1250) },
        totalAmount: new Prisma.Decimal(0),
      }),
      expect.anything(),
    );
    expect(loyaltyWalletService.awardPointsForPaidOrder).toHaveBeenCalledWith(
      'order-1',
      'payment-1',
      'customer-1',
    );
    expect(
      notificationsService.notifyPaymentStatusChanged,
    ).toHaveBeenCalledWith('payment-1');
    expect(notificationsService.notifyOrderPlaced).toHaveBeenCalledWith(
      'order-1',
    );
  });

  it('creates a Stripe payment intent for subscription payment attempts', async () => {
    const {
      service,
      prisma,
      paymentsRepository,
      stripePaymentsService,
      notificationsService,
    } = makeService();

    prisma.tenantSubscription.findUnique.mockResolvedValue({
      id: 'subscription-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      packagePlanId: 'plan-1',
      paymentStatus: PaymentStatus.PENDING,
      planSnapshot: {
        name: 'Growth',
        planPrice: 100,
        vatPercentage: 15,
        currency: 'USD',
      },
      packagePlan: {
        id: 'plan-1',
        name: 'Growth',
        billingInterval: 'MONTHLY',
        planPrice: new Prisma.Decimal(100),
        vatPercentage: new Prisma.Decimal(15),
        currency: 'USD',
      },
    });
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
    });
    prisma.branch.findFirst.mockResolvedValue({ id: 'branch-1' });
    paymentsRepository.createUnchecked.mockResolvedValue({
      id: 'payment-subscription-1',
    });
    stripePaymentsService.createPaymentIntent.mockResolvedValue({
      id: 'pi_subscription_123',
      client_secret: 'pi_subscription_123_secret',
    });
    paymentsRepository.updateStatus.mockResolvedValue({
      id: 'payment-subscription-1',
      providerRef: 'pi_subscription_123',
    });

    const result = await service.createSubscriptionAttempt(
      {
        uid: 'owner-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      } as never,
      'subscription-1',
      { note: 'Initial plan payment' },
    );

    expect(paymentsRepository.createUnchecked).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        amount: new Prisma.Decimal(115),
        currency: 'USD',
        paymentMethod: PaymentMethod.STRIPE,
      }),
    );
    expect(stripePaymentsService.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 115,
        currency: 'USD',
      }),
    );
    const createPaymentIntentMock =
      stripePaymentsService.createPaymentIntent as jest.Mock<
        unknown,
        [{ metadata: Record<string, unknown> }]
      >;
    const paymentIntentInput = createPaymentIntentMock.mock.calls[0]?.[0];
    expect(paymentIntentInput.metadata).toMatchObject({
      paymentTransactionId: 'payment-subscription-1',
      subscriptionId: 'subscription-1',
      target: 'TENANT_SUBSCRIPTION',
    });
    expect(result.paymentSession).toEqual({
      provider: 'stripe',
      clientSecret: 'pi_subscription_123_secret',
      publishableKey: 'pk_test_123',
      paymentIntentId: 'pi_subscription_123',
    });
    expect(
      notificationsService.notifyPaymentAttemptCreated,
    ).toHaveBeenCalledWith('payment-subscription-1');
  });

  it('updates restaurant Stripe account settings', async () => {
    const { service, prisma, stripePaymentsService } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      settings: {
        payments: {
          stripe: {
            accountId: 'acct_old',
            payoutsEnabled: false,
          },
        },
      },
    });
    prisma.restaurant.update.mockResolvedValue({
      id: 'restaurant-1',
      settings: {
        payments: {
          stripe: {
            accountId: 'acct_new',
            payoutsEnabled: true,
            chargesEnabled: true,
            onboardingComplete: true,
            dashboardUrl: null,
            note: 'Connected',
            updatedAt: '2026-06-22T00:00:00.000Z',
            updatedBy: 'admin-1',
          },
        },
      },
    });

    const result = await service.updateRestaurantStripeAccount(
      {
        uid: 'super-1',
        role: UserRoleEnum.SUPER_ADMIN,
      } as never,
      'restaurant-1',
      {
        accountId: ' acct_new ',
        payoutsEnabled: true,
        chargesEnabled: true,
        onboardingComplete: true,
        note: 'Connected',
      },
    );

    expect(prisma.restaurant.findFirst).toHaveBeenCalledWith({
      where: { id: 'restaurant-1', deletedAt: null },
      select: { id: true, tenantId: true, settings: true },
    });
    const restaurantUpdate = prisma.restaurant.update as jest.Mock<
      unknown,
      [RestaurantStripeSettingsUpdateArgs]
    >;
    const updateArgs = restaurantUpdate.mock.calls[0]?.[0];
    expect(updateArgs?.where).toEqual({ id: 'restaurant-1' });
    expect(updateArgs?.data.settings.payments.stripe).toEqual(
      expect.objectContaining({
        accountId: 'acct_new',
        payoutsEnabled: true,
        chargesEnabled: true,
        onboardingComplete: true,
        note: 'Connected',
        updatedBy: 'super-1',
      }),
    );
    expect(stripePaymentsService.createTransfer).not.toHaveBeenCalled();
    expect(result.data.stripe.accountId).toBe('acct_new');
  });

  it('rejects restaurant admin Stripe account updates', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.updateRestaurantStripeAccount(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        } as never,
        'restaurant-1',
        { accountId: 'acct_new' },
      ),
    ).rejects.toThrow(
      'Only super admins can manage restaurant payment configuration',
    );
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
    expect(prisma.restaurant.update).not.toHaveBeenCalled();
  });

  it('routes the legacy Stripe transfer endpoint through wallet settlement', async () => {
    const { service } = makeService();
    const createProviderPayout = jest
      .spyOn(service, 'createRestaurantProviderPayout')
      .mockResolvedValue({
        data: { id: 'request-1' },
        message: 'Restaurant provider payout completed successfully',
      } as never);
    const user = {
      uid: 'super-1',
      role: UserRoleEnum.SUPER_ADMIN,
    } as never;

    await service.createRestaurantStripeTransfer(user, 'restaurant-1', {
      amount: 125.5,
      currency: 'EUR',
      description: 'Weekly payout',
      idempotencyKey: 'legacy-payout-1',
    });

    expect(createProviderPayout).toHaveBeenCalledWith(user, 'restaurant-1', {
      provider: RestaurantPayoutProvider.STRIPE,
      amount: 125.5,
      currency: 'EUR',
      description: 'Weekly payout',
      idempotencyKey: 'legacy-payout-1',
    });
  });

  it('fetches restaurant payment management summary', async () => {
    const { service, prisma, paymentsRepository, stripePaymentsService } =
      makeService();
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      settings: {
        payments: {
          stripe: {
            accountId: 'acct_123',
            payoutsEnabled: true,
          },
          methods: {
            allowedPaymentMethods: ['COD', 'STRIPE', 'WALLET'],
            walletEnabled: true,
          },
        },
      },
    });
    prisma.restaurant.findUnique.mockResolvedValue({ settings: null });
    paymentsRepository.summarizeRestaurantTransactions.mockResolvedValue({
      paidCharges: {
        _sum: { amount: new Prisma.Decimal(1000) },
        _count: { _all: 4 },
      },
      pendingCharges: {
        _sum: { amount: new Prisma.Decimal(200) },
        _count: { _all: 1 },
      },
      failedCharges: {
        _sum: { amount: new Prisma.Decimal(50) },
        _count: { _all: 1 },
      },
      refundedAmount: {
        _sum: { amount: new Prisma.Decimal(100) },
        _count: { _all: 1 },
      },
      transactionCount: 7,
    });
    paymentsRepository.summarizeRestaurantWallets.mockResolvedValue({
      accountCount: 3,
      totalBalance: new Prisma.Decimal(250),
    });
    prisma.restaurantWalletAccount.upsert.mockResolvedValue({
      id: 'restaurant-wallet-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      balance: new Prisma.Decimal(900),
      currency: 'PKR',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    paymentsRepository.listRestaurantTransactions.mockResolvedValue({
      items: [{ id: 'payment-1' }],
      total: 1,
    });

    const result = await service.getRestaurantPaymentManagement(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      } as never,
      'restaurant-1',
      { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'DESC' },
    );

    expect(
      paymentsRepository.summarizeRestaurantTransactions,
    ).toHaveBeenCalledWith('restaurant-1', undefined);
    expect(result.data.payments.summary).toEqual(
      expect.objectContaining({
        paidChargeAmount: 1000,
        refundedAmount: 100,
        estimatedAvailableBalance: 900,
      }),
    );
    expect(result.data.payments.wallet).toEqual({
      type: 'RESTAURANT_WALLET',
      balance: 900,
      currency: 'PKR',
      customerWalletExposure: {
        accountCount: 3,
        totalBalance: 250,
      },
    });
    expect(result.data.payments.methods.activePlatformMethods).toEqual([
      PaymentMethod.COD,
      PaymentMethod.STRIPE,
      PaymentMethod.WALLET,
    ]);
    expect(result.data.payments.stripe).toEqual(
      expect.objectContaining({
        accountId: 'acct_123',
        publishableKey: 'pk_test_123',
        configured: true,
      }),
    );
    expect(stripePaymentsService.createTransfer).not.toHaveBeenCalled();
  });

  it('updates restaurant payment method settings without clearing stripe settings', async () => {
    const { service, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      settings: {
        payments: {
          stripe: {
            accountId: 'acct_123',
            payoutsEnabled: true,
          },
          methods: {
            allowedPaymentMethods: ['COD'],
            walletEnabled: false,
            note: 'Old note',
          },
        },
      },
    });
    prisma.restaurant.update.mockImplementation(
      (args: RestaurantStripeSettingsUpdateArgs) =>
        Promise.resolve({
          id: args.where.id,
          settings: args.data.settings,
        }),
    );

    const result = await service.updateRestaurantPaymentMethods(
      {
        uid: 'super-1',
        role: UserRoleEnum.SUPER_ADMIN,
      } as never,
      'restaurant-1',
      {
        allowedPaymentMethods: [
          PaymentMethod.COD,
          PaymentMethod.STRIPE,
          PaymentMethod.STRIPE,
        ],
        walletEnabled: false,
        note: 'Use cash and card',
      },
    );

    const restaurantUpdate = prisma.restaurant.update as jest.Mock<
      unknown,
      [RestaurantStripeSettingsUpdateArgs]
    >;
    const updateArgs = restaurantUpdate.mock.calls[0]?.[0];
    expect(updateArgs?.data.settings.payments.stripe).toEqual(
      expect.objectContaining({
        accountId: 'acct_123',
        payoutsEnabled: true,
      }),
    );
    expect(updateArgs?.data.settings.payments.methods).toEqual(
      expect.objectContaining({
        allowedPaymentMethods: [PaymentMethod.COD, PaymentMethod.STRIPE],
        walletEnabled: false,
        note: 'Use cash and card',
        updatedBy: 'super-1',
      }),
    );
    expect(result.data.methods.allowedPaymentMethods).toEqual([
      PaymentMethod.COD,
      PaymentMethod.STRIPE,
    ]);
  });

  it('allows a restaurant admin to update payment methods for its tenant restaurant', async () => {
    const { service, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      settings: {},
    });
    prisma.restaurant.update.mockImplementation(
      (args: RestaurantStripeSettingsUpdateArgs) =>
        Promise.resolve({
          id: args.where.id,
          settings: args.data.settings,
        }),
    );

    const result = await service.updateRestaurantPaymentMethods(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      } as never,
      'restaurant-1',
      {
        allowedPaymentMethods: [PaymentMethod.COD],
        walletEnabled: false,
      },
    );

    expect(prisma.restaurant.findFirst).toHaveBeenCalled();
    expect(result.data.methods.allowedPaymentMethods).toEqual([
      PaymentMethod.COD,
    ]);
    expect(prisma.restaurant.update).toHaveBeenCalled();
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
    expect(
      notificationsService.notifyPaymentStatusChanged,
    ).toHaveBeenCalledWith('payment-1');
    expect(result.received).toBe(true);
  });

  it('moves payment-pending Stripe order to placed after webhook success', async () => {
    const {
      service,
      prisma,
      stripePaymentsService,
      paymentsRepository,
      notificationsService,
    } = makeService();

    stripePaymentsService.constructWebhookEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_pending_order_123',
          metadata: { paymentTransactionId: 'payment-1' },
        },
      },
    });
    paymentsRepository.findByProviderRef.mockResolvedValue({
      id: 'payment-1',
      orderId: 'order-1',
      status: PaymentStatus.PENDING,
    });
    prisma.order.findFirst.mockResolvedValue({ id: 'order-1' });

    await service.handleStripeWebhook(Buffer.from('{}'), 'sig_123');

    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'order-1', status: OrderStatus.PAYMENT_PENDING },
      select: { id: true },
    });
    expect(paymentsRepository.updateOrderState).toHaveBeenCalledWith(
      'order-1',
      { status: OrderStatus.PLACED },
      expect.anything(),
    );
    expect(notificationsService.notifyOrderPlaced).toHaveBeenCalledWith(
      'order-1',
    );
  });

  it('marks subscription paid from stripe webhook success', async () => {
    const {
      service,
      stripePaymentsService,
      paymentsRepository,
      notificationsService,
      transactionTx,
    } = makeService();

    stripePaymentsService.constructWebhookEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_subscription_123',
        },
      },
    });
    paymentsRepository.findByProviderRef.mockResolvedValue({
      id: 'payment-subscription-1',
      orderId: null,
      status: PaymentStatus.PENDING,
      providerData: {
        target: 'TENANT_SUBSCRIPTION',
        subscriptionId: 'subscription-1',
      },
    });

    const result = await service.handleStripeWebhook(
      Buffer.from('{}'),
      'sig_123',
    );

    expect(paymentsRepository.updateStatus).toHaveBeenCalledWith(
      'payment-subscription-1',
      expect.objectContaining({
        status: PaymentStatus.PAID,
        providerRef: 'pi_subscription_123',
      }),
      expect.anything(),
    );
    expect(transactionTx.tenantSubscription.update).toHaveBeenCalledWith({
      where: { id: 'subscription-1' },
      data: {
        paymentStatus: PaymentStatus.PAID,
        status: 'ACTIVE',
        updatedBy: 'stripe:webhook',
      },
    });
    expect(
      notificationsService.notifyPaymentStatusChanged,
    ).toHaveBeenCalledWith('payment-subscription-1');
    expect(result.received).toBe(true);
  });

  it('marks subscription failed from stripe webhook failure', async () => {
    const {
      service,
      stripePaymentsService,
      paymentsRepository,
      transactionTx,
    } = makeService();

    stripePaymentsService.constructWebhookEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_subscription_123',
        },
      },
    });
    paymentsRepository.findByProviderRef.mockResolvedValue({
      id: 'payment-subscription-1',
      orderId: null,
      status: PaymentStatus.PENDING,
      providerData: {
        target: 'TENANT_SUBSCRIPTION',
        subscriptionId: 'subscription-1',
      },
    });

    const result = await service.handleStripeWebhook(
      Buffer.from('{}'),
      'sig_123',
    );

    expect(paymentsRepository.updateStatus).toHaveBeenCalledWith(
      'payment-subscription-1',
      expect.objectContaining({
        status: PaymentStatus.FAILED,
        note: 'Stripe payment failed',
      }),
      expect.anything(),
    );
    expect(transactionTx.tenantSubscription.update).toHaveBeenCalledWith({
      where: { id: 'subscription-1' },
      data: {
        paymentStatus: PaymentStatus.FAILED,
        updatedBy: 'stripe:webhook',
      },
    });
    expect(result.received).toBe(true);
  });

  it('credits wallet from stripe webhook success for top-up payments', async () => {
    const {
      service,
      stripePaymentsService,
      paymentsRepository,
      loyaltyWalletService,
    } = makeService();

    stripePaymentsService.constructWebhookEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_wallet_123',
        },
      },
    });
    paymentsRepository.findByProviderRef.mockResolvedValue({
      id: 'payment-wallet-1',
      orderId: null,
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      amount: new Prisma.Decimal(500),
      providerData: {
        customerId: 'customer-1',
        target: 'WALLET_TOP_UP',
      },
      status: PaymentStatus.PENDING,
    });

    const result = await service.handleStripeWebhook(
      Buffer.from('{}'),
      'sig_123',
    );

    expect(loyaltyWalletService.applyWalletTopUp).toHaveBeenCalledWith(
      {
        customerId: 'customer-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      500,
      'payment-wallet-1',
      'Wallet top-up via Stripe',
      'stripe:webhook',
    );
    expect(result.received).toBe(true);
  });

  it('creates wallet top-up even when customer is not tied to a branch', async () => {
    const { service, prisma, paymentsRepository, stripePaymentsService } =
      makeService();

    prisma.branch.findFirst.mockResolvedValue({
      id: 'branch-main-1',
    });
    prisma.restaurant.findUnique.mockResolvedValue({
      settings: { currency: 'USD' },
    });
    paymentsRepository.createUnchecked.mockResolvedValue({
      id: 'payment-wallet-1',
      providerData: {},
    });
    stripePaymentsService.createPaymentIntent.mockResolvedValue({
      id: 'pi_wallet_123',
      client_secret: 'pi_wallet_123_secret',
    });
    paymentsRepository.updateStatus.mockResolvedValue({
      id: 'payment-wallet-1',
      providerRef: 'pi_wallet_123',
      providerData: {},
    });

    const result = await service.createWalletTopUpAttempt(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      } as never,
      {
        customerId: 'customer-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
      },
      {
        amount: 500,
        currency: 'PKR',
        note: 'Wallet top-up',
      },
    );

    expect(prisma.branch.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        deletedAt: null,
      },
      select: {
        id: true,
      },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    });
    expect(paymentsRepository.createUnchecked).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 'branch-main-1',
        currency: 'PKR',
      }),
    );
    expect(result.paymentSession).toEqual({
      provider: 'stripe',
      clientSecret: 'pi_wallet_123_secret',
      publishableKey: 'pk_test_123',
      paymentIntentId: 'pi_wallet_123',
    });
  });

  it('allows admin to fetch wallet top-up payment details', async () => {
    const { service, paymentsRepository } = makeService();

    paymentsRepository.findById.mockResolvedValue({
      id: 'payment-wallet-1',
      orderId: null,
      restaurantId: 'restaurant-1',
      providerData: {
        customerId: 'customer-1',
        target: 'WALLET_TOP_UP',
      },
    });

    const result = await service.details(
      {
        uid: 'admin-1',
        role: UserRoleEnum.SUPER_ADMIN,
      } as never,
      'payment-wallet-1',
    );

    expect(result.message).toBe('Payment fetched successfully');
    expect(result.data.id).toBe('payment-wallet-1');
  });

  it('lets admin mark wallet top-up paid and credit wallet once', async () => {
    const {
      service,
      paymentsRepository,
      loyaltyWalletService,
      notificationsService,
    } = makeService();

    paymentsRepository.findById.mockResolvedValue({
      id: 'payment-wallet-1',
      orderId: null,
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      amount: new Prisma.Decimal(500),
      paymentMethod: PaymentMethod.STRIPE,
      providerRef: 'pi_wallet_123',
      providerData: {
        customerId: 'customer-1',
        target: 'WALLET_TOP_UP',
      },
      status: PaymentStatus.PENDING,
      type: 'CHARGE',
    });
    paymentsRepository.updateStatus.mockResolvedValue({
      id: 'payment-wallet-1',
      status: PaymentStatus.PAID,
    });

    const result = await service.updateStatus(
      {
        uid: 'admin-1',
        role: UserRoleEnum.SUPER_ADMIN,
      } as never,
      'payment-wallet-1',
      {
        status: PaymentStatus.PAID,
        note: 'Admin confirmed payment',
      },
    );

    expect(loyaltyWalletService.applyWalletTopUp).toHaveBeenCalledWith(
      {
        customerId: 'customer-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      500,
      'payment-wallet-1',
      'Admin confirmed payment',
      'admin-1',
    );
    expect(
      notificationsService.notifyPaymentStatusChanged,
    ).toHaveBeenCalledWith('payment-wallet-1');
    expect(result.message).toBe('Payment marked as paid successfully');
  });

  it('creates a restaurant payout request against wallet balance', async () => {
    const { service, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      settings: {},
    });
    prisma.restaurantWalletAccount.upsert.mockResolvedValue({
      id: 'wallet-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      balance: new Prisma.Decimal(1000),
      currency: 'PKR',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.restaurantPayoutRequest.create.mockResolvedValue({
      id: 'request-1',
      walletAccountId: 'wallet-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: null,
      requestedBy: 'admin-1',
      reviewedBy: null,
      paidBy: null,
      status: RestaurantPayoutRequestStatus.REQUESTED,
      amount: new Prisma.Decimal(500),
      currency: 'PKR',
      bankDetails: { bankName: 'HBL' },
      note: 'Need payout',
      rejectionReason: null,
      approvalNote: null,
      paymentReference: null,
      paidNote: null,
      approvedAt: null,
      rejectedAt: null,
      paidAt: null,
      walletTransactionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.createRestaurantPayoutRequest(
      {
        uid: 'admin-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
      } as never,
      'restaurant-1',
      {
        amount: 500,
        bankDetails: {
          bankName: ' HBL ',
          accountTitle: ' Pizza House ',
          accountNumber: ' 123456 ',
        },
        note: 'Need payout',
      },
    );

    const payoutCreateCalls = prisma.restaurantPayoutRequest.create.mock
      .calls as Array<
      [{ data: { amount: Prisma.Decimal; bankDetails: unknown } }]
    >;
    const payoutCreateArgs = payoutCreateCalls[0][0];
    expect(payoutCreateArgs.data.amount).toEqual(new Prisma.Decimal(500));
    expect(payoutCreateArgs.data.bankDetails).toEqual({
      bankName: 'HBL',
      accountTitle: 'Pizza House',
      accountNumber: '123456',
    });
    expect(result.message).toBe(
      'Restaurant payout request created successfully',
    );
  });

  it('rejects restaurant payout request above wallet balance', async () => {
    const { service, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      settings: {},
    });
    prisma.restaurantWalletAccount.upsert.mockResolvedValue({
      id: 'wallet-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      balance: new Prisma.Decimal(100),
      currency: 'PKR',
    });

    await expect(
      service.createRestaurantPayoutRequest(
        {
          uid: 'admin-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
          tid: 'tenant-1',
        } as never,
        'restaurant-1',
        {
          amount: 500,
          bankDetails: {
            bankName: 'HBL',
            accountTitle: 'Pizza House',
            accountNumber: '123456',
          },
        },
      ),
    ).rejects.toThrow('Requested amount exceeds wallet balance');
  });

  it('rejects manual bank requests when an automated provider is active', async () => {
    const { service, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      settings: {
        payments: {
          payoutProviders: {
            configurations: {
              PAYPAL: {
                provider: 'PAYPAL',
                enabled: true,
                publicDetails: {
                  recipientEmail: 'owner@example.com',
                  environment: 'LIVE',
                },
                encryptedCredentials: 'encrypted-credentials',
                approvedAt: '2026-07-25T00:00:00.000Z',
                approvedBy: 'super-1',
              },
            },
          },
        },
      },
    });

    await expect(
      service.createRestaurantPayoutRequest(
        {
          uid: 'admin-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
          tid: 'tenant-1',
        } as never,
        'restaurant-1',
        {
          amount: 500,
          bankDetails: {
            bankName: 'Bank',
            accountTitle: 'Pizza House',
            accountNumber: '123456',
          },
        },
      ),
    ).rejects.toThrow(
      'Manual bank payout requests are only available without an approved automated payout provider',
    );
    expect(prisma.restaurantPayoutRequest.create).not.toHaveBeenCalled();
  });

  it('deducts restaurant wallet only when approved payout is marked paid', async () => {
    const { service, prisma, transactionTx } = makeService();
    Object.assign(transactionTx, {
      restaurantPayoutRequest: prisma.restaurantPayoutRequest,
      restaurantWalletAccount: prisma.restaurantWalletAccount,
      restaurantWalletTransaction: prisma.restaurantWalletTransaction,
    });
    prisma.restaurantPayoutRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      walletAccountId: 'wallet-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: null,
      status: RestaurantPayoutRequestStatus.APPROVED,
      amount: new Prisma.Decimal(500),
      currency: 'PKR',
      walletAccount: {
        id: 'wallet-1',
        balance: new Prisma.Decimal(1000),
      },
    });
    prisma.restaurantWalletTransaction.create.mockResolvedValue({
      id: 'wallet-tx-1',
    });
    prisma.restaurantPayoutRequest.update.mockResolvedValue({
      id: 'request-1',
      walletAccountId: 'wallet-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: null,
      requestedBy: 'admin-2',
      reviewedBy: 'super-1',
      paidBy: 'super-1',
      status: RestaurantPayoutRequestStatus.PAID,
      amount: new Prisma.Decimal(500),
      currency: 'PKR',
      bankDetails: { bankName: 'HBL' },
      note: null,
      rejectionReason: null,
      approvalNote: null,
      paymentReference: 'BANK-123',
      paidNote: 'sent',
      approvedAt: new Date(),
      rejectedAt: null,
      paidAt: new Date(),
      walletTransactionId: 'wallet-tx-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.markRestaurantPayoutPaid(
      { uid: 'super-1', role: UserRoleEnum.SUPER_ADMIN } as never,
      'request-1',
      { paymentReference: 'BANK-123', note: 'sent' },
    );

    expect(prisma.restaurantWalletAccount.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { balance: new Prisma.Decimal(500) },
    });
    const walletTransactionCreateCalls = prisma.restaurantWalletTransaction
      .create.mock.calls as Array<
      [
        {
          data: {
            type: RestaurantWalletTransactionType;
            amount: Prisma.Decimal;
            balanceAfter: Prisma.Decimal;
          };
        },
      ]
    >;
    const walletTransactionCreateArgs = walletTransactionCreateCalls[0][0];
    expect(walletTransactionCreateArgs.data).toMatchObject({
      type: RestaurantWalletTransactionType.PAYOUT_DEBIT,
      amount: new Prisma.Decimal(-500),
      balanceAfter: new Prisma.Decimal(500),
    });
  });

  it('lets only super admin configure encrypted PayPal credentials and returns redacted details', async () => {
    const { service, prisma, payoutCredentialsService, paypalPayoutsService } =
      makeService();
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      settings: {},
    });
    prisma.restaurant.update.mockResolvedValue({ id: 'restaurant-1' });
    payoutCredentialsService.decrypt.mockReturnValue({
      clientId: 'paypal-client-1234',
      clientSecret: 'paypal-secret',
      recipientEmail: 'owner@example.com',
      environment: PaypalPayoutEnvironment.LIVE,
    });

    const result = await service.configureRestaurantPayoutProvider(
      {
        uid: 'super-1',
        role: UserRoleEnum.SUPER_ADMIN,
      } as never,
      'restaurant-1',
      {
        provider: RestaurantPayoutProvider.PAYPAL,
        paypalClientId: 'paypal-client-1234',
        paypalClientSecret: 'paypal-secret',
        paypalRecipientEmail: 'owner@example.com',
        paypalEnvironment: PaypalPayoutEnvironment.LIVE,
      },
    );

    expect(payoutCredentialsService.encrypt).toHaveBeenCalledWith(
      'restaurant-1',
      RestaurantPayoutProvider.PAYPAL,
      {
        clientId: 'paypal-client-1234',
        clientSecret: 'paypal-secret',
        recipientEmail: 'owner@example.com',
        environment: PaypalPayoutEnvironment.LIVE,
      },
    );
    expect(paypalPayoutsService.verifyCredentials).toHaveBeenCalledWith({
      clientId: 'paypal-client-1234',
      clientSecret: 'paypal-secret',
      recipientEmail: 'owner@example.com',
      environment: PaypalPayoutEnvironment.LIVE,
    });
    expect(result.data).toEqual(
      expect.objectContaining({
        configurations: [
          expect.objectContaining({
            provider: RestaurantPayoutProvider.PAYPAL,
            enabled: true,
            credentialsConfigured: true,
          }),
        ],
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain('paypal-secret');
    expect(JSON.stringify(result.data)).not.toContain('encrypted-credentials');
  });

  it('rejects restaurant owner payout credential configuration', async () => {
    const { service } = makeService();

    await expect(
      service.configureRestaurantPayoutProvider(
        {
          uid: 'owner-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
          tid: 'tenant-1',
        } as never,
        'restaurant-1',
        {
          provider: RestaurantPayoutProvider.STRIPE,
          stripeAccountId: 'acct_restaurant',
        },
      ),
    ).rejects.toThrow(
      'Only super admins can manage restaurant payment configuration',
    );
  });

  it('lets super admin disable an approved restaurant payout provider', async () => {
    const { service, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      settings: {
        payments: {
          payoutProviders: {
            configurations: {
              PAYPAL: {
                provider: 'PAYPAL',
                enabled: true,
                publicDetails: {
                  recipientEmail: 'owner@example.com',
                  environment: 'LIVE',
                },
                encryptedCredentials: 'encrypted-credentials',
                approvedAt: '2026-07-25T00:00:00.000Z',
                approvedBy: 'super-1',
              },
            },
          },
        },
      },
    });
    prisma.restaurant.update.mockResolvedValue({ id: 'restaurant-1' });

    const result = await service.updateRestaurantPayoutProviderConfiguration(
      { uid: 'super-1', role: UserRoleEnum.SUPER_ADMIN } as never,
      'restaurant-1',
      RestaurantPayoutProvider.PAYPAL,
      { enabled: false },
    );
    expect(prisma.restaurant.update).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({
      provider: RestaurantPayoutProvider.PAYPAL,
      enabled: false,
    });
  });

  it('debits the wallet once after an approved Stripe provider payout succeeds', async () => {
    const { service, prisma, stripePaymentsService, transactionTx } =
      makeService();
    const approvedRequest = {
      id: 'request-auto-1',
      walletAccountId: 'wallet-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: null,
      requestedBy: 'super-1',
      reviewedBy: 'super-1',
      paidBy: null,
      status: RestaurantPayoutRequestStatus.APPROVED,
      amount: new Prisma.Decimal(250),
      currency: 'EUR',
      bankDetails: {
        provider: 'STRIPE',
        idempotencyKey: 'AUTO:STRIPE:payout-1',
      },
      note: null,
      rejectionReason: null,
      approvalNote: null,
      paymentReference: null,
      paidNote: null,
      approvedAt: new Date(),
      rejectedAt: null,
      paidAt: null,
      walletTransactionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      settings: {
        payments: {
          payoutProviders: {
            configurations: {
              STRIPE: {
                provider: 'STRIPE',
                enabled: true,
                publicDetails: { accountId: 'acct_123' },
                encryptedCredentials: null,
                approvedAt: '2026-07-25T00:00:00.000Z',
                approvedBy: 'super-1',
              },
            },
          },
        },
      },
    });
    prisma.restaurantWalletAccount.upsert.mockResolvedValue({
      id: 'wallet-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      balance: new Prisma.Decimal(1000),
      currency: 'EUR',
    });
    prisma.restaurantPayoutRequest.findFirst.mockResolvedValue(null);
    prisma.restaurantPayoutRequest.create.mockResolvedValue(approvedRequest);
    prisma.restaurantPayoutRequest.findUnique.mockResolvedValue({
      ...approvedRequest,
      walletAccount: {
        id: 'wallet-1',
        balance: new Prisma.Decimal(1000),
      },
    });
    prisma.restaurantWalletTransaction.findUnique.mockResolvedValue(null);
    prisma.restaurantWalletTransaction.create.mockResolvedValue({
      id: 'wallet-tx-auto-1',
    });
    prisma.restaurantPayoutRequest.update.mockResolvedValue({
      ...approvedRequest,
      status: RestaurantPayoutRequestStatus.PAID,
      paidBy: 'super-1',
      paidAt: new Date(),
      paymentReference: 'tr_123',
      walletTransactionId: 'wallet-tx-auto-1',
    });
    Object.assign(transactionTx, {
      restaurantPayoutRequest: prisma.restaurantPayoutRequest,
      restaurantWalletAccount: prisma.restaurantWalletAccount,
      restaurantWalletTransaction: prisma.restaurantWalletTransaction,
    });
    stripePaymentsService.createTransfer.mockResolvedValue({ id: 'tr_123' });

    const result = await service.createRestaurantProviderPayout(
      { uid: 'super-1', role: UserRoleEnum.SUPER_ADMIN } as never,
      'restaurant-1',
      {
        provider: RestaurantPayoutProvider.STRIPE,
        amount: 250,
        currency: 'EUR',
        idempotencyKey: 'payout-1',
      },
    );

    expect(stripePaymentsService.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 250,
        currency: 'EUR',
        destinationAccountId: 'acct_123',
        idempotencyKey: 'payout-1',
      }),
    );
    expect(prisma.restaurantWalletAccount.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { balance: new Prisma.Decimal(750) },
    });
    expect(result.data.status).toBe(RestaurantPayoutRequestStatus.PAID);
  });

  it('returns an already-paid provider payout without transferring again', async () => {
    const { service, prisma, stripePaymentsService } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      settings: {
        payments: {
          payoutProviders: {
            configurations: {
              STRIPE: {
                provider: 'STRIPE',
                enabled: true,
                publicDetails: { accountId: 'acct_123' },
                encryptedCredentials: null,
                approvedAt: '2026-07-25T00:00:00.000Z',
                approvedBy: 'super-1',
              },
            },
          },
        },
      },
    });
    prisma.restaurantWalletAccount.upsert.mockResolvedValue({
      id: 'wallet-1',
      balance: new Prisma.Decimal(750),
      currency: 'EUR',
    });
    prisma.restaurantPayoutRequest.findFirst.mockResolvedValue({
      id: 'request-auto-1',
      status: RestaurantPayoutRequestStatus.PAID,
      amount: new Prisma.Decimal(250),
      currency: 'EUR',
      bankDetails: {
        provider: 'STRIPE',
        idempotencyKey: 'AUTO:STRIPE:payout-1',
      },
    });

    const result = await service.createRestaurantProviderPayout(
      { uid: 'super-1', role: UserRoleEnum.SUPER_ADMIN } as never,
      'restaurant-1',
      {
        provider: RestaurantPayoutProvider.STRIPE,
        amount: 250,
        currency: 'EUR',
        idempotencyKey: 'payout-1',
      },
    );

    expect(stripePaymentsService.createTransfer).not.toHaveBeenCalled();
    expect(prisma.restaurantWalletAccount.update).not.toHaveBeenCalled();
    expect(result.message).toBe('Restaurant payout was already completed');
  });
});
