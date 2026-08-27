import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  BillingInterval,
  GeneratedInvoiceKind,
  PackageBillingModel,
  PackageCommissionType,
  PackagePayoutCycle,
  PaymentFeePayer,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  SubscriptionAdjustmentDirection,
  SubscriptionAdjustmentSource,
  SubscriptionDeductionStatus,
  SubscriptionDeductionType,
  SubscriptionStatus,
} from '@prisma/client';
import { PackagePlansService } from './package-plans.service';

describe('PackagePlansService', () => {
  const superAdmin = { uid: 'admin-1', role: 'SUPER_ADMIN' } as never;

  const makePlan = (overrides: Record<string, unknown> = {}) => ({
    id: 'plan-1',
    tenantId: null,
    name: 'Hybrid Growth',
    description: null,
    billingModel: PackageBillingModel.HYBRID,
    billingInterval: BillingInterval.MONTHLY,
    planPrice: new Prisma.Decimal(5000),
    commissionType: PackageCommissionType.PERCENTAGE,
    commissionPercentage: new Prisma.Decimal(5),
    commissionFixedAmount: new Prisma.Decimal(0),
    commissionCapAmount: new Prisma.Decimal(250),
    vatPercentage: new Prisma.Decimal(15),
    payoutCycle: PackagePayoutCycle.WEEKLY,
    termsDocumentUrl: 'terms/growth.pdf',
    currency: 'PKR',
    trialDays: 0,
    features: null,
    isActive: true,
    isDefault: false,
    deletedAt: null,
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
    updatedAt: new Date('2026-04-27T00:00:00.000Z'),
    ...overrides,
  });

  const makeSubscription = (overrides: Record<string, unknown> = {}) => ({
    id: 'subscription-12345678',
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    packagePlanId: 'plan-1',
    status: SubscriptionStatus.ACTIVE,
    paymentStatus: PaymentStatus.PENDING,
    payoutCycleOverride: null,
    startsAt: new Date('2026-06-01T00:00:00.000Z'),
    endsAt: null,
    nextBillingAt: new Date('2026-07-01T00:00:00.000Z'),
    planSnapshot: {
      id: 'plan-1',
      name: 'Hybrid Growth',
      billingModel: PackageBillingModel.HYBRID,
      billingInterval: BillingInterval.MONTHLY,
      planPrice: 5000,
      commissionType: PackageCommissionType.PERCENTAGE,
      commissionPercentage: 5,
      commissionFixedAmount: 0,
      commissionCapAmount: 250,
      vatPercentage: 15,
      payoutCycle: PackagePayoutCycle.WEEKLY,
      currency: 'PKR',
    },
    note: 'June subscription',
    createdBy: 'admin-1',
    updatedBy: 'admin-1',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    tenant: { id: 'tenant-1', name: 'Tenant One', slug: 'tenant-one' },
    restaurant: {
      id: 'restaurant-1',
      name: 'Pizza House',
      slug: 'pizza-house',
      supportContact: { email: 'support@pizza.test' },
      settings: {
        billing: {
          email: 'billing@pizza.test',
        },
      },
    },
    packagePlan: makePlan(),
    ...overrides,
  });

  const makePaidOrder = (overrides: Record<string, unknown> = {}) => ({
    id: 'order-1',
    branchId: 'branch-1',
    orderType: 'DELIVERY',
    paymentMethod: PaymentMethod.STRIPE,
    paymentStatus: PaymentStatus.PAID,
    subtotal: new Prisma.Decimal(1000),
    taxAmount: new Prisma.Decimal(0),
    deliveryFee: new Prisma.Decimal(0),
    serviceChargeAmount: new Prisma.Decimal(0),
    transactionFeeAmount: new Prisma.Decimal(0),
    transactionFeePayer: null,
    tipAmount: new Prisma.Decimal(0),
    discountAmount: new Prisma.Decimal(0),
    walletAppliedAmount: new Prisma.Decimal(0),
    loyaltyDiscountAmount: new Prisma.Decimal(0),
    totalAmount: new Prisma.Decimal(1000),
    paidAt: new Date('2026-06-09T10:00:00.000Z'),
    createdAt: new Date('2026-06-09T09:55:00.000Z'),
    branch: { id: 'branch-1', name: 'Main' },
    transactions: [
      {
        id: 'txn-1',
        amount: new Prisma.Decimal(1000),
        currency: 'PKR',
        paymentMethod: PaymentMethod.STRIPE,
        providerRef: 'pi_123',
        processedAt: new Date('2026-06-09T10:00:00.000Z'),
      },
    ],
    ...overrides,
  });

  it('creates hybrid package plan with fixed fee and commission', async () => {
    const repository = {
      createPlan: jest.fn().mockResolvedValue(makePlan()),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.createPlan(superAdmin, {
      name: 'Hybrid Growth',
      billingModel: PackageBillingModel.HYBRID,
      planPrice: 5000,
      commissionPercentage: 5,
      commissionType: PackageCommissionType.PERCENTAGE,
      commissionCapAmount: 250,
      commissionFixedAmount: 0,
      vatPercentage: 15,
      payoutCycle: PackagePayoutCycle.WEEKLY,
      termsDocumentUrl: 'terms/growth.pdf',
    });

    expect(repository.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        billingModel: PackageBillingModel.HYBRID,
        planPrice: new Prisma.Decimal(5000),
        commissionType: PackageCommissionType.PERCENTAGE,
        commissionPercentage: new Prisma.Decimal(5),
        commissionFixedAmount: new Prisma.Decimal(0),
        commissionCapAmount: new Prisma.Decimal(250),
        vatPercentage: new Prisma.Decimal(15),
        payoutCycle: PackagePayoutCycle.WEEKLY,
        termsDocumentUrl: 'terms/growth.pdf',
      }),
    );
    expect(result.message).toBe('Package plan created successfully');
  });

  it('creates package plan with weekly billing interval', async () => {
    const repository = {
      createPlan: jest
        .fn()
        .mockResolvedValue(
          makePlan({ billingInterval: BillingInterval.WEEKLY }),
        ),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.createPlan(superAdmin, {
      name: 'Weekly Growth',
      billingModel: PackageBillingModel.PLAN,
      billingInterval: BillingInterval.WEEKLY,
      planPrice: 1250,
    });

    expect(repository.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        billingInterval: BillingInterval.WEEKLY,
        planPrice: new Prisma.Decimal(1250),
      }),
    );
    expect(result.data.billingInterval).toBe(BillingInterval.WEEKLY);
  });

  it('creates commission package plan with fixed per-order commission', async () => {
    const repository = {
      createPlan: jest.fn().mockResolvedValue(
        makePlan({
          billingModel: PackageBillingModel.COMMISSION,
          planPrice: new Prisma.Decimal(0),
          commissionType: PackageCommissionType.FIXED,
          commissionPercentage: new Prisma.Decimal(0),
          commissionFixedAmount: new Prisma.Decimal(75),
          commissionCapAmount: null,
        }),
      ),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.createPlan(superAdmin, {
      name: 'Fixed Per Order',
      billingModel: PackageBillingModel.COMMISSION,
      commissionType: PackageCommissionType.FIXED,
      commissionFixedAmount: 75,
    });

    expect(repository.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        billingModel: PackageBillingModel.COMMISSION,
        commissionType: PackageCommissionType.FIXED,
        commissionPercentage: new Prisma.Decimal(0),
        commissionFixedAmount: new Prisma.Decimal(75),
      }),
    );
    expect(result.message).toBe('Package plan created successfully');
  });

  it('rejects commission plan with fixed plan price', async () => {
    const service = new PackagePlansService({} as never);

    await expect(
      service.createPlan(superAdmin, {
        name: 'Commission Only',
        billingModel: PackageBillingModel.COMMISSION,
        planPrice: 1000,
        commissionPercentage: 8,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects fixed plan with commission cap amount', async () => {
    const service = new PackagePlansService({} as never);

    await expect(
      service.createPlan(superAdmin, {
        name: 'Fixed Only',
        billingModel: PackageBillingModel.PLAN,
        planPrice: 5000,
        commissionCapAmount: 250,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns feature catalog for super admin', () => {
    const service = new PackagePlansService({} as never);

    const result = service.getFeatureCatalog(superAdmin);

    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ORDER_MANAGEMENT' }),
        expect.objectContaining({ code: 'BRANCH_MANAGEMENT' }),
      ]),
    );
  });

  it('rejects non-super-admin package management', async () => {
    const service = new PackagePlansService({} as never);

    await expect(
      service.listPlans(
        { uid: 'business-1', role: 'BUSINESS_ADMIN' } as never,
        { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'DESC' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lists active public package plans without requiring admin context', async () => {
    const repository = {
      listPublicPlans: jest
        .fn()
        .mockResolvedValue({ items: [makePlan()], total: 1 }),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.listPublicPlans({
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    });

    expect(repository.listPublicPlans).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    });
    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });
  });

  it('cancels existing active subscription when assigning a new package', async () => {
    const repository = {
      findTenantById: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
      findPlanById: jest.fn().mockResolvedValue(makePlan()),
      findActiveSubscription: jest.fn().mockResolvedValue({ id: 'sub-old' }),
      updateSubscription: jest.fn().mockResolvedValue({ id: 'sub-old' }),
      createSubscription: jest.fn().mockResolvedValue({ id: 'sub-new' }),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.assignSubscription(superAdmin, {
      tenantId: 'tenant-1',
      packagePlanId: 'plan-1',
    });

    expect(repository.updateSubscription).toHaveBeenCalledWith(
      'sub-old',
      expect.objectContaining({ status: SubscriptionStatus.CANCELLED }),
    );
    expect(repository.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant: { connect: { id: 'tenant-1' } },
        packagePlan: { connect: { id: 'plan-1' } },
        paymentStatus: PaymentStatus.PENDING,
      }),
    );
    const createCalls = repository.createSubscription.mock.calls as unknown as [
      {
        planSnapshot?: {
          billingModel?: PackageBillingModel;
          commissionType?: PackageCommissionType;
          commissionCapAmount?: number | null;
          commissionFixedAmount?: number;
          vatPercentage?: number;
          payoutCycle?: PackagePayoutCycle;
        };
      },
    ][];
    expect(createCalls[0]?.[0].planSnapshot).toMatchObject({
      billingModel: PackageBillingModel.HYBRID,
      commissionCapAmount: 250,
      vatPercentage: 15,
      payoutCycle: PackagePayoutCycle.WEEKLY,
    });
    expect(result.message).toBe('Tenant subscription assigned successfully');
  });

  it('refreshes plan features when switching an existing subscription', async () => {
    const existing = makeSubscription();
    const nextPlan = makePlan({
      id: 'plan-2',
      name: 'POS Plan',
      features: { orderManagement: false, posCashRegister: true },
    });
    const repository = {
      findSubscriptionById: jest.fn().mockResolvedValue(existing),
      findPlanById: jest.fn().mockResolvedValue(nextPlan),
      updateSubscription: jest.fn().mockResolvedValue({
        ...existing,
        packagePlanId: 'plan-2',
      }),
    };
    const service = new PackagePlansService(repository as never);

    await service.updateSubscription(superAdmin, existing.id, {
      packagePlanId: 'plan-2',
    });

    const updateCalls = repository.updateSubscription.mock.calls as Array<
      [string, unknown]
    >;
    const updateData = updateCalls[0]?.[1] as
      | {
          packagePlan?: { connect?: { id?: string } };
          planSnapshot?: {
            id?: string;
            features?: Record<string, boolean>;
          };
        }
      | undefined;

    expect(updateData?.packagePlan?.connect?.id).toBe('plan-2');
    expect(updateData?.planSnapshot?.id).toBe('plan-2');
    expect(updateData?.planSnapshot?.features).toEqual({
      orderManagement: false,
      posCashRegister: true,
    });
  });

  it('returns restaurant subscription invoice details for super admin', async () => {
    const repository = {
      findSubscriptionById: jest.fn().mockResolvedValue(makeSubscription()),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([makePaidOrder()]),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.getSubscriptionInvoice(
      superAdmin,
      'subscription-12345678',
    );

    expect(result.data).toMatchObject({
      invoiceNumber: 'SUB-INV-12345678-20260701',
      subscriptionId: 'subscription-12345678',
      restaurant: {
        id: 'restaurant-1',
        billingEmail: 'billing@pizza.test',
      },
      totals: {
        subscriptionFeeAmount: 5000,
        transactionFeeAmount: 50,
        subtotal: 5050,
        vatPercentage: 15,
        vatAmount: 757.5,
        totalFeesAmount: 5807.5,
        onlinePaymentCreditAmount: 1000,
        amountDue: 4807.5,
        creditAmount: 0,
        totalAmount: 4807.5,
        currency: 'PKR',
      },
    });
    expect(repository.listPaidRestaurantOrders).toHaveBeenCalledWith(
      'restaurant-1',
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-07-01T00:00:00.000Z'),
      true,
    );
  });

  it('deducts commission for every successful payment method plus fees and VAT', async () => {
    const repository = {
      findRestaurantPayoutScope: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
        tenantId: 'tenant-1',
        name: 'Pizza House',
        slug: 'pizza-house',
        supportContact: { email: 'support@pizza.test' },
        settings: { billing: { email: 'billing@pizza.test' } },
        tenant: { id: 'tenant-1', name: 'Tenant One', slug: 'tenant-one' },
      }),
      findActiveRestaurantSubscription: jest
        .fn()
        .mockResolvedValue(makeSubscription()),
      listRestaurantWalletPayoutOrders: jest.fn().mockResolvedValue([
        makePaidOrder({
          totalAmount: new Prisma.Decimal(1008),
          transactionFeeAmount: new Prisma.Decimal(10),
          transactionFeePayer: PaymentFeePayer.RESTAURANT,
          transactions: [
            {
              id: 'charge-1',
              type: PaymentTransactionType.CHARGE,
              amount: new Prisma.Decimal(1010),
              currency: 'PKR',
              paymentMethod: PaymentMethod.STRIPE,
              providerRef: 'pi_123',
              processedAt: new Date('2026-06-09T10:00:00.000Z'),
            },
          ],
        }),
        makePaidOrder({
          id: 'order-cod',
          paymentMethod: PaymentMethod.COD,
          paymentStatus: PaymentStatus.PENDING,
          totalAmount: new Prisma.Decimal(200),
          transactions: [],
        }),
        makePaidOrder({
          id: 'order-card-on-delivery',
          paymentMethod: PaymentMethod.CARD_ON_DELIVERY,
          paymentStatus: PaymentStatus.PENDING,
          totalAmount: new Prisma.Decimal(300),
          transactions: [],
        }),
        makePaidOrder({
          id: 'order-wallet',
          paymentMethod: PaymentMethod.WALLET,
          totalAmount: new Prisma.Decimal(100),
          transactions: [],
        }),
        makePaidOrder({
          id: 'order-paypal-customer-fee',
          paymentMethod: PaymentMethod.PAYPAL,
          totalAmount: new Prisma.Decimal(50),
          transactionFeeAmount: new Prisma.Decimal(5),
          transactionFeePayer: PaymentFeePayer.CUSTOMER,
          transactions: [
            {
              id: 'charge-paypal',
              type: PaymentTransactionType.CHARGE,
              amount: new Prisma.Decimal(50),
              currency: 'PKR',
              paymentMethod: PaymentMethod.PAYPAL,
              providerRef: 'paypal-123',
              processedAt: new Date('2026-06-09T10:00:00.000Z'),
            },
          ],
        }),
      ]),
      listRestaurantSpecialPayoutInvoices: jest.fn().mockResolvedValue([]),
      findRestaurantWalletAccount: jest.fn().mockResolvedValue({
        balance: new Prisma.Decimal(1060),
        currency: 'PKR',
      }),
    };
    const service = new PackagePlansService(repository as never);

    await expect(
      service.getRestaurantPayoutBalanceSummary('restaurant-1'),
    ).resolves.toMatchObject({
      ordersCount: 5,
      totalOrderAmount: 1658,
      platformCollectedAmount: 1060,
      grossAmount: 1060,
      platformCommissionAmount: 82.9,
      restaurantTransactionFeeAmount: 10,
      vatPercentage: 15,
      vatAmount: 13.94,
      totalDeductionsAmount: 106.84,
      restaurantPayoutAmount: 953.16,
      currency: 'PKR',
      activePlan: {
        subscriptionId: 'subscription-12345678',
        id: 'plan-1',
        name: 'Hybrid Growth',
        billingModel: PackageBillingModel.HYBRID,
        commissionType: PackageCommissionType.PERCENTAGE,
        commissionPercentage: 5,
        commissionFixedAmount: 0,
        commissionCapAmount: 250,
        vatPercentage: 15,
        payoutCycle: PackagePayoutCycle.WEEKLY,
      },
    });
  });

  it('rounds percentage commission once across the payout total', async () => {
    const repository = {
      findRestaurantPayoutScope: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
        tenantId: 'tenant-1',
        name: 'Pizza House',
        slug: 'pizza-house',
        supportContact: null,
        settings: null,
        tenant: { id: 'tenant-1', name: 'Tenant One', slug: 'tenant-one' },
      }),
      findActiveRestaurantSubscription: jest
        .fn()
        .mockResolvedValue(makeSubscription()),
      listRestaurantWalletPayoutOrders: jest.fn().mockResolvedValue([
        makePaidOrder({ totalAmount: new Prisma.Decimal('100.10') }),
        makePaidOrder({
          id: 'order-2',
          totalAmount: new Prisma.Decimal('100.10'),
        }),
      ]),
      listRestaurantSpecialPayoutInvoices: jest.fn().mockResolvedValue([]),
      findRestaurantWalletAccount: jest.fn().mockResolvedValue({
        balance: new Prisma.Decimal('200.20'),
        currency: 'PKR',
      }),
    };
    const service = new PackagePlansService(repository as never);

    await expect(
      service.getRestaurantPayoutBalanceSummary('restaurant-1'),
    ).resolves.toMatchObject({
      totalOrderAmount: 200.2,
      platformCommissionAmount: 10.01,
    });
  });

  it('reduces provider-collected payout and commission after a refund', async () => {
    const repository = {
      findRestaurantPayoutScope: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
        tenantId: 'tenant-1',
        name: 'Pizza House',
        slug: 'pizza-house',
        supportContact: null,
        settings: null,
        tenant: { id: 'tenant-1', name: 'Tenant One', slug: 'tenant-one' },
      }),
      findActiveRestaurantSubscription: jest
        .fn()
        .mockResolvedValue(makeSubscription()),
      listRestaurantWalletPayoutOrders: jest.fn().mockResolvedValue([
        makePaidOrder({
          totalAmount: new Prisma.Decimal(100),
          transactions: [
            {
              id: 'charge-1',
              type: PaymentTransactionType.CHARGE,
              amount: new Prisma.Decimal(100),
              currency: 'PKR',
              paymentMethod: PaymentMethod.STRIPE,
              providerRef: 'pi_123',
              processedAt: new Date('2026-06-09T10:00:00.000Z'),
            },
            {
              id: 'refund-1',
              type: PaymentTransactionType.REFUND,
              amount: new Prisma.Decimal(40),
              currency: 'PKR',
              paymentMethod: PaymentMethod.STRIPE,
              providerRef: 're_123',
              processedAt: new Date('2026-06-10T10:00:00.000Z'),
            },
          ],
        }),
      ]),
      listRestaurantSpecialPayoutInvoices: jest.fn().mockResolvedValue([]),
      findRestaurantWalletAccount: jest.fn().mockResolvedValue({
        balance: new Prisma.Decimal(60),
        currency: 'PKR',
      }),
    };
    const service = new PackagePlansService(repository as never);

    await expect(
      service.getRestaurantPayoutBalanceSummary('restaurant-1'),
    ).resolves.toMatchObject({
      totalOrderAmount: 60,
      platformCollectedAmount: 60,
      platformCommissionAmount: 3,
      vatAmount: 0.45,
      restaurantPayoutAmount: 56.55,
    });
  });

  it('uses only the current billing cycle for a recurring invoice', async () => {
    const repository = {
      findSubscriptionById: jest.fn().mockResolvedValue(
        makeSubscription({
          startsAt: new Date('2026-07-20T00:00:00.000Z'),
          nextBillingAt: new Date('2026-09-20T00:00:00.000Z'),
        }),
      ),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([]),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.getSubscriptionInvoice(
      superAdmin,
      'subscription-12345678',
    );

    expect(result.data.servicePeriod).toEqual({
      from: new Date('2026-08-20T00:00:00.000Z'),
      to: new Date('2026-09-20T00:00:00.000Z'),
    });
    expect(repository.listPaidRestaurantOrders).toHaveBeenCalledWith(
      'restaurant-1',
      new Date('2026-08-20T00:00:00.000Z'),
      new Date('2026-09-20T00:00:00.000Z'),
      true,
    );
  });

  it('includes paid order breakdown and only applies online orders as credit', async () => {
    const repository = {
      findSubscriptionById: jest.fn().mockResolvedValue(makeSubscription()),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([
        makePaidOrder({ totalAmount: new Prisma.Decimal(1000) }),
        makePaidOrder({
          id: 'order-cash-1',
          paymentMethod: PaymentMethod.COD,
          totalAmount: new Prisma.Decimal(500),
          transactions: [],
        }),
      ]),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.getSubscriptionInvoice(
      superAdmin,
      'subscription-12345678',
    );

    expect(result.data.totals.onlinePaymentCreditAmount).toBe(1000);
    expect(result.data.transactionFee).toEqual({ ordersCount: 2, amount: 75 });
    expect(result.data.orderBreakdown).toMatchObject({
      summary: {
        offlineOrdersCount: 1,
        offlineTotalAmount: 500,
        onlineOrdersCount: 1,
        onlineTotalAmount: 1000,
        totalOrdersCount: 2,
        totalOrdersAmount: 1500,
      },
      orders: [
        expect.objectContaining({
          id: 'order-1',
          paidBy: PaymentMethod.STRIPE,
        }),
        expect.objectContaining({
          id: 'order-cash-1',
          paidBy: PaymentMethod.COD,
        }),
      ],
    });
  });

  it('charges commission at confirmation without crediting unpaid online funds', async () => {
    const repository = {
      findSubscriptionById: jest.fn().mockResolvedValue(makeSubscription()),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([
        makePaidOrder({
          id: 'order-confirmed-cash',
          paymentMethod: PaymentMethod.COD,
          paymentStatus: PaymentStatus.PENDING,
          paidAt: null,
          totalAmount: new Prisma.Decimal(600),
          transactions: [],
        }),
        makePaidOrder({
          id: 'order-confirmed-online',
          paymentStatus: PaymentStatus.PENDING,
          paidAt: null,
          totalAmount: new Prisma.Decimal(400),
          transactions: [],
        }),
      ]),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.getSubscriptionInvoice(
      superAdmin,
      'subscription-12345678',
    );

    expect(result.data.transactionFee).toEqual({ ordersCount: 2, amount: 50 });
    expect(result.data.totals.onlinePaymentCreditAmount).toBe(0);
    expect(result.data.orderBreakdown.summary).toMatchObject({
      offlineTotalAmount: 600,
      onlineTotalAmount: 400,
      totalOrdersAmount: 1000,
    });
  });

  it('applies the commission cap once across all paid orders in the subscription period', async () => {
    const repository = {
      findSubscriptionById: jest.fn().mockResolvedValue(makeSubscription()),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([
        makePaidOrder({ totalAmount: new Prisma.Decimal(4000) }),
        makePaidOrder({
          id: 'order-cash-1',
          paymentMethod: PaymentMethod.COD,
          totalAmount: new Prisma.Decimal(4000),
          transactions: [],
        }),
      ]),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.getSubscriptionInvoice(
      superAdmin,
      'subscription-12345678',
    );

    expect(result.data.transactionFee).toEqual({
      ordersCount: 2,
      amount: 250,
    });
    expect(result.data.totals.transactionFeeAmount).toBe(250);
    expect(result.data.totals.onlinePaymentCreditAmount).toBe(4000);
  });

  it('returns a credit note when online payment credit covers subscription fees', async () => {
    const repository = {
      findSubscriptionById: jest.fn().mockResolvedValue(makeSubscription()),
      listPaidRestaurantOrders: jest
        .fn()
        .mockResolvedValue([
          makePaidOrder({ totalAmount: new Prisma.Decimal(7000) }),
        ]),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.getSubscriptionInvoice(
      superAdmin,
      'subscription-12345678',
    );

    expect(result.data).toMatchObject({
      documentType: 'CREDIT_NOTE',
      invoiceNumber: 'CRN-12345678-20260701',
      totals: {
        totalFeesAmount: 6037.5,
        onlinePaymentCreditAmount: 7000,
        amountDue: 0,
        creditAmount: 962.5,
        totalAmount: 0,
      },
    });
  });

  it('renders credit note PDF wording and order payments as table columns', async () => {
    const repository = {
      findSubscriptionById: jest.fn().mockResolvedValue(makeSubscription()),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([
        makePaidOrder({
          id: 'order-card-1',
          totalAmount: new Prisma.Decimal(7000),
        }),
      ]),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.downloadSubscriptionInvoicePdf(
      superAdmin,
      'subscription-12345678',
    );
    const pdfText = result.content.toString('utf8');

    expect(result.fileName).toBe('CRN-12345678-20260701.pdf');
    expect(pdfText).toContain('remaining credit owed to the restaurant');
    expect(pdfText).toContain('Order ID');
    expect(pdfText).toContain('Paid By');
    expect(pdfText).toContain('order-card-1');
    expect(pdfText).not.toContain('Order ID | Date | Paid By');
  });

  it('generates restaurant subscription invoice PDF', async () => {
    const repository = {
      findSubscriptionById: jest.fn().mockResolvedValue(makeSubscription()),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([]),
      updateSubscription: jest.fn().mockResolvedValue(makeSubscription()),
    };
    const invoiceRecordsService = {
      persist: jest.fn().mockResolvedValue({ id: 'invoice-record-1' }),
    };
    const service = new PackagePlansService(
      repository as never,
      undefined,
      undefined,
      invoiceRecordsService as never,
    );

    const result = await service.downloadSubscriptionInvoicePdf(
      superAdmin,
      'subscription-12345678',
    );

    expect(result.fileName).toBe('SUB-INV-12345678-20260701.pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.content.subarray(0, 8).toString('utf8')).toBe('%PDF-1.4');
    expect(invoiceRecordsService.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceNumber: 'SUB-INV-12345678-20260701',
        subscriptionId: 'subscription-12345678',
        eventType: 'DOWNLOADED',
      }),
    );
  });

  it('rebuilds a detailed subscription PDF from a stored JSON snapshot', async () => {
    const repository = {
      findSubscriptionById: jest.fn().mockResolvedValue(makeSubscription()),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([makePaidOrder()]),
    };
    const service = new PackagePlansService(repository as never);
    const invoice = await service.getSubscriptionInvoice(
      superAdmin,
      'subscription-12345678',
    );
    const snapshot = JSON.parse(
      JSON.stringify(invoice.data),
    ) as Prisma.JsonValue;

    const pdf = service.generateStoredInvoicePdf(
      GeneratedInvoiceKind.SUBSCRIPTION,
      snapshot,
    );
    const pdfText = pdf.toString('utf8');

    expect(pdfText).toContain('Order Payment Details');
    expect(pdfText).toContain('order-1');
    expect(pdfText).toContain('Total Revenue');
  });

  it('sends restaurant subscription invoice to billing email', async () => {
    const repository = {
      findSubscriptionById: jest.fn().mockResolvedValue(makeSubscription()),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([]),
      updateSubscription: jest.fn().mockResolvedValue(makeSubscription()),
    };
    const mailerService = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };
    const invoiceRecordsService = {
      persist: jest.fn().mockResolvedValue({ id: 'invoice-record-1' }),
    };
    const service = new PackagePlansService(
      repository as never,
      mailerService as never,
      undefined,
      invoiceRecordsService as never,
    );

    const result = await service.sendSubscriptionInvoiceEmail(
      superAdmin,
      'subscription-12345678',
      {},
    );

    expect(mailerService.sendEmail).toHaveBeenCalledWith(
      'billing@pizza.test',
      'DeliveryWays invoice SUB-INV-12345678-20260701',
      expect.stringContaining('Please find attached DeliveryWays invoice'),
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            filename: 'SUB-INV-12345678-20260701.pdf',
            contentType: 'application/pdf',
          }),
        ],
      }),
    );
    expect(result.data.sentTo).toBe('billing@pizza.test');
    expect(invoiceRecordsService.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceNumber: 'SUB-INV-12345678-20260701',
        eventType: 'EMAILED',
        recipientEmail: 'billing@pizza.test',
        status: 'SENT',
      }),
    );
    expect(repository.updateSubscription).toHaveBeenCalledWith(
      'subscription-12345678',
      { nextBillingAt: new Date('2026-08-01T00:00:00.000Z') },
    );
  });

  it('requires a restaurant billing email before sending invoice', async () => {
    const repository = {
      findSubscriptionById: jest.fn().mockResolvedValue(
        makeSubscription({
          restaurant: {
            id: 'restaurant-1',
            name: 'Pizza House',
            slug: 'pizza-house',
            supportContact: {},
            settings: {},
          },
        }),
      ),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([]),
    };
    const service = new PackagePlansService(
      repository as never,
      {
        sendEmail: jest.fn(),
      } as never,
    );

    await expect(
      service.sendSubscriptionInvoiceEmail(
        superAdmin,
        'subscription-12345678',
        {},
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns weekly payout invoice with super admin gross and restaurant net payout', async () => {
    const repository = {
      findRestaurantPayoutScope: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
        tenantId: 'tenant-1',
        name: 'Pizza House',
        slug: 'pizza-house',
        supportContact: { email: 'support@pizza.test' },
        settings: { billing: { email: 'billing@pizza.test' } },
        tenant: { id: 'tenant-1', name: 'Tenant One', slug: 'tenant-one' },
      }),
      findActiveRestaurantSubscription: jest
        .fn()
        .mockResolvedValue(makeSubscription()),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([makePaidOrder()]),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.getWeeklyPayoutInvoice(superAdmin, {
      restaurantId: 'restaurant-1',
      fromDate: '2026-06-04T00:00:00.000Z',
      toDate: '2026-06-11T00:00:00.000Z',
    });

    expect(repository.listPaidRestaurantOrders).toHaveBeenCalledWith(
      'restaurant-1',
      new Date('2026-06-04T00:00:00.000Z'),
      new Date('2026-06-11T00:00:00.000Z'),
      true,
    );
    expect(result.data).toMatchObject({
      restaurant: {
        id: 'restaurant-1',
        billingEmail: 'billing@pizza.test',
      },
      subscription: {
        billingInterval: BillingInterval.MONTHLY,
        payoutCycle: PackagePayoutCycle.WEEKLY,
      },
      totals: {
        ordersCount: 1,
        grossAmount: 1000,
        platformCommissionAmount: 50,
        vatPercentage: 15,
        vatAmount: 7.5,
        restaurantPayoutAmount: 942.5,
        currency: 'PKR',
      },
    });
  });

  it('renders payout invoice PDF with order-level reconciliation rows', async () => {
    const repository = {
      findRestaurantPayoutScope: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
        tenantId: 'tenant-1',
        name: 'Pizza House',
        slug: 'pizza-house',
        supportContact: { email: 'support@pizza.test' },
        settings: { billing: { email: 'billing@pizza.test' } },
        tenant: { id: 'tenant-1', name: 'Tenant One', slug: 'tenant-one' },
      }),
      findActiveRestaurantSubscription: jest
        .fn()
        .mockResolvedValue(makeSubscription()),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([makePaidOrder()]),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.downloadWeeklyPayoutInvoicePdf(superAdmin, {
      restaurantId: 'restaurant-1',
      fromDate: '2026-06-04T00:00:00.000Z',
      toDate: '2026-06-11T00:00:00.000Z',
    });
    const pdfText = result.content.toString('utf8');

    expect(pdfText).toContain('Order Payout Details');
    expect(pdfText).toContain('Order ID');
    expect(pdfText).toContain('order-1');
    expect(pdfText).toContain('Gross');
    expect(pdfText).toContain('Net');
  });

  it('rebuilds a detailed payout PDF from a stored JSON snapshot', async () => {
    const repository = {
      findRestaurantPayoutScope: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
        tenantId: 'tenant-1',
        name: 'Pizza House',
        slug: 'pizza-house',
        supportContact: { email: 'support@pizza.test' },
        settings: { billing: { email: 'billing@pizza.test' } },
        tenant: { id: 'tenant-1', name: 'Tenant One', slug: 'tenant-one' },
      }),
      findActiveRestaurantSubscription: jest
        .fn()
        .mockResolvedValue(makeSubscription()),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([makePaidOrder()]),
    };
    const service = new PackagePlansService(repository as never);
    const invoice = await service.getWeeklyPayoutInvoice(superAdmin, {
      restaurantId: 'restaurant-1',
      fromDate: '2026-06-04T00:00:00.000Z',
      toDate: '2026-06-11T00:00:00.000Z',
    });
    const snapshot = JSON.parse(
      JSON.stringify(invoice.data),
    ) as Prisma.JsonValue;

    const pdf = service.generateStoredInvoicePdf(
      GeneratedInvoiceKind.WEEKLY_PAYOUT,
      snapshot,
    );
    const pdfText = pdf.toString('utf8');

    expect(pdfText).toContain('Order Payout Details');
    expect(pdfText).toContain('order-1');
    expect(pdfText).toContain('Platform Commission');
  });

  it('auto-emails due subscription invoices once and advances next billing date', async () => {
    const subscription = makeSubscription({
      nextBillingAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    const repository = {
      listDueSubscriptions: jest.fn().mockResolvedValue([subscription]),
      findSubscriptionById: jest.fn().mockResolvedValue(subscription),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([]),
      settleSubscriptionInvoiceFromWallet: jest.fn().mockResolvedValue({
        appliedAmount: new Prisma.Decimal(0),
        balanceAfter: new Prisma.Decimal(0),
        walletAccountId: 'restaurant-wallet-1',
        walletTransactionId: null,
      }),
      updateSubscription: jest.fn().mockResolvedValue(subscription),
    };
    const mailerService = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const invoiceRecordsService = {
      hasEmailed: jest.fn().mockResolvedValue(false),
      persist: jest.fn().mockResolvedValue({ id: 'invoice-record-1' }),
    };
    const service = new PackagePlansService(
      repository as never,
      mailerService as never,
      undefined,
      invoiceRecordsService as never,
    );

    const result = await service.emailDueSubscriptionInvoices(
      new Date('2026-07-01T02:00:00.000Z'),
    );

    expect(result).toEqual({ sent: 1, skipped: 0 });
    expect(mailerService.sendEmail).toHaveBeenCalledWith(
      'billing@pizza.test',
      'DeliveryWays invoice SUB-INV-12345678-20260701',
      expect.any(String),
      expect.any(Object),
    );
    expect(invoiceRecordsService.hasEmailed).toHaveBeenCalledWith(
      GeneratedInvoiceKind.SUBSCRIPTION,
      'subscription-12345678:2026-06-01T00:00:00.000Z:2026-07-01T00:00:00.000Z',
    );
    expect(repository.updateSubscription).toHaveBeenCalledWith(
      'subscription-12345678',
      { nextBillingAt: new Date('2026-08-01T00:00:00.000Z') },
    );
  });

  it('recovers an emailed invoice without debiting or emailing it again', async () => {
    const subscription = makeSubscription({
      nextBillingAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    const repository = {
      listDueSubscriptions: jest.fn().mockResolvedValue([subscription]),
      findSubscriptionById: jest.fn().mockResolvedValue(subscription),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([]),
      settleSubscriptionInvoiceFromWallet: jest.fn(),
      updateSubscription: jest.fn().mockResolvedValue(subscription),
    };
    const mailerService = { sendEmail: jest.fn() };
    const invoiceRecordsService = {
      hasEmailed: jest.fn().mockResolvedValue(true),
      persist: jest.fn(),
    };
    const service = new PackagePlansService(
      repository as never,
      mailerService as never,
      undefined,
      invoiceRecordsService as never,
    );

    const result = await service.emailDueSubscriptionInvoices(
      new Date('2026-07-01T02:00:00.000Z'),
    );

    expect(result).toEqual({ sent: 0, skipped: 1 });
    expect(
      repository.settleSubscriptionInvoiceFromWallet,
    ).not.toHaveBeenCalled();
    expect(mailerService.sendEmail).not.toHaveBeenCalled();
    expect(invoiceRecordsService.persist).not.toHaveBeenCalled();
    expect(repository.updateSubscription).toHaveBeenCalledWith(
      'subscription-12345678',
      { nextBillingAt: new Date('2026-08-01T00:00:00.000Z') },
    );
  });

  it('settles a due subscription fully from the restaurant wallet', async () => {
    const subscription = makeSubscription();
    const repository = {
      listDueSubscriptions: jest.fn().mockResolvedValue([subscription]),
      findSubscriptionById: jest.fn().mockResolvedValue(subscription),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([]),
      settleSubscriptionInvoiceFromWallet: jest.fn().mockResolvedValue({
        appliedAmount: new Prisma.Decimal(5750),
        balanceAfter: new Prisma.Decimal(1250),
        walletAccountId: 'restaurant-wallet-1',
        walletTransactionId: 'restaurant-wallet-tx-1',
      }),
      updateSubscription: jest.fn().mockResolvedValue(subscription),
      markOneTimeDeductionsApplied: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const mailerService = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const invoiceRecordsService = {
      hasEmailed: jest.fn().mockResolvedValue(false),
      persist: jest.fn().mockResolvedValue({ id: 'invoice-record-1' }),
    };
    const service = new PackagePlansService(
      repository as never,
      mailerService as never,
      undefined,
      invoiceRecordsService as never,
    );

    const result = await service.emailDueSubscriptionInvoices(
      new Date('2026-07-01T02:00:00.000Z'),
    );

    expect(result).toEqual({ sent: 0, skipped: 0 });
    expect(repository.settleSubscriptionInvoiceFromWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        settlementKey:
          'subscription-12345678:2026-06-01T00:00:00.000Z:2026-07-01T00:00:00.000Z',
        amountDue: new Prisma.Decimal(5750),
      }),
    );
    expect(mailerService.sendEmail).not.toHaveBeenCalled();
    expect(invoiceRecordsService.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: GeneratedInvoiceKind.SUBSCRIPTION,
        totalAmount: 0,
      }),
    );
    expect(repository.updateSubscription).toHaveBeenCalledWith(
      'subscription-12345678',
      {
        nextBillingAt: new Date('2026-08-01T00:00:00.000Z'),
        paymentStatus: PaymentStatus.PAID,
      },
    );
  });

  it('applies a partial wallet settlement and emails only the remainder', async () => {
    const subscription = makeSubscription();
    const repository = {
      listDueSubscriptions: jest.fn().mockResolvedValue([subscription]),
      findSubscriptionById: jest.fn().mockResolvedValue(subscription),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([]),
      settleSubscriptionInvoiceFromWallet: jest.fn().mockResolvedValue({
        appliedAmount: new Prisma.Decimal(2000),
        balanceAfter: new Prisma.Decimal(0),
        walletAccountId: 'restaurant-wallet-1',
        walletTransactionId: 'restaurant-wallet-tx-1',
      }),
      updateSubscription: jest.fn().mockResolvedValue(subscription),
      markOneTimeDeductionsApplied: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const mailerService = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const invoiceRecordsService = {
      hasEmailed: jest.fn().mockResolvedValue(false),
      persist: jest.fn().mockResolvedValue({ id: 'invoice-record-1' }),
    };
    const service = new PackagePlansService(
      repository as never,
      mailerService as never,
      undefined,
      invoiceRecordsService as never,
    );

    const result = await service.emailDueSubscriptionInvoices(
      new Date('2026-07-01T02:00:00.000Z'),
    );

    expect(result).toEqual({ sent: 1, skipped: 0 });
    expect(mailerService.sendEmail).toHaveBeenCalledWith(
      'billing@pizza.test',
      expect.any(String),
      expect.stringContaining('Invoice Amount Due: 3750.00 PKR'),
      expect.any(Object),
    );
    expect(invoiceRecordsService.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAmount: 3750,
      }),
    );
  });

  it('applies recurring and one-time subscription deductions on invoices', async () => {
    const repository = {
      findSubscriptionById: jest.fn().mockResolvedValue(makeSubscription()),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([]),
      listApplicableDeductions: jest.fn().mockResolvedValue([
        {
          id: 'deduction-recurring-1',
          title: 'Marketing credit',
          description: null,
          type: SubscriptionDeductionType.RECURRING,
          status: SubscriptionDeductionStatus.ACTIVE,
          amount: new Prisma.Decimal(300),
          currency: 'PKR',
        },
        {
          id: 'deduction-one-time-1',
          title: 'Service outage credit',
          description: null,
          type: SubscriptionDeductionType.ONE_TIME,
          status: SubscriptionDeductionStatus.ACTIVE,
          amount: new Prisma.Decimal(200),
          currency: 'PKR',
        },
      ]),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.getSubscriptionInvoice(
      superAdmin,
      'subscription-12345678',
    );

    expect(result.data.deductions).toHaveLength(2);
    expect(result.data.totals).toMatchObject({
      deductionAmount: 500,
      subtotal: 4500,
      vatAmount: 675,
      totalFeesAmount: 5175,
    });
  });

  it('adds module fees and custom charges while keeping credits separate on subscription invoices', async () => {
    const repository = {
      findSubscriptionById: jest.fn().mockResolvedValue(makeSubscription()),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([]),
      listApplicableDeductions: jest.fn().mockResolvedValue([
        {
          id: 'pos-module-fee-1',
          title: 'POS Module',
          description: null,
          type: SubscriptionDeductionType.RECURRING,
          status: SubscriptionDeductionStatus.ACTIVE,
          direction: SubscriptionAdjustmentDirection.CHARGE,
          source: SubscriptionAdjustmentSource.MODULE,
          moduleCode: 'POS',
          amount: new Prisma.Decimal(600),
          currency: 'PKR',
        },
        {
          id: 'custom-charge-1',
          title: 'Hardware setup',
          description: null,
          type: SubscriptionDeductionType.ONE_TIME,
          status: SubscriptionDeductionStatus.ACTIVE,
          direction: SubscriptionAdjustmentDirection.CHARGE,
          source: SubscriptionAdjustmentSource.CUSTOM,
          moduleCode: null,
          amount: new Prisma.Decimal(100),
          currency: 'PKR',
        },
        {
          id: 'credit-1',
          title: 'Service credit',
          description: null,
          type: SubscriptionDeductionType.ONE_TIME,
          status: SubscriptionDeductionStatus.ACTIVE,
          direction: SubscriptionAdjustmentDirection.CREDIT,
          source: SubscriptionAdjustmentSource.CUSTOM,
          moduleCode: null,
          amount: new Prisma.Decimal(200),
          currency: 'PKR',
        },
      ]),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.getSubscriptionInvoice(
      superAdmin,
      'subscription-12345678',
    );

    expect(result.data.additionalCharges).toHaveLength(2);
    expect(result.data.deductions).toHaveLength(1);
    expect(
      result.data.lineItems.some((item) => item.description.includes('POS')),
    ).toBe(true);
    expect(
      result.data.lineItems.some((item) =>
        item.description.includes('Hardware setup'),
      ),
    ).toBe(true);
    expect(
      result.data.lineItems.some((item) =>
        item.description.includes('Service credit'),
      ),
    ).toBe(true);
    expect(result.data.totals).toMatchObject({
      additionalChargeAmount: 700,
      deductionAmount: 200,
      subtotal: 5500,
      vatAmount: 825,
      totalFeesAmount: 6325,
    });
  });

  it('rejects module fee adjustments without charge direction and module code', async () => {
    const repository = {
      findTenantById: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
      findRestaurantById: jest.fn().mockResolvedValue({ id: 'restaurant-1' }),
    };
    const service = new PackagePlansService(repository as never);

    await expect(
      service.createDeduction(superAdmin, {
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        type: SubscriptionDeductionType.RECURRING,
        direction: SubscriptionAdjustmentDirection.CREDIT,
        source: SubscriptionAdjustmentSource.MODULE,
        title: 'POS Module',
        amount: 600,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('exports monthly invoice records as DATEV placeholder CSV', async () => {
    const repository = {
      listMonthlyGeneratedInvoices: jest.fn().mockResolvedValue([
        {
          invoiceNumber: 'CRN-12345678-20260701',
          kind: 'SUBSCRIPTION',
          restaurantId: 'restaurant-1',
          subscriptionId: 'subscription-12345678',
          orderId: null,
          currency: 'PKR',
          totalAmount: new Prisma.Decimal(0),
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          snapshot: {
            documentType: 'CREDIT_NOTE',
            restaurant: { name: 'Pizza House' },
          },
        },
      ]),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.exportMonthlyInvoicesDatevCsv(superAdmin, {
      year: 2026,
      month: 7,
    });
    const csv = result.content.toString('utf8');

    expect(result.fileName).toBe('datev-invoices-2026-07.csv');
    expect(csv).toContain('TODO_REVENUE_ACCOUNT');
    expect(csv).toContain('CRN-12345678-20260701');
    expect(csv).toContain('CREDIT_NOTE');
    expect(csv).toContain('DATEV account numbers are placeholders');
  });

  it('auto-emails weekly payout invoices once for the last completed payout period', async () => {
    const subscription = makeSubscription();
    const repository = {
      listActiveRestaurantSubscriptionsForPayouts: jest
        .fn()
        .mockResolvedValue([subscription]),
      findRestaurantPayoutScope: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
        tenantId: 'tenant-1',
        name: 'Pizza House',
        slug: 'pizza-house',
        supportContact: { email: 'support@pizza.test' },
        settings: { billing: { email: 'billing@pizza.test' } },
        tenant: { id: 'tenant-1', name: 'Tenant One', slug: 'tenant-one' },
      }),
      findActiveRestaurantSubscription: jest
        .fn()
        .mockResolvedValue(subscription),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([makePaidOrder()]),
    };
    const mailerService = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const invoiceRecordsService = {
      hasRecord: jest
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
      hasEmailed: jest.fn().mockResolvedValue(false),
      persist: jest.fn().mockResolvedValue({ id: 'invoice-record-1' }),
    };
    const service = new PackagePlansService(
      repository as never,
      mailerService as never,
      undefined,
      invoiceRecordsService as never,
    );

    const result = await service.emailDuePayoutInvoices(
      new Date('2026-07-08T10:00:00.000Z'),
    );

    expect(result).toEqual({ sent: 1, skipped: 0 });
    expect(repository.listPaidRestaurantOrders).toHaveBeenCalledWith(
      'restaurant-1',
      new Date('2026-06-29T00:00:00.000Z'),
      new Date('2026-07-06T00:00:00.000Z'),
      true,
    );
    expect(invoiceRecordsService.hasRecord).toHaveBeenCalledWith(
      'WEEKLY_PAYOUT',
      'restaurant-1:2026-06-29T00:00:00.000Z:2026-07-06T00:00:00.000Z',
    );
    expect(mailerService.sendEmail).toHaveBeenCalledWith(
      'billing@pizza.test',
      expect.stringContaining('payout invoice'),
      expect.any(String),
      expect.any(Object),
    );

    await expect(
      service.emailDuePayoutInvoices(new Date('2026-07-10T10:00:00.000Z')),
    ).resolves.toEqual({ sent: 0, skipped: 1 });
    expect(invoiceRecordsService.hasRecord).toHaveBeenLastCalledWith(
      'WEEKLY_PAYOUT',
      'restaurant-1:2026-06-29T00:00:00.000Z:2026-07-06T00:00:00.000Z',
    );
    expect(mailerService.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('uses restaurant subscription payout cycle override for automated payout periods', async () => {
    const subscription = makeSubscription({
      payoutCycleOverride: PackagePayoutCycle.MONTHLY,
      planSnapshot: {
        ...makeSubscription().planSnapshot,
        payoutCycle: PackagePayoutCycle.WEEKLY,
      },
    });
    const repository = {
      listActiveRestaurantSubscriptionsForPayouts: jest
        .fn()
        .mockResolvedValue([subscription]),
      findRestaurantPayoutScope: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
        tenantId: 'tenant-1',
        name: 'Pizza House',
        slug: 'pizza-house',
        supportContact: { email: 'support@pizza.test' },
        settings: { billing: { email: 'billing@pizza.test' } },
        tenant: { id: 'tenant-1', name: 'Tenant One', slug: 'tenant-one' },
      }),
      findActiveRestaurantSubscription: jest
        .fn()
        .mockResolvedValue(subscription),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([makePaidOrder()]),
    };
    const mailerService = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const invoiceRecordsService = {
      hasRecord: jest.fn().mockResolvedValue(false),
      hasEmailed: jest.fn().mockResolvedValue(false),
      persist: jest.fn().mockResolvedValue({ id: 'invoice-record-1' }),
    };
    const service = new PackagePlansService(
      repository as never,
      mailerService as never,
      undefined,
      invoiceRecordsService as never,
    );

    await service.emailDuePayoutInvoices(new Date('2026-07-08T10:00:00.000Z'));

    expect(repository.listPaidRestaurantOrders).toHaveBeenCalledWith(
      'restaurant-1',
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-07-01T00:00:00.000Z'),
      true,
    );
  });

  it('excludes amounts already paid by an early special payout from the next scheduled payout', async () => {
    const subscription = makeSubscription();
    const repository = {
      listActiveRestaurantSubscriptionsForPayouts: jest
        .fn()
        .mockResolvedValue([subscription]),
      findRestaurantPayoutScope: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
        tenantId: 'tenant-1',
        name: 'Pizza House',
        slug: 'pizza-house',
        supportContact: { email: 'support@pizza.test' },
        settings: { billing: { email: 'billing@pizza.test' } },
        tenant: { id: 'tenant-1', name: 'Tenant One', slug: 'tenant-one' },
      }),
      findActiveRestaurantSubscription: jest
        .fn()
        .mockResolvedValue(subscription),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([
        makePaidOrder({
          id: 'order-early',
          totalAmount: new Prisma.Decimal(1000),
        }),
        makePaidOrder({
          id: 'order-new',
          totalAmount: new Prisma.Decimal(2000),
        }),
      ]),
      listRestaurantSpecialPayoutInvoices: jest.fn().mockResolvedValue([
        {
          id: 'invoice-special-1',
          sourceKey: 'restaurant-1:special:payout-request-1',
          snapshot: {
            lineItems: [
              { orderId: 'order-early', restaurantPayoutAmount: 950 },
            ],
          },
        },
      ]),
    };
    const mailerService = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const persistInvoice = jest.fn(
      (input: { snapshot: { lineItems: Array<{ orderId: string }> } }) => {
        void input;
        return Promise.resolve({ id: 'invoice-record-1' });
      },
    );
    const invoiceRecordsService = {
      hasRecord: jest.fn().mockResolvedValue(false),
      persist: persistInvoice,
    };
    const service = new PackagePlansService(
      repository as never,
      mailerService as never,
      undefined,
      invoiceRecordsService as never,
    );

    await service.emailDuePayoutInvoices(new Date('2026-07-08T10:00:00.000Z'));

    const persistedInvoice = persistInvoice.mock.calls[0]?.[0].snapshot as {
      lineItems: Array<{ orderId: string }>;
    };
    expect(persistedInvoice.lineItems.map((item) => item.orderId)).toEqual([
      'order-new',
    ]);
  });
});
