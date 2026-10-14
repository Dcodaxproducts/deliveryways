import { ConflictException, Injectable } from '@nestjs/common';
import {
  GeneratedInvoiceKind,
  GeneratedInvoiceStatus,
  OrderStatus,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  RestaurantWalletTransactionType,
  SubscriptionDeductionStatus,
  SubscriptionDeductionType,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database';
import { SUCCESSFUL_ORDER_STATUSES } from '../../common/utils/successful-order-statuses';
import { FinancialLedgerRepository } from '../financial-ledger';
import {
  ListPackagePlansDto,
  ListSubscriptionDeductionsDto,
  ListTenantSubscriptionsDto,
  MonthlyInvoiceDatevExportQueryDto,
} from './dto';

@Injectable()
export class PackagePlansRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financialLedgerRepository: FinancialLedgerRepository,
  ) {}

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

    const operationKey = `subscription-wallet-settlement:${input.tenantId}:${input.restaurantId}:${input.settlementKey}`;
    const requestHash = FinancialLedgerRepository.createCanonicalRequestHash({
      tenantId: input.tenantId,
      restaurantId: input.restaurantId,
      subscriptionId: input.subscriptionId,
      settlementKey: input.settlementKey,
      invoiceNumber: input.invoiceNumber,
      amountDue: amountDue.toFixed(2),
      currency: input.currency,
      periodFrom: input.periodFrom.toISOString(),
      periodTo: input.periodTo.toISOString(),
    });

    return this.financialLedgerRepository.withFinancialLedgerTransaction(
      [
        {
          tenantId: input.tenantId,
          restaurantId: input.restaurantId,
          accountKind: 'RESTAURANT_WALLET',
        },
      ],
      async (tx) => {
        const existing = await tx.restaurantWalletTransaction.findUnique({
          where: { subscriptionInvoiceKey: input.settlementKey },
        });
        const wallet = await tx.restaurantWalletAccount.findUnique({
          where: { restaurantId: input.restaurantId },
        });
        if (
          existing &&
          existing.idempotencyKey !==
            FinancialLedgerRepository.createOperationKey(operationKey)
        ) {
          const metadata =
            existing.metadata &&
            !Array.isArray(existing.metadata) &&
            typeof existing.metadata === 'object'
              ? existing.metadata
              : {};
          const identityMatches =
            existing.tenantId === input.tenantId &&
            existing.restaurantId === input.restaurantId &&
            existing.currency === input.currency &&
            existing.type === RestaurantWalletTransactionType.ADJUSTMENT &&
            existing.amount.isNegative() &&
            existing.amount.abs().equals(amountDue) &&
            metadata.source === 'PACKAGE_PLAN_SUBSCRIPTION_SETTLEMENT' &&
            metadata.target === 'TENANT_SUBSCRIPTION' &&
            metadata.subscriptionId === input.subscriptionId &&
            metadata.invoiceNumber === input.invoiceNumber &&
            metadata.periodFrom === input.periodFrom.toISOString() &&
            metadata.periodTo === input.periodTo.toISOString();
          if (!identityMatches) {
            throw new ConflictException(
              'Subscription settlement key conflicts with immutable invoice identity',
            );
          }
          const adopted = await tx.restaurantWalletTransaction.update({
            where: { id: existing.id },
            data: {
              idempotencyKey:
                FinancialLedgerRepository.createOperationKey(operationKey),
              requestHash,
            },
          });
          return {
            appliedAmount: adopted.amount.abs().toDecimalPlaces(2),
            balanceAfter: adopted.balanceAfter,
            walletAccountId: adopted.walletAccountId,
            walletTransactionId: adopted.id,
          };
        }
        if (existing) {
          const replay =
            await this.financialLedgerRepository.applyRestaurantWalletDelta(
              {
                tenantId: input.tenantId,
                restaurantId: input.restaurantId,
                operationKey,
                requestHash,
                allowNegative: false,
                source: 'PACKAGE_PLAN_SUBSCRIPTION_SETTLEMENT',
                delta: existing.amount,
                currency: input.currency,
                type: RestaurantWalletTransactionType.ADJUSTMENT,
                subscriptionInvoiceKey: input.settlementKey,
                createdBy: input.createdBy,
              },
              tx,
            );
          return {
            appliedAmount: replay.transaction.amount.abs().toDecimalPlaces(2),
            balanceAfter: replay.transaction.balanceAfter,
            walletAccountId: replay.transaction.walletAccountId,
            walletTransactionId: replay.transaction.id,
          };
        }
        if (
          !wallet ||
          wallet.tenantId !== input.tenantId ||
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
        const result =
          await this.financialLedgerRepository.applyRestaurantWalletDelta(
            {
              tenantId: input.tenantId,
              restaurantId: input.restaurantId,
              operationKey,
              requestHash,
              allowNegative: false,
              source: 'PACKAGE_PLAN_SUBSCRIPTION_SETTLEMENT',
              delta: appliedAmount.negated(),
              currency: input.currency,
              type: RestaurantWalletTransactionType.ADJUSTMENT,
              subscriptionInvoiceKey: input.settlementKey,
              note: 'FeastFlow subscription invoice settled from restaurant wallet',
              metadata: {
                target: 'TENANT_SUBSCRIPTION',
                subscriptionId: input.subscriptionId,
                invoiceNumber: input.invoiceNumber,
                periodFrom: input.periodFrom.toISOString(),
                periodTo: input.periodTo.toISOString(),
                invoiceAmountDue: amountDue.toFixed(2),
                currency: input.currency,
              },
              createdBy: input.createdBy,
            },
            tx,
          );
        return {
          appliedAmount,
          balanceAfter: result.transaction.balanceAfter,
          walletAccountId: result.transaction.walletAccountId,
          walletTransactionId: result.transaction.id,
        };
      },
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

  /** PostgreSQL reduces full payout history before rows cross into Node.js. */
  getRestaurantPayoutAvailabilityAggregates(
    restaurantId: string,
    periodFrom: Date,
    periodTo: Date,
    fixedCommissionAmount: Prisma.Decimal,
    commissionPercentage: Prisma.Decimal,
  ) {
    return this.prisma.$queryRaw<
      Array<{
        billingMonth: string;
        ordersCount: bigint;
        totalOrderAmount: Prisma.Decimal;
        platformCollectedAmount: Prisma.Decimal;
        restaurantTransactionFeeAmount: Prisma.Decimal;
        fixedCommissionAmount: Prisma.Decimal;
        periodOrdersCount: bigint;
        periodTotalOrderAmount: Prisma.Decimal;
        periodPlatformCollectedAmount: Prisma.Decimal;
        periodRestaurantTransactionFeeAmount: Prisma.Decimal;
        periodFixedCommissionAmount: Prisma.Decimal;
        periodPercentageCommissionAmount: Prisma.Decimal;
      }>
    >(Prisma.sql`
      WITH transaction_totals AS (
        SELECT pt."order_id",
               COALESCE(SUM(CASE WHEN pt."type" = 'REFUND' THEN -pt."amount" ELSE pt."amount" END), 0)::numeric AS net_collected
        FROM "payment_transactions" pt
        WHERE pt."restaurant_id" = ${restaurantId}
          AND ((pt."type" = 'CHARGE' AND pt."status" = 'PAID')
            OR (pt."type" = 'REFUND' AND pt."status" = 'REFUNDED'))
          AND pt."order_id" IS NOT NULL
        GROUP BY pt."order_id"
      ), eligible_orders AS (
        SELECT COALESCE(o."paid_at", o."created_at") AS occurred_at,
               CASE WHEN o."payment_method" IN ('COD', 'CARD_ON_DELIVERY', 'WALLET')
                 THEN o."total_amount"
                 ELSE GREATEST(LEAST(o."total_amount", COALESCE(tt.net_collected, 0)), 0)
               END::numeric AS commissionable_amount,
               CASE WHEN o."payment_method" IN ('COD', 'CARD_ON_DELIVERY', 'WALLET')
                 THEN 0 ELSE GREATEST(COALESCE(tt.net_collected, 0), 0)
               END::numeric AS platform_collected_amount,
               CASE WHEN o."transaction_fee_payer" = 'RESTAURANT'
                 THEN o."transaction_fee_amount" ELSE 0
               END::numeric AS restaurant_transaction_fee_amount,
               LEAST(${fixedCommissionAmount}, CASE
                 WHEN o."payment_method" IN ('COD', 'CARD_ON_DELIVERY', 'WALLET') THEN o."total_amount"
                 ELSE GREATEST(LEAST(o."total_amount", COALESCE(tt.net_collected, 0)), 0)
               END)::numeric AS fixed_commission_amount,
               ROUND((CASE
                 WHEN o."payment_method" IN ('COD', 'CARD_ON_DELIVERY', 'WALLET') THEN o."total_amount"
                 ELSE GREATEST(LEAST(o."total_amount", COALESCE(tt.net_collected, 0)), 0)
               END) * ${commissionPercentage} / 100, 2)::numeric AS percentage_commission_amount
        FROM "orders" o
        LEFT JOIN transaction_totals tt ON tt."order_id" = o."id"
        WHERE o."restaurant_id" = ${restaurantId}
          AND o."status" IN (
            'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'PICKED_UP',
            'READY_TO_SERVE', 'SERVED', 'OUT_FOR_DELIVERY', 'DELIVERED'
          )
      )
      SELECT to_char(date_trunc('month', occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS "billingMonth",
             COUNT(*)::bigint AS "ordersCount",
             COALESCE(SUM(commissionable_amount), 0)::numeric AS "totalOrderAmount",
             COALESCE(SUM(platform_collected_amount), 0)::numeric AS "platformCollectedAmount",
             COALESCE(SUM(restaurant_transaction_fee_amount), 0)::numeric AS "restaurantTransactionFeeAmount",
             COALESCE(SUM(fixed_commission_amount), 0)::numeric AS "fixedCommissionAmount",
             COUNT(*) FILTER (WHERE occurred_at >= ${periodFrom} AND occurred_at < ${periodTo})::bigint AS "periodOrdersCount",
             COALESCE(SUM(commissionable_amount) FILTER (WHERE occurred_at >= ${periodFrom} AND occurred_at < ${periodTo}), 0)::numeric AS "periodTotalOrderAmount",
             COALESCE(SUM(platform_collected_amount) FILTER (WHERE occurred_at >= ${periodFrom} AND occurred_at < ${periodTo}), 0)::numeric AS "periodPlatformCollectedAmount",
             COALESCE(SUM(restaurant_transaction_fee_amount) FILTER (WHERE occurred_at >= ${periodFrom} AND occurred_at < ${periodTo}), 0)::numeric AS "periodRestaurantTransactionFeeAmount",
             COALESCE(SUM(fixed_commission_amount) FILTER (WHERE occurred_at >= ${periodFrom} AND occurred_at < ${periodTo}), 0)::numeric AS "periodFixedCommissionAmount",
             COALESCE(SUM(percentage_commission_amount) FILTER (WHERE occurred_at >= ${periodFrom} AND occurred_at < ${periodTo}), 0)::numeric AS "periodPercentageCommissionAmount"
      FROM eligible_orders
      GROUP BY date_trunc('month', occurred_at AT TIME ZONE 'UTC')
      ORDER BY date_trunc('month', occurred_at AT TIME ZONE 'UTC')
    `);
  }

  getRestaurantSpecialPayoutAggregates(
    restaurantId: string,
    periodFrom: Date,
    periodTo: Date,
  ) {
    return this.prisma.$queryRaw<
      Array<{
        totalAmount: Prisma.Decimal;
        periodAmount: Prisma.Decimal;
      }>
    >(Prisma.sql`
      SELECT COALESCE(SUM((line.item->>'restaurantPayoutAmount')::numeric), 0)::numeric AS "totalAmount",
             COALESCE(SUM((line.item->>'restaurantPayoutAmount')::numeric) FILTER (
               WHERE NULLIF(line.item->>'paidAt', '')::timestamptz >= ${periodFrom}
                 AND NULLIF(line.item->>'paidAt', '')::timestamptz < ${periodTo}
             ), 0)::numeric AS "periodAmount"
      FROM "generated_invoices" gi
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(gi."snapshot"->'lineItems') = 'array'
          THEN gi."snapshot"->'lineItems' ELSE '[]'::jsonb END
      ) line(item)
      WHERE gi."kind" = 'WEEKLY_PAYOUT'
        AND gi."restaurant_id" = ${restaurantId}
        AND gi."source_key" LIKE '%:special:%'
        AND line.item ? 'restaurantPayoutAmount'
    `);
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

  listRestaurantPayoutInvoicesForRange(
    restaurantId: string,
    rangeFrom: Date,
    rangeTo: Date,
    excludeSourceKey?: string,
  ) {
    return this.prisma.generatedInvoice.findMany({
      where: {
        kind: GeneratedInvoiceKind.WEEKLY_PAYOUT,
        status: GeneratedInvoiceStatus.SENT,
        restaurantId,
        periodFrom: { lt: rangeTo },
        periodTo: { gt: rangeFrom },
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
