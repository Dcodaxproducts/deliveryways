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
  PaymentStatus,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { MailerService } from '../mailer/mailer.service';
import {
  AssignTenantSubscriptionDto,
  CreatePackagePlanDto,
  ListPackagePlansDto,
  ListTenantSubscriptionsDto,
  SendTenantSubscriptionInvoiceDto,
  SendWeeklyRestaurantPayoutInvoiceDto,
  UpdatePackagePlanDto,
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
      currency: input.currency ?? 'PKR',
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

    if (dto.packagePlanId) {
      const plan = await this.packagePlansRepository.findPlanById(
        dto.packagePlanId,
      );
      if (!plan || !plan.isActive) {
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
      status: dto.status,
      paymentStatus: dto.paymentStatus,
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

  async getSubscriptionInvoice(user: AuthUserContext, id: string) {
    this.ensureSuperAdmin(user);
    const invoice = await this.buildSubscriptionInvoice(id);

    return {
      data: invoice,
      message: 'Subscription invoice fetched successfully',
    };
  }

  async downloadSubscriptionInvoicePdf(user: AuthUserContext, id: string) {
    this.ensureSuperAdmin(user);
    const invoice = await this.buildSubscriptionInvoice(id);

    return {
      fileName: `${invoice.invoiceNumber}.pdf`,
      mimeType: 'application/pdf',
      content: this.generateSubscriptionInvoicePdf(invoice),
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
    await this.mailerService.sendEmail(
      recipientEmail,
      `DeliveryWays invoice ${invoice.invoiceNumber}`,
      this.buildSubscriptionInvoiceEmailBody(invoice),
      {
        attachments: [
          {
            filename: fileName,
            content: this.generateSubscriptionInvoicePdf(invoice),
            contentType: 'application/pdf',
          },
        ],
      },
    );

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

    return {
      data: invoice,
      message: 'Weekly payout invoice fetched successfully',
    };
  }

  async downloadWeeklyPayoutInvoicePdf(
    user: AuthUserContext,
    query: WeeklyRestaurantPayoutInvoiceQueryDto,
  ) {
    this.ensureSuperAdmin(user);
    const invoice = await this.buildWeeklyPayoutInvoice(query);

    return {
      fileName: `${invoice.invoiceNumber}.pdf`,
      mimeType: 'application/pdf',
      content: this.generateWeeklyPayoutInvoicePdf(invoice),
    };
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
    await this.mailerService.sendEmail(
      recipientEmail,
      `DeliveryWays payout invoice ${invoice.invoiceNumber}`,
      this.buildWeeklyPayoutInvoiceEmailBody(invoice),
      {
        attachments: [
          {
            filename: fileName,
            content: this.generateWeeklyPayoutInvoicePdf(invoice),
            contentType: 'application/pdf',
          },
        ],
      },
    );

    return {
      data: {
        invoiceNumber: invoice.invoiceNumber,
        restaurantId: invoice.restaurant.id,
        sentTo: recipientEmail,
        fileName,
        mimeType: 'application/pdf',
      },
      message: 'Weekly payout invoice generated and sent successfully',
    };
  }

  private async buildWeeklyPayoutInvoice(
    query: WeeklyRestaurantPayoutInvoiceQueryDto,
  ) {
    const period = this.resolveWeeklyPayoutPeriod(query);
    const restaurant =
      await this.packagePlansRepository.findRestaurantPayoutScope(
        query.restaurantId,
      );

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const [subscription, orders] = await Promise.all([
      this.packagePlansRepository.findActiveRestaurantSubscription(
        restaurant.id,
      ),
      this.packagePlansRepository.listPaidRestaurantOrders(
        restaurant.id,
        period.from,
        period.to,
      ),
    ]);
    const plan = subscription
      ? this.resolveSubscriptionInvoicePlan(subscription)
      : null;
    const lineItems = orders.map((order) =>
      this.toWeeklyPayoutOrderLine(order, plan),
    );
    const grossAmount = lineItems.reduce(
      (sum, item) => sum.plus(item.grossAmount),
      new Prisma.Decimal(0),
    );
    const platformCommissionAmount = lineItems.reduce(
      (sum, item) => sum.plus(item.platformCommissionAmount),
      new Prisma.Decimal(0),
    );
    const restaurantPayoutAmount = Prisma.Decimal.max(
      grossAmount.minus(platformCommissionAmount),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    const currency =
      lineItems[0]?.currency ?? plan?.currency ?? this.resolveDefaultCurrency();

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
        platformCommissionAmount: Number(item.platformCommissionAmount),
        restaurantPayoutAmount: Number(item.restaurantPayoutAmount),
      })),
      totals: {
        ordersCount: lineItems.length,
        grossAmount: Number(grossAmount.toDecimalPlaces(2)),
        platformCommissionAmount: Number(
          platformCommissionAmount.toDecimalPlaces(2),
        ),
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
  ) {
    const grossAmount = new Prisma.Decimal(order.totalAmount).toDecimalPlaces(
      2,
    );
    const platformCommissionAmount = this.calculateOrderCommission(
      grossAmount,
      plan,
    );
    const restaurantPayoutAmount = Prisma.Decimal.max(
      grossAmount.minus(platformCommissionAmount),
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
      currency: order.transactions[0]?.currency ?? plan?.currency ?? 'PKR',
      providerReference: order.transactions[0]?.providerRef ?? null,
    };
  }

  private calculateOrderCommission(
    grossAmount: Prisma.Decimal,
    plan: ReturnType<
      PackagePlansService['resolveSubscriptionInvoicePlan']
    > | null,
  ) {
    if (!plan) {
      return new Prisma.Decimal(0);
    }

    let commission =
      plan.commissionType === PackageCommissionType.FIXED
        ? new Prisma.Decimal(plan.commissionFixedAmount)
        : grossAmount.mul(plan.commissionPercentage).div(100);

    if (plan.commissionCapAmount !== null) {
      commission = Prisma.Decimal.min(
        commission,
        new Prisma.Decimal(plan.commissionCapAmount),
      );
    }

    return Prisma.Decimal.min(commission, grossAmount).toDecimalPlaces(2);
  }

  private resolveWeeklyPayoutPeriod(
    query: WeeklyRestaurantPayoutInvoiceQueryDto,
  ) {
    const to = query.toDate ? new Date(query.toDate) : new Date();
    const from = query.fromDate
      ? new Date(query.fromDate)
      : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

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

  private resolveDefaultCurrency() {
    return 'PKR';
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

  private async buildSubscriptionInvoice(id: string) {
    const subscription = await this.getSubscriptionOrThrow(id);
    const plan = this.resolveSubscriptionInvoicePlan(subscription);
    const servicePeriod = this.resolveSubscriptionInvoicePeriod(subscription);
    const paidOrders =
      subscription.restaurantId && this.isTransactionFeePlan(plan)
        ? await this.packagePlansRepository.listPaidRestaurantOrders(
            subscription.restaurantId,
            servicePeriod.from,
            servicePeriod.to,
          )
        : [];

    return this.toSubscriptionInvoice(
      subscription,
      plan,
      servicePeriod,
      paidOrders,
    );
  }

  private toSubscriptionInvoice(
    subscription: TenantSubscriptionDetails,
    plan: ReturnType<PackagePlansService['resolveSubscriptionInvoicePlan']>,
    servicePeriod: { from: Date; to: Date },
    paidOrders: RestaurantPayoutOrder[],
  ) {
    const subscriptionFeeAmount = new Prisma.Decimal(plan.planPrice)
      .toDecimalPlaces(2)
      .toNumber();
    const transactionFeeAmount = paidOrders
      .reduce(
        (sum, order) =>
          sum.plus(
            this.calculateOrderCommission(
              new Prisma.Decimal(order.totalAmount).toDecimalPlaces(2),
              plan,
            ),
          ),
        new Prisma.Decimal(0),
      )
      .toDecimalPlaces(2)
      .toNumber();
    const subtotal = Number(
      (subscriptionFeeAmount + transactionFeeAmount).toFixed(2),
    );
    const vatAmount = Number(
      ((subtotal * plan.vatPercentage) / 100).toFixed(2),
    );
    const totalAmount = Number((subtotal + vatAmount).toFixed(2));
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
        description: `Transaction fee for ${paidOrders.length} paid order${paidOrders.length === 1 ? '' : 's'}`,
        quantity: paidOrders.length,
        unitPrice: transactionFeeAmount,
        amount: transactionFeeAmount,
      });
    }

    return {
      invoiceNumber: this.buildSubscriptionInvoiceNumber(subscription.id),
      subscriptionId: subscription.id,
      tenant: subscription.tenant,
      restaurant: subscription.restaurant
        ? {
            id: subscription.restaurant.id,
            name: subscription.restaurant.name,
            slug: subscription.restaurant.slug,
            billingEmail: this.resolveRestaurantBillingEmail(subscription),
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
        currency: plan.currency,
      },
      status: subscription.status,
      paymentStatus: subscription.paymentStatus,
      issuedAt,
      dueAt: subscription.nextBillingAt,
      servicePeriod,
      lineItems,
      transactionFee: {
        ordersCount: paidOrders.length,
        amount: transactionFeeAmount,
      },
      totals: {
        subscriptionFeeAmount,
        transactionFeeAmount,
        subtotal,
        vatPercentage: plan.vatPercentage,
        vatAmount,
        totalAmount,
        currency: plan.currency,
      },
      note: subscription.note,
    };
  }

  private resolveSubscriptionInvoicePeriod(
    subscription: TenantSubscriptionDetails,
  ) {
    return {
      from: subscription.startsAt,
      to:
        subscription.nextBillingAt ??
        subscription.endsAt ??
        subscription.startsAt,
    };
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
        snapshot.payoutCycle ??
        packagePlan.payoutCycle ??
        PackagePayoutCycle.WEEKLY,
      currency: snapshot.currency ?? packagePlan.currency,
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
      return null;
    }

    const settings = this.asJsonObject(subscription.restaurant.settings);
    const supportContact = this.asJsonObject(
      subscription.restaurant.supportContact,
    );

    return (
      this.readNestedString(settings, ['invoice', 'email']) ??
      this.readNestedString(settings, ['billing', 'email']) ??
      this.readNestedString(settings, ['email']) ??
      this.readNestedString(supportContact, ['email'])
    );
  }

  private buildSubscriptionInvoiceNumber(subscriptionId: string) {
    return `SUB-INV-${subscriptionId.slice(-8).toUpperCase()}`;
  }

  private generateSubscriptionInvoicePdf(
    invoice: Awaited<
      ReturnType<PackagePlansService['buildSubscriptionInvoice']>
    >,
  ) {
    const lines = [
      `Invoice ${invoice.invoiceNumber}`,
      `Invoice Date: ${invoice.issuedAt.toISOString()}`,
      `Due Date: ${invoice.dueAt?.toISOString() ?? 'N/A'}`,
      `Service Period: ${invoice.servicePeriod.from.toISOString()} - ${invoice.servicePeriod.to.toISOString()}`,
      '',
      'Billed To',
      `Restaurant: ${invoice.restaurant?.name ?? 'N/A'}`,
      `Tenant: ${invoice.tenant.name}`,
      `Email: ${invoice.restaurant?.billingEmail ?? 'N/A'}`,
      '',
      'Package',
      `Plan: ${invoice.packagePlan.name}`,
      `Billing Model: ${invoice.packagePlan.billingModel}`,
      `Billing Interval: ${invoice.packagePlan.billingInterval}`,
      `Commission: ${invoice.packagePlan.commissionType} ${invoice.packagePlan.commissionPercentage}% / ${invoice.packagePlan.commissionFixedAmount}`,
      `Payout Cycle: ${invoice.packagePlan.payoutCycle}`,
      '',
      `Subscription Fee: ${this.formatInvoiceMoney(invoice.totals.subscriptionFeeAmount)} ${invoice.totals.currency}`,
      `Transaction Fee: ${this.formatInvoiceMoney(invoice.totals.transactionFeeAmount)} ${invoice.totals.currency}`,
      `Subtotal: ${this.formatInvoiceMoney(invoice.totals.subtotal)} ${invoice.totals.currency}`,
      `VAT (${invoice.totals.vatPercentage}%): ${this.formatInvoiceMoney(invoice.totals.vatAmount)} ${invoice.totals.currency}`,
      `Total: ${this.formatInvoiceMoney(invoice.totals.totalAmount)} ${invoice.totals.currency}`,
      `Payment Status: ${invoice.paymentStatus}`,
      `Subscription Status: ${invoice.status}`,
      '',
      invoice.note ? `Note: ${invoice.note}` : '',
    ];

    return this.buildSimplePdf(lines);
  }

  private buildSubscriptionInvoiceEmailBody(
    invoice: Awaited<
      ReturnType<PackagePlansService['buildSubscriptionInvoice']>
    >,
  ) {
    return [
      `Hi ${invoice.restaurant?.name ?? invoice.tenant.name},`,
      '',
      `Please find attached DeliveryWays invoice ${invoice.invoiceNumber}.`,
      '',
      `Package: ${invoice.packagePlan.name}`,
      `Service Period: ${invoice.servicePeriod.from.toISOString()} - ${invoice.servicePeriod.to.toISOString()}`,
      `Subscription Fee: ${this.formatInvoiceMoney(invoice.totals.subscriptionFeeAmount)} ${invoice.totals.currency}`,
      `Transaction Fee: ${this.formatInvoiceMoney(invoice.totals.transactionFeeAmount)} ${invoice.totals.currency}`,
      `Total: ${this.formatInvoiceMoney(invoice.totals.totalAmount)} ${invoice.totals.currency}`,
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
    const lines = [
      `Payout Invoice ${invoice.invoiceNumber}`,
      `Invoice Date: ${invoice.issuedAt.toISOString()}`,
      `Payout Period: ${invoice.period.from.toISOString()} - ${invoice.period.to.toISOString()}`,
      '',
      'Restaurant',
      `Restaurant: ${invoice.restaurant.name}`,
      `Tenant: ${invoice.tenant.name}`,
      `Email: ${invoice.restaurant.billingEmail ?? 'N/A'}`,
      '',
      `Orders Count: ${invoice.totals.ordersCount}`,
      `Gross Collected By Super Admin: ${this.formatInvoiceMoney(invoice.totals.grossAmount)} ${invoice.totals.currency}`,
      `Platform Commission: ${this.formatInvoiceMoney(invoice.totals.platformCommissionAmount)} ${invoice.totals.currency}`,
      `Restaurant Payout Due: ${this.formatInvoiceMoney(invoice.totals.restaurantPayoutAmount)} ${invoice.totals.currency}`,
      '',
      invoice.note,
    ];

    return this.buildSimplePdf(lines);
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
      `Payout Period: ${invoice.period.from.toISOString()} - ${invoice.period.to.toISOString()}`,
      `Gross Collected: ${this.formatInvoiceMoney(invoice.totals.grossAmount)} ${invoice.totals.currency}`,
      `Platform Commission: ${this.formatInvoiceMoney(invoice.totals.platformCommissionAmount)} ${invoice.totals.currency}`,
      `Restaurant Payout Due: ${this.formatInvoiceMoney(invoice.totals.restaurantPayoutAmount)} ${invoice.totals.currency}`,
      '',
      'DeliveryWays',
    ].join('\n');
  }

  private buildSimplePdf(lines: string[]) {
    const escapedLines = lines
      .filter((line) => line.length > 0)
      .slice(0, 52)
      .flatMap((line) => this.wrapPdfLine(line))
      .map((line) => `0 -14 Td (${this.escapePdfText(line)}) Tj`)
      .join('\n');
    const stream = `BT\n/F1 10 Tf\n50 800 Td\n${escapedLines}\nET`;
    const objects = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
      '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
      `5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];

    for (const object of objects) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += object;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (const offset of offsets.slice(1)) {
      pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    return Buffer.from(pdf, 'utf8');
  }

  private wrapPdfLine(line: string) {
    const chunks: string[] = [];
    for (let index = 0; index < line.length; index += 78) {
      chunks.push(line.slice(index, index + 78));
    }

    return chunks.length > 0 ? chunks : [''];
  }

  private escapePdfText(text: string) {
    return text
      .replace(/[^\x20-\x7E]/g, '?')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  private asJsonObject(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, Prisma.JsonValue>;
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

  private formatInvoiceMoney(value: number) {
    return Number(value).toFixed(2);
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

    if (billingInterval === BillingInterval.YEARLY) {
      nextBillingAt.setFullYear(nextBillingAt.getFullYear() + 1);
      return nextBillingAt;
    }

    nextBillingAt.setMonth(nextBillingAt.getMonth() + 1);
    return nextBillingAt;
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
