import { Injectable } from '@nestjs/common';
import {
  GeneratedInvoiceKind,
  PaymentStatus,
  Prisma,
  SubscriptionDeductionStatus,
  SubscriptionDeductionType,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database';
import {
  ListPackagePlansDto,
  ListSubscriptionDeductionsDto,
  ListTenantSubscriptionsDto,
  MonthlyInvoiceDatevExportQueryDto,
} from './dto';

@Injectable()
export class PackagePlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  createPlan(data: Prisma.PackagePlanCreateInput) {
    return this.prisma.packagePlan.create({ data });
  }

  updatePlan(id: string, data: Prisma.PackagePlanUpdateInput) {
    return this.prisma.packagePlan.update({ where: { id }, data });
  }

  findPlanById(id: string) {
    return this.prisma.packagePlan.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async listPlans(query: ListPackagePlansDto) {
    const where: Prisma.PackagePlanWhereInput = {
      ...(query.withDeleted ? {} : { deletedAt: null }),
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.billingModel ? { billingModel: query.billingModel } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.packagePlan.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
      }),
      this.prisma.packagePlan.count({ where }),
    ]);

    return { items, total };
  }

  async listPublicPlans(query: ListPackagePlansDto) {
    const where: Prisma.PackagePlanWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(query.billingModel ? { billingModel: query.billingModel } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.packagePlan.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [
          { isDefault: 'desc' },
          {
            [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
          },
        ],
        select: {
          id: true,
          name: true,
          description: true,
          billingModel: true,
          billingInterval: true,
          planPrice: true,
          commissionType: true,
          commissionPercentage: true,
          commissionFixedAmount: true,
          commissionCapAmount: true,
          vatPercentage: true,
          payoutCycle: true,
          termsDocumentUrl: true,
          currency: true,
          trialDays: true,
          features: true,
          isDefault: true,
        },
      }),
      this.prisma.packagePlan.count({ where }),
    ]);

    return { items, total };
  }

  clearDefaultPlans(exceptPlanId?: string) {
    return this.prisma.packagePlan.updateMany({
      where: {
        isDefault: true,
        ...(exceptPlanId ? { id: { not: exceptPlanId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  findTenantById(id: string) {
    return this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
  }

  findRestaurantById(id: string, tenantId: string) {
    return this.prisma.restaurant.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
  }

  createDeduction(data: Prisma.SubscriptionDeductionCreateInput) {
    return this.prisma.subscriptionDeduction.create({ data });
  }

  updateDeduction(id: string, data: Prisma.SubscriptionDeductionUpdateInput) {
    return this.prisma.subscriptionDeduction.update({ where: { id }, data });
  }

  findDeductionById(id: string) {
    return this.prisma.subscriptionDeduction.findUnique({ where: { id } });
  }

  async listDeductions(query: ListSubscriptionDeductionsDto) {
    const where: Prisma.SubscriptionDeductionWhereInput = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.subscriptionId ? { subscriptionId: query.subscriptionId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.direction ? { direction: query.direction } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.moduleCode
        ? { moduleCode: query.moduleCode.trim().toUpperCase() }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.subscriptionDeduction.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
      }),
      this.prisma.subscriptionDeduction.count({ where }),
    ]);

    return { items, total };
  }

  listApplicableDeductions(
    subscription: {
      id: string;
      tenantId: string;
      restaurantId: string | null;
    },
    periodTo: Date,
  ) {
    return this.prisma.subscriptionDeduction.findMany({
      where: {
        tenantId: subscription.tenantId,
        status: SubscriptionDeductionStatus.ACTIVE,
        OR: [
          { subscriptionId: subscription.id },
          {
            subscriptionId: null,
            restaurantId: subscription.restaurantId,
          },
          {
            subscriptionId: null,
            restaurantId: null,
          },
        ],
        AND: [
          {
            OR: [{ appliesFrom: null }, { appliesFrom: { lte: periodTo } }],
          },
          {
            OR: [
              { type: SubscriptionDeductionType.RECURRING },
              {
                type: SubscriptionDeductionType.ONE_TIME,
                appliedAt: null,
              },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  markOneTimeDeductionsApplied(ids: string[], appliedAt: Date) {
    if (!ids.length) {
      return Promise.resolve({ count: 0 });
    }

    return this.prisma.subscriptionDeduction.updateMany({
      where: {
        id: { in: ids },
        type: SubscriptionDeductionType.ONE_TIME,
        status: SubscriptionDeductionStatus.ACTIVE,
      },
      data: {
        status: SubscriptionDeductionStatus.APPLIED,
        appliedAt,
      },
    });
  }

  listMonthlyGeneratedInvoices(query: MonthlyInvoiceDatevExportQueryDto) {
    const from = new Date(Date.UTC(query.year, query.month - 1, 1));
    const to = new Date(Date.UTC(query.year, query.month, 1));

    return this.prisma.generatedInvoice.findMany({
      where: {
        createdAt: { gte: from, lt: to },
        kind: {
          in: [GeneratedInvoiceKind.ORDER, GeneratedInvoiceKind.SUBSCRIPTION],
        },
        ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { invoiceNumber: 'asc' }],
    });
  }

  findActiveSubscription(tenantId: string, restaurantId?: string | null) {
    return this.prisma.tenantSubscription.findFirst({
      where: {
        tenantId,
        restaurantId: restaurantId ?? null,
        status: {
          in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE],
        },
      },
      include: this.subscriptionInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  createSubscription(data: Prisma.TenantSubscriptionCreateInput) {
    return this.prisma.tenantSubscription.create({
      data,
      include: this.subscriptionInclude,
    });
  }

  updateSubscription(id: string, data: Prisma.TenantSubscriptionUpdateInput) {
    return this.prisma.tenantSubscription.update({
      where: { id },
      data,
      include: this.subscriptionInclude,
    });
  }

  findSubscriptionById(id: string) {
    return this.prisma.tenantSubscription.findUnique({
      where: { id },
      include: this.subscriptionInclude,
    });
  }

  listDueSubscriptions(now: Date) {
    return this.prisma.tenantSubscription.findMany({
      where: {
        nextBillingAt: { lte: now },
        status: {
          in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE],
        },
      },
      include: this.subscriptionInclude,
      orderBy: [{ nextBillingAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  listActiveRestaurantSubscriptionsForPayouts() {
    return this.prisma.tenantSubscription.findMany({
      where: {
        restaurantId: { not: null },
        status: {
          in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE],
        },
      },
      include: this.subscriptionInclude,
      orderBy: [{ restaurantId: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findActiveRestaurantSubscription(restaurantId: string) {
    return this.prisma.tenantSubscription.findFirst({
      where: {
        restaurantId,
        status: {
          in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE],
        },
      },
      include: this.subscriptionInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  findRestaurantPayoutScope(restaurantId: string) {
    return this.prisma.restaurant.findFirst({
      where: { id: restaurantId, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        name: true,
        slug: true,
        supportContact: true,
        settings: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            owner: { select: { email: true } },
          },
        },
      },
    });
  }

  listPaidRestaurantOrders(restaurantId: string, fromDate: Date, toDate: Date) {
    return this.prisma.order.findMany({
      where: {
        restaurantId,
        paymentStatus: PaymentStatus.PAID,
        paidAt: {
          gte: fromDate,
          lt: toDate,
        },
      },
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        branchId: true,
        orderType: true,
        paymentMethod: true,
        paymentStatus: true,
        subtotal: true,
        taxAmount: true,
        deliveryFee: true,
        serviceChargeAmount: true,
        tipAmount: true,
        discountAmount: true,
        walletAppliedAmount: true,
        loyaltyDiscountAmount: true,
        totalAmount: true,
        paidAt: true,
        createdAt: true,
        branch: { select: { id: true, name: true } },
        transactions: {
          where: { status: PaymentStatus.PAID },
          orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            amount: true,
            currency: true,
            paymentMethod: true,
            providerRef: true,
            processedAt: true,
          },
        },
      },
    });
  }

  listRestaurantSpecialPayoutInvoices(restaurantId: string) {
    return this.prisma.generatedInvoice.findMany({
      where: {
        kind: GeneratedInvoiceKind.WEEKLY_PAYOUT,
        restaurantId,
        sourceKey: { contains: ':special:' },
      },
      select: {
        id: true,
        sourceKey: true,
        snapshot: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listSubscriptions(query: ListTenantSubscriptionsDto) {
    const where: Prisma.TenantSubscriptionWhereInput = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              {
                tenant: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                restaurant: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                packagePlan: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantSubscription.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
        include: this.subscriptionInclude,
      }),
      this.prisma.tenantSubscription.count({ where }),
    ]);

    return { items, total };
  }

  countActiveSubscriptionsByPlan(packagePlanId: string) {
    return this.prisma.tenantSubscription.count({
      where: {
        packagePlanId,
        status: {
          in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE],
        },
      },
    });
  }

  private readonly subscriptionInclude = {
    tenant: {
      select: {
        id: true,
        name: true,
        slug: true,
        owner: { select: { email: true } },
      },
    },
    restaurant: {
      select: {
        id: true,
        name: true,
        slug: true,
        supportContact: true,
        settings: true,
      },
    },
    packagePlan: true,
  } satisfies Prisma.TenantSubscriptionInclude;
}
