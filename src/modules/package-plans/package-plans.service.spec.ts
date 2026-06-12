import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  BillingInterval,
  PackageBillingModel,
  PackageCommissionType,
  PackagePayoutCycle,
  PaymentStatus,
  Prisma,
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
    paymentMethod: 'CARD',
    subtotal: new Prisma.Decimal(1000),
    taxAmount: new Prisma.Decimal(0),
    deliveryFee: new Prisma.Decimal(0),
    serviceChargeAmount: new Prisma.Decimal(0),
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
        paymentMethod: 'CARD',
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
      invoiceNumber: 'SUB-INV-12345678',
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
        totalAmount: 5807.5,
        currency: 'PKR',
      },
    });
    expect(repository.listPaidRestaurantOrders).toHaveBeenCalledWith(
      'restaurant-1',
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-07-01T00:00:00.000Z'),
    );
  });

  it('generates restaurant subscription invoice PDF', async () => {
    const repository = {
      findSubscriptionById: jest.fn().mockResolvedValue(makeSubscription()),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([]),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.downloadSubscriptionInvoicePdf(
      superAdmin,
      'subscription-12345678',
    );

    expect(result.fileName).toBe('SUB-INV-12345678.pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.content.subarray(0, 8).toString('utf8')).toBe('%PDF-1.4');
  });

  it('sends restaurant subscription invoice to billing email', async () => {
    const repository = {
      findSubscriptionById: jest.fn().mockResolvedValue(makeSubscription()),
      listPaidRestaurantOrders: jest.fn().mockResolvedValue([]),
    };
    const mailerService = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PackagePlansService(
      repository as never,
      mailerService as never,
    );

    const result = await service.sendSubscriptionInvoiceEmail(
      superAdmin,
      'subscription-12345678',
      {},
    );

    expect(mailerService.sendEmail).toHaveBeenCalledWith(
      'billing@pizza.test',
      'DeliveryWays invoice SUB-INV-12345678',
      expect.stringContaining('Please find attached DeliveryWays invoice'),
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            filename: 'SUB-INV-12345678.pdf',
            contentType: 'application/pdf',
          }),
        ],
      }),
    );
    expect(result.data.sentTo).toBe('billing@pizza.test');
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
        restaurantPayoutAmount: 950,
        currency: 'PKR',
      },
    });
  });
});
