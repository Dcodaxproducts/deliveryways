import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { UserRoleEnum } from '../../common/enums';
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

    const prisma = {
      order: {
        findUnique: jest.fn(),
      },
      branch: {
        findFirst: jest.fn(),
      },
      restaurant: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(callback({})),
      ),
    };

    const notificationsService = {
      notifyPaymentAttemptCreated: jest.fn(),
      notifyPaymentStatusChanged: jest.fn(),
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

    const loyaltyWalletService = {
      awardPointsForPaidOrder: jest.fn(),
      restoreOrderBenefits: jest.fn(),
      applyWalletTopUp: jest.fn(),
    };
    const globalSettingsService = {
      getDefaultCurrencyCode: jest.fn().mockResolvedValue('PKR'),
      getPaymentMethods: jest.fn().mockResolvedValue({
        data: [
          { code: PaymentMethod.COD, label: 'Cash', isActive: true },
          { code: PaymentMethod.STRIPE, label: 'Stripe', isActive: true },
          { code: PaymentMethod.BANK_TRANSFER, label: 'Bank', isActive: false },
        ],
      }),
    };

    const service = new PaymentsService(
      paymentsRepository as never,
      prisma as never,
      notificationsService as never,
      stripePaymentsService as never,
      loyaltyWalletService as never,
      globalSettingsService as never,
    );

    return {
      service,
      paymentsRepository,
      prisma,
      notificationsService,
      stripePaymentsService,
      loyaltyWalletService,
      globalSettingsService,
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
    prisma.restaurant.findUnique.mockResolvedValue({
      settings: { currency: 'USD' },
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
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
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
      where: { id: 'restaurant-1', tenantId: 'tenant-1', deletedAt: null },
      select: { id: true },
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
        updatedBy: 'admin-1',
      }),
    );
    expect(stripePaymentsService.createTransfer).not.toHaveBeenCalled();
    expect(result.data.stripe.accountId).toBe('acct_new');
  });

  it('creates a super-admin Stripe transfer to restaurant account', async () => {
    const { service, prisma, stripePaymentsService } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      settings: {
        currency: 'USD',
        payments: {
          stripe: {
            accountId: 'acct_123',
            payoutsEnabled: true,
            chargesEnabled: true,
            onboardingComplete: true,
          },
        },
      },
    });
    prisma.restaurant.findUnique.mockResolvedValue({
      settings: { currency: 'USD' },
    });
    stripePaymentsService.createTransfer.mockResolvedValue({
      id: 'tr_123',
    });
    prisma.restaurant.update.mockResolvedValue({ id: 'restaurant-1' });

    const result = await service.createRestaurantStripeTransfer(
      {
        uid: 'super-1',
        role: UserRoleEnum.SUPER_ADMIN,
      } as never,
      'restaurant-1',
      {
        amount: 125.5,
        description: 'Weekly payout',
      },
    );

    expect(stripePaymentsService.createTransfer).toHaveBeenCalledWith({
      amount: 125.5,
      currency: 'PKR',
      destinationAccountId: 'acct_123',
      description: 'Weekly payout',
      idempotencyKey: undefined,
      metadata: {
        restaurantId: 'restaurant-1',
        tenantId: 'tenant-1',
        actorId: 'super-1',
      },
    });
    const restaurantUpdate = prisma.restaurant.update as jest.Mock<
      unknown,
      [RestaurantStripeSettingsUpdateArgs]
    >;
    const updateArgs = restaurantUpdate.mock.calls[0]?.[0];
    expect(updateArgs?.where).toEqual({ id: 'restaurant-1' });
    expect(updateArgs?.data.settings.payments.stripe.lastTransfer).toEqual(
      expect.objectContaining({
        id: 'tr_123',
        amount: 125.5,
        currency: 'PKR',
        destinationAccountId: 'acct_123',
        createdBy: 'super-1',
      }),
    );
    expect(result.data.transfer).toEqual(
      expect.objectContaining({
        id: 'tr_123',
        amount: 125.5,
        currency: 'PKR',
      }),
    );
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
      type: 'CUSTOMER_WALLET_EXPOSURE',
      accountCount: 3,
      totalBalance: 250,
    });
    expect(result.data.payments.methods.activePlatformMethods).toEqual([
      PaymentMethod.COD,
      PaymentMethod.STRIPE,
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
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
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
        updatedBy: 'admin-1',
      }),
    );
    expect(result.data.methods.allowedPaymentMethods).toEqual([
      PaymentMethod.COD,
      PaymentMethod.STRIPE,
    ]);
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
});
