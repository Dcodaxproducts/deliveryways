import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingInterval,
  PackageBillingModel,
  PackageCommissionType,
  PackagePayoutCycle,
  GeneratedInvoiceEventType,
  GeneratedInvoiceKind,
  GeneratedInvoiceStatus,
  PaymentFeePayer,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  SubscriptionAdjustmentDirection,
  SubscriptionAdjustmentSource,
  SubscriptionDeductionType,
  SubscriptionStatus,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import {
  InvoicePdfBuilder,
  type InvoicePdfSection,
} from '../../common/pdf/invoice-pdf.builder';
import { MailerService } from '../mailer/mailer.service';
import { GlobalSettingsService } from '../global-settings/global-settings.service';
import { InvoiceRecordsService } from '../invoices/invoice-records.service';
import {
  AssignTenantSubscriptionDto,
  CreateSubscriptionDeductionDto,
  CreatePackagePlanDto,
  ListPackagePlansDto,
  ListSubscriptionDeductionsDto,
  ListTenantSubscriptionsDto,
  MonthlyInvoiceDatevExportQueryDto,
  SendTenantSubscriptionInvoiceDto,
  SendWeeklyRestaurantPayoutInvoiceDto,
  UpdatePackagePlanDto,
  UpdateSubscriptionDeductionDto,
  UpdateTenantSubscriptionDto,
  WeeklyRestaurantPayoutInvoiceQueryDto,
} from './dto';
import { PackagePlansRepository } from './package-plans.repository';

type TenantSubscriptionDetails = NonNullable<
  Awaited<ReturnType<PackagePlansRepository['findSubscriptionById']>>
>;
type RestaurantPayoutScope = NonNullable<
  Awaited<ReturnType<PackagePlansRepository['findRestaurantPayoutScope']>>
>;
type RestaurantPayoutOrder = Awaited<
  ReturnType<PackagePlansRepository['listPaidRestaurantOrders']>
>[number];
type SubscriptionDeduction = Awaited<
  ReturnType<PackagePlansRepository['listApplicableDeductions']>
>[number];
type SubscriptionPayoutActivity = Awaited<
  ReturnType<PackagePlansRepository['listSubscriptionPayoutActivity']>
>[number];

interface MonthlyBillingHistory {
  commissionDeductedAmount: Prisma.Decimal;
  monthlyFeeDeductedAmount: Prisma.Decimal;
}

interface SubscriptionPlanSnapshot {
  id?: string;
  name?: string;
  billingModel?: PackageBillingModel;
  billingInterval?: BillingInterval;
  planPrice?: number;
  commissionType?: PackageCommissionType;
  commissionPercentage?: number;
  commissionFixedAmount?: number;
  commissionCapAmount?: number | null;
  vatPercentage?: number;
  payoutCycle?: PackagePayoutCycle;
  payoutCycleOverride?: PackagePayoutCycle | null;
  currency?: string;
}

interface NormalizedPlanInput {
  name?: string;
  description?: string | null;
  billingModel?: PackageBillingModel;
  billingInterval?: BillingInterval;
  planPrice?: Prisma.Decimal;
  commissionType?: PackageCommissionType;
  commissionPercentage?: Prisma.Decimal;
  commissionFixedAmount?: Prisma.Decimal;
  commissionCapAmount?: Prisma.Decimal | null;
  vatPercentage?: Prisma.Decimal;
  payoutCycle?: PackagePayoutCycle;
  termsDocumentUrl?: string | null;
  currency?: string;
  trialDays?: number;
  features?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  isActive?: boolean;
  isDefault?: boolean;
}

@Injectable()
export class PackagePlansService {
  constructor(
    private readonly packagePlansRepository: PackagePlansRepository,
    private readonly mailerService?: MailerService,
    private readonly globalSettingsService?: GlobalSettingsService,
    private readonly invoiceRecordsService?: InvoiceRecordsService,
  ) {}

  async createPlan(user: AuthUserContext, dto: CreatePackagePlanDto) {
    this.ensureSuperAdmin(user);
    const input = this.normalizePlanInput(dto);
    this.assertBillingModelAmounts(input);

    if (input.isDefault) {
      await this.packagePlansRepository.clearDefaultPlans();
    }

    const data = await this.packagePlansRepository.createPlan({
      name: this.requireString(input.name, 'Plan name is required'),
      description: input.description,
      billingModel: this.requireBillingModel(input.billingModel),
      billingInterval: input.billingInterval ?? BillingInterval.MONTHLY,
      planPrice: input.planPrice ?? new Prisma.Decimal(0),
      commissionType: input.commissionType ?? PackageCommissionType.PERCENTAGE,
      commissionPercentage: input.commissionPercentage ?? new Prisma.Decimal(0),
      commissionFixedAmount:
        input.commissionFixedAmount ?? new Prisma.Decimal(0),
      commissionCapAmount: input.commissionCapAmount,
      vatPercentage: input.vatPercentage ?? new Prisma.Decimal(0),
      payoutCycle: input.payoutCycle ?? PackagePayoutCycle.WEEKLY,
      termsDocumentUrl: input.termsDocumentUrl,
      currency: input.currency ?? (await this.resolveDefaultCurrency()),
      trialDays: input.trialDays ?? 0,
      features: input.features,
      isActive: input.isActive ?? true,
      isDefault: input.isDefault ?? false,
    });

    return {
      data,
      message: 'Package plan created successfully',
    };
  }

  async listPlans(user: AuthUserContext, query: ListPackagePlansDto) {
    this.ensureSuperAdmin(user);
    const { items, total } = await this.packagePlansRepository.listPlans(query);

    return {
      data: items,
      message: 'Package plans fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async listPublicPlans(query: ListPackagePlansDto) {
    const { items, total } =
      await this.packagePlansRepository.listPublicPlans(query);

    return {
      data: items,
      message: 'Package plans fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  getFeatureCatalog(user: AuthUserContext) {
    this.ensureSuperAdmin(user);

    return {
      data: [
        {
          code: 'ORDER_MANAGEMENT',
          name: 'Order Management',
          description: 'Create, manage, track, and update orders',
        },
        {
          code: 'MENU_MANAGEMENT',
          name: 'Menu Management',
          description:
            'Create menus, items, categories, modifiers, and pricing',
        },
        {
          code: 'BRANCH_MANAGEMENT',
          name: 'Branch Management',
          description: 'Manage branches and branch settings',
          supportsLimit: true,
        },
        {
          code: 'REPORTS_ANALYTICS',
          name: 'Reports & Analytics',
          description: 'Dashboard, sales reports, and performance analytics',
        },
        {
          code: 'PRIORITY_SUPPORT',
          name: 'Priority Support',
          description: 'Priority support access for the restaurant',
        },
        {
          code: 'PROMOTIONS_COUPONS',
          name: 'Promotions & Coupons',
          description: 'Coupons, campaigns, and promotions',
        },
        {
          code: 'POS',
          name: 'POS',
          description: 'Point-of-sale ordering and operational tools',
        },
        {
          code: 'LOYALTY_WALLET',
          name: 'Loyalty & Wallet',
          description: 'Customer loyalty, wallet, and reward features',
        },
      ],
      message: 'Package plan feature catalog fetched successfully',
    };
  }

  async planDetails(user: AuthUserContext, id: string) {
    this.ensureSuperAdmin(user);
    const plan = await this.packagePlansRepository.findPlanById(id);
    if (!plan) {
      throw new NotFoundException('Package plan not found');
    }

    return {
      data: plan,
      message: 'Package plan fetched successfully',
    };
  }

  async updatePlan(
    user: AuthUserContext,
    id: string,
    dto: UpdatePackagePlanDto,
  ) {
    this.ensureSuperAdmin(user);
    const existing = await this.packagePlansRepository.findPlanById(id);
    if (!existing) {
      throw new NotFoundException('Package plan not found');
    }

    const input = this.normalizePlanInput(dto);
    this.assertBillingModelAmounts({
      billingModel: input.billingModel ?? existing.billingModel,
      planPrice: input.planPrice ?? existing.planPrice,
      commissionType: input.commissionType ?? existing.commissionType,
      commissionPercentage:
        input.commissionPercentage ?? existing.commissionPercentage,
      commissionFixedAmount:
        input.commissionFixedAmount ?? existing.commissionFixedAmount,
      commissionCapAmount:
        input.commissionCapAmount ?? existing.commissionCapAmount,
    });

    if (input.isDefault) {
      await this.packagePlansRepository.clearDefaultPlans(id);
    }

    const data = await this.packagePlansRepository.updatePlan(id, input);

    return {
      data,
      message: 'Package plan updated successfully',
    };
  }

  async removePlan(user: AuthUserContext, id: string) {
    this.ensureSuperAdmin(user);
    const existing = await this.packagePlansRepository.findPlanById(id);
    if (!existing) {
      throw new NotFoundException('Package plan not found');
    }

    const activeSubscriptions =
      await this.packagePlansRepository.countActiveSubscriptionsByPlan(id);
    if (activeSubscriptions > 0) {
      throw new BadRequestException(
        'Package plan has active subscriptions and cannot be deleted',
      );
    }

    await this.packagePlansRepository.updatePlan(id, {
      deletedAt: new Date(),
      isActive: false,
      isDefault: false,
    });

    return {
      data: { id },
      message: 'Package plan deleted successfully',
    };
  }

  async assignSubscription(
    user: AuthUserContext,
    dto: AssignTenantSubscriptionDto,
  ) {
    this.ensureSuperAdmin(user);
    await this.assertTenantAndRestaurant(dto.tenantId, dto.restaurantId);
    const plan = await this.packagePlansRepository.findPlanById(
      dto.packagePlanId,
    );
    if (!plan || !plan.isActive) {
      throw new BadRequestException('Active package plan is required');
    }

    this.assertDateRange(dto.startsAt, dto.endsAt);

    const existing = await this.packagePlansRepository.findActiveSubscription(
      dto.tenantId,
      dto.restaurantId ?? null,
    );
    if (existing) {
      await this.packagePlansRepository.updateSubscription(existing.id, {
        status: SubscriptionStatus.CANCELLED,
        endsAt: new Date(),
        updatedBy: user.uid,
      });
    }

    const data = await this.packagePlansRepository.createSubscription({
      tenant: { connect: { id: dto.tenantId } },
      restaurant: dto.restaurantId
        ? { connect: { id: dto.restaurantId } }
        : undefined,
      packagePlan: { connect: { id: dto.packagePlanId } },
      status: dto.status ?? SubscriptionStatus.ACTIVE,
      paymentStatus: dto.paymentStatus ?? PaymentStatus.PENDING,
      payoutCycleOverride: dto.payoutCycleOverride,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      nextBillingAt: dto.nextBillingAt
        ? new Date(dto.nextBillingAt)
        : this.resolveNextBillingAt(plan.billingInterval, dto.startsAt),
      planSnapshot: this.buildPlanSnapshot(plan),
      note: dto.note,
      createdBy: user.uid,
      updatedBy: user.uid,
    });

    return {
      data,
      message: 'Tenant subscription assigned successfully',
    };
  }

  async listSubscriptions(
    user: AuthUserContext,
    query: ListTenantSubscriptionsDto,
  ) {
    this.ensureSuperAdmin(user);
    const { items, total } =
      await this.packagePlansRepository.listSubscriptions(query);

    return {
      data: items,
      message: 'Tenant subscriptions fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async updateSubscription(
    user: AuthUserContext,
    id: string,
    dto: UpdateTenantSubscriptionDto,
  ) {
    this.ensureSuperAdmin(user);
    const existing = await this.packagePlansRepository.findSubscriptionById(id);
    if (!existing) {
      throw new NotFoundException('Tenant subscription not found');
    }

    const nextPlan = dto.packagePlanId
      ? await this.packagePlansRepository.findPlanById(dto.packagePlanId)
      : null;
    if (dto.packagePlanId) {
      if (!nextPlan || !nextPlan.isActive) {
        throw new BadRequestException('Active package plan is required');
      }
    }

    this.assertDateRange(
      dto.startsAt ?? existing.startsAt.toISOString(),
      dto.endsAt ?? existing.endsAt?.toISOString(),
    );

    const data = await this.packagePlansRepository.updateSubscription(id, {
      packagePlan: dto.packagePlanId
        ? { connect: { id: dto.packagePlanId } }
        : undefined,
      planSnapshot: nextPlan ? this.buildPlanSnapshot(nextPlan) : undefined,
      status: dto.status,
      paymentStatus: dto.paymentStatus,
      payoutCycleOverride: dto.payoutCycleOverride,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      nextBillingAt: dto.nextBillingAt
        ? new Date(dto.nextBillingAt)
        : undefined,
      note: dto.note,
      updatedBy: user.uid,
    });

    return {
      data,
      message: 'Tenant subscription updated successfully',
    };
  }

  async listDeductions(
    user: AuthUserContext,
    query: ListSubscriptionDeductionsDto,
  ) {
    this.ensureSuperAdmin(user);
    const { items, total } =
      await this.packagePlansRepository.listDeductions(query);

    return {
      data: items,
      message: 'Subscription deductions fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async createDeduction(
    user: AuthUserContext,
    dto: CreateSubscriptionDeductionDto,
  ) {
    this.ensureSuperAdmin(user);
    await this.assertTenantAndRestaurant(dto.tenantId, dto.restaurantId);
    const adjustment = this.normalizeAdjustmentMetadata(dto);
    if (dto.subscriptionId) {
      const subscription = await this.getSubscriptionOrThrow(
        dto.subscriptionId,
      );
      if (
        subscription.tenantId !== dto.tenantId ||
        (dto.restaurantId && subscription.restaurantId !== dto.restaurantId)
      ) {
        throw new BadRequestException(
          'Deduction subscription must belong to the selected tenant/restaurant',
        );
      }
    }

    const data = await this.packagePlansRepository.createDeduction({
      tenant: { connect: { id: dto.tenantId } },
      restaurant: dto.restaurantId
        ? { connect: { id: dto.restaurantId } }
        : undefined,
      subscription: dto.subscriptionId
        ? { connect: { id: dto.subscriptionId } }
        : undefined,
      type: dto.type ?? SubscriptionDeductionType.ONE_TIME,
      direction: adjustment.direction,
      source: adjustment.source,
      moduleCode: adjustment.moduleCode,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      amount: new Prisma.Decimal(dto.amount).toDecimalPlaces(2),
      currency: dto.currency?.trim().toUpperCase() ?? 'PKR',
      appliesFrom: dto.appliesFrom ? new Date(dto.appliesFrom) : undefined,
      createdBy: user.uid,
      updatedBy: user.uid,
    });

    return {
      data,
      message: 'Subscription deduction created successfully',
    };
  }

  async updateDeduction(
    user: AuthUserContext,
    id: string,
    dto: UpdateSubscriptionDeductionDto,
  ) {
    this.ensureSuperAdmin(user);
    const existing = await this.packagePlansRepository.findDeductionById(id);
    if (!existing) {
      throw new NotFoundException('Subscription deduction not found');
    }
    const adjustment = this.normalizeAdjustmentMetadata(dto, existing);

    const data = await this.packagePlansRepository.updateDeduction(id, {
      status: dto.status,
      direction: adjustment.direction,
      source: adjustment.source,
      moduleCode: adjustment.moduleCode,
      title: dto.title?.trim(),
      description:
        dto.description !== undefined
          ? dto.description.trim() || null
          : undefined,
      amount:
        dto.amount !== undefined
          ? new Prisma.Decimal(dto.amount).toDecimalPlaces(2)
          : undefined,
      currency: dto.currency?.trim().toUpperCase(),
      appliesFrom: dto.appliesFrom ? new Date(dto.appliesFrom) : undefined,
      updatedBy: user.uid,
    });

    return {
      data,
      message: 'Subscription deduction updated successfully',
    };
  }

  async exportMonthlyInvoicesDatevCsv(
    user: AuthUserContext,
    query: MonthlyInvoiceDatevExportQueryDto,
  ) {
    this.ensureSuperAdmin(user);
    const invoices =
      await this.packagePlansRepository.listMonthlyGeneratedInvoices(query);
    const content = this.buildDatevCsv(invoices, query);
    const month = String(query.month).padStart(2, '0');

    return {
      fileName: `datev-invoices-${query.year}-${month}.csv`,
      mimeType: 'text/csv; charset=utf-8',
      content: Buffer.from(content, 'utf8'),
    };
  }

  async getSubscriptionInvoice(user: AuthUserContext, id: string) {
    this.ensureSuperAdmin(user);
    const invoice = await this.buildSubscriptionInvoice(id);
    await this.persistSubscriptionInvoice(user, invoice);

    return {
      data: invoice,
      message: 'Subscription invoice fetched successfully',
    };
  }

  async downloadSubscriptionInvoicePdf(user: AuthUserContext, id: string) {
    this.ensureSuperAdmin(user);
    const invoice = await this.buildSubscriptionInvoice(id);
    const content = this.generateSubscriptionInvoicePdf(invoice);
    await this.persistSubscriptionInvoice(user, invoice, {
      eventType: GeneratedInvoiceEventType.DOWNLOADED,
    });

    return {
      fileName: `${invoice.invoiceNumber}.pdf`,
      mimeType: 'application/pdf',
      content,
    };
  }

  async sendSubscriptionInvoiceEmail(
    user: AuthUserContext,
    id: string,
    dto: SendTenantSubscriptionInvoiceDto,
  ) {
    this.ensureSuperAdmin(user);
    const invoice = await this.buildSubscriptionInvoice(id);
    const recipientEmail = dto.email ?? invoice.restaurant?.billingEmail;

    if (!recipientEmail) {
      throw new BadRequestException(
        'Restaurant billing email is required to send invoice',
      );
    }

    if (!this.mailerService) {
      throw new InternalServerErrorException(
        'Mailer service is not configured',
      );
    }

    const fileName = `${invoice.invoiceNumber}.pdf`;
    await this.deliverSubscriptionInvoice(user, invoice, recipientEmail);
    await this.advanceSubscriptionBillingCursor(invoice);

    return {
      data: {
        invoiceNumber: invoice.invoiceNumber,
        subscriptionId: invoice.subscriptionId,
        restaurantId: invoice.restaurant?.id ?? null,
        sentTo: recipientEmail,
        fileName,
        mimeType: 'application/pdf',
      },
      message: 'Subscription invoice generated and sent successfully',
    };
  }

  async getWeeklyPayoutInvoice(
    user: AuthUserContext,
    query: WeeklyRestaurantPayoutInvoiceQueryDto,
  ) {
    this.ensureSuperAdmin(user);
    const invoice = await this.buildWeeklyPayoutInvoice(query);
    await this.persistWeeklyPayoutInvoice(user, invoice);

    return {
      data: invoice,
      message: 'Payout invoice fetched successfully',
    };
  }

  async getRestaurantPayoutBalanceSummary(
    restaurantId: string,
    now = new Date(),
  ) {
    const restaurant =
      await this.packagePlansRepository.findRestaurantPayoutScope(restaurantId);
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    const subscription =
      await this.packagePlansRepository.findActiveRestaurantSubscription(
        restaurant.id,
      );
    const plan = subscription
      ? this.resolveSubscriptionInvoicePlan(subscription)
      : null;
    const [orders, specialPayouts, currency, walletAccount] = await Promise.all(
      [
        this.packagePlansRepository.listRestaurantWalletPayoutOrders(
          restaurant.id,
        ),
        this.listSpecialPayoutSummary(restaurant.id),
        this.resolveDefaultCurrency(),
        this.packagePlansRepository.findRestaurantWalletAccount?.(
          restaurant.id,
        ) ?? Promise.resolve(null),
      ],
    );
    const currentBillingMonth = this.toBillingMonth(now);
    const billingMonths = [
      ...new Set([
        currentBillingMonth,
        ...orders.map((order) =>
          this.toBillingMonth(order.paidAt ?? order.createdAt),
        ),
      ]),
    ].sort();
    const monthlyHistory = await this.listMonthlyBillingHistory(
      restaurant.id,
      billingMonths,
    );
    const remainingCommissionCaps = new Map<string, Prisma.Decimal | null>();
    const payoutSummaryCommissionCaps = new Map<
      string,
      Prisma.Decimal | null
    >();
    for (const month of billingMonths) {
      const history = this.getMonthlyBillingHistory(monthlyHistory, month);
      remainingCommissionCaps.set(
        month,
        plan?.commissionCapAmount !== null &&
          plan?.commissionCapAmount !== undefined
          ? Prisma.Decimal.max(
              new Prisma.Decimal(plan.commissionCapAmount).minus(
                history.commissionDeductedAmount,
              ),
              new Prisma.Decimal(0),
            )
          : null,
      );
      payoutSummaryCommissionCaps.set(
        month,
        remainingCommissionCaps.get(month) ?? null,
      );
    }
    const lineItems = orders.map((order) => {
      const billingMonth = this.toBillingMonth(order.paidAt ?? order.createdAt);
      const netCollectedAmount = order.transactions.reduce(
        (sum, transaction) =>
          transaction.type === PaymentTransactionType.REFUND
            ? sum.minus(transaction.amount)
            : sum.plus(transaction.amount),
        new Prisma.Decimal(0),
      );

      const orderAmount = new Prisma.Decimal(order.totalAmount).toDecimalPlaces(
        2,
      );
      const isPlatformCollected = this.isPlatformCollectedPayoutOrder(order);
      const commissionableAmount = isPlatformCollected
        ? Prisma.Decimal.max(
            Prisma.Decimal.min(orderAmount, netCollectedAmount),
            new Prisma.Decimal(0),
          ).toDecimalPlaces(2)
        : orderAmount;

      const line = this.toWeeklyPayoutOrderLine(
        { ...order, totalAmount: commissionableAmount },
        plan,
        currency,
        specialPayouts.payoutAmountsByOrder.get(order.id) ??
          new Prisma.Decimal(0),
        remainingCommissionCaps.get(billingMonth) ?? null,
      );

      const remainingCommissionCap = remainingCommissionCaps.get(billingMonth);
      if (
        remainingCommissionCap !== null &&
        remainingCommissionCap !== undefined
      ) {
        remainingCommissionCaps.set(
          billingMonth,
          Prisma.Decimal.max(
            remainingCommissionCap.minus(line.platformCommissionAmount),
            new Prisma.Decimal(0),
          ),
        );
      }

      const transactionFeeAmount =
        order.transactionFeePayer === PaymentFeePayer.RESTAURANT
          ? new Prisma.Decimal(order.transactionFeeAmount).toDecimalPlaces(2)
          : new Prisma.Decimal(0);

      return {
        ...line,
        billingMonth,
        totalOrderAmount: commissionableAmount,
        platformCollectedAmount: isPlatformCollected
          ? Prisma.Decimal.max(
              netCollectedAmount,
              new Prisma.Decimal(0),
            ).toDecimalPlaces(2)
          : new Prisma.Decimal(0),
        transactionFeeAmount,
      };
    });
    const totalOrderAmount = lineItems.reduce(
      (sum, item) => sum.plus(item.totalOrderAmount),
      new Prisma.Decimal(0),
    );
    const platformCollectedAmount = lineItems.reduce(
      (sum, item) => sum.plus(item.platformCollectedAmount),
      new Prisma.Decimal(0),
    );
    const platformCommissionAmount = this.sumDecimalValues(
      billingMonths.map((month) =>
        this.calculatePayoutSummaryCommission(
          lineItems.filter((item) => item.billingMonth === month),
          plan,
          payoutSummaryCommissionCaps.get(month) ?? null,
        ),
      ),
    );
    const restaurantTransactionFeeAmount = lineItems.reduce(
      (sum, item) => sum.plus(item.transactionFeeAmount),
      new Prisma.Decimal(0),
    );
    const vatPercentage = new Prisma.Decimal(plan?.vatPercentage ?? 0);
    const payoutChargeVatAmount = platformCommissionAmount
      .plus(restaurantTransactionFeeAmount)
      .mul(vatPercentage)
      .div(100)
      .toDecimalPlaces(2);
    const previousPayoutAmount = [
      ...specialPayouts.payoutAmountsByOrder.values(),
    ]
      .reduce((sum, amount) => sum.plus(amount), new Prisma.Decimal(0))
      .toDecimalPlaces(2);
    const deductionsBeforeMonthlyFee = platformCommissionAmount
      .plus(restaurantTransactionFeeAmount)
      .plus(payoutChargeVatAmount)
      .plus(previousPayoutAmount)
      .toDecimalPlaces(2);
    const payoutBeforeMonthlyFee = Prisma.Decimal.max(
      platformCollectedAmount.minus(deductionsBeforeMonthlyFee),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    const ledgerBalance = Prisma.Decimal.max(
      new Prisma.Decimal(walletAccount?.balance ?? 0).toDecimalPlaces(2),
      new Prisma.Decimal(0),
    );
    const availablePayoutBeforeMonthlyFee = Prisma.Decimal.min(
      ledgerBalance,
      payoutBeforeMonthlyFee,
    ).toDecimalPlaces(2);
    const currentMonthHistory = this.getMonthlyBillingHistory(
      monthlyHistory,
      currentBillingMonth,
    );
    const monthlyFeeAmount = this.resolveMonthlyPayoutFee(plan);
    const currentMonthPeriod =
      this.resolveBillingMonthPeriod(currentBillingMonth);
    const monthlyFeeScheduledToDate = this.resolveMonthlyFeeScheduledToDate(
      monthlyFeeAmount,
      currentBillingMonth,
      new Date(Math.min(now.getTime() + 1, currentMonthPeriod.to.getTime())),
    );
    const monthlyFeeVatMultiplier = new Prisma.Decimal(1).plus(
      vatPercentage.div(100),
    );
    const monthlyFeeDeductedAmount = Prisma.Decimal.min(
      Prisma.Decimal.max(
        monthlyFeeScheduledToDate.minus(
          currentMonthHistory.monthlyFeeDeductedAmount,
        ),
        new Prisma.Decimal(0),
      ),
      availablePayoutBeforeMonthlyFee.div(monthlyFeeVatMultiplier),
    ).toDecimalPlaces(2);
    const monthlyFeeVatAmount = monthlyFeeDeductedAmount
      .mul(vatPercentage)
      .div(100)
      .toDecimalPlaces(2);
    const monthlyFeeDeductedThisMonth =
      currentMonthHistory.monthlyFeeDeductedAmount
        .plus(monthlyFeeDeductedAmount)
        .toDecimalPlaces(2);
    const monthlyFeeOutstandingAmount = Prisma.Decimal.max(
      monthlyFeeAmount.minus(monthlyFeeDeductedThisMonth),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    const totalDeductionsAmount = deductionsBeforeMonthlyFee
      .plus(monthlyFeeDeductedAmount)
      .plus(monthlyFeeVatAmount)
      .toDecimalPlaces(2);
    const calculatedRestaurantPayoutAmount = Prisma.Decimal.max(
      payoutBeforeMonthlyFee
        .minus(monthlyFeeDeductedAmount)
        .minus(monthlyFeeVatAmount),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    const restaurantPayoutAmount = Prisma.Decimal.max(
      availablePayoutBeforeMonthlyFee
        .minus(monthlyFeeDeductedAmount)
        .minus(monthlyFeeVatAmount),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    const vatAmount = payoutChargeVatAmount
      .plus(monthlyFeeVatAmount)
      .toDecimalPlaces(2);

    return {
      ordersCount: lineItems.length,
      totalOrderAmount: Number(totalOrderAmount.toDecimalPlaces(2)),
      platformCollectedAmount: Number(
        platformCollectedAmount.toDecimalPlaces(2),
      ),
      grossAmount: Number(platformCollectedAmount.toDecimalPlaces(2)),
      platformCommissionAmount: Number(
        platformCommissionAmount.toDecimalPlaces(2),
      ),
      restaurantTransactionFeeAmount: Number(
        restaurantTransactionFeeAmount.toDecimalPlaces(2),
      ),
      vatPercentage: Number(vatPercentage),
      vatAmount: Number(vatAmount),
      previousPayoutAmount: Number(previousPayoutAmount),
      billingMonth: currentBillingMonth,
      monthlyFeeAmount: Number(monthlyFeeAmount),
      monthlyFeeScheduledToDate: Number(monthlyFeeScheduledToDate),
      monthlyFeeDeductedBefore: Number(
        currentMonthHistory.monthlyFeeDeductedAmount,
      ),
      monthlyFeeDeductedAmount: Number(monthlyFeeDeductedAmount),
      monthlyFeeVatAmount: Number(monthlyFeeVatAmount),
      monthlyFeeDeductedThisMonth: Number(monthlyFeeDeductedThisMonth),
      monthlyFeeOutstandingAmount: Number(monthlyFeeOutstandingAmount),
      totalDeductionsAmount: Number(totalDeductionsAmount),
      ledgerBalance: Number(ledgerBalance),
      calculatedRestaurantPayoutAmount: Number(
        calculatedRestaurantPayoutAmount,
      ),
      restaurantPayoutAmount: Number(restaurantPayoutAmount.toDecimalPlaces(2)),
      currency,
      activePlan:
        subscription && plan
          ? {
              subscriptionId: subscription.id,
              id: plan.id,
              name: plan.name,
              billingModel: plan.billingModel,
              commissionType: plan.commissionType,
              commissionPercentage: Number(plan.commissionPercentage),
              commissionFixedAmount: Number(plan.commissionFixedAmount),
              commissionCapAmount:
                plan.commissionCapAmount === null
                  ? null
                  : Number(plan.commissionCapAmount),
              vatPercentage: Number(plan.vatPercentage),
              payoutCycle: plan.payoutCycle,
            }
          : null,
    };
  }

  async downloadWeeklyPayoutInvoicePdf(
    user: AuthUserContext,
    query: WeeklyRestaurantPayoutInvoiceQueryDto,
  ) {
    this.ensureSuperAdmin(user);
    const invoice = await this.buildWeeklyPayoutInvoice(query);
    const content = this.generateWeeklyPayoutInvoicePdf(invoice);
    await this.persistWeeklyPayoutInvoice(user, invoice, {
      eventType: GeneratedInvoiceEventType.DOWNLOADED,
    });

    return {
      fileName: `${invoice.invoiceNumber}.pdf`,
      mimeType: 'application/pdf',
      content,
    };
  }

  generateStoredInvoicePdf(
    kind: GeneratedInvoiceKind,
    snapshot: Prisma.JsonValue,
  ) {
    if (kind === GeneratedInvoiceKind.SUBSCRIPTION) {
      const invoice = snapshot as unknown as Awaited<
        ReturnType<PackagePlansService['buildSubscriptionInvoice']>
      >;
      const payoutActivity = invoice.payoutActivity ?? {
        currency: invoice.totals.currency,
        summary: {
          requestedCount: 0,
          requestedAmount: 0,
          approvedCount: 0,
          approvedAmount: 0,
          rejectedCount: 0,
          rejectedAmount: 0,
          paidCount: 0,
          paidAmount: 0,
        },
        requests: [],
      };
      const hydratedInvoice = {
        ...invoice,
        issuedAt: this.parseStoredInvoiceDate(invoice.issuedAt),
        dueAt: this.parseStoredInvoiceDate(invoice.dueAt),
        servicePeriod: {
          from: this.parseStoredInvoiceDate(invoice.servicePeriod.from),
          to: this.parseStoredInvoiceDate(invoice.servicePeriod.to),
        },
        orderBreakdown: {
          ...invoice.orderBreakdown,
          orders: invoice.orderBreakdown.orders.map((order) => ({
            ...order,
            date: this.parseStoredInvoiceDate(order.date),
          })),
        },
        payoutActivity: {
          ...payoutActivity,
          requests: payoutActivity.requests.map((request) => ({
            ...request,
            requestedAt: this.parseStoredInvoiceDate(request.requestedAt),
            approvedAt: request.approvedAt
              ? this.parseStoredInvoiceDate(request.approvedAt)
              : null,
            rejectedAt: request.rejectedAt
              ? this.parseStoredInvoiceDate(request.rejectedAt)
              : null,
            paidAt: request.paidAt
              ? this.parseStoredInvoiceDate(request.paidAt)
              : null,
          })),
        },
      };

      return this.generateSubscriptionInvoicePdf(hydratedInvoice);
    }

    if (kind === GeneratedInvoiceKind.WEEKLY_PAYOUT) {
      const invoice = snapshot as unknown as Awaited<
        ReturnType<PackagePlansService['buildWeeklyPayoutInvoice']>
      >;
      const hydratedInvoice = {
        ...invoice,
        monthlyBilling: invoice.monthlyBilling ?? { months: [] },
        totals: {
          ...invoice.totals,
          monthlyFeeDeductedAmount:
            invoice.totals.monthlyFeeDeductedAmount ?? 0,
          monthlyFeeOutstandingAmount:
            invoice.totals.monthlyFeeOutstandingAmount ?? 0,
        },
        issuedAt: this.parseStoredInvoiceDate(invoice.issuedAt),
        period: {
          from: this.parseStoredInvoiceDate(invoice.period.from),
          to: this.parseStoredInvoiceDate(invoice.period.to),
        },
        lineItems: invoice.lineItems.map((item) => ({
          ...item,
          paidAt: item.paidAt ? this.parseStoredInvoiceDate(item.paidAt) : null,
        })),
      };

      return this.generateWeeklyPayoutInvoicePdf(hydratedInvoice);
    }

    throw new BadRequestException('Stored invoice kind is not supported');
  }

  async sendWeeklyPayoutInvoiceEmail(
    user: AuthUserContext,
    dto: SendWeeklyRestaurantPayoutInvoiceDto,
  ) {
    this.ensureSuperAdmin(user);
    const invoice = await this.buildWeeklyPayoutInvoice(dto);
    const recipientEmail = dto.email ?? invoice.restaurant.billingEmail;

    if (!recipientEmail) {
      throw new BadRequestException(
        'Restaurant billing email is required to send payout invoice',
      );
    }

    if (!this.mailerService) {
      throw new InternalServerErrorException(
        'Mailer service is not configured',
      );
    }

    const fileName = `${invoice.invoiceNumber}.pdf`;
    await this.deliverWeeklyPayoutInvoice(user, invoice, recipientEmail);

    return {
      data: {
        invoiceNumber: invoice.invoiceNumber,
        restaurantId: invoice.restaurant.id,
        sentTo: recipientEmail,
        fileName,
        mimeType: 'application/pdf',
      },
      message: 'Payout invoice generated and sent successfully',
    };
  }

  async persistSpecialPayoutInvoiceForPaidRequest(input: {
    payoutRequestId: string;
    tenantId: string;
    restaurantId: string;
    amount: Prisma.Decimal;
    currency: string;
    paidBy: string;
    paidAt: Date;
  }) {
    if (!this.invoiceRecordsService) return null;

    const sourceKey = `${input.restaurantId}:special:${input.payoutRequestId}`;
    if (
      await this.invoiceRecordsService.hasRecord?.(
        GeneratedInvoiceKind.WEEKLY_PAYOUT,
        sourceKey,
      )
    ) {
      return null;
    }

    const periodTo = new Date(input.paidAt.getTime() + 1);
    const invoice = await this.buildWeeklyPayoutInvoice({
      restaurantId: input.restaurantId,
      fromDate: new Date(0).toISOString(),
      toDate: periodTo.toISOString(),
    });
    let remaining = input.amount.toDecimalPlaces(2);
    const lineItems = [];

    for (const lineItem of invoice.lineItems) {
      if (remaining.lessThanOrEqualTo(0)) break;

      const available = new Prisma.Decimal(
        lineItem.restaurantPayoutAmount,
      ).toDecimalPlaces(2);
      const payoutAmount = Prisma.Decimal.min(available, remaining);
      if (payoutAmount.lessThanOrEqualTo(0)) continue;

      lineItems.push({
        ...lineItem,
        restaurantPayoutAmount: Number(payoutAmount),
      });
      remaining = remaining.minus(payoutAmount);
    }

    if (lineItems.length === 0) return null;

    const specialInvoice = {
      ...invoice,
      invoiceNumber: this.buildSpecialPayoutInvoiceNumber(
        input.restaurantId,
        input.payoutRequestId,
        input.paidAt,
      ),
      issuedAt: input.paidAt,
      period: {
        from:
          lineItems[0]?.paidAt instanceof Date
            ? lineItems[0].paidAt
            : invoice.period.from,
        to: periodTo,
      },
      lineItems,
      sourceKey,
      payoutRequestId: input.payoutRequestId,
      totals: {
        ordersCount: lineItems.length,
        totalOrderAmount: lineItems.reduce(
          (sum, item) => sum + Number(item.totalOrderAmount),
          0,
        ),
        grossAmount: lineItems.reduce(
          (sum, item) => sum + Number(item.grossAmount),
          0,
        ),
        platformCommissionAmount: lineItems.reduce(
          (sum, item) => sum + Number(item.platformCommissionAmount),
          0,
        ),
        restaurantTransactionFeeAmount: lineItems.reduce(
          (sum, item) => sum + Number(item.transactionFeeAmount),
          0,
        ),
        vatPercentage: invoice.totals.vatPercentage,
        vatAmount: lineItems.reduce(
          (sum, item) => sum + Number(item.vatAmount),
          0,
        ),
        previousPayoutAmount: lineItems.reduce(
          (sum, item) => sum + Number(item.previousPayoutAmount),
          0,
        ),
        monthlyFeeDeductedAmount: lineItems.reduce(
          (sum, item) => sum + Number(item.monthlyFeeAmount),
          0,
        ),
        monthlyFeeOutstandingAmount: invoice.totals.monthlyFeeOutstandingAmount,
        restaurantPayoutAmount: lineItems.reduce(
          (sum, item) => sum + Number(item.restaurantPayoutAmount),
          0,
        ),
        currency: input.currency,
      },
      note: 'Special restaurant payout completed before the normal scheduled payout. These paid amounts remain excluded from the next scheduled payout invoice.',
    };

    await this.persistWeeklyPayoutInvoice(
      { uid: input.paidBy, role: UserRoleEnum.SUPER_ADMIN } as AuthUserContext,
      specialInvoice,
      { status: GeneratedInvoiceStatus.SENT },
    );

    return specialInvoice;
  }

  async emailDueSubscriptionInvoices(now = new Date()) {
    this.ensureInvoiceAutomationConfigured();
    const systemUser = this.systemInvoiceUser();
    const subscriptions =
      await this.packagePlansRepository.listDueSubscriptions(now);
    const results = { sent: 0, skipped: 0 };

    for (const subscription of subscriptions) {
      const invoice = await this.buildSubscriptionInvoice(subscription.id);
      const sourceKey = this.buildSubscriptionInvoiceSourceKey(invoice);

      if (
        await this.invoiceRecordsService?.hasEmailed?.(
          GeneratedInvoiceKind.SUBSCRIPTION,
          sourceKey,
        )
      ) {
        await this.advanceSubscriptionBillingCursor(invoice);
        await this.markInvoiceOneTimeDeductionsApplied(invoice, now);
        results.skipped += 1;
        continue;
      }

      const settledInvoice = await this.settleSubscriptionInvoiceFromWallet(
        systemUser,
        invoice,
      );
      const recipientEmail = settledInvoice.restaurant?.billingEmail;

      if (settledInvoice.totals.amountDue <= 0) {
        await this.persistSubscriptionInvoice(systemUser, settledInvoice);
        await this.advanceSubscriptionBillingCursor(
          settledInvoice,
          PaymentStatus.PAID,
        );
        await this.markInvoiceOneTimeDeductionsApplied(settledInvoice, now);
        continue;
      }

      if (!recipientEmail) {
        await this.persistSubscriptionInvoice(systemUser, settledInvoice);
        await this.advanceSubscriptionBillingCursor(settledInvoice);
        await this.markInvoiceOneTimeDeductionsApplied(settledInvoice, now);
        results.skipped += 1;
        continue;
      }

      await this.deliverSubscriptionInvoice(
        systemUser,
        settledInvoice,
        recipientEmail,
      );
      await this.advanceSubscriptionBillingCursor(settledInvoice);
      await this.markInvoiceOneTimeDeductionsApplied(settledInvoice, now);
      results.sent += 1;
    }

    return results;
  }

  private async settleSubscriptionInvoiceFromWallet(
    user: AuthUserContext,
    invoice: Awaited<
      ReturnType<PackagePlansService['buildSubscriptionInvoice']>
    >,
  ) {
    if (!invoice.restaurant || invoice.totals.amountDue <= 0) {
      return invoice;
    }

    if (
      typeof this.packagePlansRepository.settleSubscriptionInvoiceFromWallet !==
      'function'
    ) {
      return invoice;
    }

    const settlement =
      await this.packagePlansRepository.settleSubscriptionInvoiceFromWallet({
        tenantId: invoice.tenant.id,
        restaurantId: invoice.restaurant.id,
        subscriptionId: invoice.subscriptionId,
        settlementKey: this.buildSubscriptionInvoiceSourceKey(invoice),
        invoiceNumber: invoice.invoiceNumber,
        amountDue: new Prisma.Decimal(invoice.totals.amountDue).toDecimalPlaces(
          2,
        ),
        currency: invoice.totals.currency,
        periodFrom: invoice.servicePeriod.from,
        periodTo: invoice.servicePeriod.to,
        createdBy: user.uid,
      });
    const walletSettlementAmount = settlement.appliedAmount
      .toDecimalPlaces(2)
      .toNumber();

    if (walletSettlementAmount <= 0) {
      return invoice;
    }

    const amountDue = Number(
      (invoice.totals.amountDue - walletSettlementAmount).toFixed(2),
    );

    return {
      ...invoice,
      lineItems: [
        ...invoice.lineItems,
        {
          description: 'Restaurant wallet settlement applied',
          quantity: 1,
          unitPrice: -walletSettlementAmount,
          amount: -walletSettlementAmount,
        },
      ],
      totals: {
        ...invoice.totals,
        walletSettlementAmount,
        amountDue,
        totalAmount: amountDue,
      },
      settlement: {
        walletAppliedAmount: walletSettlementAmount,
        remainingDueAmount: amountDue,
        walletAccountId: settlement.walletAccountId,
        walletTransactionId: settlement.walletTransactionId,
        balanceAfter:
          settlement.balanceAfter?.toDecimalPlaces(2).toNumber() ?? null,
        settledAt: new Date().toISOString(),
      },
    };
  }

  private async markInvoiceOneTimeDeductionsApplied(
    invoice: Awaited<
      ReturnType<PackagePlansService['buildSubscriptionInvoice']>
    >,
    appliedAt: Date,
  ) {
    const deductionIds = invoice.deductions
      .filter((item) => item.type === SubscriptionDeductionType.ONE_TIME)
      .map((item) => item.id);

    if (deductionIds.length) {
      await this.packagePlansRepository.markOneTimeDeductionsApplied(
        deductionIds,
        appliedAt,
      );
    }
  }

  async emailDuePayoutInvoices(now = new Date()) {
    this.ensureInvoiceAutomationConfigured();
    const systemUser = this.systemInvoiceUser();
    const subscriptions =
      await this.packagePlansRepository.listActiveRestaurantSubscriptionsForPayouts();
    const results = { sent: 0, skipped: 0 };

    for (const subscription of subscriptions) {
      if (!subscription.restaurantId) {
        results.skipped += 1;
        continue;
      }

      const plan = this.resolveSubscriptionInvoicePlan(subscription);
      const period = this.resolveLastCompletedPayoutPeriod(
        plan.payoutCycle,
        now,
      );
      const invoice = await this.buildWeeklyPayoutInvoice({
        restaurantId: subscription.restaurantId,
        fromDate: period.from.toISOString(),
        toDate: period.to.toISOString(),
      });
      const recipientEmail = invoice.restaurant.billingEmail;
      const sourceKey = this.buildWeeklyPayoutInvoiceSourceKey(invoice);
      const hasPayoutActivity =
        invoice.totals.ordersCount > 0 ||
        invoice.totals.monthlyFeeDeductedAmount > 0;

      if (
        !hasPayoutActivity ||
        (await this.invoiceRecordsService?.hasRecord(
          GeneratedInvoiceKind.WEEKLY_PAYOUT,
          sourceKey,
        ))
      ) {
        results.skipped += 1;
        continue;
      }

      if (!recipientEmail) {
        await this.persistWeeklyPayoutInvoice(systemUser, invoice);
        results.skipped += 1;
        continue;
      }

      await this.deliverWeeklyPayoutInvoice(
        systemUser,
        invoice,
        recipientEmail,
      );
      results.sent += 1;
    }

    return results;
  }

  private async buildWeeklyPayoutInvoice(
    query: WeeklyRestaurantPayoutInvoiceQueryDto,
  ) {
    const restaurant =
      await this.packagePlansRepository.findRestaurantPayoutScope(
        query.restaurantId,
      );

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const subscription =
      await this.packagePlansRepository.findActiveRestaurantSubscription(
        restaurant.id,
      );
    const plan = subscription
      ? this.resolveSubscriptionInvoicePlan(subscription)
      : null;
    const period = this.resolvePayoutInvoicePeriod(query, plan?.payoutCycle);
    const sourceKey = `${restaurant.id}:${period.from.toISOString()}:${period.to.toISOString()}`;
    const orders = await this.packagePlansRepository.listPaidRestaurantOrders(
      restaurant.id,
      period.from,
      period.to,
      true,
    );
    const specialPayouts = await this.listSpecialPayoutSummary(restaurant.id);
    const defaultCurrency = await this.resolveDefaultCurrency();
    const billingMonths = this.listPayoutBillingMonths(period, orders);
    const monthlyHistory = await this.listMonthlyBillingHistory(
      restaurant.id,
      billingMonths,
      sourceKey,
    );
    const remainingCommissionCaps = new Map<string, Prisma.Decimal | null>();
    const commissionCapsBefore = new Map<string, Prisma.Decimal | null>();

    for (const month of billingMonths) {
      const history = this.getMonthlyBillingHistory(monthlyHistory, month);
      remainingCommissionCaps.set(
        month,
        plan?.commissionCapAmount !== null &&
          plan?.commissionCapAmount !== undefined
          ? Prisma.Decimal.max(
              new Prisma.Decimal(plan.commissionCapAmount).minus(
                history.commissionDeductedAmount,
              ),
              new Prisma.Decimal(0),
            )
          : null,
      );
      commissionCapsBefore.set(
        month,
        remainingCommissionCaps.get(month) ?? null,
      );
    }
    const lineItems = orders
      .map((order) => {
        const billingMonth = this.toBillingMonth(
          order.paidAt ?? order.createdAt,
        );
        const orderAmount = new Prisma.Decimal(
          order.totalAmount,
        ).toDecimalPlaces(2);
        const netCollectedAmount = order.transactions.reduce(
          (sum, transaction) =>
            transaction.type === PaymentTransactionType.REFUND
              ? sum.minus(transaction.amount)
              : sum.plus(transaction.amount),
          new Prisma.Decimal(0),
        );
        const isPlatformCollected = this.isPlatformCollectedPayoutOrder(order);
        const commissionableAmount = isPlatformCollected
          ? Prisma.Decimal.max(
              Prisma.Decimal.min(orderAmount, netCollectedAmount),
              new Prisma.Decimal(0),
            ).toDecimalPlaces(2)
          : orderAmount;
        const previousPayoutAmount =
          specialPayouts.payoutAmountsByOrder.get(order.id) ??
          new Prisma.Decimal(0);
        const line = this.toWeeklyPayoutOrderLine(
          { ...order, totalAmount: commissionableAmount },
          plan,
          defaultCurrency,
          previousPayoutAmount,
          remainingCommissionCaps.get(billingMonth) ?? null,
        );

        const remainingCommissionCap =
          remainingCommissionCaps.get(billingMonth);
        if (
          remainingCommissionCap !== null &&
          remainingCommissionCap !== undefined
        ) {
          remainingCommissionCaps.set(
            billingMonth,
            Prisma.Decimal.max(
              remainingCommissionCap.minus(line.platformCommissionAmount),
              new Prisma.Decimal(0),
            ),
          );
        }

        const transactionFeeAmount =
          order.transactionFeePayer === PaymentFeePayer.RESTAURANT
            ? new Prisma.Decimal(order.transactionFeeAmount).toDecimalPlaces(2)
            : new Prisma.Decimal(0);
        const vatAmount = line.platformCommissionAmount
          .plus(transactionFeeAmount)
          .mul(plan?.vatPercentage ?? 0)
          .div(100)
          .toDecimalPlaces(2);
        const platformCollectedAmount = isPlatformCollected
          ? Prisma.Decimal.max(
              netCollectedAmount,
              new Prisma.Decimal(0),
            ).toDecimalPlaces(2)
          : new Prisma.Decimal(0);

        return {
          ...line,
          billingMonth,
          totalOrderAmount: commissionableAmount,
          grossAmount: platformCollectedAmount,
          transactionFeeAmount,
          vatAmount,
          restaurantPayoutAmount: Prisma.Decimal.max(
            platformCollectedAmount
              .minus(line.platformCommissionAmount)
              .minus(transactionFeeAmount)
              .minus(vatAmount)
              .minus(previousPayoutAmount),
            new Prisma.Decimal(0),
          ).toDecimalPlaces(2),
          monthlyFeeAmount: new Prisma.Decimal(0),
          monthlyFeeVatAmount: new Prisma.Decimal(0),
        };
      })
      .filter(
        (item) =>
          item.restaurantPayoutAmount.greaterThan(0) ||
          item.grossAmount.equals(0),
      );
    for (const month of billingMonths) {
      const monthLineItems = lineItems.filter(
        (item) => item.billingMonth === month,
      );
      if (monthLineItems.length === 0) continue;

      const normalizedCommission = this.calculatePayoutSummaryCommission(
        monthLineItems,
        plan,
        commissionCapsBefore.get(month) ?? null,
      );
      const currentCommission = this.sumDecimalValues(
        monthLineItems.map((item) => item.platformCommissionAmount),
      );
      const adjustment = normalizedCommission.minus(currentCommission);
      if (adjustment.equals(0)) continue;

      const lineItem = monthLineItems.at(-1);
      if (!lineItem) continue;
      const previousCommission = lineItem.platformCommissionAmount;
      const previousVat = lineItem.vatAmount;
      lineItem.platformCommissionAmount = Prisma.Decimal.max(
        previousCommission.plus(adjustment),
        new Prisma.Decimal(0),
      ).toDecimalPlaces(2);
      lineItem.vatAmount = lineItem.platformCommissionAmount
        .plus(lineItem.transactionFeeAmount)
        .mul(plan?.vatPercentage ?? 0)
        .div(100)
        .toDecimalPlaces(2);
      lineItem.restaurantPayoutAmount = Prisma.Decimal.max(
        lineItem.restaurantPayoutAmount
          .plus(previousCommission)
          .plus(previousVat)
          .minus(lineItem.platformCommissionAmount)
          .minus(lineItem.vatAmount),
        new Prisma.Decimal(0),
      ).toDecimalPlaces(2);
    }
    const monthlyBilling = billingMonths.map((month) => {
      const history = this.getMonthlyBillingHistory(monthlyHistory, month);
      const monthLineItems = lineItems.filter(
        (item) => item.billingMonth === month,
      );
      const commissionDeductedThisPayout = this.sumDecimalValues(
        monthLineItems.map((item) => item.platformCommissionAmount),
      );
      const monthlyFeeAmount = this.resolveMonthlyPayoutFee(plan);
      const monthlyFeeScheduledToDate = this.resolveMonthlyFeeScheduledToDate(
        monthlyFeeAmount,
        month,
        period.to,
      );
      const monthlyFeeDue = Prisma.Decimal.max(
        monthlyFeeScheduledToDate.minus(history.monthlyFeeDeductedAmount),
        new Prisma.Decimal(0),
      );
      const availablePayout = this.sumDecimalValues(
        monthLineItems.map((item) => item.restaurantPayoutAmount),
      );
      const monthlyFeeVatMultiplier = new Prisma.Decimal(1).plus(
        new Prisma.Decimal(plan?.vatPercentage ?? 0).div(100),
      );
      let monthlyFeeDeductedThisPayout = Prisma.Decimal.min(
        monthlyFeeDue,
        availablePayout.div(monthlyFeeVatMultiplier),
      ).toDecimalPlaces(2);

      for (const item of monthLineItems) {
        if (monthlyFeeDeductedThisPayout.lessThanOrEqualTo(0)) break;
        const lineFee = Prisma.Decimal.min(
          item.restaurantPayoutAmount.div(monthlyFeeVatMultiplier),
          monthlyFeeDeductedThisPayout,
        ).toDecimalPlaces(2);
        const lineFeeVat = lineFee
          .mul(plan?.vatPercentage ?? 0)
          .div(100)
          .toDecimalPlaces(2);
        item.monthlyFeeAmount = lineFee;
        item.monthlyFeeVatAmount = lineFeeVat;
        item.vatAmount = item.vatAmount.plus(lineFeeVat).toDecimalPlaces(2);
        item.restaurantPayoutAmount = item.restaurantPayoutAmount
          .minus(lineFee)
          .minus(lineFeeVat)
          .toDecimalPlaces(2);
        monthlyFeeDeductedThisPayout =
          monthlyFeeDeductedThisPayout.minus(lineFee);
      }

      const deductedThisPayout = this.sumDecimalValues(
        monthLineItems.map((item) => item.monthlyFeeAmount),
      );
      const commissionDeductedThisMonth = history.commissionDeductedAmount
        .plus(commissionDeductedThisPayout)
        .toDecimalPlaces(2);
      const monthlyFeeDeductedThisMonth = history.monthlyFeeDeductedAmount
        .plus(deductedThisPayout)
        .toDecimalPlaces(2);
      const commissionCapAmount =
        plan?.commissionCapAmount !== null &&
        plan?.commissionCapAmount !== undefined
          ? new Prisma.Decimal(plan.commissionCapAmount)
          : null;

      return {
        month,
        commissionCapAmount,
        commissionDeductedBefore: history.commissionDeductedAmount,
        commissionDeductedThisPayout,
        commissionDeductedThisMonth,
        commissionCapRemaining:
          commissionCapAmount === null
            ? null
            : Prisma.Decimal.max(
                commissionCapAmount.minus(commissionDeductedThisMonth),
                new Prisma.Decimal(0),
              ).toDecimalPlaces(2),
        monthlyFeeAmount,
        monthlyFeeScheduledToDate,
        monthlyFeeDeductedBefore: history.monthlyFeeDeductedAmount,
        monthlyFeeDeductedThisPayout: deductedThisPayout,
        monthlyFeeDeductedThisMonth,
        monthlyFeeOutstandingAmount: Prisma.Decimal.max(
          monthlyFeeAmount.minus(monthlyFeeDeductedThisMonth),
          new Prisma.Decimal(0),
        ).toDecimalPlaces(2),
      };
    });
    const totalOrderAmount = lineItems.reduce(
      (sum, item) => sum.plus(item.totalOrderAmount),
      new Prisma.Decimal(0),
    );
    const grossAmount = lineItems.reduce(
      (sum, item) => sum.plus(item.grossAmount),
      new Prisma.Decimal(0),
    );
    const platformCommissionAmount = lineItems.reduce(
      (sum, item) => sum.plus(item.platformCommissionAmount),
      new Prisma.Decimal(0),
    );
    const restaurantTransactionFeeAmount = lineItems.reduce(
      (sum, item) => sum.plus(item.transactionFeeAmount),
      new Prisma.Decimal(0),
    );
    const vatAmount = lineItems.reduce(
      (sum, item) => sum.plus(item.vatAmount),
      new Prisma.Decimal(0),
    );
    const previousPayoutAmount = lineItems.reduce(
      (sum, item) => sum.plus(item.previousPayoutAmount),
      new Prisma.Decimal(0),
    );
    const monthlyFeeDeductedAmount = this.sumDecimalValues(
      monthlyBilling.map((item) => item.monthlyFeeDeductedThisPayout),
    );
    const monthlyFeeOutstandingAmount = this.sumDecimalValues(
      monthlyBilling.map((item) => item.monthlyFeeOutstandingAmount),
    );
    const restaurantPayoutAmount = this.sumDecimalValues(
      lineItems.map((item) => item.restaurantPayoutAmount),
    );
    const currency = defaultCurrency;

    return {
      invoiceNumber: this.buildWeeklyPayoutInvoiceNumber(
        restaurant.id,
        period.from,
        period.to,
      ),
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        billingEmail: this.resolveRestaurantPayoutEmail(restaurant),
        address: this.resolveRestaurantPayoutAddress(restaurant),
        taxNumber: this.resolveRestaurantPayoutTaxNumber(restaurant),
      },
      tenant: restaurant.tenant,
      subscription: subscription
        ? {
            id: subscription.id,
            billingInterval: plan?.billingInterval ?? BillingInterval.MONTHLY,
            payoutCycle: plan?.payoutCycle ?? PackagePayoutCycle.WEEKLY,
          }
        : null,
      issuedAt: new Date(),
      period,
      lineItems: lineItems.map((item) => ({
        ...item,
        grossAmount: Number(item.grossAmount),
        totalOrderAmount: Number(item.totalOrderAmount),
        platformCommissionAmount: Number(item.platformCommissionAmount),
        transactionFeeAmount: Number(item.transactionFeeAmount),
        vatAmount: Number(item.vatAmount),
        restaurantPayoutAmount: Number(item.restaurantPayoutAmount),
        previousPayoutAmount: Number(item.previousPayoutAmount),
        monthlyFeeAmount: Number(item.monthlyFeeAmount),
        monthlyFeeVatAmount: Number(item.monthlyFeeVatAmount),
      })),
      monthlyBilling: {
        months: monthlyBilling.map((item) =>
          Object.fromEntries(
            Object.entries(item).map(([key, value]) => [
              key,
              value instanceof Prisma.Decimal ? Number(value) : value,
            ]),
          ),
        ),
      },
      totals: {
        ordersCount: lineItems.length,
        totalOrderAmount: Number(totalOrderAmount.toDecimalPlaces(2)),
        grossAmount: Number(grossAmount.toDecimalPlaces(2)),
        platformCommissionAmount: Number(
          platformCommissionAmount.toDecimalPlaces(2),
        ),
        restaurantTransactionFeeAmount: Number(
          restaurantTransactionFeeAmount.toDecimalPlaces(2),
        ),
        vatPercentage: Number(plan?.vatPercentage ?? 0),
        vatAmount: Number(vatAmount.toDecimalPlaces(2)),
        previousPayoutAmount: Number(previousPayoutAmount.toDecimalPlaces(2)),
        monthlyFeeDeductedAmount: Number(monthlyFeeDeductedAmount),
        monthlyFeeOutstandingAmount: Number(monthlyFeeOutstandingAmount),
        restaurantPayoutAmount: Number(restaurantPayoutAmount),
        currency,
      },
      note: 'Customer order payments are collected by super admin first; this weekly invoice summarizes the net payout due to the restaurant.',
    };
  }

  private toWeeklyPayoutOrderLine(
    order: RestaurantPayoutOrder,
    plan: ReturnType<
      PackagePlansService['resolveSubscriptionInvoicePlan']
    > | null,
    defaultCurrency: string,
    previouslyPaidAmount = new Prisma.Decimal(0),
    remainingCommissionCap: Prisma.Decimal | null = null,
  ) {
    const grossAmount = new Prisma.Decimal(order.totalAmount).toDecimalPlaces(
      2,
    );
    const platformCommissionAmount = this.calculateOrderCommission(
      grossAmount,
      plan,
      remainingCommissionCap,
    );
    const calculatedRestaurantPayoutAmount = Prisma.Decimal.max(
      grossAmount.minus(platformCommissionAmount),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    const priorPayoutAmount = Prisma.Decimal.min(
      previouslyPaidAmount.toDecimalPlaces(2),
      calculatedRestaurantPayoutAmount,
    );
    const restaurantPayoutAmount = Prisma.Decimal.max(
      calculatedRestaurantPayoutAmount.minus(priorPayoutAmount),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);

    return {
      orderId: order.id,
      branch: order.branch,
      orderType: order.orderType,
      paymentMethod: order.paymentMethod,
      paidAt: order.paidAt,
      grossAmount,
      platformCommissionAmount,
      restaurantPayoutAmount,
      previousPayoutAmount: priorPayoutAmount,
      currency: defaultCurrency,
      providerReference: order.transactions[0]?.providerRef ?? null,
    };
  }

  private async listSpecialPayoutSummary(restaurantId: string) {
    const invoices =
      await this.packagePlansRepository.listRestaurantSpecialPayoutInvoices?.(
        restaurantId,
      );
    const payoutAmountsByOrder = new Map<string, Prisma.Decimal>();
    let commissionAmount = new Prisma.Decimal(0);

    for (const invoice of invoices ?? []) {
      const snapshot = this.asJsonObject(invoice.snapshot);
      const lineItems = Array.isArray(snapshot.lineItems)
        ? snapshot.lineItems
        : [];

      for (const item of lineItems) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          continue;
        }
        const line = item as Record<string, Prisma.JsonValue>;
        const orderId = this.readString(line.orderId);
        if (!orderId) {
          continue;
        }
        const amount = this.readDecimal(line.restaurantPayoutAmount);
        payoutAmountsByOrder.set(
          orderId,
          (payoutAmountsByOrder.get(orderId) ?? new Prisma.Decimal(0)).plus(
            amount,
          ),
        );
        commissionAmount = commissionAmount.plus(
          this.readDecimal(line.platformCommissionAmount),
        );
      }
    }

    return {
      payoutAmountsByOrder,
      commissionAmount: commissionAmount.toDecimalPlaces(2),
    };
  }

  private async listMonthlyBillingHistory(
    restaurantId: string,
    billingMonths: string[],
    excludeSourceKey?: string,
  ) {
    const history = new Map<string, MonthlyBillingHistory>();

    if (
      typeof this.packagePlansRepository.listRestaurantMonthlyPayoutInvoices !==
      'function'
    ) {
      return history;
    }

    for (const month of billingMonths) {
      const { from, to } = this.resolveBillingMonthPeriod(month);
      const invoices =
        await this.packagePlansRepository.listRestaurantMonthlyPayoutInvoices(
          restaurantId,
          from,
          to,
          excludeSourceKey,
        );
      let commissionDeductedAmount = new Prisma.Decimal(0);
      let monthlyFeeDeductedAmount = new Prisma.Decimal(0);

      for (const invoice of invoices) {
        const snapshot = this.asJsonObject(invoice.snapshot);
        const monthlyBilling = this.asJsonObject(snapshot.monthlyBilling);
        const months = Array.isArray(monthlyBilling.months)
          ? monthlyBilling.months
          : [];
        const storedMonth = months.find((item) => {
          const record = this.asJsonObject(item);
          return this.readString(record.month) === month;
        });

        if (storedMonth) {
          const record = this.asJsonObject(storedMonth);
          commissionDeductedAmount = commissionDeductedAmount.plus(
            this.readDecimal(record.commissionDeductedThisPayout),
          );
          monthlyFeeDeductedAmount = monthlyFeeDeductedAmount.plus(
            this.readDecimal(record.monthlyFeeDeductedThisPayout),
          );
          continue;
        }

        const lineItems = Array.isArray(snapshot.lineItems)
          ? snapshot.lineItems
          : [];
        for (const item of lineItems) {
          const line = this.asJsonObject(item);
          const paidAt = this.readString(line.paidAt);
          if (paidAt && this.toBillingMonth(new Date(paidAt)) === month) {
            commissionDeductedAmount = commissionDeductedAmount.plus(
              this.readDecimal(line.platformCommissionAmount),
            );
          }
        }
      }

      history.set(month, {
        commissionDeductedAmount: commissionDeductedAmount.toDecimalPlaces(2),
        monthlyFeeDeductedAmount: monthlyFeeDeductedAmount.toDecimalPlaces(2),
      });
    }

    return history;
  }

  private getMonthlyBillingHistory(
    history: Map<string, MonthlyBillingHistory>,
    month: string,
  ) {
    return (
      history.get(month) ?? {
        commissionDeductedAmount: new Prisma.Decimal(0),
        monthlyFeeDeductedAmount: new Prisma.Decimal(0),
      }
    );
  }

  private listPayoutBillingMonths(
    period: { from: Date; to: Date },
    orders: RestaurantPayoutOrder[],
  ) {
    const months = new Set<string>();
    const cursor = new Date(
      Date.UTC(period.from.getUTCFullYear(), period.from.getUTCMonth(), 1),
    );
    const lastInstant = new Date(period.to.getTime() - 1);
    const end = new Date(
      Date.UTC(lastInstant.getUTCFullYear(), lastInstant.getUTCMonth(), 1),
    );

    while (cursor <= end) {
      months.add(this.toBillingMonth(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    for (const order of orders) {
      months.add(this.toBillingMonth(order.paidAt ?? order.createdAt));
    }

    return [...months].sort();
  }

  private resolveBillingMonthPeriod(month: string) {
    const [year, monthNumber] = month.split('-').map(Number);
    const from = new Date(Date.UTC(year, monthNumber - 1, 1));
    const to = new Date(Date.UTC(year, monthNumber, 1));
    return { from, to };
  }

  private toBillingMonth(date: Date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private resolveMonthlyPayoutFee(
    plan: ReturnType<
      PackagePlansService['resolveSubscriptionInvoicePlan']
    > | null,
  ) {
    if (
      !plan ||
      plan.billingInterval !== BillingInterval.MONTHLY ||
      new Prisma.Decimal(plan.planPrice).lessThanOrEqualTo(0)
    ) {
      return new Prisma.Decimal(0);
    }

    return new Prisma.Decimal(plan.planPrice).toDecimalPlaces(2);
  }

  private resolveMonthlyFeeScheduledToDate(
    monthlyFeeAmount: Prisma.Decimal,
    month: string,
    periodTo: Date,
  ) {
    if (monthlyFeeAmount.lessThanOrEqualTo(0)) {
      return new Prisma.Decimal(0);
    }

    const { from, to } = this.resolveBillingMonthPeriod(month);
    const coveredTo = new Date(Math.min(periodTo.getTime(), to.getTime()));
    if (coveredTo <= from) return new Prisma.Decimal(0);
    if (coveredTo >= to) return monthlyFeeAmount;

    const lastCoveredDay = new Date(coveredTo.getTime() - 1).getUTCDate();
    const installments = Math.min(4, Math.ceil(lastCoveredDay / 7));
    const regularInstallment = monthlyFeeAmount.div(4).toDecimalPlaces(2);

    if (installments < 4) {
      return regularInstallment.mul(installments).toDecimalPlaces(2);
    }
    return monthlyFeeAmount;
  }

  private sumDecimalValues(values: Prisma.Decimal[]) {
    return values
      .reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0))
      .toDecimalPlaces(2);
  }

  private calculateOrderCommission(
    grossAmount: Prisma.Decimal,
    plan: ReturnType<
      PackagePlansService['resolveSubscriptionInvoicePlan']
    > | null,
    remainingCommissionCap: Prisma.Decimal | null = null,
  ) {
    if (!plan) {
      return new Prisma.Decimal(0);
    }

    let commission =
      plan.commissionType === PackageCommissionType.FIXED
        ? new Prisma.Decimal(plan.commissionFixedAmount)
        : grossAmount.mul(plan.commissionPercentage).div(100);

    const cap =
      remainingCommissionCap ??
      (plan.commissionCapAmount !== null
        ? new Prisma.Decimal(plan.commissionCapAmount)
        : null);

    if (cap !== null) {
      commission = Prisma.Decimal.min(commission, cap);
    }

    return Prisma.Decimal.min(commission, grossAmount).toDecimalPlaces(2);
  }

  private calculatePayoutSummaryCommission(
    lineItems: Array<{
      totalOrderAmount: Prisma.Decimal;
      platformCommissionAmount: Prisma.Decimal;
    }>,
    plan: ReturnType<
      PackagePlansService['resolveSubscriptionInvoicePlan']
    > | null,
    remainingCommissionCap: Prisma.Decimal | null,
  ) {
    if (!plan || plan.commissionType === PackageCommissionType.FIXED) {
      return lineItems.reduce(
        (sum, item) => sum.plus(item.platformCommissionAmount),
        new Prisma.Decimal(0),
      );
    }

    const totalOrderAmount = lineItems.reduce(
      (sum, item) => sum.plus(item.totalOrderAmount),
      new Prisma.Decimal(0),
    );
    let commission = totalOrderAmount.mul(plan.commissionPercentage).div(100);

    if (remainingCommissionCap !== null) {
      commission = Prisma.Decimal.min(commission, remainingCommissionCap);
    }

    return Prisma.Decimal.min(commission, totalOrderAmount).toDecimalPlaces(2);
  }

  private resolvePayoutInvoicePeriod(
    query: WeeklyRestaurantPayoutInvoiceQueryDto,
    payoutCycle: PackagePayoutCycle = PackagePayoutCycle.WEEKLY,
  ) {
    const to = query.toDate ? new Date(query.toDate) : new Date();
    const from = query.fromDate
      ? new Date(query.fromDate)
      : this.resolveLastCompletedPayoutPeriod(payoutCycle, to).from;

    if (from >= to) {
      throw new BadRequestException('toDate must be after fromDate');
    }

    return { from, to };
  }

  private buildWeeklyPayoutInvoiceNumber(
    restaurantId: string,
    from: Date,
    to: Date,
  ) {
    const fromStamp = from.toISOString().slice(0, 10).replace(/-/g, '');
    const toStamp = to.toISOString().slice(0, 10).replace(/-/g, '');
    return `PAYOUT-${restaurantId.slice(-6).toUpperCase()}-${fromStamp}-${toStamp}`;
  }

  private buildSpecialPayoutInvoiceNumber(
    restaurantId: string,
    payoutRequestId: string,
    paidAt: Date,
  ) {
    const paidStamp = paidAt.toISOString().slice(0, 10).replace(/-/g, '');
    return `PAYOUT-${restaurantId.slice(-6).toUpperCase()}-SPECIAL-${paidStamp}-${payoutRequestId.slice(-6).toUpperCase()}`;
  }

  private resolveRestaurantPayoutEmail(restaurant: RestaurantPayoutScope) {
    const settings = this.asJsonObject(restaurant.settings);
    const supportContact = this.asJsonObject(restaurant.supportContact);

    return (
      this.readNestedString(settings, ['invoice', 'email']) ??
      this.readNestedString(settings, ['billing', 'email']) ??
      this.readNestedString(settings, ['email']) ??
      this.readNestedString(supportContact, ['email'])
    );
  }

  private async resolveDefaultCurrency() {
    return (
      (await this.globalSettingsService?.getDefaultCurrencyCode()) ?? 'PKR'
    );
  }

  private normalizePlanInput(
    dto: CreatePackagePlanDto | UpdatePackagePlanDto,
  ): NormalizedPlanInput {
    return {
      name: dto.name?.trim(),
      description:
        dto.description !== undefined
          ? dto.description?.trim() || null
          : undefined,
      billingModel: dto.billingModel,
      billingInterval: dto.billingInterval,
      planPrice:
        dto.planPrice !== undefined
          ? new Prisma.Decimal(dto.planPrice)
          : undefined,
      commissionType: dto.commissionType,
      commissionPercentage:
        dto.commissionPercentage !== undefined
          ? new Prisma.Decimal(dto.commissionPercentage)
          : undefined,
      commissionFixedAmount:
        dto.commissionFixedAmount !== undefined
          ? new Prisma.Decimal(dto.commissionFixedAmount)
          : undefined,
      commissionCapAmount:
        dto.commissionCapAmount !== undefined
          ? new Prisma.Decimal(dto.commissionCapAmount)
          : undefined,
      vatPercentage:
        dto.vatPercentage !== undefined
          ? new Prisma.Decimal(dto.vatPercentage)
          : undefined,
      payoutCycle: dto.payoutCycle,
      termsDocumentUrl:
        dto.termsDocumentUrl !== undefined
          ? dto.termsDocumentUrl.trim() || null
          : undefined,
      currency: dto.currency?.trim().toUpperCase(),
      trialDays: dto.trialDays,
      features:
        dto.features !== undefined
          ? Object.keys(dto.features).length > 0
            ? (dto.features as Prisma.InputJsonValue)
            : Prisma.JsonNull
          : undefined,
      isActive: dto.isActive,
      isDefault: dto.isDefault,
    };
  }

  private async getSubscriptionOrThrow(id: string) {
    const subscription =
      await this.packagePlansRepository.findSubscriptionById(id);
    if (!subscription) {
      throw new NotFoundException('Tenant subscription not found');
    }

    return subscription;
  }

  private normalizeAdjustmentMetadata(
    dto: Pick<
      CreateSubscriptionDeductionDto | UpdateSubscriptionDeductionDto,
      'direction' | 'source' | 'moduleCode'
    >,
    existing?: {
      direction?: SubscriptionAdjustmentDirection | null;
      source?: SubscriptionAdjustmentSource | null;
      moduleCode?: string | null;
    },
  ) {
    const direction =
      dto.direction ??
      existing?.direction ??
      SubscriptionAdjustmentDirection.CREDIT;
    const source =
      dto.source ?? existing?.source ?? SubscriptionAdjustmentSource.CUSTOM;
    const moduleCode =
      dto.moduleCode !== undefined
        ? dto.moduleCode.trim().toUpperCase() || null
        : source === SubscriptionAdjustmentSource.MODULE
          ? (existing?.moduleCode ?? null)
          : null;

    if (source === SubscriptionAdjustmentSource.MODULE) {
      if (!moduleCode) {
        throw new BadRequestException('moduleCode is required for module fees');
      }
      if (direction !== SubscriptionAdjustmentDirection.CHARGE) {
        throw new BadRequestException('Module fees must be charges');
      }
    }

    if (source === SubscriptionAdjustmentSource.CUSTOM && moduleCode) {
      throw new BadRequestException(
        'moduleCode is only allowed for module fees',
      );
    }

    return { direction, source, moduleCode };
  }

  private async buildSubscriptionInvoice(id: string) {
    const subscription = await this.getSubscriptionOrThrow(id);
    const plan = this.resolveSubscriptionInvoicePlan(subscription);
    const servicePeriod = this.resolveSubscriptionInvoicePeriod(
      subscription,
      plan.billingInterval,
    );
    const commissionOrders = subscription.restaurantId
      ? await this.packagePlansRepository.listPaidRestaurantOrders(
          subscription.restaurantId,
          servicePeriod.from,
          servicePeriod.to,
          true,
        )
      : [];
    const deductions = this.packagePlansRepository.listApplicableDeductions
      ? await this.packagePlansRepository.listApplicableDeductions(
          {
            id: subscription.id,
            tenantId: subscription.tenantId,
            restaurantId: subscription.restaurantId,
          },
          servicePeriod.to,
        )
      : [];
    const payoutActivity =
      subscription.restaurantId &&
      this.packagePlansRepository.listSubscriptionPayoutActivity
        ? await this.packagePlansRepository.listSubscriptionPayoutActivity(
            subscription.tenantId,
            subscription.restaurantId,
            servicePeriod.from,
            servicePeriod.to,
          )
        : [];
    const billingMonths = this.listPayoutBillingMonths(
      servicePeriod,
      commissionOrders,
    );
    const monthlyBillingHistory = subscription.restaurantId
      ? await this.listMonthlyBillingHistory(
          subscription.restaurantId,
          billingMonths,
        )
      : new Map<string, MonthlyBillingHistory>();

    return this.toSubscriptionInvoice(
      subscription,
      plan,
      servicePeriod,
      commissionOrders,
      deductions,
      payoutActivity,
      monthlyBillingHistory,
    );
  }

  private toSubscriptionInvoice(
    subscription: TenantSubscriptionDetails,
    plan: ReturnType<PackagePlansService['resolveSubscriptionInvoicePlan']>,
    servicePeriod: { from: Date; to: Date },
    commissionOrders: RestaurantPayoutOrder[],
    deductions: SubscriptionDeduction[],
    payoutActivity: SubscriptionPayoutActivity[],
    monthlyBillingHistory: Map<string, MonthlyBillingHistory>,
  ) {
    const subscriptionFeeAmount = new Prisma.Decimal(plan.planPrice)
      .toDecimalPlaces(2)
      .toNumber();
    const onlineOrders = commissionOrders.filter((order) =>
      this.isOnlinePaymentOrder(order),
    );
    const onlinePaidOrders = onlineOrders.filter(
      (order) => order.paymentStatus === PaymentStatus.PAID,
    );
    const offlineOrders = commissionOrders.filter(
      (order) => !this.isOnlinePaymentOrder(order),
    );
    const transactionFeeAmount = this.calculateOrdersCommission(
      commissionOrders,
      plan,
    )
      .toDecimalPlaces(2)
      .toNumber();
    const onlinePaymentCollectedAmount = onlinePaidOrders
      .reduce(
        (sum, order) =>
          sum.plus(new Prisma.Decimal(order.totalAmount).toDecimalPlaces(2)),
        new Prisma.Decimal(0),
      )
      .toDecimalPlaces(2)
      .toNumber();
    const weeklyCommissionDeductedAmount = Prisma.Decimal.min(
      this.sumDecimalValues(
        [...monthlyBillingHistory.values()].map(
          (history) => history.commissionDeductedAmount,
        ),
      ),
      new Prisma.Decimal(transactionFeeAmount),
    )
      .toDecimalPlaces(2)
      .toNumber();
    const weeklyMonthlyFeeDeductedAmount = Prisma.Decimal.min(
      this.sumDecimalValues(
        [...monthlyBillingHistory.values()].map(
          (history) => history.monthlyFeeDeductedAmount,
        ),
      ),
      new Prisma.Decimal(subscriptionFeeAmount),
    )
      .toDecimalPlaces(2)
      .toNumber();
    const hasWeeklyPayoutDeductions =
      weeklyCommissionDeductedAmount > 0 || weeklyMonthlyFeeDeductedAmount > 0;
    const onlinePaymentCreditAmount = hasWeeklyPayoutDeductions
      ? 0
      : onlinePaymentCollectedAmount;
    const adjustmentItems = this.toInvoiceDeductionItems(
      deductions,
      plan.currency,
    );
    const additionalChargeAmount = adjustmentItems
      .filter(
        (item) => item.direction === SubscriptionAdjustmentDirection.CHARGE,
      )
      .reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0))
      .toDecimalPlaces(2)
      .toNumber();
    const deductionAmount = adjustmentItems
      .filter(
        (item) => item.direction === SubscriptionAdjustmentDirection.CREDIT,
      )
      .reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0))
      .toDecimalPlaces(2)
      .toNumber();
    const subtotal = Number(
      (
        subscriptionFeeAmount +
        transactionFeeAmount +
        additionalChargeAmount -
        deductionAmount -
        weeklyCommissionDeductedAmount -
        weeklyMonthlyFeeDeductedAmount
      ).toFixed(2),
    );
    const vatAmount = Number(
      ((subtotal * plan.vatPercentage) / 100).toFixed(2),
    );
    const totalFeesAmount = Number((subtotal + vatAmount).toFixed(2));
    const settlementBalanceAmount = Number(
      (totalFeesAmount - onlinePaymentCreditAmount).toFixed(2),
    );
    const amountDue = Math.max(settlementBalanceAmount, 0);
    const creditAmount = Math.max(-settlementBalanceAmount, 0);
    const documentType = creditAmount > 0 ? 'CREDIT_NOTE' : 'INVOICE';
    const issuedAt = new Date();
    const lineItems = [
      {
        description: `${plan.name} ${plan.billingInterval.toLowerCase()} subscription`,
        quantity: 1,
        unitPrice: subscriptionFeeAmount,
        amount: subscriptionFeeAmount,
      },
    ];

    if (transactionFeeAmount > 0 || this.isTransactionFeePlan(plan)) {
      lineItems.push({
        description: `Order commission for ${commissionOrders.length} confirmed order${commissionOrders.length === 1 ? '' : 's'}`,
        quantity: commissionOrders.length,
        unitPrice: transactionFeeAmount,
        amount: transactionFeeAmount,
      });
    }

    if (weeklyMonthlyFeeDeductedAmount > 0) {
      lineItems.push({
        description: 'Monthly fee withheld from weekly payouts',
        quantity: 1,
        unitPrice: -weeklyMonthlyFeeDeductedAmount,
        amount: -weeklyMonthlyFeeDeductedAmount,
      });
    }

    if (weeklyCommissionDeductedAmount > 0) {
      lineItems.push({
        description: 'Commission withheld from weekly payouts',
        quantity: 1,
        unitPrice: -weeklyCommissionDeductedAmount,
        amount: -weeklyCommissionDeductedAmount,
      });
    }

    if (onlinePaymentCreditAmount > 0) {
      lineItems.push({
        description: `Online payment credit from ${onlinePaidOrders.length} paid order${onlinePaidOrders.length === 1 ? '' : 's'}`,
        quantity: 1,
        unitPrice: -onlinePaymentCreditAmount,
        amount: -onlinePaymentCreditAmount,
      });
    }

    for (const item of adjustmentItems) {
      const isCharge =
        item.direction === SubscriptionAdjustmentDirection.CHARGE;
      lineItems.push({
        description: this.formatAdjustmentLineDescription(item),
        quantity: 1,
        unitPrice: isCharge ? item.amount : -item.amount,
        amount: isCharge ? item.amount : -item.amount,
      });
    }

    return {
      documentType,
      invoiceNumber: this.buildSubscriptionInvoiceNumber(
        subscription.id,
        servicePeriod.to,
        documentType,
      ),
      subscriptionId: subscription.id,
      tenant: subscription.tenant,
      restaurant: subscription.restaurant
        ? {
            id: subscription.restaurant.id,
            name: subscription.restaurant.name,
            slug: subscription.restaurant.slug,
            billingEmail: this.resolveRestaurantBillingEmail(subscription),
            address: this.resolveRestaurantBillingAddress(subscription),
            taxNumber: this.resolveRestaurantTaxNumber(subscription),
          }
        : null,
      packagePlan: {
        id: plan.id,
        name: plan.name,
        billingModel: plan.billingModel,
        billingInterval: plan.billingInterval,
        planPrice: plan.planPrice,
        commissionType: plan.commissionType,
        commissionPercentage: plan.commissionPercentage,
        commissionFixedAmount: plan.commissionFixedAmount,
        commissionCapAmount: plan.commissionCapAmount,
        vatPercentage: plan.vatPercentage,
        payoutCycle: plan.payoutCycle,
        payoutCycleOverride: plan.payoutCycleOverride,
        currency: plan.currency,
      },
      status: subscription.status,
      paymentStatus: subscription.paymentStatus,
      issuedAt,
      dueAt: subscription.nextBillingAt,
      servicePeriod,
      lineItems,
      transactionFee: {
        ordersCount: commissionOrders.length,
        amount: transactionFeeAmount,
      },
      weeklyPayoutDeductions: {
        commissionAmount: weeklyCommissionDeductedAmount,
        monthlyFeeAmount: weeklyMonthlyFeeDeductedAmount,
        totalAmount: Number(
          (
            weeklyCommissionDeductedAmount + weeklyMonthlyFeeDeductedAmount
          ).toFixed(2),
        ),
      },
      adjustments: adjustmentItems,
      additionalCharges: adjustmentItems.filter(
        (item) => item.direction === SubscriptionAdjustmentDirection.CHARGE,
      ),
      deductions: adjustmentItems.filter(
        (item) => item.direction === SubscriptionAdjustmentDirection.CREDIT,
      ),
      orderBreakdown: this.buildSubscriptionOrderBreakdown(
        commissionOrders,
        onlineOrders,
        offlineOrders,
        plan.currency,
      ),
      payoutActivity: this.buildSubscriptionPayoutActivity(
        payoutActivity,
        servicePeriod,
        plan.currency,
      ),
      totals: {
        subscriptionFeeAmount,
        transactionFeeAmount,
        weeklyCommissionDeductedAmount,
        weeklyMonthlyFeeDeductedAmount,
        additionalChargeAmount,
        deductionAmount,
        subtotal,
        vatPercentage: plan.vatPercentage,
        vatAmount,
        totalFeesAmount,
        onlinePaymentCreditAmount,
        onlinePaymentCollectedAmount,
        settlementBalanceAmount,
        amountDue,
        creditAmount,
        totalAmount: amountDue,
        currency: plan.currency,
      },
      note: subscription.note,
    };
  }

  private buildSubscriptionPayoutActivity(
    requests: SubscriptionPayoutActivity[],
    servicePeriod: { from: Date; to: Date },
    currency: string,
  ) {
    const isInPeriod = (date: Date | null) =>
      date !== null && date >= servicePeriod.from && date < servicePeriod.to;
    const sum = (dates: (request: SubscriptionPayoutActivity) => Date | null) =>
      requests
        .filter((request) => isInPeriod(dates(request)))
        .reduce(
          (total, request) => total.plus(request.amount),
          new Prisma.Decimal(0),
        )
        .toDecimalPlaces(2)
        .toNumber();

    return {
      currency,
      summary: {
        requestedCount: requests.filter((request) =>
          isInPeriod(request.createdAt),
        ).length,
        requestedAmount: sum((request) => request.createdAt),
        approvedCount: requests.filter((request) =>
          isInPeriod(request.approvedAt),
        ).length,
        approvedAmount: sum((request) => request.approvedAt),
        rejectedCount: requests.filter((request) =>
          isInPeriod(request.rejectedAt),
        ).length,
        rejectedAmount: sum((request) => request.rejectedAt),
        paidCount: requests.filter((request) => isInPeriod(request.paidAt))
          .length,
        paidAmount: sum((request) => request.paidAt),
      },
      requests: requests.map((request) => ({
        id: request.id,
        branchId: request.branchId,
        status: request.status,
        amount: new Prisma.Decimal(request.amount)
          .toDecimalPlaces(2)
          .toNumber(),
        currency: request.currency,
        note: request.note,
        rejectionReason: request.rejectionReason,
        approvalNote: request.approvalNote,
        paymentReference: request.paymentReference,
        paidNote: request.paidNote,
        requestedAt: request.createdAt,
        approvedAt: request.approvedAt,
        rejectedAt: request.rejectedAt,
        paidAt: request.paidAt,
      })),
    };
  }

  private calculateOrdersCommission(
    orders: RestaurantPayoutOrder[],
    plan: ReturnType<PackagePlansService['resolveSubscriptionInvoicePlan']>,
  ) {
    const grossAmount = orders.reduce(
      (sum, order) => sum.plus(order.totalAmount),
      new Prisma.Decimal(0),
    );
    let commission =
      plan.commissionType === PackageCommissionType.FIXED
        ? new Prisma.Decimal(plan.commissionFixedAmount).mul(orders.length)
        : grossAmount.mul(plan.commissionPercentage).div(100);

    if (plan.commissionCapAmount !== null) {
      commission = Prisma.Decimal.min(
        commission,
        new Prisma.Decimal(plan.commissionCapAmount),
      );
    }

    return Prisma.Decimal.min(commission, grossAmount).toDecimalPlaces(2);
  }

  private buildSubscriptionOrderBreakdown(
    paidOrders: RestaurantPayoutOrder[],
    onlinePaidOrders: RestaurantPayoutOrder[],
    offlinePaidOrders: RestaurantPayoutOrder[],
    currency: string,
  ) {
    return {
      currency,
      orders: paidOrders.map((order) => ({
        id: order.id,
        date: order.paidAt ?? order.createdAt,
        paidBy: order.paymentMethod,
        status: order.paymentStatus ?? PaymentStatus.PAID,
        total: new Prisma.Decimal(order.totalAmount)
          .toDecimalPlaces(2)
          .toNumber(),
      })),
      summary: {
        offlineOrdersCount: offlinePaidOrders.length,
        offlineTotalAmount: this.sumOrderTotals(offlinePaidOrders),
        onlineOrdersCount: onlinePaidOrders.length,
        onlineTotalAmount: this.sumOrderTotals(onlinePaidOrders),
        totalOrdersCount: paidOrders.length,
        totalOrdersAmount: this.sumOrderTotals(paidOrders),
      },
    };
  }

  private sumOrderTotals(orders: RestaurantPayoutOrder[]) {
    return orders
      .reduce(
        (sum, order) =>
          sum.plus(new Prisma.Decimal(order.totalAmount).toDecimalPlaces(2)),
        new Prisma.Decimal(0),
      )
      .toDecimalPlaces(2)
      .toNumber();
  }

  private isOnlinePaymentOrder(order: RestaurantPayoutOrder) {
    const offlinePaymentMethods = new Set<PaymentMethod>([
      PaymentMethod.COD,
      PaymentMethod.CARD_ON_DELIVERY,
    ]);

    return !offlinePaymentMethods.has(order.paymentMethod);
  }

  private isPlatformCollectedPayoutOrder(order: RestaurantPayoutOrder) {
    const nonPlatformCollectedMethods = new Set<PaymentMethod>([
      PaymentMethod.COD,
      PaymentMethod.CARD_ON_DELIVERY,
      PaymentMethod.WALLET,
    ]);

    return !nonPlatformCollectedMethods.has(order.paymentMethod);
  }

  private resolveSubscriptionInvoicePeriod(
    subscription: TenantSubscriptionDetails,
    billingInterval: BillingInterval,
  ) {
    if (subscription.nextBillingAt) {
      return {
        from: this.resolvePreviousBillingAt(
          billingInterval,
          subscription.nextBillingAt,
        ),
        to: subscription.nextBillingAt,
      };
    }

    return {
      from: subscription.startsAt,
      to: subscription.endsAt ?? subscription.startsAt,
    };
  }

  private resolvePreviousBillingAt(
    billingInterval: BillingInterval,
    billingAt: Date,
  ) {
    const previousBillingAt = new Date(billingAt);

    switch (billingInterval) {
      case BillingInterval.DAILY:
        previousBillingAt.setUTCDate(previousBillingAt.getUTCDate() - 1);
        break;
      case BillingInterval.WEEKLY:
        previousBillingAt.setUTCDate(previousBillingAt.getUTCDate() - 7);
        break;
      case BillingInterval.BIWEEKLY:
        previousBillingAt.setUTCDate(previousBillingAt.getUTCDate() - 14);
        break;
      case BillingInterval.YEARLY:
        previousBillingAt.setUTCFullYear(
          previousBillingAt.getUTCFullYear() - 1,
        );
        break;
      case BillingInterval.MONTHLY:
      default:
        previousBillingAt.setUTCMonth(previousBillingAt.getUTCMonth() - 1);
        break;
    }

    return previousBillingAt;
  }

  private isTransactionFeePlan(
    plan: ReturnType<PackagePlansService['resolveSubscriptionInvoicePlan']>,
  ) {
    return plan.billingModel !== PackageBillingModel.PLAN;
  }

  private resolveSubscriptionInvoicePlan(
    subscription: TenantSubscriptionDetails,
  ) {
    const snapshot = this.asSubscriptionPlanSnapshot(subscription.planSnapshot);
    const packagePlan = subscription.packagePlan;

    return {
      id: snapshot.id ?? packagePlan.id,
      name: snapshot.name ?? packagePlan.name,
      billingModel: snapshot.billingModel ?? packagePlan.billingModel,
      billingInterval: snapshot.billingInterval ?? packagePlan.billingInterval,
      planPrice: snapshot.planPrice ?? packagePlan.planPrice.toNumber(),
      commissionType:
        snapshot.commissionType ??
        packagePlan.commissionType ??
        PackageCommissionType.PERCENTAGE,
      commissionPercentage:
        snapshot.commissionPercentage ??
        packagePlan.commissionPercentage.toNumber(),
      commissionFixedAmount:
        snapshot.commissionFixedAmount ??
        packagePlan.commissionFixedAmount.toNumber(),
      commissionCapAmount:
        snapshot.commissionCapAmount ??
        packagePlan.commissionCapAmount?.toNumber() ??
        null,
      vatPercentage:
        snapshot.vatPercentage ?? packagePlan.vatPercentage.toNumber(),
      payoutCycle:
        subscription.payoutCycleOverride ??
        snapshot.payoutCycle ??
        packagePlan.payoutCycle ??
        PackagePayoutCycle.WEEKLY,
      payoutCycleOverride: subscription.payoutCycleOverride ?? null,
      currency: packagePlan.currency,
    };
  }

  private asSubscriptionPlanSnapshot(
    value: Prisma.JsonValue | null,
  ): SubscriptionPlanSnapshot {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as SubscriptionPlanSnapshot;
  }

  private resolveRestaurantBillingEmail(
    subscription: TenantSubscriptionDetails,
  ) {
    if (!subscription.restaurant) {
      return subscription.tenant.owner?.email?.trim() || null;
    }

    const settings = this.asJsonObject(subscription.restaurant.settings);
    const supportContact = this.asJsonObject(
      subscription.restaurant.supportContact,
    );

    return (
      this.readNestedString(settings, ['invoice', 'email']) ??
      this.readNestedString(settings, ['billing', 'email']) ??
      this.readNestedString(settings, ['email']) ??
      this.readNestedString(supportContact, ['email']) ??
      subscription.tenant.owner?.email?.trim() ??
      null
    );
  }

  private resolveRestaurantBillingAddress(
    subscription: TenantSubscriptionDetails,
  ) {
    if (!subscription.restaurant) return null;
    return this.resolveRestaurantAddressFromSettings(
      subscription.restaurant.settings,
    );
  }

  private resolveRestaurantTaxNumber(subscription: TenantSubscriptionDetails) {
    if (!subscription.restaurant) return null;
    return this.resolveRestaurantTaxNumberFromSettings(
      subscription.restaurant.settings,
    );
  }

  private resolveRestaurantPayoutAddress(restaurant: RestaurantPayoutScope) {
    return this.resolveRestaurantAddressFromSettings(restaurant.settings);
  }

  private resolveRestaurantPayoutTaxNumber(restaurant: RestaurantPayoutScope) {
    return this.resolveRestaurantTaxNumberFromSettings(restaurant.settings);
  }

  private resolveRestaurantAddressFromSettings(
    settings: Prisma.JsonValue | null,
  ) {
    const root = this.asJsonObject(settings);
    const address = this.asJsonObject(
      this.readFirstPath(root, [
        ['legalProfile', 'businessAddress'],
        ['invoice', 'businessAddress'],
        ['invoice', 'billingAddress'],
        ['billing', 'businessAddress'],
        ['billing', 'address'],
        ['businessAddress'],
        ['address'],
      ]),
    );
    const parts = [
      address.street,
      address.area,
      address.postalCode,
      address.city,
      address.state,
      address.country,
    ]
      .map((value) => this.readStringValue(value))
      .filter((value): value is string => Boolean(value));

    return parts.length ? parts.join(', ') : null;
  }

  private resolveRestaurantTaxNumberFromSettings(
    settings: Prisma.JsonValue | null,
  ) {
    const root = this.asJsonObject(settings);

    return this.readSettingsString(
      [root],
      [
        ['legalProfile', 'taxNumber'],
        ['billing', 'taxNumber'],
        ['billing', 'vatNumber'],
        ['invoice', 'taxNumber'],
        ['invoice', 'vatNumber'],
        ['taxNumber'],
        ['vatNumber'],
      ],
    );
  }

  private toInvoiceDeductionItems(
    deductions: SubscriptionDeduction[],
    invoiceCurrency: string,
  ) {
    return deductions
      .filter((item) => item.currency === invoiceCurrency)
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        type: item.type,
        direction: item.direction ?? SubscriptionAdjustmentDirection.CREDIT,
        source: item.source ?? SubscriptionAdjustmentSource.CUSTOM,
        moduleCode: item.moduleCode,
        amount: new Prisma.Decimal(item.amount).toDecimalPlaces(2).toNumber(),
        currency: item.currency,
      }));
  }

  private formatAdjustmentLineDescription(item: {
    title: string;
    type: SubscriptionDeductionType;
    direction: SubscriptionAdjustmentDirection;
    source: SubscriptionAdjustmentSource;
    moduleCode: string | null;
  }) {
    const cadence =
      item.type === SubscriptionDeductionType.RECURRING
        ? 'recurring'
        : 'one-time';
    if (item.source === SubscriptionAdjustmentSource.MODULE) {
      return `${item.title} (${item.moduleCode ?? 'module'} module fee, ${cadence})`;
    }

    return `${item.title} (${cadence} ${item.direction === SubscriptionAdjustmentDirection.CHARGE ? 'charge' : 'credit'})`;
  }

  private buildSubscriptionSettlementRows(
    invoice: Awaited<
      ReturnType<PackagePlansService['buildSubscriptionInvoice']>
    >,
  ) {
    const rows = [
      [
        'Subscription Fee',
        this.formatInvoiceMoney(invoice.totals.subscriptionFeeAmount),
      ],
      [
        'Commission Fee',
        this.formatInvoiceMoney(invoice.totals.transactionFeeAmount),
      ],
    ];

    for (const item of invoice.additionalCharges) {
      rows.push([
        item.source === SubscriptionAdjustmentSource.MODULE
          ? `Module Fee: ${item.title}`
          : `Additional Charge: ${item.title}`,
        this.formatInvoiceMoney(item.amount),
      ]);
    }

    for (const item of invoice.deductions) {
      rows.push([
        `Credit: ${item.title}`,
        `-${this.formatInvoiceMoney(item.amount)}`,
      ]);
    }

    rows.push(
      ['Subtotal', this.formatInvoiceMoney(invoice.totals.subtotal)],
      [
        `VAT (${invoice.totals.vatPercentage}%)`,
        this.formatInvoiceMoney(invoice.totals.vatAmount),
      ],
      ['Fees Total', this.formatInvoiceMoney(invoice.totals.totalFeesAmount)],
      [
        'Online Payment Credit',
        `-${this.formatInvoiceMoney(invoice.totals.onlinePaymentCreditAmount)}`,
      ],
      [
        invoice.documentType === 'CREDIT_NOTE'
          ? 'Credit Note Amount'
          : 'Invoice Amount Due',
        this.formatInvoiceMoney(
          invoice.documentType === 'CREDIT_NOTE'
            ? invoice.totals.creditAmount
            : invoice.totals.amountDue,
        ),
      ],
    );

    return rows;
  }

  private buildSubscriptionInvoiceNumber(
    subscriptionId: string,
    periodTo: Date,
    documentType: string,
  ) {
    const periodStamp = periodTo.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = documentType === 'CREDIT_NOTE' ? 'CRN' : 'SUB-INV';

    return `${prefix}-${subscriptionId.slice(-8).toUpperCase()}-${periodStamp}`;
  }

  private generateSubscriptionInvoicePdf(
    invoice: Awaited<
      ReturnType<PackagePlansService['buildSubscriptionInvoice']>
    >,
  ) {
    return InvoicePdfBuilder.build({
      title: `${this.formatSubscriptionDocumentType(invoice.documentType)} ${invoice.invoiceNumber}`,
      subtitle: invoice.packagePlan.name,
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt,
      brandName: invoice.restaurant?.name ?? invoice.tenant.name,
      headerLines: this.deliveryWaysCompanyHeaderLines(),
      meta: [
        { label: 'Due Date', value: this.formatInvoiceDate(invoice.dueAt) },
        {
          label: 'Service From',
          value: this.formatInvoiceDate(invoice.servicePeriod.from),
        },
        {
          label: 'Service To',
          value: this.formatInvoiceDate(invoice.servicePeriod.to),
        },
        {
          label: 'Billing Cycle',
          value: this.formatInvoiceLabel(invoice.packagePlan.billingInterval),
        },
        { label: 'Invoice Payment Status', value: invoice.paymentStatus },
        { label: 'Currency', value: invoice.totals.currency },
      ],
      sections: [
        {
          title: 'Billed To',
          rows: [
            `Restaurant: ${invoice.restaurant?.name ?? 'N/A'}`,
            `Tenant: ${invoice.tenant.name}`,
            `Email: ${invoice.restaurant?.billingEmail ?? 'N/A'}`,
            `Address: ${invoice.restaurant?.address ?? 'N/A'}`,
            `Tax ID: ${invoice.restaurant?.taxNumber ?? 'N/A'}`,
          ],
        },
        {
          title: 'Settlement',
          tables: [
            {
              columns: [
                { header: 'Description', width: 320 },
                { header: `Amount (${invoice.totals.currency})`, width: 140 },
              ],
              rows: this.buildSubscriptionSettlementRows(invoice),
            },
          ],
          rows: [
            invoice.documentType === 'CREDIT_NOTE'
              ? `Credit Note Amount: ${this.formatInvoiceMoney(invoice.totals.creditAmount)} ${invoice.totals.currency} remaining credit owed to the restaurant after DeliveryWays fees are deducted.`
              : `Invoice Amount Due: ${this.formatInvoiceMoney(invoice.totals.amountDue)} ${invoice.totals.currency}`,
            `Subscription Status: ${invoice.status}`,
            invoice.note ? `Note: ${invoice.note}` : 'Note: N/A',
          ],
        },
        this.buildSubscriptionOrderBreakdownSection(invoice),
        this.buildSubscriptionPayoutActivitySection(invoice),
      ],
    });
  }

  private buildSubscriptionPayoutActivitySection(
    invoice: Awaited<
      ReturnType<PackagePlansService['buildSubscriptionInvoice']>
    >,
  ): InvoicePdfSection {
    const activity = invoice.payoutActivity;
    if (activity.requests.length === 0) {
      return {
        title: 'Payout Activity',
        rows: ['No payout request activity for this service period.'],
      };
    }

    return {
      title: 'Payout Activity',
      pageBreakBefore: true,
      rows: [
        `Requested: ${activity.summary.requestedCount} (${this.formatInvoiceMoney(activity.summary.requestedAmount)} ${activity.currency})`,
        `Approved: ${activity.summary.approvedCount} (${this.formatInvoiceMoney(activity.summary.approvedAmount)} ${activity.currency})`,
        `Rejected: ${activity.summary.rejectedCount} (${this.formatInvoiceMoney(activity.summary.rejectedAmount)} ${activity.currency})`,
        `Paid: ${activity.summary.paidCount} (${this.formatInvoiceMoney(activity.summary.paidAmount)} ${activity.currency})`,
        'Payout activity is informational and does not change the invoice amount due.',
      ],
      tables: [
        {
          columns: [
            { header: 'Request', width: 90 },
            { header: 'Requested', width: 80 },
            { header: 'Status', width: 65 },
            { header: 'Paid', width: 80 },
            { header: `Amount (${activity.currency})`, width: 85 },
            { header: 'Reference', width: 100 },
          ],
          rows: activity.requests.map((request) => [
            request.id,
            this.formatInvoiceDate(request.requestedAt),
            this.formatInvoiceLabel(request.status),
            request.paidAt ? this.formatInvoiceDate(request.paidAt) : 'N/A',
            this.formatInvoiceMoney(request.amount),
            request.paymentReference ?? 'N/A',
          ]),
        },
      ],
    };
  }

  private buildWeeklyPayoutOrderBreakdownSection(
    invoice: Awaited<
      ReturnType<PackagePlansService['buildWeeklyPayoutInvoice']>
    >,
  ) {
    if (!invoice.lineItems.length) {
      return {
        title: 'Order Payout Details',
        pageBreakBefore: true,
        rows: ['No paid orders found for this payout period.'],
      };
    }

    return {
      title: 'Order Payout Details',
      pageBreakBefore: true,
      tables: [
        {
          columns: [
            { header: 'Order ID', width: 106 },
            { header: 'Paid At', width: 70 },
            { header: 'Branch', width: 78 },
            { header: 'Payment', width: 62 },
            { header: `Gross (${invoice.totals.currency})`, width: 58 },
            { header: 'Fee', width: 48 },
            { header: 'Net', width: 58 },
          ],
          rows: invoice.lineItems.map((item) => [
            item.orderId,
            this.formatInvoiceDate(item.paidAt),
            item.branch?.name ?? 'N/A',
            item.paymentMethod ?? 'N/A',
            this.formatInvoiceMoney(item.grossAmount),
            this.formatInvoiceMoney(item.platformCommissionAmount),
            this.formatInvoiceMoney(item.restaurantPayoutAmount),
          ]),
        },
      ],
      rows: [
        `Total Orders: ${invoice.totals.ordersCount}`,
        `Total Successful Order Amount: ${this.formatInvoiceMoney(invoice.totals.totalOrderAmount)} ${invoice.totals.currency}`,
        `Gross Collected: ${this.formatInvoiceMoney(invoice.totals.grossAmount)} ${invoice.totals.currency}`,
        `Platform Commission: ${this.formatInvoiceMoney(invoice.totals.platformCommissionAmount)} ${invoice.totals.currency}`,
        `Restaurant-paid Transaction Fees: ${this.formatInvoiceMoney(invoice.totals.restaurantTransactionFeeAmount)} ${invoice.totals.currency}`,
        `VAT (${invoice.totals.vatPercentage}%): ${this.formatInvoiceMoney(invoice.totals.vatAmount)} ${invoice.totals.currency}`,
        `Restaurant Payout Due: ${this.formatInvoiceMoney(invoice.totals.restaurantPayoutAmount)} ${invoice.totals.currency}`,
      ],
    };
  }

  private buildSubscriptionOrderBreakdownSection(
    invoice: Awaited<
      ReturnType<PackagePlansService['buildSubscriptionInvoice']>
    >,
  ): InvoicePdfSection {
    const { orderBreakdown } = invoice;
    const rows = [
      `Offline/Cash Orders: ${orderBreakdown.summary.offlineOrdersCount}`,
      `Offline/Cash Total: ${this.formatInvoiceMoney(orderBreakdown.summary.offlineTotalAmount)} ${orderBreakdown.currency}`,
      `Online Payment Orders: ${orderBreakdown.summary.onlineOrdersCount}`,
      `Online Payment Total: ${this.formatInvoiceMoney(orderBreakdown.summary.onlineTotalAmount)} ${orderBreakdown.currency}`,
      `Total Orders: ${orderBreakdown.summary.totalOrdersCount}`,
      `Total Revenue: ${this.formatInvoiceMoney(orderBreakdown.summary.totalOrdersAmount)} ${orderBreakdown.currency}`,
    ];

    if (!orderBreakdown.orders.length) {
      return {
        title: 'Order Payment Details',
        pageBreakBefore: true,
        rows: ['No paid orders found for this service period.', ...rows],
      };
    }

    return {
      title: 'Order Payment Details',
      pageBreakBefore: true,
      tables: [
        {
          columns: [
            { header: 'Order ID', width: 150 },
            { header: 'Date', width: 82 },
            { header: 'Paid By', width: 82 },
            { header: 'Status', width: 82 },
            { header: `Total (${orderBreakdown.currency})`, width: 103 },
          ],
          rows: orderBreakdown.orders.map((order) => [
            order.id,
            this.formatInvoiceDate(order.date),
            order.paidBy,
            order.status,
            this.formatInvoiceMoney(order.total),
          ]),
        },
      ],
      rows,
    };
  }

  private buildSubscriptionInvoiceEmailBody(
    invoice: Awaited<
      ReturnType<PackagePlansService['buildSubscriptionInvoice']>
    >,
  ) {
    return [
      `Hi ${invoice.restaurant?.name ?? invoice.tenant.name},`,
      '',
      `Please find attached DeliveryWays ${this.formatSubscriptionDocumentType(invoice.documentType).toLowerCase()} ${invoice.invoiceNumber}.`,
      '',
      `Package: ${invoice.packagePlan.name}`,
      `Service Period: ${this.formatInvoiceDate(invoice.servicePeriod.from)} - ${this.formatInvoiceDate(invoice.servicePeriod.to)}`,
      `Subscription Fee: ${this.formatInvoiceMoney(invoice.totals.subscriptionFeeAmount)} ${invoice.totals.currency}`,
      `Commission Fee: ${this.formatInvoiceMoney(invoice.totals.transactionFeeAmount)} ${invoice.totals.currency}`,
      `Commission Withheld From Weekly Payouts: -${this.formatInvoiceMoney(invoice.totals.weeklyCommissionDeductedAmount)} ${invoice.totals.currency}`,
      `Monthly Fee Withheld From Weekly Payouts: -${this.formatInvoiceMoney(invoice.totals.weeklyMonthlyFeeDeductedAmount)} ${invoice.totals.currency}`,
      `Additional Charges: ${this.formatInvoiceMoney(invoice.totals.additionalChargeAmount)} ${invoice.totals.currency}`,
      `Credits: -${this.formatInvoiceMoney(invoice.totals.deductionAmount)} ${invoice.totals.currency}`,
      `Fees Total: ${this.formatInvoiceMoney(invoice.totals.totalFeesAmount)} ${invoice.totals.currency}`,
      `Online Payment Credit: -${this.formatInvoiceMoney(invoice.totals.onlinePaymentCreditAmount)} ${invoice.totals.currency}`,
      invoice.documentType === 'CREDIT_NOTE'
        ? `Credit Note Amount: ${this.formatInvoiceMoney(invoice.totals.creditAmount)} ${invoice.totals.currency} remaining credit owed to the restaurant after DeliveryWays fees are deducted.`
        : `Invoice Amount Due: ${this.formatInvoiceMoney(invoice.totals.amountDue)} ${invoice.totals.currency}`,
      `Payment Status: ${invoice.paymentStatus}`,
      '',
      'DeliveryWays',
    ].join('\n');
  }

  private generateWeeklyPayoutInvoicePdf(
    invoice: Awaited<
      ReturnType<PackagePlansService['buildWeeklyPayoutInvoice']>
    >,
  ) {
    return InvoicePdfBuilder.build({
      title: `${this.formatInvoiceLabel(invoice.subscription?.payoutCycle ?? PackagePayoutCycle.WEEKLY)} Payout Invoice ${invoice.invoiceNumber}`,
      subtitle: invoice.restaurant.name,
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt,
      brandName: invoice.restaurant.name,
      headerLines: this.deliveryWaysCompanyHeaderLines(),
      meta: [
        {
          label: 'Payout Cycle',
          value: this.formatInvoiceLabel(
            invoice.subscription?.payoutCycle ?? PackagePayoutCycle.WEEKLY,
          ),
        },
        {
          label: 'Payout From',
          value: this.formatInvoiceDate(invoice.period.from),
        },
        {
          label: 'Payout To',
          value: this.formatInvoiceDate(invoice.period.to),
        },
        { label: 'Orders Count', value: invoice.totals.ordersCount },
        { label: 'Currency', value: invoice.totals.currency },
      ],
      sections: [
        {
          title: 'Restaurant',
          rows: [
            `Restaurant: ${invoice.restaurant.name}`,
            `Tenant: ${invoice.tenant.name}`,
            `Email: ${invoice.restaurant.billingEmail ?? 'N/A'}`,
            `Address: ${invoice.restaurant.address ?? 'N/A'}`,
            `Tax ID: ${invoice.restaurant.taxNumber ?? 'N/A'}`,
          ],
        },
        {
          title: 'Settlement',
          tables: [
            {
              columns: [
                { header: 'Description', width: 320 },
                { header: `Amount (${invoice.totals.currency})`, width: 140 },
              ],
              rows: [
                [
                  'Total Successful Order Amount',
                  this.formatInvoiceMoney(invoice.totals.totalOrderAmount),
                ],
                [
                  'Gross Collected By Super Admin',
                  this.formatInvoiceMoney(invoice.totals.grossAmount),
                ],
                [
                  'Platform Commission',
                  this.formatInvoiceMoney(
                    invoice.totals.platformCommissionAmount,
                  ),
                ],
                [
                  'Restaurant-paid Transaction Fees',
                  this.formatInvoiceMoney(
                    invoice.totals.restaurantTransactionFeeAmount,
                  ),
                ],
                [
                  'Monthly Fee Deducted',
                  this.formatInvoiceMoney(
                    invoice.totals.monthlyFeeDeductedAmount,
                  ),
                ],
                [
                  'Monthly Fee Outstanding',
                  this.formatInvoiceMoney(
                    invoice.totals.monthlyFeeOutstandingAmount,
                  ),
                ],
                [
                  `VAT (${invoice.totals.vatPercentage}%)`,
                  this.formatInvoiceMoney(invoice.totals.vatAmount),
                ],
                [
                  'Restaurant Payout Due',
                  this.formatInvoiceMoney(
                    invoice.totals.restaurantPayoutAmount,
                  ),
                ],
              ],
            },
          ],
          rows: [invoice.note],
        },
        {
          title: 'Monthly Billing Status',
          tables: [
            {
              columns: [
                { header: 'Month', width: 70 },
                { header: 'Commission This Payout', width: 115 },
                { header: 'Commission Month Total', width: 115 },
                { header: 'Commission Cap Left', width: 100 },
                { header: 'Monthly Fee Deducted', width: 110 },
                { header: 'Monthly Fee Outstanding', width: 115 },
              ],
              rows: invoice.monthlyBilling.months.map((month) => [
                String(month.month),
                this.formatInvoiceMoney(
                  Number(month.commissionDeductedThisPayout),
                ),
                this.formatInvoiceMoney(
                  Number(month.commissionDeductedThisMonth),
                ),
                month.commissionCapRemaining === null
                  ? 'N/A'
                  : this.formatInvoiceMoney(
                      Number(month.commissionCapRemaining),
                    ),
                this.formatInvoiceMoney(
                  Number(month.monthlyFeeDeductedThisMonth),
                ),
                this.formatInvoiceMoney(
                  Number(month.monthlyFeeOutstandingAmount),
                ),
              ]),
            },
          ],
        },
        this.buildWeeklyPayoutOrderBreakdownSection(invoice),
      ],
    });
  }

  private buildWeeklyPayoutInvoiceEmailBody(
    invoice: Awaited<
      ReturnType<PackagePlansService['buildWeeklyPayoutInvoice']>
    >,
  ) {
    return [
      `Hi ${invoice.restaurant.name},`,
      '',
      `Please find attached DeliveryWays payout invoice ${invoice.invoiceNumber}.`,
      '',
      `Payout Period: ${this.formatInvoiceDate(invoice.period.from)} - ${this.formatInvoiceDate(invoice.period.to)}`,
      `Gross Collected: ${this.formatInvoiceMoney(invoice.totals.grossAmount)} ${invoice.totals.currency}`,
      `Platform Commission: ${this.formatInvoiceMoney(invoice.totals.platformCommissionAmount)} ${invoice.totals.currency}`,
      `Restaurant-paid Transaction Fees: ${this.formatInvoiceMoney(invoice.totals.restaurantTransactionFeeAmount)} ${invoice.totals.currency}`,
      `Monthly Fee Deducted: ${this.formatInvoiceMoney(invoice.totals.monthlyFeeDeductedAmount)} ${invoice.totals.currency}`,
      `Monthly Fee Outstanding: ${this.formatInvoiceMoney(invoice.totals.monthlyFeeOutstandingAmount)} ${invoice.totals.currency}`,
      `VAT (${invoice.totals.vatPercentage}%): ${this.formatInvoiceMoney(invoice.totals.vatAmount)} ${invoice.totals.currency}`,
      `Restaurant Payout Due: ${this.formatInvoiceMoney(invoice.totals.restaurantPayoutAmount)} ${invoice.totals.currency}`,
      '',
      'DeliveryWays',
    ].join('\n');
  }

  private async advanceSubscriptionBillingCursor(
    invoice: Awaited<
      ReturnType<PackagePlansService['buildSubscriptionInvoice']>
    >,
    paymentStatus?: PaymentStatus,
  ) {
    await this.packagePlansRepository.updateSubscription(
      invoice.subscriptionId,
      {
        nextBillingAt: this.resolveNextBillingAt(
          invoice.packagePlan.billingInterval,
          invoice.servicePeriod.to.toISOString(),
        ),
        ...(paymentStatus ? { paymentStatus } : {}),
      },
    );
  }

  private async deliverSubscriptionInvoice(
    user: AuthUserContext,
    invoice: Awaited<
      ReturnType<PackagePlansService['buildSubscriptionInvoice']>
    >,
    recipientEmail: string,
  ) {
    if (!this.mailerService) {
      throw new InternalServerErrorException(
        'Mailer service is not configured',
      );
    }

    const fileName = `${invoice.invoiceNumber}.pdf`;
    const content = this.generateSubscriptionInvoicePdf(invoice);
    await this.mailerService.sendEmail(
      recipientEmail,
      `DeliveryWays ${this.formatSubscriptionDocumentType(
        invoice.documentType,
      ).toLowerCase()} ${invoice.invoiceNumber}`,
      this.buildSubscriptionInvoiceEmailBody(invoice),
      {
        attachments: [
          {
            filename: fileName,
            content,
            contentType: 'application/pdf',
          },
        ],
      },
    );

    await this.persistSubscriptionInvoice(user, invoice, {
      eventType: GeneratedInvoiceEventType.EMAILED,
      recipientEmail,
      status: GeneratedInvoiceStatus.SENT,
    });
  }

  private async deliverWeeklyPayoutInvoice(
    user: AuthUserContext,
    invoice: Awaited<
      ReturnType<PackagePlansService['buildWeeklyPayoutInvoice']>
    >,
    recipientEmail: string,
  ) {
    if (!this.mailerService) {
      throw new InternalServerErrorException(
        'Mailer service is not configured',
      );
    }

    const fileName = `${invoice.invoiceNumber}.pdf`;
    const content = this.generateWeeklyPayoutInvoicePdf(invoice);
    await this.mailerService.sendEmail(
      recipientEmail,
      `DeliveryWays payout invoice ${invoice.invoiceNumber}`,
      this.buildWeeklyPayoutInvoiceEmailBody(invoice),
      {
        attachments: [
          {
            filename: fileName,
            content,
            contentType: 'application/pdf',
          },
        ],
      },
    );

    await this.persistWeeklyPayoutInvoice(user, invoice, {
      eventType: GeneratedInvoiceEventType.EMAILED,
      recipientEmail,
      status: GeneratedInvoiceStatus.SENT,
    });
  }

  private ensureInvoiceAutomationConfigured() {
    if (!this.mailerService || !this.invoiceRecordsService) {
      throw new InternalServerErrorException(
        'Invoice automation is not configured',
      );
    }
  }

  private systemInvoiceUser() {
    return {
      uid: 'system:invoice-automation',
      role: UserRoleEnum.SUPER_ADMIN,
    } as AuthUserContext;
  }

  private async persistSubscriptionInvoice(
    user: AuthUserContext,
    invoice: Awaited<
      ReturnType<PackagePlansService['buildSubscriptionInvoice']>
    >,
    options: {
      eventType?: GeneratedInvoiceEventType;
      recipientEmail?: string;
      status?: GeneratedInvoiceStatus;
    } = {},
  ) {
    if (!this.invoiceRecordsService) return;

    await this.invoiceRecordsService.persist({
      invoiceNumber: invoice.invoiceNumber,
      kind: GeneratedInvoiceKind.SUBSCRIPTION,
      status: options.status,
      sourceKey: this.buildSubscriptionInvoiceSourceKey(invoice),
      tenantId: invoice.tenant.id,
      restaurantId: invoice.restaurant?.id,
      subscriptionId: invoice.subscriptionId,
      periodFrom: invoice.servicePeriod.from,
      periodTo: invoice.servicePeriod.to,
      currency: invoice.totals.currency,
      totalAmount: invoice.totals.totalAmount,
      snapshot: invoice as unknown as Prisma.InputJsonValue,
      actorId: user.uid,
      eventType: options.eventType,
      recipientEmail: options.recipientEmail,
    });
  }

  private async persistWeeklyPayoutInvoice(
    user: AuthUserContext,
    invoice: Awaited<
      ReturnType<PackagePlansService['buildWeeklyPayoutInvoice']>
    >,
    options: {
      eventType?: GeneratedInvoiceEventType;
      recipientEmail?: string;
      status?: GeneratedInvoiceStatus;
    } = {},
  ) {
    if (!this.invoiceRecordsService) return;

    await this.invoiceRecordsService.persist({
      invoiceNumber: invoice.invoiceNumber,
      kind: GeneratedInvoiceKind.WEEKLY_PAYOUT,
      status: options.status,
      sourceKey: this.buildWeeklyPayoutInvoiceSourceKey(invoice),
      tenantId: invoice.tenant.id,
      restaurantId: invoice.restaurant.id,
      periodFrom: invoice.period.from,
      periodTo: invoice.period.to,
      currency: invoice.totals.currency,
      totalAmount: invoice.totals.restaurantPayoutAmount,
      snapshot: invoice as unknown as Prisma.InputJsonValue,
      actorId: user.uid,
      eventType: options.eventType,
      recipientEmail: options.recipientEmail,
    });
  }

  private buildSubscriptionInvoiceSourceKey(
    invoice: Awaited<
      ReturnType<PackagePlansService['buildSubscriptionInvoice']>
    >,
  ) {
    return `${invoice.subscriptionId}:${invoice.servicePeriod.from.toISOString()}:${invoice.servicePeriod.to.toISOString()}`;
  }

  private buildWeeklyPayoutInvoiceSourceKey(
    invoice: Awaited<
      ReturnType<PackagePlansService['buildWeeklyPayoutInvoice']>
    > & { sourceKey?: string },
  ) {
    return (
      invoice.sourceKey ??
      `${invoice.restaurant.id}:${invoice.period.from.toISOString()}:${invoice.period.to.toISOString()}`
    );
  }

  private resolveLastCompletedPayoutPeriod(
    payoutCycle: PackagePayoutCycle,
    now: Date,
  ) {
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    let to = new Date(startOfToday);
    let from = new Date(to);

    switch (payoutCycle) {
      case PackagePayoutCycle.DAILY:
        from.setUTCDate(from.getUTCDate() - 1);
        break;
      case PackagePayoutCycle.BIWEEKLY:
        {
          const anchor = Date.UTC(1970, 0, 5);
          const cycleMilliseconds = 14 * 24 * 60 * 60 * 1000;
          const completedCycles = Math.floor(
            (startOfToday.getTime() - anchor) / cycleMilliseconds,
          );
          to = new Date(anchor + completedCycles * cycleMilliseconds);
          from = new Date(to.getTime() - cycleMilliseconds);
        }
        break;
      case PackagePayoutCycle.MONTHLY:
        to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 1, 1));
        break;
      case PackagePayoutCycle.WEEKLY:
      default:
        to.setUTCDate(to.getUTCDate() - ((to.getUTCDay() + 6) % 7));
        from = new Date(to);
        from.setUTCDate(from.getUTCDate() - 7);
        break;
    }

    return { from, to };
  }

  private asJsonObject(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, Prisma.JsonValue>;
  }

  private readString(value: Prisma.JsonValue | undefined) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readDecimal(value: Prisma.JsonValue | undefined) {
    if (typeof value === 'number' || typeof value === 'string') {
      return new Prisma.Decimal(value).toDecimalPlaces(2);
    }

    return new Prisma.Decimal(0);
  }

  private readNestedString(
    object: Record<string, Prisma.JsonValue>,
    path: string[],
  ) {
    let current: Prisma.JsonValue | undefined = object;
    for (const key of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return null;
      }

      current = (current as Record<string, Prisma.JsonValue>)[key];
    }

    return typeof current === 'string' && current.trim()
      ? current.trim()
      : null;
  }

  private readFirstPath(
    object: Record<string, Prisma.JsonValue>,
    paths: string[][],
  ) {
    for (const path of paths) {
      let current: Prisma.JsonValue | undefined = object;
      for (const key of path) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) {
          current = undefined;
          break;
        }
        current = (current as Record<string, Prisma.JsonValue>)[key];
      }
      if (current !== undefined && current !== null) {
        return current;
      }
    }

    return null;
  }

  private readStringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readSettingsString(
    sources: Record<string, Prisma.JsonValue>[],
    paths: string[][],
  ) {
    for (const source of sources) {
      const value = this.readFirstPath(source, paths);
      const text = this.readStringValue(value);
      if (text) return text;
    }

    return null;
  }

  private deliveryWaysCompanyHeaderLines() {
    return [
      'DeliveryWays company address: configure legal address',
      'DATEV account mapping: revenue/debtor/tax placeholders',
    ];
  }

  private buildDatevCsv(
    invoices: Awaited<
      ReturnType<PackagePlansRepository['listMonthlyGeneratedInvoices']>
    >,
    query: MonthlyInvoiceDatevExportQueryDto,
  ) {
    const revenueAccount = query.revenueAccount ?? 'TODO_REVENUE_ACCOUNT';
    const debtorAccount = query.debtorAccount ?? 'TODO_DEBTOR_ACCOUNT';
    const taxAccount = query.taxAccount ?? 'TODO_TAX_ACCOUNT';
    const header = [
      'Belegdatum',
      'Belegnummer',
      'Dokumenttyp',
      'Rechnungstyp',
      'Soll/Haben',
      'Betrag',
      'Waehrung',
      'Debitorenkonto',
      'Erloeskonto',
      'Steuerkonto',
      'BU-Schluessel',
      'RestaurantId',
      'SubscriptionId',
      'OrderId',
      'Buchungstext',
      'MappingHinweis',
    ];
    const rows = invoices.map((invoice) => {
      const snapshot = this.asJsonObject(invoice.snapshot);
      const documentType =
        this.readStringValue(snapshot.documentType) ??
        (invoice.invoiceNumber.startsWith('CRN-') ? 'CREDIT_NOTE' : 'INVOICE');
      const amount = new Prisma.Decimal(invoice.totalAmount)
        .toDecimalPlaces(2)
        .toNumber();
      const isCreditNote = documentType === 'CREDIT_NOTE';

      return [
        this.formatInvoiceDate(invoice.createdAt),
        invoice.invoiceNumber,
        invoice.kind,
        documentType,
        isCreditNote ? 'H' : 'S',
        this.formatInvoiceMoney(amount),
        invoice.currency,
        debtorAccount,
        revenueAccount,
        taxAccount,
        'TODO_BU_KEY',
        invoice.restaurantId ?? '',
        invoice.subscriptionId ?? '',
        invoice.orderId ?? '',
        this.buildDatevBookingText(snapshot, invoice.invoiceNumber),
        'DATEV account numbers are placeholders; configure debtor/revenue/tax/BU mapping with accountant before import.',
      ];
    });

    return [header, ...rows]
      .map((row) => row.map((value) => this.csvEscape(String(value))).join(','))
      .join('\n');
  }

  private buildDatevBookingText(
    snapshot: Record<string, Prisma.JsonValue>,
    invoiceNumber: string,
  ) {
    const restaurant = this.asJsonObject(snapshot.restaurant ?? null);
    const restaurantName = this.readStringValue(restaurant.name);
    return restaurantName
      ? `DeliveryWays ${invoiceNumber} ${restaurantName}`
      : `DeliveryWays ${invoiceNumber}`;
  }

  private csvEscape(value: string) {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
  }

  private formatSubscriptionDocumentType(documentType: string) {
    return documentType === 'CREDIT_NOTE' ? 'Credit Note' : 'Invoice';
  }

  private formatInvoiceMoney(value: number | string | null | undefined) {
    return Number(value ?? 0).toFixed(2);
  }

  private formatInvoiceLabel(value: string) {
    return value
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private formatInvoiceDate(value: Date | null | undefined) {
    return value ? value.toISOString().slice(0, 10) : 'N/A';
  }

  private parseStoredInvoiceDate(value: unknown) {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      throw new InternalServerErrorException(
        'Stored invoice snapshot contains an invalid date',
      );
    }

    return date;
  }

  private formatCommissionSummary(
    commissionType: string,
    commissionPercentage: number,
    commissionFixedAmount: number,
  ) {
    if (commissionType === 'PERCENTAGE') {
      return `${commissionPercentage}%`;
    }

    if (commissionType === 'FIXED') {
      return this.formatInvoiceMoney(commissionFixedAmount);
    }

    const parts: string[] = [];
    if (commissionPercentage > 0) parts.push(`${commissionPercentage}%`);
    if (commissionFixedAmount > 0) {
      parts.push(this.formatInvoiceMoney(commissionFixedAmount));
    }

    return parts.length ? parts.join(' + ') : '0.00';
  }

  private assertBillingModelAmounts(input: {
    billingModel?: PackageBillingModel;
    planPrice?: Prisma.Decimal;
    commissionType?: PackageCommissionType;
    commissionPercentage?: Prisma.Decimal;
    commissionFixedAmount?: Prisma.Decimal;
    commissionCapAmount?: Prisma.Decimal | null;
  }): void {
    const planPrice = input.planPrice ?? new Prisma.Decimal(0);
    const commissionType =
      input.commissionType ?? PackageCommissionType.PERCENTAGE;
    const commissionPercentage =
      input.commissionPercentage ?? new Prisma.Decimal(0);
    const commissionFixedAmount =
      input.commissionFixedAmount ?? new Prisma.Decimal(0);
    const commissionCapAmount = input.commissionCapAmount;

    if (!input.billingModel) {
      throw new BadRequestException('Billing model is required');
    }

    if (input.billingModel === PackageBillingModel.COMMISSION) {
      if (planPrice.greaterThan(0)) {
        throw new BadRequestException(
          'Commission based plans cannot have a fixed plan price',
        );
      }

      this.assertCommissionAmount(
        commissionType,
        commissionPercentage,
        commissionFixedAmount,
        'Commission based plans',
      );
    }

    if (input.billingModel === PackageBillingModel.PLAN) {
      if (planPrice.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          'Plan based packages require a fixed plan price',
        );
      }

      if (
        commissionPercentage.greaterThan(0) ||
        commissionFixedAmount.greaterThan(0)
      ) {
        throw new BadRequestException(
          'Plan based packages cannot have commission charges',
        );
      }

      if (commissionCapAmount?.greaterThan(0)) {
        throw new BadRequestException(
          'Plan based packages cannot have a commission cap amount',
        );
      }
    }

    if (
      input.billingModel === PackageBillingModel.HYBRID &&
      planPrice.lessThanOrEqualTo(0)
    ) {
      throw new BadRequestException(
        'Hybrid packages require a fixed plan price',
      );
    }

    if (input.billingModel === PackageBillingModel.HYBRID) {
      this.assertCommissionAmount(
        commissionType,
        commissionPercentage,
        commissionFixedAmount,
        'Hybrid packages',
      );
    }
  }

  private assertCommissionAmount(
    commissionType: PackageCommissionType,
    commissionPercentage: Prisma.Decimal,
    commissionFixedAmount: Prisma.Decimal,
    label: string,
  ) {
    if (commissionType === PackageCommissionType.PERCENTAGE) {
      if (commissionPercentage.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          `${label} require a commission percentage`,
        );
      }

      return;
    }

    if (commissionFixedAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        `${label} require a fixed commission amount`,
      );
    }
  }

  private async assertTenantAndRestaurant(
    tenantId: string,
    restaurantId?: string,
  ) {
    const tenant = await this.packagePlansRepository.findTenantById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (!restaurantId) {
      return;
    }

    const restaurant = await this.packagePlansRepository.findRestaurantById(
      restaurantId,
      tenantId,
    );
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found for tenant');
    }
  }

  private assertDateRange(startsAt?: string, endsAt?: string): void {
    if (!startsAt || !endsAt) {
      return;
    }

    if (new Date(startsAt) >= new Date(endsAt)) {
      throw new BadRequestException(
        'Subscription end date must be after start date',
      );
    }
  }

  private resolveNextBillingAt(
    billingInterval: BillingInterval,
    startsAt?: string,
  ): Date {
    const nextBillingAt = startsAt ? new Date(startsAt) : new Date();

    switch (billingInterval) {
      case BillingInterval.DAILY:
        nextBillingAt.setDate(nextBillingAt.getDate() + 1);
        return nextBillingAt;
      case BillingInterval.WEEKLY:
        nextBillingAt.setDate(nextBillingAt.getDate() + 7);
        return nextBillingAt;
      case BillingInterval.BIWEEKLY:
        nextBillingAt.setDate(nextBillingAt.getDate() + 14);
        return nextBillingAt;
      case BillingInterval.YEARLY:
        nextBillingAt.setFullYear(nextBillingAt.getFullYear() + 1);
        return nextBillingAt;
      case BillingInterval.MONTHLY:
      default:
        nextBillingAt.setMonth(nextBillingAt.getMonth() + 1);
        return nextBillingAt;
    }
  }

  private buildPlanSnapshot(plan: {
    id: string;
    name: string;
    description?: string | null;
    billingModel: PackageBillingModel;
    billingInterval: BillingInterval;
    planPrice: Prisma.Decimal;
    commissionType?: PackageCommissionType;
    commissionPercentage: Prisma.Decimal;
    commissionFixedAmount?: Prisma.Decimal;
    commissionCapAmount?: Prisma.Decimal | null;
    vatPercentage?: Prisma.Decimal;
    payoutCycle?: PackagePayoutCycle;
    currency: string;
    trialDays: number;
    features?: Prisma.JsonValue | null;
    termsDocumentUrl?: string | null;
  }): Prisma.InputJsonValue {
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description ?? null,
      billingModel: plan.billingModel,
      billingInterval: plan.billingInterval,
      planPrice: plan.planPrice.toNumber(),
      commissionType: plan.commissionType ?? PackageCommissionType.PERCENTAGE,
      commissionPercentage: plan.commissionPercentage.toNumber(),
      commissionFixedAmount: plan.commissionFixedAmount?.toNumber() ?? 0,
      commissionCapAmount: plan.commissionCapAmount?.toNumber() ?? null,
      vatPercentage: plan.vatPercentage?.toNumber() ?? 0,
      payoutCycle: plan.payoutCycle ?? PackagePayoutCycle.WEEKLY,
      currency: plan.currency,
      trialDays: plan.trialDays,
      features: plan.features ?? null,
      termsDocumentUrl: plan.termsDocumentUrl ?? null,
    };
  }

  private ensureSuperAdmin(user: AuthUserContext): void {
    if (user.role !== UserRoleEnum.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can manage package plans');
    }
  }

  private requireString(value: string | undefined, message: string): string {
    if (!value) {
      throw new BadRequestException(message);
    }

    return value;
  }

  private requireBillingModel(
    value: PackageBillingModel | undefined,
  ): PackageBillingModel {
    if (!value) {
      throw new BadRequestException('Billing model is required');
    }

    return value;
  }
}
