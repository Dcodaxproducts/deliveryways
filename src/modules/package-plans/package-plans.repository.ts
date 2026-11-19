import { Injectable } from '@nestjs/common';
import {
  GeneratedInvoiceEventType,
  GeneratedInvoiceKind,
  GeneratedInvoiceStatus,
  OrderStatus,
  PaymentStatus,
  PaymentTransactionType,
  PackageBillingModel,
  PackageCommissionType,
  Prisma,
  RestaurantWalletTransactionType,
  SubscriptionDeductionStatus,
  SubscriptionDeductionType,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database';
import { SUCCESSFUL_ORDER_STATUSES } from '../../common/utils/successful-order-statuses';
import {
  allocateMonthlyCommission,
  allocateMonthlyFee,
} from './payout-accounting';
import {
  ListPackagePlansDto,
  ListSubscriptionDeductionsDto,
  ListTenantSubscriptionsDto,
  MonthlyInvoiceDatevExportQueryDto,
} from './dto';

class WalletSettlementConflictError extends Error {}

export interface MonthlyPayoutAllocationInput {
  tenantId: string;
  restaurantId: string;
  subscriptionId: string;
  localMonth: string;
  timezone: string;
  currency: string;
  sourceKey: string;
  grossCommissionableAmount: Prisma.Decimal;
  commissionableOrderCount: number;
  availablePayoutAmount: Prisma.Decimal;
  availableForMonthlyFeeAmount: Prisma.Decimal;
  packagePlanId: string;
  billingModel: PackageBillingModel;
  commissionType: PackageCommissionType;
  commissionCapAmount: Prisma.Decimal | null;
  commissionPercentage: Prisma.Decimal;
  commissionFixedAmount: Prisma.Decimal;
  vatPercentage: Prisma.Decimal;
  monthlyFeeAmount: Prisma.Decimal;
  snapshotHash: string;
  expectedCommissionAmount: Prisma.Decimal;
  expectedMonthlyFeeAmount: Prisma.Decimal;
  generatedInvoiceId?: string;
  isSpecialPayout?: boolean;
}

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

  async listPublicPlans(
    query: ListPackagePlansDto,
    selectedPlanIds: string[] | null = null,
  ) {
    const usesExplicitSelection = query.landingOnly && selectedPlanIds !== null;
    const where: Prisma.PackagePlanWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(usesExplicitSelection
        ? { id: { in: selectedPlanIds } }
        : query.landingOnly
          ? { showOnLanding: true }
          : {}),
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
        ...(usesExplicitSelection
          ? {}
          : {
              skip: (query.page - 1) * query.limit,
              take: query.limit,
            }),
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
          showOnLanding: true,
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

  async settleSubscriptionInvoiceFromWallet(input: {
    tenantId: string;
    restaurantId: string;
    subscriptionId: string;
    settlementKey: string;
    invoiceNumber: string;
    amountDue: Prisma.Decimal;
    currency: string;
    periodFrom: Date;
    periodTo: Date;
    createdBy: string;
  }) {
    const amountDue = input.amountDue.toDecimalPlaces(2);
    if (amountDue.lessThanOrEqualTo(0)) {
      return this.emptyWalletSettlement();
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const existing = await tx.restaurantWalletTransaction.findUnique({
            where: { subscriptionInvoiceKey: input.settlementKey },
          });

          if (existing) {
            return {
              appliedAmount: existing.amount.abs().toDecimalPlaces(2),
              balanceAfter: existing.balanceAfter,
              walletAccountId: existing.walletAccountId,
              walletTransactionId: existing.id,
            };
          }

          const wallet = await tx.restaurantWalletAccount.findUnique({
            where: { restaurantId: input.restaurantId },
          });

          if (
            !wallet ||
            wallet.currency !== input.currency ||
            wallet.balance.lessThanOrEqualTo(0)
          ) {
            return {
              ...this.emptyWalletSettlement(),
              balanceAfter: wallet?.balance ?? null,
              walletAccountId: wallet?.id ?? null,
            };
          }

          const appliedAmount = Prisma.Decimal.min(
            wallet.balance.toDecimalPlaces(2),
            amountDue,
          ).toDecimalPlaces(2);
          const balanceAfter = wallet.balance
            .minus(appliedAmount)
            .toDecimalPlaces(2);
          const updated = await tx.restaurantWalletAccount.updateMany({
            where: {
              id: wallet.id,
              balance: wallet.balance,
              currency: input.currency,
            },
            data: { balance: { decrement: appliedAmount } },
          });

          if (updated.count !== 1) {
            throw new WalletSettlementConflictError();
          }

          const walletTransaction = await tx.restaurantWalletTransaction.create(
            {
              data: {
                walletAccountId: wallet.id,
                tenantId: input.tenantId,
                restaurantId: input.restaurantId,
                subscriptionInvoiceKey: input.settlementKey,
                type: RestaurantWalletTransactionType.ADJUSTMENT,
                amount: appliedAmount.negated(),
                balanceAfter,
                currency: input.currency,
                note: 'DeliveryWays subscription invoice settled from restaurant wallet',
                metadata: {
                  target: 'TENANT_SUBSCRIPTION',
                  subscriptionId: input.subscriptionId,
                  invoiceNumber: input.invoiceNumber,
                  periodFrom: input.periodFrom.toISOString(),
                  periodTo: input.periodTo.toISOString(),
                } as Prisma.InputJsonValue,
                createdBy: input.createdBy,
              },
            },
          );

          return {
            appliedAmount,
            balanceAfter,
            walletAccountId: wallet.id,
            walletTransactionId: walletTransaction.id,
          };
        });
      } catch (error) {
        if (this.isPrismaError(error, 'P2002')) {
          const existing =
            await this.prisma.restaurantWalletTransaction.findUnique({
              where: { subscriptionInvoiceKey: input.settlementKey },
            });
          if (existing) {
            return {
              appliedAmount: existing.amount.abs().toDecimalPlaces(2),
              balanceAfter: existing.balanceAfter,
              walletAccountId: existing.walletAccountId,
              walletTransactionId: existing.id,
            };
          }
        }

        if (
          error instanceof WalletSettlementConflictError ||
          this.isPrismaError(error, 'P2034')
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new WalletSettlementConflictError(
      'Restaurant wallet balance changed during subscription settlement',
    );
  }

  private emptyWalletSettlement() {
    return {
      appliedAmount: new Prisma.Decimal(0),
      balanceAfter: null as Prisma.Decimal | null,
      walletAccountId: null as string | null,
      walletTransactionId: null as string | null,
    };
  }

  private isPrismaError(error: unknown, code: string) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
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

  listPaidRestaurantOrders(
    restaurantId: string,
    fromDate: Date,
    toDate: Date,
    recognizeConfirmedOrders = false,
  ) {
    return this.prisma.order.findMany({
      where: {
        restaurantId,
        ...(recognizeConfirmedOrders
          ? {
              status: {
                in: [
                  OrderStatus.CONFIRMED,
                  OrderStatus.PREPARING,
                  OrderStatus.READY_FOR_PICKUP,
                  OrderStatus.PICKED_UP,
                  OrderStatus.READY_TO_SERVE,
                  OrderStatus.SERVED,
                  OrderStatus.OUT_FOR_DELIVERY,
                  OrderStatus.DELIVERED,
                ],
              },
              createdAt: { gte: fromDate, lt: toDate },
            }
          : {
              paymentStatus: PaymentStatus.PAID,
              paidAt: { gte: fromDate, lt: toDate },
            }),
      },
      orderBy: recognizeConfirmedOrders
        ? [{ createdAt: 'asc' }]
        : [{ paidAt: 'asc' }, { createdAt: 'asc' }],
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
        transactionFeeAmount: true,
        transactionFeePayer: true,
        tipAmount: true,
        discountAmount: true,
        walletAppliedAmount: true,
        loyaltyDiscountAmount: true,
        totalAmount: true,
        paidAt: true,
        createdAt: true,
        branch: { select: { id: true, name: true } },
        transactions: {
          where: {
            OR: [
              {
                type: PaymentTransactionType.CHARGE,
                status: PaymentStatus.PAID,
              },
              {
                type: PaymentTransactionType.REFUND,
                status: PaymentStatus.REFUNDED,
              },
            ],
          },
          orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            type: true,
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

  listSubscriptionPayoutActivity(
    tenantId: string,
    restaurantId: string,
    fromDate: Date,
    toDate: Date,
  ) {
    const occurredDuringPeriod = { gte: fromDate, lt: toDate };

    return this.prisma.restaurantPayoutRequest.findMany({
      where: {
        tenantId,
        restaurantId,
        OR: [
          { createdAt: occurredDuringPeriod },
          { approvedAt: occurredDuringPeriod },
          { rejectedAt: occurredDuringPeriod },
          { paidAt: occurredDuringPeriod },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        branchId: true,
        status: true,
        amount: true,
        currency: true,
        note: true,
        rejectionReason: true,
        approvalNote: true,
        paymentReference: true,
        paidNote: true,
        createdAt: true,
        approvedAt: true,
        rejectedAt: true,
        paidAt: true,
      },
    });
  }

  listRestaurantWalletPayoutOrders(restaurantId: string) {
    return this.prisma.order.findMany({
      where: {
        restaurantId,
        status: { in: SUCCESSFUL_ORDER_STATUSES },
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
        transactionFeeAmount: true,
        transactionFeePayer: true,
        tipAmount: true,
        discountAmount: true,
        walletAppliedAmount: true,
        loyaltyDiscountAmount: true,
        totalAmount: true,
        paidAt: true,
        createdAt: true,
        branch: { select: { id: true, name: true } },
        transactions: {
          where: {
            OR: [
              {
                type: PaymentTransactionType.CHARGE,
                status: PaymentStatus.PAID,
              },
              {
                type: PaymentTransactionType.REFUND,
                status: PaymentStatus.REFUNDED,
              },
            ],
          },
          orderBy: [{ processedAt: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            type: true,
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

  findRestaurantWalletAccount(restaurantId: string) {
    return this.prisma.restaurantWalletAccount.findUnique({
      where: { restaurantId },
      select: { balance: true, currency: true },
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

  findFinalizedPayoutInvoice(sourceKey: string) {
    return this.prisma.generatedInvoice.findFirst({
      where: {
        kind: GeneratedInvoiceKind.WEEKLY_PAYOUT,
        status: GeneratedInvoiceStatus.SENT,
        sourceKey,
      },
      select: {
        id: true,
        invoiceNumber: true,
        snapshot: true,
      },
    });
  }

  listRestaurantMonthlyPayoutInvoices(
    restaurantId: string,
    monthFrom: Date,
    monthTo: Date,
    excludeSourceKey?: string,
  ) {
    return this.prisma.generatedInvoice.findMany({
      where: {
        kind: GeneratedInvoiceKind.WEEKLY_PAYOUT,
        status: GeneratedInvoiceStatus.SENT,
        restaurantId,
        periodFrom: { lt: monthTo },
        periodTo: { gt: monthFrom },
        ...(excludeSourceKey ? { sourceKey: { not: excludeSourceKey } } : {}),
      },
      select: {
        id: true,
        sourceKey: true,
        periodFrom: true,
        periodTo: true,
        snapshot: true,
      },
      orderBy: [{ periodFrom: 'asc' }, { createdAt: 'asc' }],
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

  async allocateMonthlyPayout(input: MonthlyPayoutAllocationInput) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.restaurantPayoutAllocation.findUnique({
              where: { sourceKey: input.sourceKey },
            });
            if (existing) return existing;
            const subscription = await tx.tenantSubscription.findFirst({
              where: {
                id: input.subscriptionId,
                tenantId: input.tenantId,
                restaurantId: input.restaurantId,
                packagePlanId: input.packagePlanId,
              },
              select: { id: true },
            });
            if (!subscription) {
              throw new WalletSettlementConflictError(
                'Payout subscription does not belong to restaurant and tenant',
              );
            }
            const ledger = await tx.restaurantPayoutMonthlyLedger.upsert({
              where: {
                restaurantId_subscriptionId_localMonth: {
                  restaurantId: input.restaurantId,
                  subscriptionId: input.subscriptionId,
                  localMonth: input.localMonth,
                },
              },
              create: {
                tenantId: input.tenantId,
                restaurantId: input.restaurantId,
                subscriptionId: input.subscriptionId,
                localMonth: input.localMonth,
                timezone: input.timezone,
                currency: input.currency,
                packagePlanId: input.packagePlanId,
                billingModel: input.billingModel,
                commissionType: input.commissionType,
                commissionPercentage: input.commissionPercentage,
                commissionFixedAmount: input.commissionFixedAmount,
                commissionCapAmount: input.commissionCapAmount,
                vatPercentage: input.vatPercentage,
                monthlyFeeAmount: input.monthlyFeeAmount,
                monthlyFeeOutstandingAmount: input.monthlyFeeAmount,
              },
              update: {},
            });
            if (ledger.finalizedAt)
              throw new WalletSettlementConflictError(
                'Payout month is finalized and immutable',
              );
            const sequence =
              (await tx.restaurantPayoutAllocation.count({
                where: { ledgerId: ledger.id },
              })) + 1;
            const feePayoutCount = await tx.restaurantPayoutAllocation.count({
              where: {
                ledgerId: ledger.id,
                monthlyFeeAmount: { gt: 0 },
              },
            });
            const commissionAmount = input.isSpecialPayout
              ? new Prisma.Decimal(0)
              : allocateMonthlyCommission({
                  grossAmount: input.grossCommissionableAmount,
                  allocatedBefore: ledger.commissionAllocatedAmount,
                  commissionType: ledger.commissionType,
                  capAmount: ledger.commissionCapAmount,
                  percentage: ledger.commissionPercentage,
                  fixedAmount: ledger.commissionFixedAmount,
                  commissionUnits: input.commissionableOrderCount,
                });
            const monthlyFeeAmount = input.isSpecialPayout
              ? new Prisma.Decimal(0)
              : allocateMonthlyFee({
                  payoutSequence: feePayoutCount + 1,
                  allocatedBefore: ledger.monthlyFeeAllocatedAmount,
                  availableAfterOtherDeductions:
                    input.availableForMonthlyFeeAmount,
                  monthlyFee: ledger.monthlyFeeAmount,
                });
            if (
              !commissionAmount.equals(input.expectedCommissionAmount) ||
              !monthlyFeeAmount.equals(input.expectedMonthlyFeeAmount)
            ) {
              throw new WalletSettlementConflictError(
                'Payout invoice totals do not match canonical ledger allocation',
              );
            }
            const allocation = await tx.restaurantPayoutAllocation.create({
              data: {
                ledgerId: ledger.id,
                generatedInvoiceId: input.generatedInvoiceId,
                sourceKey: input.sourceKey,
                sequence,
                commissionAmount,
                monthlyFeeAmount,
                availablePayoutAmount: input.availablePayoutAmount,
                isSpecialPayout: input.isSpecialPayout ?? false,
                snapshotHash: input.snapshotHash,
              },
            });
            const monthlyFeeAllocatedAmount =
              ledger.monthlyFeeAllocatedAmount.plus(monthlyFeeAmount);
            await tx.restaurantPayoutMonthlyLedger.update({
              where: { id: ledger.id },
              data: {
                commissionAllocatedAmount:
                  ledger.commissionAllocatedAmount.plus(commissionAmount),
                monthlyFeeAllocatedAmount,
                monthlyFeeOutstandingAmount: Prisma.Decimal.max(
                  ledger.monthlyFeeAmount.minus(monthlyFeeAllocatedAmount),
                  0,
                ),
              },
            });
            return allocation;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (attempt < 2 && this.isPrismaError(error, 'P2034')) continue;
        throw error;
      }
    }
    throw new WalletSettlementConflictError(
      'Payout allocation changed during finalization',
    );
  }

  async finalizePayoutInvoice(input: {
    invoiceNumber: string;
    sourceKey: string;
    tenantId: string;
    restaurantId: string;
    subscriptionId: string | null;
    periodFrom: Date;
    periodTo: Date;
    currency: string;
    totalAmount: Prisma.Decimal;
    snapshot: Prisma.InputJsonValue;
    actorId: string;
    lockToken?: string;
    finalizedAt: Date;
    recipientEmail?: string;
    allocations: MonthlyPayoutAllocationInput[];
  }) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.generatedInvoice.findUnique({
              where: {
                kind_sourceKey: {
                  kind: GeneratedInvoiceKind.WEEKLY_PAYOUT,
                  sourceKey: input.sourceKey,
                },
              },
            });
            if (existing) {
              if (input.lockToken) {
                await tx.restaurantPayoutSchedule.updateMany({
                  where: {
                    restaurantId: input.restaurantId,
                    lockToken: input.lockToken,
                  },
                  data: { lockToken: null, lockExpiresAt: null },
                });
              }
              const outbox = await tx.payoutInvoiceEmailOutbox.findUnique({
                where: { generatedInvoiceId: existing.id },
              });
              return { invoice: existing, outbox, created: false };
            }

            if (input.subscriptionId) {
              const subscription = await tx.tenantSubscription.findFirst({
                where: {
                  id: input.subscriptionId,
                  tenantId: input.tenantId,
                  restaurantId: input.restaurantId,
                },
                select: { id: true },
              });
              if (!subscription) {
                throw new WalletSettlementConflictError(
                  'Payout subscription does not belong to restaurant and tenant',
                );
              }
            }

            const invoice = await tx.generatedInvoice.create({
              data: {
                invoiceNumber: input.invoiceNumber,
                kind: GeneratedInvoiceKind.WEEKLY_PAYOUT,
                status: GeneratedInvoiceStatus.SENT,
                tenantId: input.tenantId,
                restaurantId: input.restaurantId,
                subscriptionId: input.subscriptionId,
                sourceKey: input.sourceKey,
                periodFrom: input.periodFrom,
                periodTo: input.periodTo,
                currency: input.currency,
                totalAmount: input.totalAmount,
                snapshot: input.snapshot,
                generatedById: input.actorId,
              },
            });
            await tx.generatedInvoiceEvent.create({
              data: {
                generatedInvoiceId: invoice.id,
                eventType: GeneratedInvoiceEventType.GENERATED,
                actorId: input.actorId,
                metadata: {
                  sourceKey: input.sourceKey,
                  invoiceNumber: input.invoiceNumber,
                  finalized: true,
                },
              },
            });

            for (const allocation of input.allocations) {
              await this.allocateMonthlyPayoutInTransaction(tx, {
                ...allocation,
                generatedInvoiceId: invoice.id,
              });
            }

            if (input.lockToken) {
              const schedule = await tx.restaurantPayoutSchedule.updateMany({
                where: {
                  restaurantId: input.restaurantId,
                  tenantId: input.tenantId,
                  lockToken: input.lockToken,
                },
                data: {
                  lastFinalizedAt: input.finalizedAt,
                  lockToken: null,
                  lockExpiresAt: null,
                },
              });
              if (schedule.count !== 1) {
                throw new WalletSettlementConflictError(
                  'Payout schedule lock was lost before finalization',
                );
              }
            }

            const outbox = input.recipientEmail
              ? await tx.payoutInvoiceEmailOutbox.create({
                  data: {
                    tenantId: input.tenantId,
                    restaurantId: input.restaurantId,
                    generatedInvoiceId: invoice.id,
                    recipientEmail: input.recipientEmail,
                    actorId: input.actorId,
                  },
                })
              : null;
            return { invoice, outbox, created: true };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (attempt < 2 && this.isPrismaError(error, 'P2034')) continue;
        throw error;
      }
    }
    throw new WalletSettlementConflictError(
      'Payout invoice changed during finalization',
    );
  }

  async claimPayoutInvoiceEmail(generatedInvoiceId: string, claimedAt: Date) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payoutInvoiceEmailOutbox.updateMany({
        where: {
          generatedInvoiceId,
          claimedAt: null,
          sentAt: null,
        },
        data: {
          claimedAt,
          attempts: { increment: 1 },
          lastError: null,
        },
      });
      if (claimed.count !== 1) return null;
      return tx.payoutInvoiceEmailOutbox.findUniqueOrThrow({
        where: { generatedInvoiceId },
      });
    });
  }

  markPayoutInvoiceEmailFailed(outboxId: string, error: string) {
    return this.prisma.payoutInvoiceEmailOutbox.update({
      where: { id: outboxId },
      data: {
        claimedAt: null,
        lastError: error.slice(0, 1000),
      },
    });
  }

  markPayoutInvoiceEmailSent(input: {
    outboxId: string;
    generatedInvoiceId: string;
    recipientEmail: string;
    actorId?: string | null;
    sentAt: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const marked = await tx.payoutInvoiceEmailOutbox.updateMany({
        where: {
          id: input.outboxId,
          generatedInvoiceId: input.generatedInvoiceId,
          claimedAt: { not: null },
          sentAt: null,
        },
        data: { sentAt: input.sentAt },
      });
      if (marked.count !== 1) return false;
      await tx.generatedInvoice.update({
        where: { id: input.generatedInvoiceId },
        data: {
          sentCount: { increment: 1 },
          lastSentAt: input.sentAt,
          lastSentTo: input.recipientEmail,
        },
      });
      await tx.generatedInvoiceEvent.create({
        data: {
          generatedInvoiceId: input.generatedInvoiceId,
          eventType: GeneratedInvoiceEventType.EMAILED,
          actorId: input.actorId,
          recipientEmail: input.recipientEmail,
          metadata: { outboxId: input.outboxId },
        },
      });
      return true;
    });
  }

  private async allocateMonthlyPayoutInTransaction(
    tx: Prisma.TransactionClient,
    input: MonthlyPayoutAllocationInput,
  ) {
    const existing = await tx.restaurantPayoutAllocation.findUnique({
      where: { sourceKey: input.sourceKey },
    });
    if (existing) return existing;
    const subscription = await tx.tenantSubscription.findFirst({
      where: {
        id: input.subscriptionId,
        tenantId: input.tenantId,
        restaurantId: input.restaurantId,
        packagePlanId: input.packagePlanId,
      },
      select: { id: true },
    });
    if (!subscription) {
      throw new WalletSettlementConflictError(
        'Payout subscription does not belong to restaurant and tenant',
      );
    }
    const ledger = await tx.restaurantPayoutMonthlyLedger.upsert({
      where: {
        restaurantId_subscriptionId_localMonth: {
          restaurantId: input.restaurantId,
          subscriptionId: input.subscriptionId,
          localMonth: input.localMonth,
        },
      },
      create: {
        tenantId: input.tenantId,
        restaurantId: input.restaurantId,
        subscriptionId: input.subscriptionId,
        localMonth: input.localMonth,
        timezone: input.timezone,
        currency: input.currency,
        packagePlanId: input.packagePlanId,
        billingModel: input.billingModel,
        commissionType: input.commissionType,
        commissionPercentage: input.commissionPercentage,
        commissionFixedAmount: input.commissionFixedAmount,
        commissionCapAmount: input.commissionCapAmount,
        vatPercentage: input.vatPercentage,
        monthlyFeeAmount: input.monthlyFeeAmount,
        monthlyFeeOutstandingAmount: input.monthlyFeeAmount,
      },
      update: {},
    });
    if (ledger.finalizedAt) {
      throw new WalletSettlementConflictError(
        'Payout month is finalized and immutable',
      );
    }
    const sequence =
      (await tx.restaurantPayoutAllocation.count({
        where: { ledgerId: ledger.id },
      })) + 1;
    const feePayoutCount = await tx.restaurantPayoutAllocation.count({
      where: { ledgerId: ledger.id, monthlyFeeAmount: { gt: 0 } },
    });
    const commissionAmount = input.isSpecialPayout
      ? new Prisma.Decimal(0)
      : allocateMonthlyCommission({
          grossAmount: input.grossCommissionableAmount,
          allocatedBefore: ledger.commissionAllocatedAmount,
          commissionType: ledger.commissionType,
          capAmount: ledger.commissionCapAmount,
          percentage: ledger.commissionPercentage,
          fixedAmount: ledger.commissionFixedAmount,
          commissionUnits: input.commissionableOrderCount,
        });
    const monthlyFeeAmount = input.isSpecialPayout
      ? new Prisma.Decimal(0)
      : allocateMonthlyFee({
          payoutSequence: feePayoutCount + 1,
          allocatedBefore: ledger.monthlyFeeAllocatedAmount,
          availableAfterOtherDeductions: input.availableForMonthlyFeeAmount,
          monthlyFee: ledger.monthlyFeeAmount,
        });
    if (
      !commissionAmount.equals(input.expectedCommissionAmount) ||
      !monthlyFeeAmount.equals(input.expectedMonthlyFeeAmount)
    ) {
      throw new WalletSettlementConflictError(
        'Payout invoice totals do not match canonical ledger allocation',
      );
    }
    const allocation = await tx.restaurantPayoutAllocation.create({
      data: {
        ledgerId: ledger.id,
        generatedInvoiceId: input.generatedInvoiceId,
        sourceKey: input.sourceKey,
        sequence,
        commissionAmount,
        monthlyFeeAmount,
        availablePayoutAmount: input.availablePayoutAmount,
        isSpecialPayout: input.isSpecialPayout ?? false,
        snapshotHash: input.snapshotHash,
      },
    });
    const monthlyFeeAllocatedAmount =
      ledger.monthlyFeeAllocatedAmount.plus(monthlyFeeAmount);
    await tx.restaurantPayoutMonthlyLedger.update({
      where: { id: ledger.id },
      data: {
        commissionAllocatedAmount:
          ledger.commissionAllocatedAmount.plus(commissionAmount),
        monthlyFeeAllocatedAmount,
        monthlyFeeOutstandingAmount: Prisma.Decimal.max(
          ledger.monthlyFeeAmount.minus(monthlyFeeAllocatedAmount),
          0,
        ),
      },
    });
    return allocation;
  }

  finalizePayoutMonth(input: {
    restaurantId: string;
    subscriptionId: string;
    localMonth: string;
    finalizedAt: Date;
  }) {
    return this.prisma.restaurantPayoutMonthlyLedger.updateMany({
      where: {
        restaurantId: input.restaurantId,
        subscriptionId: input.subscriptionId,
        localMonth: input.localMonth,
        finalizedAt: null,
      },
      data: { finalizedAt: input.finalizedAt },
    });
  }

  async acquireRestaurantPayoutSchedule(input: {
    restaurantId: string;
    lockToken: string;
    now: Date;
    lockExpiresAt: Date;
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        const restaurant = await tx.restaurant.findUnique({
          where: { id: input.restaurantId },
          select: { tenantId: true },
        });
        if (!restaurant) {
          throw new WalletSettlementConflictError('Restaurant not found');
        }
        await tx.restaurantPayoutSchedule.upsert({
          where: { restaurantId: input.restaurantId },
          create: {
            restaurantId: input.restaurantId,
            tenantId: restaurant.tenantId,
          },
          update: { tenantId: restaurant.tenantId },
        });
        const claimed = await tx.restaurantPayoutSchedule.updateMany({
          where: {
            restaurantId: input.restaurantId,
            OR: [
              { lockToken: null },
              { lockExpiresAt: null },
              { lockExpiresAt: { lte: input.now } },
            ],
          },
          data: {
            lockToken: input.lockToken,
            lockExpiresAt: input.lockExpiresAt,
          },
        });
        if (claimed.count === 0) return null;
        return tx.restaurantPayoutSchedule.findUniqueOrThrow({
          where: { restaurantId: input.restaurantId },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  finalizeRestaurantPayoutSchedule(input: {
    restaurantId: string;
    lockToken: string;
    finalizedAt: Date;
  }) {
    return this.prisma.restaurantPayoutSchedule.updateMany({
      where: {
        restaurantId: input.restaurantId,
        lockToken: input.lockToken,
      },
      data: {
        lastFinalizedAt: input.finalizedAt,
        lockToken: null,
        lockExpiresAt: null,
      },
    });
  }

  releaseRestaurantPayoutSchedule(restaurantId: string, lockToken: string) {
    return this.prisma.restaurantPayoutSchedule.updateMany({
      where: { restaurantId, lockToken },
      data: { lockToken: null, lockExpiresAt: null },
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
