import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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
import {
  AssignTenantSubscriptionDto,
  CreatePackagePlanDto,
  ListPackagePlansDto,
  ListTenantSubscriptionsDto,
  UpdatePackagePlanDto,
  UpdateTenantSubscriptionDto,
} from './dto';
import { PackagePlansRepository } from './package-plans.repository';

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
