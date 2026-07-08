import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  RestaurantPayoutRequestStatus,
  RestaurantWalletTransactionType,
  SubscriptionStatus,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaService } from '../../database';
import {
  AdminUpdatePaymentStatusDto,
  CreateRestaurantPayoutRequestDto,
  CreateRestaurantStripeTransferDto,
  CreatePaymentAttemptDto,
  CreateSubscriptionPaymentAttemptDto,
  ListRestaurantPayoutRequestsDto,
  MarkRestaurantPayoutPaidDto,
  ListPaymentsDto,
  RefundPaymentDto,
  RestaurantPaymentManagementQueryDto,
  ReviewRestaurantPayoutRequestDto,
  UpdateRestaurantPaymentMethodsDto,
  UpdateRestaurantStripeAccountDto,
  UpdatePaymentStatusDto,
} from './dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsRepository } from './payments.repository';
import { LoyaltyWalletService } from '../loyalty-wallet/loyalty-wallet.service';
import { GlobalSettingsService } from '../global-settings/global-settings.service';
import { StripePaymentsService } from './stripe-payments.service';
import {
  CreateWalletTopUpDto,
  GuestPurchaseGiftCardDto,
} from '../customer-app/dto';

export interface RestaurantStripeSettings {
  accountId: string | null;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  onboardingComplete: boolean;
  dashboardUrl: string | null;
  note: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  lastTransfer?: Prisma.JsonObject;
}

export interface RestaurantPaymentMethodSettings {
  allowedPaymentMethods: PaymentMethod[];
  walletEnabled: boolean;
  note: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly stripePaymentsService: StripePaymentsService,
    private readonly loyaltyWalletService?: LoyaltyWalletService,
    private readonly globalSettingsService?: GlobalSettingsService,
  ) {}

  async createSubscriptionAttempt(
    user: AuthUserContext,
    subscriptionId: string,
    dto: CreateSubscriptionPaymentAttemptDto,
  ) {
    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { id: subscriptionId },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        packagePlanId: true,
        paymentStatus: true,
        planSnapshot: true,
        packagePlan: {
          select: {
            id: true,
            name: true,
            billingInterval: true,
            planPrice: true,
            vatPercentage: true,
            currency: true,
          },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException('Tenant subscription not found');
    }

    if (!subscription.restaurantId) {
      throw new BadRequestException(
        'Subscription restaurant context is required for payment',
      );
    }

    await this.assertAdminPaymentAccess(user, subscription.restaurantId);

    if (subscription.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Subscription is already paid');
    }

    const plan = this.resolveSubscriptionPaymentPlan(subscription);
    const amount = this.calculateSubscriptionPaymentAmount(plan);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Subscription does not require payment');
    }

    const currency =
      dto.currency?.trim().toUpperCase() || plan.currency.toUpperCase();
    const branchId = await this.resolveSubscriptionPaymentBranchId(
      subscription.tenantId,
      subscription.restaurantId,
    );
    const transaction = await this.paymentsRepository.createUnchecked({
      tenantId: subscription.tenantId,
      restaurantId: subscription.restaurantId,
      branchId,
      paymentMethod: PaymentMethod.STRIPE,
      type: PaymentTransactionType.CHARGE,
      status: PaymentStatus.PENDING,
      amount,
      currency,
      note: dto.note,
      providerData: {
        target: 'TENANT_SUBSCRIPTION',
        subscriptionId: subscription.id,
        packagePlanId: subscription.packagePlanId,
        planName: plan.name,
        subscriptionFeeAmount: Number(plan.planPrice),
        vatPercentage: Number(plan.vatPercentage),
        vatAmount: Number(amount.minus(plan.planPrice).toDecimalPlaces(2)),
      } as Prisma.InputJsonValue,
    });

    const intent = await this.stripePaymentsService.createPaymentIntent({
      amount: Number(amount),
      currency,
      description: `DeliveryWays subscription ${subscription.id}`,
      metadata: {
        paymentTransactionId: transaction.id,
        orderId: null,
        customerId: user.uid,
        restaurantId: subscription.restaurantId,
        subscriptionId: subscription.id,
        tenantId: subscription.tenantId,
        target: 'TENANT_SUBSCRIPTION',
      },
    });
    const paymentSession = {
      provider: 'stripe',
      clientSecret: intent.client_secret,
      publishableKey: this.stripePaymentsService.getPublishableKey(),
      paymentIntentId: intent.id,
    };
    const updated = await this.paymentsRepository.updateStatus(transaction.id, {
      status: PaymentStatus.PENDING,
      providerRef: intent.id,
      providerData: {
        target: 'TENANT_SUBSCRIPTION',
        subscriptionId: subscription.id,
        packagePlanId: subscription.packagePlanId,
        planName: plan.name,
        subscriptionFeeAmount: Number(plan.planPrice),
        vatPercentage: Number(plan.vatPercentage),
        vatAmount: Number(amount.minus(plan.planPrice).toDecimalPlaces(2)),
        ...paymentSession,
      } as Prisma.InputJsonValue,
      note: dto.note,
    });

    await this.notificationsService.notifyPaymentAttemptCreated(updated.id);

    return {
      data: {
        subscriptionId: subscription.id,
        paymentStatus: subscription.paymentStatus,
        transaction: updated,
      },
      paymentSession,
      message: 'Subscription payment intent created successfully',
    };
  }

  async createAttempt(
    user: AuthUserContext,
    orderId: string,
    dto: CreatePaymentAttemptDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
        customerId: true,
        totalAmount: true,
        paymentMethod: true,
        paymentStatus: true,
        status: true,
        branch: {
          select: {
            settings: true,
          },
        },
        restaurant: {
          select: {
            settings: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.assertOrderAccess(user, order.restaurantId, order.customerId);

    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Order is already paid');
    }

    const paymentMethod = dto.paymentMethod ?? order.paymentMethod;
    await this.assertPaymentMethodAllowedForOrder(order, paymentMethod);
    const currency = await this.resolvePreferredCurrency(
      order.restaurantId,
      dto.currency,
    );

    const existingPendingCharge =
      await this.paymentsRepository.findLatestPendingChargeByOrderId(order.id);

    if (paymentMethod !== PaymentMethod.STRIPE) {
      const data = await this.switchPendingOrderPaymentMethod(
        user,
        order,
        paymentMethod,
        currency,
        dto.note,
        existingPendingCharge,
      );

      await this.notificationsService.notifyPaymentAttemptCreated(data.id);

      return {
        data,
        message: 'Order payment method updated successfully',
      };
    }

    const data = existingPendingCharge
      ? await this.paymentsRepository.updateChargePaymentMethod(
          existingPendingCharge.id,
          {
            paymentMethod,
            status: PaymentStatus.PENDING,
            amount: order.totalAmount,
            currency,
            note: dto.note,
            processedAt: null,
          },
        )
      : await this.paymentsRepository.create({
          order: { connect: { id: order.id } },
          tenant: { connect: { id: order.tenantId } },
          restaurant: { connect: { id: order.restaurantId } },
          branch: { connect: { id: order.branchId } },
          paymentMethod,
          type: PaymentTransactionType.CHARGE,
          status: PaymentStatus.PENDING,
          amount: order.totalAmount,
          currency,
          note: dto.note,
        });

    let providerPayload: Record<string, unknown> | undefined;

    if (paymentMethod === PaymentMethod.STRIPE) {
      const intent = await this.stripePaymentsService.createPaymentIntent({
        amount: Number(order.totalAmount),
        currency,
        description: `DeliveryWays order ${order.id}`,
        metadata: {
          paymentTransactionId: data.id,
          orderId: order.id,
          customerId: order.customerId,
          restaurantId: order.restaurantId,
        },
      });

      const updated = await this.paymentsRepository.updateStatus(data.id, {
        status: PaymentStatus.PENDING,
        providerRef: intent.id,
        providerData: {
          provider: 'stripe',
          clientSecret: intent.client_secret,
          publishableKey: this.stripePaymentsService.getPublishableKey(),
          paymentIntentId: intent.id,
        } as Prisma.InputJsonValue,
        note: dto.note,
      });

      providerPayload = {
        provider: 'stripe',
        clientSecret: intent.client_secret,
        publishableKey: this.stripePaymentsService.getPublishableKey(),
        paymentIntentId: intent.id,
      };

      await this.notificationsService.notifyPaymentAttemptCreated(updated.id);

      return {
        data: updated,
        paymentSession: providerPayload,
        message: 'Stripe payment intent created successfully',
      };
    }

    await this.notificationsService.notifyPaymentAttemptCreated(data.id);

    return {
      data,
      message: 'Payment attempt created successfully',
    };
  }

  private async switchPendingOrderPaymentMethod(
    user: AuthUserContext,
    order: {
      id: string;
      tenantId: string;
      restaurantId: string;
      branchId: string;
      customerId: string;
      totalAmount: Prisma.Decimal;
      paymentMethod: PaymentMethod;
      paymentStatus: PaymentStatus;
      status: OrderStatus;
    },
    paymentMethod: PaymentMethod,
    currency: string,
    note: string | undefined,
    existingPendingCharge: Awaited<
      ReturnType<PaymentsRepository['findLatestPendingChargeByOrderId']>
    > | null,
  ) {
    if (
      paymentMethod !== order.paymentMethod &&
      order.status !== OrderStatus.PAYMENT_PENDING
    ) {
      throw new BadRequestException(
        'Payment method can only be changed while order payment is pending',
      );
    }

    if (
      existingPendingCharge?.paymentMethod === PaymentMethod.STRIPE &&
      existingPendingCharge.providerRef
    ) {
      await this.stripePaymentsService.cancelPaymentIntent(
        existingPendingCharge.providerRef,
      );
    }

    const paidViaWallet = paymentMethod === PaymentMethod.WALLET;
    const nextPaymentStatus = paidViaWallet
      ? PaymentStatus.PAID
      : PaymentStatus.PENDING;
    const processedAt = paidViaWallet ? new Date() : null;

    const data = await this.prisma.$transaction(async (tx) => {
      const payment = existingPendingCharge
        ? await this.paymentsRepository.updateChargePaymentMethod(
            existingPendingCharge.id,
            {
              paymentMethod,
              status: nextPaymentStatus,
              amount: order.totalAmount,
              currency,
              note,
              providerRef: null,
              providerData: null,
              processedAt,
            },
            tx,
          )
        : await this.paymentsRepository.create(
            {
              order: { connect: { id: order.id } },
              tenant: { connect: { id: order.tenantId } },
              restaurant: { connect: { id: order.restaurantId } },
              branch: { connect: { id: order.branchId } },
              paymentMethod,
              type: PaymentTransactionType.CHARGE,
              status: nextPaymentStatus,
              amount: order.totalAmount,
              currency,
              processedAt,
              note,
            },
            tx,
          );

      if (paidViaWallet) {
        await this.loyaltyWalletService!.applyOrderBenefits(
          tx,
          {
            customerId: order.customerId,
            tenantId: order.tenantId,
            restaurantId: order.restaurantId,
            branchId: order.branchId,
          },
          {
            id: order.id,
            walletAppliedAmount: order.totalAmount,
            loyaltyDiscountAmount: new Prisma.Decimal(0),
            loyaltyPointsRedeemed: 0,
          },
          user.uid,
        );
      }

      await this.paymentsRepository.updateOrderState(
        order.id,
        {
          paymentMethod,
          status: OrderStatus.PLACED,
          paymentStatus: nextPaymentStatus,
          paidAt: processedAt,
          ...(paidViaWallet
            ? {
                walletAppliedAmount: { increment: order.totalAmount },
                totalAmount: new Prisma.Decimal(0),
              }
            : {}),
        },
        tx,
      );

      return payment;
    });

    if (paidViaWallet) {
      await this.loyaltyWalletService!.awardPointsForPaidOrder(
        order.id,
        data.id,
        user.uid,
      );
      await this.notificationsService.notifyPaymentStatusChanged(data.id);
    }

    if (order.status === OrderStatus.PAYMENT_PENDING) {
      await this.notificationsService.notifyOrderPlaced(order.id);
    }

    return data;
  }

  async createWalletTopUpAttempt(
    user: AuthUserContext,
    context: {
      customerId: string;
      tenantId: string;
      restaurantId: string;
      branchId?: string;
    },
    dto: CreateWalletTopUpDto,
  ) {
    if (
      user.role === UserRoleEnum.CUSTOMER &&
      user.uid !== context.customerId
    ) {
      throw new ForbiddenException('Cross-customer access denied');
    }

    const branchId = await this.resolveWalletTopUpBranchId(context);

    const currency = await this.resolvePreferredCurrency(
      context.restaurantId,
      dto.currency,
    );
    const data = await this.paymentsRepository.createUnchecked({
      tenantId: context.tenantId,
      restaurantId: context.restaurantId,
      branchId,
      paymentMethod: PaymentMethod.STRIPE,
      type: PaymentTransactionType.CHARGE,
      status: PaymentStatus.PENDING,
      amount: new Prisma.Decimal(dto.amount),
      currency,
      note: dto.note,
      providerData: {
        target: 'WALLET_TOP_UP',
        customerId: context.customerId,
      } as Prisma.InputJsonValue,
    });

    const intent = await this.stripePaymentsService.createPaymentIntent({
      amount: dto.amount,
      currency,
      description: `DeliveryWays wallet top-up ${context.customerId}`,
      metadata: {
        paymentTransactionId: data.id,
        orderId: null,
        customerId: context.customerId,
        restaurantId: context.restaurantId,
        walletTopUp: 'true',
      },
    });

    const updated = await this.paymentsRepository.updateStatus(data.id, {
      status: PaymentStatus.PENDING,
      providerRef: intent.id,
      providerData: {
        provider: 'stripe',
        target: 'WALLET_TOP_UP',
        customerId: context.customerId,
        clientSecret: intent.client_secret,
        publishableKey: this.stripePaymentsService.getPublishableKey(),
        paymentIntentId: intent.id,
      } as Prisma.InputJsonValue,
      note: dto.note,
    });

    return {
      transaction: updated,
      paymentSession: {
        provider: 'stripe',
        clientSecret: intent.client_secret,
        publishableKey: this.stripePaymentsService.getPublishableKey(),
        paymentIntentId: intent.id,
      },
    };
  }

  async createGuestGiftCardPurchaseAttempt(
    context: {
      tenantId: string;
      restaurantId: string;
      branchId?: string;
    },
    dto: GuestPurchaseGiftCardDto,
  ) {
    const branchId = await this.resolveGuestGiftCardBranchId(context);
    const currency = await this.resolvePreferredCurrency(
      context.restaurantId,
      dto.currency,
    );
    const amount = new Prisma.Decimal(dto.amount).toDecimalPlaces(2);

    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Gift card amount must be greater than 0');
    }

    const data = await this.paymentsRepository.createUnchecked({
      tenantId: context.tenantId,
      restaurantId: context.restaurantId,
      branchId,
      paymentMethod: PaymentMethod.STRIPE,
      type: PaymentTransactionType.CHARGE,
      status: PaymentStatus.PENDING,
      amount,
      currency,
      note: dto.message,
      providerData: {
        target: 'GUEST_GIFT_CARD_PURCHASE',
        buyerEmail: dto.buyerEmail,
        buyerName: dto.buyerName ?? null,
        title: dto.title ?? null,
        message: dto.message ?? null,
        expiresAt: dto.expiresAt ?? null,
      } as Prisma.InputJsonValue,
    });

    const intent = await this.stripePaymentsService.createPaymentIntent({
      amount: Number(amount),
      currency,
      description: `DeliveryWays guest gift card ${data.id}`,
      metadata: {
        paymentTransactionId: data.id,
        orderId: null,
        customerId: dto.buyerEmail,
        restaurantId: context.restaurantId,
        giftCardPurchase: 'true',
        buyerEmail: dto.buyerEmail,
      },
    });

    const updated = await this.paymentsRepository.updateStatus(data.id, {
      status: PaymentStatus.PENDING,
      providerRef: intent.id,
      providerData: {
        target: 'GUEST_GIFT_CARD_PURCHASE',
        buyerEmail: dto.buyerEmail,
        buyerName: dto.buyerName ?? null,
        title: dto.title ?? null,
        message: dto.message ?? null,
        expiresAt: dto.expiresAt ?? null,
        provider: 'stripe',
        clientSecret: intent.client_secret,
        publishableKey: this.stripePaymentsService.getPublishableKey(),
        paymentIntentId: intent.id,
      } as Prisma.InputJsonValue,
      note: dto.message,
    });

    return {
      transaction: updated,
      paymentSession: {
        provider: 'stripe',
        clientSecret: intent.client_secret,
        publishableKey: this.stripePaymentsService.getPublishableKey(),
        paymentIntentId: intent.id,
      },
    };
  }

  private async resolveGuestGiftCardBranchId(context: {
    tenantId: string;
    restaurantId: string;
    branchId?: string;
  }) {
    if (context.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: context.branchId,
          tenantId: context.tenantId,
          restaurantId: context.restaurantId,
          deletedAt: null,
          isActive: true,
        },
        select: { id: true },
      });

      if (!branch) {
        throw new BadRequestException('Branch not found or inactive');
      }

      return branch.id;
    }

    return this.resolveWalletTopUpBranchId({
      customerId: '',
      tenantId: context.tenantId,
      restaurantId: context.restaurantId,
    });
  }

  private async resolveWalletTopUpBranchId(context: {
    customerId: string;
    tenantId: string;
    restaurantId: string;
    branchId?: string;
  }) {
    if (context.branchId) {
      return context.branchId;
    }

    const branch = await this.prisma.branch.findFirst({
      where: {
        tenantId: context.tenantId,
        restaurantId: context.restaurantId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    });

    if (!branch) {
      throw new BadRequestException(
        'Restaurant branch context is required for wallet top-up',
      );
    }

    return branch.id;
  }

  private async resolveSubscriptionPaymentBranchId(
    tenantId: string,
    restaurantId: string,
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: {
        tenantId,
        restaurantId,
        deletedAt: null,
      },
      select: { id: true },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    });

    if (!branch) {
      throw new BadRequestException(
        'Restaurant branch context is required for subscription payment',
      );
    }

    return branch.id;
  }

  private resolveSubscriptionPaymentPlan(subscription: {
    planSnapshot: Prisma.JsonValue | null;
    packagePlan: {
      id: string;
      name: string;
      billingInterval: string;
      planPrice: Prisma.Decimal;
      vatPercentage: Prisma.Decimal;
      currency: string;
    };
  }) {
    const snapshot = this.asJsonObject(subscription.planSnapshot);

    return {
      id: this.readString(snapshot.id) ?? subscription.packagePlan.id,
      name: this.readString(snapshot.name) ?? subscription.packagePlan.name,
      billingInterval:
        this.readString(snapshot.billingInterval) ??
        subscription.packagePlan.billingInterval,
      planPrice: this.readDecimal(
        snapshot.planPrice,
        subscription.packagePlan.planPrice,
      ),
      vatPercentage: this.readDecimal(
        snapshot.vatPercentage,
        subscription.packagePlan.vatPercentage,
      ),
      currency:
        this.readString(snapshot.currency) ?? subscription.packagePlan.currency,
    };
  }

  private calculateSubscriptionPaymentAmount(plan: {
    planPrice: Prisma.Decimal;
    vatPercentage: Prisma.Decimal;
  }) {
    const vatAmount = plan.planPrice
      .mul(plan.vatPercentage)
      .div(100)
      .toDecimalPlaces(2);

    return plan.planPrice.plus(vatAmount).toDecimalPlaces(2);
  }

  private async resolvePreferredCurrency(
    restaurantId: string,
    fallbackCurrency?: string,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { settings: true },
    });

    return (
      (await this.globalSettingsService?.getDefaultCurrencyCode()) ??
      fallbackCurrency?.trim().toUpperCase() ??
      this.readRestaurantCurrency(restaurant?.settings) ??
      this.stripePaymentsService.getDefaultCurrency()
    );
  }

  private readRestaurantCurrency(
    settings: Prisma.JsonValue | null | undefined,
  ) {
    const value = this.readFirstJsonString(settings, [
      ['currency'],
      ['customerApp', 'currency'],
      ['checkout', 'currency'],
      ['payments', 'currency'],
      ['defaultCurrency'],
    ]);

    return value?.toUpperCase() ?? null;
  }

  private readFirstJsonString(
    source: Prisma.JsonValue | null | undefined,
    paths: string[][],
  ) {
    for (const path of paths) {
      let current: unknown = source;

      for (const key of path) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) {
          current = null;
          break;
        }

        current = (current as Record<string, unknown>)[key];
      }

      if (typeof current === 'string' && current.trim().length > 0) {
        return current.trim();
      }
    }

    return null;
  }

  async getRestaurantStripeAccount(
    user: AuthUserContext,
    restaurantId: string,
  ) {
    const restaurant = await this.requireRestaurantForStripe(
      user,
      restaurantId,
    );

    return {
      data: {
        restaurantId: restaurant.id,
        stripe: this.readRestaurantStripeSettings(restaurant.settings),
        publishableKey: this.stripePaymentsService.getPublishableKey() ?? null,
        configured: this.stripePaymentsService.isConfigured(),
      },
      message: 'Restaurant Stripe account fetched successfully',
    };
  }

  async updateRestaurantStripeAccount(
    user: AuthUserContext,
    restaurantId: string,
    dto: UpdateRestaurantStripeAccountDto,
  ) {
    const hasUpdates = Object.values(dto).some((value) => value !== undefined);
    if (!hasUpdates) {
      throw new BadRequestException(
        'At least one Stripe account field is required',
      );
    }

    const restaurant = await this.requireRestaurantForStripe(
      user,
      restaurantId,
    );
    const current = this.readRestaurantStripeSettings(restaurant.settings);
    const nextSettings = this.writeRestaurantStripeSettings(
      restaurant.settings,
      {
        accountId:
          dto.accountId !== undefined
            ? (this.resolveOptionalString(dto.accountId) ?? null)
            : current.accountId,
        payoutsEnabled: dto.payoutsEnabled ?? current.payoutsEnabled,
        chargesEnabled: dto.chargesEnabled ?? current.chargesEnabled,
        onboardingComplete:
          dto.onboardingComplete ?? current.onboardingComplete,
        dashboardUrl:
          dto.dashboardUrl !== undefined
            ? (this.resolveOptionalString(dto.dashboardUrl) ?? null)
            : current.dashboardUrl,
        note:
          dto.note !== undefined
            ? (this.resolveOptionalString(dto.note) ?? null)
            : current.note,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
        ...(current.lastTransfer ? { lastTransfer: current.lastTransfer } : {}),
      },
    );

    const updated = await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { settings: nextSettings as Prisma.InputJsonValue },
      select: { id: true, settings: true },
    });

    return {
      data: {
        restaurantId: updated.id,
        stripe: this.readRestaurantStripeSettings(updated.settings),
      },
      message: 'Restaurant Stripe account updated successfully',
    };
  }

  async createRestaurantStripeTransfer(
    user: AuthUserContext,
    restaurantId: string,
    dto: CreateRestaurantStripeTransferDto,
  ) {
    const restaurant = await this.requireRestaurantForStripe(
      user,
      restaurantId,
    );
    const stripeSettings = this.readRestaurantStripeSettings(
      restaurant.settings,
    );

    if (!stripeSettings.accountId) {
      throw new BadRequestException(
        'Restaurant Stripe accountId is required before transfers',
      );
    }

    if (!stripeSettings.payoutsEnabled) {
      throw new BadRequestException(
        'Stripe payouts are disabled for this restaurant',
      );
    }

    const currency = await this.resolvePreferredCurrency(
      restaurant.id,
      dto.currency,
    );
    const transfer = await this.stripePaymentsService.createTransfer({
      amount: dto.amount,
      currency,
      destinationAccountId: stripeSettings.accountId,
      description:
        dto.description ?? `DeliveryWays restaurant payout ${restaurant.id}`,
      idempotencyKey: dto.idempotencyKey,
      metadata: {
        restaurantId: restaurant.id,
        tenantId: restaurant.tenantId,
        actorId: user.uid,
      },
    });
    const transferSnapshot: Prisma.JsonObject = {
      id: transfer.id,
      amount: dto.amount,
      currency,
      destinationAccountId: stripeSettings.accountId,
      description:
        dto.description ?? `DeliveryWays restaurant payout ${restaurant.id}`,
      createdAt: new Date().toISOString(),
      createdBy: user.uid,
    };
    const nextSettings = this.writeRestaurantStripeSettings(
      restaurant.settings,
      {
        ...stripeSettings,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
        lastTransfer: transferSnapshot,
      },
    );

    await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { settings: nextSettings as Prisma.InputJsonValue },
      select: { id: true },
    });

    return {
      data: {
        restaurantId: restaurant.id,
        transfer: transferSnapshot,
      },
      message: 'Restaurant Stripe transfer created successfully',
    };
  }

  async getRestaurantWallet(user: AuthUserContext, restaurantId: string) {
    const restaurant = await this.requireRestaurantForPayments(
      user,
      restaurantId,
    );
    const wallet = await this.ensureRestaurantWalletAccount(
      restaurant.tenantId,
      restaurant.id,
      await this.resolvePreferredCurrency(restaurant.id),
    );
    const transactions = await this.prisma.restaurantWalletTransaction.findMany(
      {
        where: { walletAccountId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    );

    return {
      data: {
        ...wallet,
        balance: Number(wallet.balance),
        transactions: transactions.map((item) => ({
          ...item,
          amount: Number(item.amount),
          balanceAfter: Number(item.balanceAfter),
        })),
      },
      message: 'Restaurant wallet fetched successfully',
    };
  }

  async listRestaurantPayoutRequests(
    user: AuthUserContext,
    restaurantId: string,
    query: ListRestaurantPayoutRequestsDto,
  ) {
    const restaurant = await this.requireRestaurantForPayments(
      user,
      restaurantId,
    );
    const where: Prisma.RestaurantPayoutRequestWhereInput = {
      restaurantId: restaurant.id,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.restaurantPayoutRequest.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.restaurantPayoutRequest.count({ where }),
    ]);

    return {
      data: items.map((item) => this.serializeRestaurantPayoutRequest(item)),
      message: 'Restaurant payout requests fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async createRestaurantPayoutRequest(
    user: AuthUserContext,
    restaurantId: string,
    dto: CreateRestaurantPayoutRequestDto,
  ) {
    const restaurant = await this.requireRestaurantForPayments(
      user,
      restaurantId,
    );
    const wallet = await this.ensureRestaurantWalletAccount(
      restaurant.tenantId,
      restaurant.id,
      dto.currency ?? (await this.resolvePreferredCurrency(restaurant.id)),
    );
    const amount = new Prisma.Decimal(dto.amount).toDecimalPlaces(2);

    if (amount.greaterThan(wallet.balance)) {
      throw new BadRequestException('Requested amount exceeds wallet balance');
    }

    const data = await this.prisma.restaurantPayoutRequest.create({
      data: {
        walletAccountId: wallet.id,
        tenantId: restaurant.tenantId,
        restaurantId: restaurant.id,
        branchId: user.bid ?? null,
        requestedBy: user.uid,
        amount,
        currency: (dto.currency ?? wallet.currency).trim().toUpperCase(),
        bankDetails: this.normalizePayoutBankDetails(
          dto.bankDetails,
        ) as Prisma.InputJsonValue,
        note: this.resolveOptionalString(dto.note),
      },
    });

    return {
      data: this.serializeRestaurantPayoutRequest(data),
      message: 'Restaurant payout request created successfully',
    };
  }

  async approveRestaurantPayoutRequest(
    user: AuthUserContext,
    id: string,
    dto: ReviewRestaurantPayoutRequestDto,
  ) {
    const data = await this.prisma.restaurantPayoutRequest.update({
      where: { id, status: RestaurantPayoutRequestStatus.REQUESTED },
      data: {
        status: RestaurantPayoutRequestStatus.APPROVED,
        reviewedBy: user.uid,
        approvalNote: this.resolveOptionalString(dto.note),
        approvedAt: new Date(),
      },
    });

    return {
      data: this.serializeRestaurantPayoutRequest(data),
      message: 'Restaurant payout request approved successfully',
    };
  }

  async rejectRestaurantPayoutRequest(
    user: AuthUserContext,
    id: string,
    dto: ReviewRestaurantPayoutRequestDto,
  ) {
    const data = await this.prisma.restaurantPayoutRequest.update({
      where: { id, status: RestaurantPayoutRequestStatus.REQUESTED },
      data: {
        status: RestaurantPayoutRequestStatus.REJECTED,
        reviewedBy: user.uid,
        rejectionReason:
          this.resolveOptionalString(dto.reason) ??
          this.resolveOptionalString(dto.note),
        rejectedAt: new Date(),
      },
    });

    return {
      data: this.serializeRestaurantPayoutRequest(data),
      message: 'Restaurant payout request rejected successfully',
    };
  }

  async markRestaurantPayoutPaid(
    user: AuthUserContext,
    id: string,
    dto: MarkRestaurantPayoutPaidDto,
  ) {
    const data = await this.prisma.$transaction(async (tx) => {
      const request = await tx.restaurantPayoutRequest.findUnique({
        where: { id },
        include: { walletAccount: true },
      });

      if (!request) {
        throw new NotFoundException('Restaurant payout request not found');
      }

      if (request.status !== RestaurantPayoutRequestStatus.APPROVED) {
        throw new BadRequestException(
          'Only approved payout requests can be marked paid',
        );
      }

      if (request.amount.greaterThan(request.walletAccount.balance)) {
        throw new BadRequestException(
          'Requested amount exceeds wallet balance',
        );
      }

      const nextBalance = request.walletAccount.balance.minus(request.amount);
      await tx.restaurantWalletAccount.update({
        where: { id: request.walletAccountId },
        data: { balance: nextBalance },
      });
      const walletTransaction = await tx.restaurantWalletTransaction.create({
        data: {
          walletAccountId: request.walletAccountId,
          tenantId: request.tenantId,
          restaurantId: request.restaurantId,
          branchId: request.branchId,
          payoutRequestId: request.id,
          type: RestaurantWalletTransactionType.PAYOUT_DEBIT,
          amount: request.amount.negated(),
          balanceAfter: nextBalance,
          currency: request.currency,
          note:
            this.resolveOptionalString(dto.note) ??
            'Manual bank payout completed by super admin',
          metadata: {
            paymentReference: dto.paymentReference ?? null,
          } as Prisma.InputJsonValue,
          createdBy: user.uid,
        },
      });

      return tx.restaurantPayoutRequest.update({
        where: { id: request.id },
        data: {
          status: RestaurantPayoutRequestStatus.PAID,
          paidBy: user.uid,
          paidAt: new Date(),
          paymentReference: this.resolveOptionalString(dto.paymentReference),
          paidNote: this.resolveOptionalString(dto.note),
          walletTransactionId: walletTransaction.id,
        },
      });
    });

    return {
      data: this.serializeRestaurantPayoutRequest(data),
      message: 'Restaurant payout marked paid successfully',
    };
  }

  async getRestaurantPaymentManagement(
    user: AuthUserContext,
    restaurantId: string,
    query: RestaurantPaymentManagementQueryDto,
  ) {
    const restaurant = await this.requireRestaurantForPayments(
      user,
      restaurantId,
    );
    const [
      transactionSummary,
      walletSummary,
      restaurantWallet,
      transactions,
      globalMethods,
    ] = await Promise.all([
      this.paymentsRepository.summarizeRestaurantTransactions(
        restaurant.id,
        query.branchId,
      ),
      this.paymentsRepository.summarizeRestaurantWallets(restaurant.id),
      this.ensureRestaurantWalletAccount(
        restaurant.tenantId,
        restaurant.id,
        await this.resolvePreferredCurrency(restaurant.id),
      ),
      this.paymentsRepository.listRestaurantTransactions(restaurant.id, {
        ...query,
        restaurantId: restaurant.id,
      }),
      this.getGlobalPaymentMethods(),
    ]);
    const stripe = this.readRestaurantStripeSettings(restaurant.settings);
    const paymentMethods = this.readRestaurantPaymentMethodSettings(
      restaurant.settings,
    );

    return {
      data: {
        restaurantId: restaurant.id,
        payments: {
          currency: await this.resolvePreferredCurrency(restaurant.id),
          methods: {
            activePlatformMethods: globalMethods
              .filter((method) => method.isActive)
              .map((method) => method.code),
            restaurantMethods: paymentMethods,
          },
          stripe: {
            ...stripe,
            publishableKey:
              this.stripePaymentsService.getPublishableKey() ?? null,
            configured: this.stripePaymentsService.isConfigured(),
          },
          payouts: {
            provider: 'stripe',
            enabled: stripe.payoutsEnabled,
            lastTransfer: stripe.lastTransfer ?? null,
          },
          wallet: {
            type: 'RESTAURANT_WALLET',
            balance: Number(restaurantWallet.balance),
            currency: restaurantWallet.currency,
            customerWalletExposure: {
              accountCount: walletSummary.accountCount,
              totalBalance: Number(walletSummary.totalBalance),
            },
          },
          summary: this.serializeRestaurantPaymentSummary(transactionSummary),
        },
        transactions: transactions.items,
      },
      message: 'Restaurant payment management fetched successfully',
      meta: buildPaginationMeta(query, transactions.total),
    };
  }

  async updateRestaurantPaymentMethods(
    user: AuthUserContext,
    restaurantId: string,
    dto: UpdateRestaurantPaymentMethodsDto,
  ) {
    const restaurant = await this.requireRestaurantForPayments(
      user,
      restaurantId,
    );
    const nextSettings = this.writeRestaurantPaymentMethodSettings(
      restaurant.settings,
      {
        allowedPaymentMethods: this.dedupePaymentMethods(
          dto.allowedPaymentMethods,
        ),
        walletEnabled:
          dto.walletEnabled ??
          dto.allowedPaymentMethods.includes(PaymentMethod.WALLET),
        note:
          dto.note !== undefined
            ? (this.resolveOptionalString(dto.note) ?? null)
            : this.readRestaurantPaymentMethodSettings(restaurant.settings)
                .note,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      },
    );

    const updated = await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { settings: nextSettings as Prisma.InputJsonValue },
      select: { id: true, settings: true },
    });

    return {
      data: {
        restaurantId: updated.id,
        methods: this.readRestaurantPaymentMethodSettings(updated.settings),
      },
      message: 'Restaurant payment methods updated successfully',
    };
  }

  async list(user: AuthUserContext, query: ListPaymentsDto) {
    const restaurantId = await this.resolveRestaurantId(
      user,
      query.restaurantId,
    );
    const customerId =
      user.role === UserRoleEnum.CUSTOMER ? user.uid : undefined;
    const { items, total } = await this.paymentsRepository.list(
      restaurantId,
      query,
      customerId,
    );

    return {
      data: items,
      message: 'Payments fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const payment = await this.paymentsRepository.findById(id);

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    if (!payment.order) {
      if (user.role === UserRoleEnum.CUSTOMER) {
        throw new BadRequestException(
          'Wallet top-up transactions are not exposed here',
        );
      }

      await this.assertAdminPaymentAccess(user, payment.restaurantId, true);

      return {
        data: payment,
        message: 'Payment fetched successfully',
      };
    }

    await this.assertOrderAccess(
      user,
      payment.order.restaurantId,
      payment.order.customerId,
    );

    return {
      data: payment,
      message: 'Payment fetched successfully',
    };
  }

  async updateStatus(
    user: AuthUserContext,
    id: string,
    dto: AdminUpdatePaymentStatusDto,
  ) {
    if (dto.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException(
        'Use the refund endpoint for refunded payment updates',
      );
    }

    if (dto.status === PaymentStatus.PENDING) {
      throw new BadRequestException(
        'Admin payment updates only support PAID, FAILED, or CANCELLED',
      );
    }

    const payment = await this.paymentsRepository.findById(id);

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    await this.assertAdminPaymentAccess(user, payment.restaurantId, true);

    if (payment.orderId && payment.order) {
      if (dto.status === PaymentStatus.PAID) {
        return this.markPaid(user, id, dto);
      }

      if (dto.status === PaymentStatus.FAILED) {
        return this.fail(user, id, dto);
      }

      return this.cancel(user, id, dto);
    }

    return this.updateWalletTopUpStatus(payment, dto, user.uid);
  }

  async markPaid(
    user: AuthUserContext,
    id: string,
    dto: UpdatePaymentStatusDto,
  ) {
    const payment = await this.paymentsRepository.findById(id);

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    if (!payment.order || !payment.orderId) {
      throw new BadRequestException(
        'Wallet top-up transactions cannot be marked paid here',
      );
    }

    const orderId = payment.orderId;

    await this.assertAdminPaymentAccess(user, payment.order.restaurantId, true);

    if (payment.type !== PaymentTransactionType.CHARGE) {
      throw new BadRequestException(
        'Only charge transactions can be marked paid',
      );
    }

    if (payment.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException(
        'Refunded transactions cannot be marked paid',
      );
    }

    const data = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await this.paymentsRepository.updateStatus(
        id,
        {
          status: PaymentStatus.PAID,
          providerRef: dto.providerRef,
          providerData: dto.providerData as Prisma.InputJsonValue,
          note: dto.note,
          processedAt: new Date(),
        },
        tx,
      );

      await this.paymentsRepository.updateOrderPaymentStatus(
        orderId,
        PaymentStatus.PAID,
        tx,
      );

      return updatedPayment;
    });

    await this.creditRestaurantWalletForPayment(data, user.uid);
    await this.loyaltyWalletService!.awardPointsForPaidOrder(
      orderId,
      data.id,
      user.uid,
    );
    await this.notificationsService.notifyPaymentStatusChanged(data.id);

    return {
      data,
      message: 'Payment marked as paid successfully',
    };
  }

  async fail(user: AuthUserContext, id: string, dto: UpdatePaymentStatusDto) {
    const payment = await this.paymentsRepository.findById(id);

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    if (!payment.order || !payment.orderId) {
      throw new BadRequestException(
        'Wallet top-up transactions cannot be failed here',
      );
    }

    const orderId = payment.orderId;

    await this.assertAdminPaymentAccess(user, payment.order.restaurantId, true);

    if (payment.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException('Refunded transactions cannot be failed');
    }

    const data = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await this.paymentsRepository.updateStatus(
        id,
        {
          status: PaymentStatus.FAILED,
          providerRef: dto.providerRef,
          providerData: dto.providerData as Prisma.InputJsonValue,
          note: dto.note,
          processedAt: new Date(),
        },
        tx,
      );

      await this.paymentsRepository.updateOrderPaymentStatus(
        orderId,
        PaymentStatus.FAILED,
        tx,
      );

      return updatedPayment;
    });

    await this.loyaltyWalletService!.restoreOrderBenefits(
      orderId,
      'PAYMENT_REVERSAL',
      user.uid,
    );
    await this.notificationsService.notifyPaymentStatusChanged(data.id);

    return {
      data,
      message: 'Payment marked as failed successfully',
    };
  }

  async cancel(user: AuthUserContext, id: string, dto: UpdatePaymentStatusDto) {
    const payment = await this.paymentsRepository.findById(id);

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    if (!payment.order || !payment.orderId) {
      throw new BadRequestException(
        'Wallet top-up transactions cannot be cancelled here',
      );
    }

    const orderId = payment.orderId;

    const isCustomer = user.role === UserRoleEnum.CUSTOMER;
    if (isCustomer) {
      await this.assertOrderAccess(
        user,
        payment.order.restaurantId,
        payment.order.customerId,
      );
    } else {
      await this.assertAdminPaymentAccess(
        user,
        payment.order.restaurantId,
        true,
      );
    }

    if (payment.status === PaymentStatus.PAID) {
      throw new BadRequestException('Paid transactions cannot be cancelled');
    }

    if (payment.paymentMethod === PaymentMethod.STRIPE && payment.providerRef) {
      await this.stripePaymentsService.cancelPaymentIntent(payment.providerRef);
    }

    const data = await this.applyPaymentTerminalStatus(
      payment.id,
      orderId,
      PaymentStatus.CANCELLED,
      {
        providerRef: dto.providerRef ?? payment.providerRef ?? undefined,
        providerData: dto.providerData,
        note: dto.note,
      },
      user.uid,
      payment.paymentMethod === PaymentMethod.STRIPE,
    );

    return {
      data,
      message: 'Payment cancelled successfully',
    };
  }

  async refund(user: AuthUserContext, id: string, dto: RefundPaymentDto) {
    const payment = await this.paymentsRepository.findById(id);

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    if (!payment.order || !payment.orderId) {
      throw new BadRequestException(
        'Wallet top-up transactions cannot be refunded here',
      );
    }

    const orderId = payment.orderId;

    await this.assertAdminPaymentAccess(user, payment.order.restaurantId);

    if (payment.type !== PaymentTransactionType.CHARGE) {
      throw new BadRequestException('Only charge transactions can be refunded');
    }

    if (payment.status !== PaymentStatus.PAID) {
      throw new BadRequestException('Only paid transactions can be refunded');
    }

    const refundAmount = dto.amount
      ? new Prisma.Decimal(dto.amount)
      : payment.amount;

    if (refundAmount.greaterThan(payment.amount)) {
      throw new BadRequestException(
        'Refund amount cannot exceed charge amount',
      );
    }

    const refundedSoFar =
      await this.paymentsRepository.sumSuccessfulRefunds(orderId);

    if (refundedSoFar.plus(refundAmount).greaterThan(payment.amount)) {
      throw new BadRequestException(
        'Refund amount exceeds remaining refundable amount',
      );
    }

    if (payment.paymentMethod === PaymentMethod.STRIPE && payment.providerRef) {
      await this.stripePaymentsService.refundPaymentIntent(
        payment.providerRef,
        Number(refundAmount),
      );
    }

    const currency = dto.currency ?? payment.currency;

    const data = await this.prisma.$transaction(async (tx) => {
      const refundTransaction = await this.paymentsRepository.create(
        {
          order: { connect: { id: orderId } },
          tenant: { connect: { id: payment.tenantId } },
          restaurant: { connect: { id: payment.restaurantId } },
          branch: { connect: { id: payment.branchId } },
          paymentMethod: payment.paymentMethod,
          type: PaymentTransactionType.REFUND,
          status: PaymentStatus.REFUNDED,
          amount: refundAmount,
          currency,
          providerRef: dto.providerRef ?? payment.providerRef,
          providerData: dto.providerData as Prisma.InputJsonValue,
          note: dto.note,
          processedAt: new Date(),
        },
        tx,
      );

      const updatedStatus = refundedSoFar
        .plus(refundAmount)
        .equals(payment.amount)
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PAID;

      await this.paymentsRepository.updateOrderPaymentStatus(
        orderId,
        updatedStatus,
        tx,
      );

      if (updatedStatus === PaymentStatus.REFUNDED) {
        await this.paymentsRepository.updateStatus(
          payment.id,
          {
            status: PaymentStatus.REFUNDED,
            processedAt: new Date(),
          },
          tx,
        );
        await this.paymentsRepository.updateOrderState(
          orderId,
          {
            status: OrderStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledByUserId: user.uid,
          },
          tx,
        );
      }

      return refundTransaction;
    });

    if (data.status === PaymentStatus.REFUNDED) {
      await this.loyaltyWalletService!.restoreOrderBenefits(
        orderId,
        'REFUND',
        user.uid,
      );
    }
    await this.notificationsService.notifyPaymentStatusChanged(data.id);

    return {
      data,
      message: 'Payment refunded successfully',
    };
  }

  private async updateWalletTopUpStatus(
    payment: {
      id: string;
      orderId: string | null;
      tenantId: string;
      restaurantId: string;
      branchId: string;
      amount: Prisma.Decimal;
      paymentMethod: PaymentMethod;
      providerRef: string | null;
      providerData: Prisma.JsonValue | null;
      status: PaymentStatus;
      type: PaymentTransactionType;
    },
    dto: AdminUpdatePaymentStatusDto,
    actorId: string,
  ) {
    if (payment.type !== PaymentTransactionType.CHARGE) {
      throw new BadRequestException(
        'Only charge transactions can be updated here',
      );
    }

    if (payment.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException('Refunded transactions cannot be updated');
    }

    if (
      dto.status !== PaymentStatus.PAID &&
      payment.status === PaymentStatus.PAID
    ) {
      throw new BadRequestException(
        'Paid wallet top-up transactions cannot be downgraded',
      );
    }

    if (
      dto.status === PaymentStatus.CANCELLED &&
      payment.paymentMethod === PaymentMethod.STRIPE &&
      payment.providerRef
    ) {
      await this.stripePaymentsService.cancelPaymentIntent(payment.providerRef);
    }

    const data = await this.prisma.$transaction(async (tx) => {
      return this.paymentsRepository.updateStatus(
        payment.id,
        {
          status: dto.status,
          providerRef: dto.providerRef ?? payment.providerRef ?? undefined,
          providerData: dto.providerData as Prisma.InputJsonValue,
          note: dto.note,
          processedAt: new Date(),
        },
        tx,
      );
    });

    if (dto.status === PaymentStatus.PAID) {
      const topUpContext = this.readWalletTopUpContext(payment);

      await this.loyaltyWalletService!.applyWalletTopUp(
        topUpContext,
        Number(payment.amount),
        payment.id,
        dto.note?.trim() || 'Wallet top-up marked as paid by admin',
        actorId,
      );
    }

    await this.notificationsService.notifyPaymentStatusChanged(data.id);

    return {
      data,
      message: `Payment marked as ${dto.status.toLowerCase()} successfully`,
    };
  }

  async handleStripeWebhook(
    rawBody: Buffer | string | undefined,
    signature?: string,
  ) {
    if (!rawBody) {
      throw new BadRequestException('Stripe webhook payload is required');
    }

    const event = this.stripePaymentsService.constructWebhookEvent(
      rawBody,
      signature,
    );

    switch (event.type) {
      case 'payment_intent.succeeded': {
        await this.handleStripePaymentIntentSucceeded(
          event.data.object as unknown as Record<string, unknown>,
        );
        break;
      }
      case 'payment_intent.payment_failed': {
        await this.handleStripePaymentIntentFailed(
          event.data.object as unknown as Record<string, unknown>,
          'Stripe payment failed',
        );
        break;
      }
      case 'payment_intent.canceled': {
        await this.handleStripePaymentIntentFailed(
          event.data.object as unknown as Record<string, unknown>,
          'Stripe payment cancelled',
          PaymentStatus.CANCELLED,
        );
        break;
      }
      default:
        break;
    }

    return {
      received: true,
      eventType: event.type,
    };
  }

  private async handleStripePaymentIntentSucceeded(
    paymentIntent: Record<string, unknown>,
  ) {
    const providerRef = this.readStripeIntentId(paymentIntent);
    const payment =
      await this.paymentsRepository.findByProviderRef(providerRef);

    if (!payment || payment.status === PaymentStatus.PAID) {
      return;
    }

    if (!payment.orderId) {
      if (
        this.readPaymentTarget(payment.providerData) === 'TENANT_SUBSCRIPTION'
      ) {
        await this.updateTenantSubscriptionPaymentStatus(
          payment,
          providerRef,
          paymentIntent,
          PaymentStatus.PAID,
        );
        await this.notificationsService.notifyPaymentStatusChanged(payment.id);
        return;
      }

      if (
        this.readPaymentTarget(payment.providerData) ===
        'GUEST_GIFT_CARD_PURCHASE'
      ) {
        await this.fulfillGuestGiftCardPurchase(
          payment,
          providerRef,
          paymentIntent,
        );
        await this.notificationsService.notifyPaymentStatusChanged(payment.id);
        return;
      }

      const topUpContext = this.readWalletTopUpContext(payment);

      await this.prisma.$transaction(async (tx) => {
        await this.paymentsRepository.updateStatus(
          payment.id,
          {
            status: PaymentStatus.PAID,
            providerRef,
            providerData: paymentIntent as Prisma.InputJsonValue,
            processedAt: new Date(),
          },
          tx,
        );
      });

      await this.loyaltyWalletService!.applyWalletTopUp(
        topUpContext,
        Number(payment.amount),
        payment.id,
        'Wallet top-up via Stripe',
        'stripe:webhook',
      );

      return;
    }

    const orderId = payment.orderId;
    const shouldPlaceOrder = await this.prisma.order.findFirst({
      where: { id: orderId, status: OrderStatus.PAYMENT_PENDING },
      select: { id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await this.paymentsRepository.updateStatus(
        payment.id,
        {
          status: PaymentStatus.PAID,
          providerRef,
          providerData: paymentIntent as Prisma.InputJsonValue,
          processedAt: new Date(),
        },
        tx,
      );
      await this.paymentsRepository.updateOrderPaymentStatus(
        orderId,
        PaymentStatus.PAID,
        tx,
      );

      if (shouldPlaceOrder) {
        await this.paymentsRepository.updateOrderState(
          orderId,
          { status: OrderStatus.PLACED },
          tx,
        );
      }
    });

    await this.creditRestaurantWalletForPayment(
      { ...payment, status: PaymentStatus.PAID },
      'stripe:webhook',
    );
    await this.loyaltyWalletService!.awardPointsForPaidOrder(
      orderId,
      payment.id,
      'stripe:webhook',
    );
    await this.notificationsService.notifyPaymentStatusChanged(payment.id);
    if (shouldPlaceOrder) {
      await this.notificationsService.notifyOrderPlaced(orderId);
    }
  }

  private async handleStripePaymentIntentFailed(
    paymentIntent: Record<string, unknown>,
    note: string,
    status: PaymentStatus = PaymentStatus.FAILED,
  ) {
    const providerRef = this.readStripeIntentId(paymentIntent);
    const payment =
      await this.paymentsRepository.findByProviderRef(providerRef);

    if (
      !payment ||
      payment.status === PaymentStatus.PAID ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      return;
    }

    if (!payment.orderId) {
      if (
        this.readPaymentTarget(payment.providerData) === 'TENANT_SUBSCRIPTION'
      ) {
        await this.updateTenantSubscriptionPaymentStatus(
          payment,
          providerRef,
          paymentIntent,
          status,
          note,
        );
        return;
      }

      await this.prisma.$transaction(async (tx) => {
        await this.paymentsRepository.updateStatus(
          payment.id,
          {
            status,
            providerRef,
            providerData: paymentIntent as Prisma.InputJsonValue,
            note,
            processedAt: new Date(),
          },
          tx,
        );
      });

      return;
    }

    const orderId = payment.orderId;

    await this.applyPaymentTerminalStatus(
      payment.id,
      orderId,
      status,
      {
        providerRef,
        providerData: paymentIntent as Prisma.InputJsonValue,
        note,
      },
      'stripe:webhook',
      true,
    );
  }

  private async applyPaymentTerminalStatus(
    paymentId: string,
    orderId: string,
    status: PaymentStatus,
    details: {
      providerRef?: string;
      providerData?: Record<string, unknown> | Prisma.InputJsonValue;
      note?: string;
    },
    actorId: string,
    cancelOrder = false,
  ) {
    const data = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await this.paymentsRepository.updateStatus(
        paymentId,
        {
          status,
          providerRef: details.providerRef,
          providerData: details.providerData as Prisma.InputJsonValue,
          note: details.note,
          processedAt: new Date(),
        },
        tx,
      );

      await this.paymentsRepository.updateOrderPaymentStatus(
        orderId,
        status,
        tx,
      );

      if (cancelOrder) {
        await this.paymentsRepository.updateOrderState(
          orderId,
          {
            status: OrderStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledByUserId: actorId,
          },
          tx,
        );
      }

      return updatedPayment;
    });

    await this.loyaltyWalletService!.restoreOrderBenefits(
      orderId,
      'PAYMENT_REVERSAL',
      actorId,
    );
    await this.notificationsService.notifyPaymentStatusChanged(data.id);

    return data;
  }

  private readStripeIntentId(paymentIntent: Record<string, unknown>) {
    const id = paymentIntent.id;

    if (typeof id !== 'string' || !id.length) {
      throw new BadRequestException('Stripe payment intent id is missing');
    }

    return id;
  }

  private readPaymentTarget(providerData: Prisma.JsonValue | null) {
    if (!providerData || typeof providerData !== 'object') {
      return null;
    }

    if (Array.isArray(providerData)) {
      return null;
    }

    const target = (providerData as Record<string, unknown>).target;
    return typeof target === 'string' ? target : null;
  }

  private readSubscriptionId(providerData: Prisma.JsonValue | null) {
    if (!providerData || typeof providerData !== 'object') {
      throw new BadRequestException('Subscription payment context is missing');
    }

    if (Array.isArray(providerData)) {
      throw new BadRequestException('Subscription payment context is missing');
    }

    const subscriptionId = (providerData as Record<string, unknown>)
      .subscriptionId;
    if (typeof subscriptionId !== 'string' || !subscriptionId.trim()) {
      throw new BadRequestException('Subscription payment context is missing');
    }

    return subscriptionId;
  }

  private async updateTenantSubscriptionPaymentStatus(
    payment: {
      id: string;
      providerData: Prisma.JsonValue | null;
    },
    providerRef: string,
    paymentIntent: Record<string, unknown>,
    status: PaymentStatus,
    note?: string,
  ) {
    const subscriptionId = this.readSubscriptionId(payment.providerData);
    const existingProviderData = this.asJsonObject(payment.providerData);

    await this.prisma.$transaction(async (tx) => {
      await this.paymentsRepository.updateStatus(
        payment.id,
        {
          status,
          providerRef,
          providerData: {
            ...existingProviderData,
            provider: 'stripe',
            paymentIntent,
            paymentIntentId: providerRef,
          } as Prisma.InputJsonValue,
          note,
          processedAt: new Date(),
        },
        tx,
      );

      await tx.tenantSubscription.update({
        where: { id: subscriptionId },
        data: {
          paymentStatus: status,
          ...(status === PaymentStatus.PAID
            ? { status: SubscriptionStatus.ACTIVE }
            : {}),
          updatedBy: 'stripe:webhook',
        },
      });
    });
  }

  private async fulfillGuestGiftCardPurchase(
    payment: {
      id: string;
      tenantId: string;
      restaurantId: string;
      branchId: string;
      amount: Prisma.Decimal;
      currency: string;
      providerData: Prisma.JsonValue | null;
    },
    providerRef: string,
    paymentIntent: Record<string, unknown>,
  ) {
    const providerData =
      payment.providerData &&
      typeof payment.providerData === 'object' &&
      !Array.isArray(payment.providerData)
        ? (payment.providerData as Record<string, unknown>)
        : {};
    const code = await this.generateUniqueGiftCardCode(payment.restaurantId);
    const now = new Date();
    const requestedExpiry = providerData.expiresAt;
    const expiresAt =
      typeof requestedExpiry === 'string' && requestedExpiry.trim()
        ? new Date(requestedExpiry)
        : this.addDays(now, 365);

    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
      throw new BadRequestException('Gift card expiry must be in the future');
    }

    await this.prisma.$transaction(async (tx) => {
      const giftCard = await tx.coupon.create({
        data: {
          tenantId: payment.tenantId,
          restaurantId: payment.restaurantId,
          branchId: payment.branchId,
          code,
          title:
            typeof providerData.title === 'string' && providerData.title.trim()
              ? providerData.title.trim()
              : 'Gift Card',
          description:
            typeof providerData.message === 'string' &&
            providerData.message.trim()
              ? providerData.message.trim()
              : null,
          kind: 'GIFT_CARD',
          status: 'ACTIVE',
          applyMode: 'ORDER_TOTAL',
          autoApply: false,
          discountType: 'FLAT',
          discountValue: payment.amount,
          maxUses: 1,
          maxUsesPerCustomer: 1,
          startsAt: now,
          expiresAt,
          isActive: true,
        },
      });

      await this.paymentsRepository.updateStatus(
        payment.id,
        {
          status: PaymentStatus.PAID,
          providerRef,
          providerData: {
            ...providerData,
            provider: 'stripe',
            paymentIntentId: providerRef,
            giftCardId: giftCard.id,
            giftCardCode: code,
            qrPayload: `DWGC:${code}`,
          } as Prisma.InputJsonValue,
          processedAt: now,
        },
        tx,
      );
    });

    void paymentIntent;
  }

  private async generateUniqueGiftCardCode(restaurantId: string) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = `GIFT-${randomBytes(5).toString('hex').toUpperCase()}`;
      const existing = await this.prisma.coupon.findUnique({
        where: {
          restaurantId_code: {
            restaurantId,
            code,
          },
        },
        select: { id: true },
      });

      if (!existing) {
        return code;
      }
    }

    throw new BadRequestException('Could not generate gift card code');
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private readWalletTopUpContext(payment: {
    tenantId: string;
    restaurantId: string;
    branchId: string;
    providerData: Prisma.JsonValue | null;
  }) {
    const providerData =
      payment.providerData && typeof payment.providerData === 'object'
        ? (payment.providerData as Record<string, unknown>)
        : {};
    const customerId = providerData.customerId;

    if (typeof customerId !== 'string' || !customerId.trim()) {
      throw new BadRequestException(
        'Wallet top-up customer context is missing',
      );
    }

    return {
      customerId,
      tenantId: payment.tenantId,
      restaurantId: payment.restaurantId,
      branchId: payment.branchId,
    };
  }

  private async requireRestaurantForStripe(
    user: AuthUserContext,
    restaurantId: string,
  ) {
    await this.assertAdminPaymentAccess(user, restaurantId);

    const restaurant = await this.prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        deletedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        settings: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    return restaurant;
  }

  private async requireRestaurantForPayments(
    user: AuthUserContext,
    restaurantId: string,
  ) {
    await this.assertAdminPaymentAccess(user, restaurantId);

    const restaurant = await this.prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        deletedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        settings: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    return restaurant;
  }

  private async getGlobalPaymentMethods() {
    const response = await this.globalSettingsService?.getPaymentMethods();

    return (
      response?.data?.map((method) => ({
        code: method.code,
        label: method.label,
        isActive: method.isActive,
      })) ?? []
    );
  }

  private async assertPaymentMethodAllowedForOrder(
    order: {
      branch: { settings: Prisma.JsonValue | null };
      restaurant: { settings: Prisma.JsonValue | null };
    },
    paymentMethod: PaymentMethod,
  ) {
    const branchMethods = this.readBranchAllowedPaymentMethods(
      order.branch.settings,
    );
    const restaurantMethods = this.readRestaurantPaymentMethodSettings(
      order.restaurant.settings,
    ).allowedPaymentMethods;
    const globalMethods = await this.getGlobalPaymentMethods();
    const activeGlobalMethods = globalMethods
      .filter((method) => method.isActive)
      .map((method) => method.code);

    if (
      paymentMethod === PaymentMethod.COD ||
      paymentMethod === PaymentMethod.WALLET ||
      paymentMethod === PaymentMethod.PAYPAL ||
      branchMethods.includes(paymentMethod) ||
      restaurantMethods.includes(paymentMethod) ||
      activeGlobalMethods.includes(paymentMethod)
    ) {
      return;
    }

    throw new BadRequestException(
      'Payment method is not allowed for this order',
    );
  }

  private readBranchAllowedPaymentMethods(
    settings: Prisma.JsonValue | null | undefined,
  ) {
    const root = this.asJsonObject(settings);
    const methods = Array.isArray(root.allowedPaymentMethods)
      ? root.allowedPaymentMethods.filter(
          (method): method is PaymentMethod =>
            typeof method === 'string' &&
            Object.values(PaymentMethod).includes(method as PaymentMethod),
        )
      : [
          PaymentMethod.COD,
          PaymentMethod.CARD_ON_DELIVERY,
          PaymentMethod.PAYPAL,
          PaymentMethod.WALLET,
        ];

    return this.dedupePaymentMethods(methods);
  }

  private serializeRestaurantPaymentSummary(summary: {
    paidCharges: {
      _sum: { amount: Prisma.Decimal | null };
      _count: { _all: number };
    };
    pendingCharges: {
      _sum: { amount: Prisma.Decimal | null };
      _count: { _all: number };
    };
    failedCharges: {
      _sum: { amount: Prisma.Decimal | null };
      _count: { _all: number };
    };
    refundedAmount: {
      _sum: { amount: Prisma.Decimal | null };
      _count: { _all: number };
    };
    transactionCount: number;
  }) {
    const paidAmount = summary.paidCharges._sum.amount ?? new Prisma.Decimal(0);
    const refundedAmount =
      summary.refundedAmount._sum.amount ?? new Prisma.Decimal(0);

    return {
      transactionCount: summary.transactionCount,
      paidChargeCount: summary.paidCharges._count._all,
      paidChargeAmount: Number(paidAmount),
      pendingChargeCount: summary.pendingCharges._count._all,
      pendingChargeAmount: Number(
        summary.pendingCharges._sum.amount ?? new Prisma.Decimal(0),
      ),
      failedChargeCount: summary.failedCharges._count._all,
      failedChargeAmount: Number(
        summary.failedCharges._sum.amount ?? new Prisma.Decimal(0),
      ),
      refundedCount: summary.refundedAmount._count._all,
      refundedAmount: Number(refundedAmount),
      estimatedAvailableBalance: Number(paidAmount.minus(refundedAmount)),
    };
  }

  private readRestaurantStripeSettings(
    settings: Prisma.JsonValue | null | undefined,
  ): RestaurantStripeSettings {
    const payments = this.asJsonObject(this.readPath(settings, ['payments']));
    const stripe = this.asJsonObject(payments.stripe);

    return {
      accountId: this.readString(stripe.accountId),
      payoutsEnabled: this.readBoolean(stripe.payoutsEnabled, false),
      chargesEnabled: this.readBoolean(stripe.chargesEnabled, false),
      onboardingComplete: this.readBoolean(stripe.onboardingComplete, false),
      dashboardUrl: this.readString(stripe.dashboardUrl),
      note: this.readString(stripe.note),
      updatedAt: this.readString(stripe.updatedAt),
      updatedBy: this.readString(stripe.updatedBy),
      ...(this.asOptionalJsonObject(stripe.lastTransfer)
        ? { lastTransfer: this.asJsonObject(stripe.lastTransfer) }
        : {}),
    };
  }

  private readRestaurantPaymentMethodSettings(
    settings: Prisma.JsonValue | null | undefined,
  ): RestaurantPaymentMethodSettings {
    const payments = this.asJsonObject(this.readPath(settings, ['payments']));
    const methods = this.asJsonObject(payments.methods);
    const allowedPaymentMethods = Array.isArray(methods.allowedPaymentMethods)
      ? this.dedupePaymentMethods(
          methods.allowedPaymentMethods.filter(
            (method): method is PaymentMethod =>
              typeof method === 'string' &&
              Object.values(PaymentMethod).includes(method as PaymentMethod),
          ),
        )
      : [
          PaymentMethod.COD,
          PaymentMethod.CARD_ON_DELIVERY,
          PaymentMethod.PAYPAL,
          PaymentMethod.WALLET,
        ];

    return {
      allowedPaymentMethods,
      walletEnabled: this.readBoolean(
        methods.walletEnabled,
        allowedPaymentMethods.includes(PaymentMethod.WALLET),
      ),
      note: this.readString(methods.note),
      updatedAt: this.readString(methods.updatedAt),
      updatedBy: this.readString(methods.updatedBy),
    };
  }

  private writeRestaurantPaymentMethodSettings(
    settings: Prisma.JsonValue | null | undefined,
    methodSettings: RestaurantPaymentMethodSettings,
  ) {
    const root = this.asJsonObject(settings);
    const payments = this.asJsonObject(root.payments);

    return {
      ...root,
      payments: {
        ...payments,
        methods: {
          allowedPaymentMethods: methodSettings.allowedPaymentMethods,
          walletEnabled: methodSettings.walletEnabled,
          note: methodSettings.note,
          updatedAt: methodSettings.updatedAt,
          updatedBy: methodSettings.updatedBy,
        },
      },
    } satisfies Prisma.JsonObject;
  }

  private writeRestaurantStripeSettings(
    settings: Prisma.JsonValue | null | undefined,
    stripeSettings: RestaurantStripeSettings,
  ) {
    const root = this.asJsonObject(settings);
    const payments = this.asJsonObject(root.payments);

    return {
      ...root,
      payments: {
        ...payments,
        stripe: {
          accountId: stripeSettings.accountId,
          payoutsEnabled: stripeSettings.payoutsEnabled,
          chargesEnabled: stripeSettings.chargesEnabled,
          onboardingComplete: stripeSettings.onboardingComplete,
          dashboardUrl: stripeSettings.dashboardUrl,
          note: stripeSettings.note,
          updatedAt: stripeSettings.updatedAt,
          updatedBy: stripeSettings.updatedBy,
          ...(stripeSettings.lastTransfer
            ? { lastTransfer: stripeSettings.lastTransfer }
            : {}),
        },
      },
    } satisfies Prisma.JsonObject;
  }

  private readPath(
    source: Prisma.JsonValue | null | undefined,
    path: string[],
  ) {
    let current: unknown = source;

    for (const key of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return null;
      }

      current = (current as Record<string, unknown>)[key];
    }

    return current;
  }

  private asJsonObject(value: unknown): Prisma.JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return { ...(value as Prisma.JsonObject) };
  }

  private asOptionalJsonObject(value: unknown): Prisma.JsonObject | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Prisma.JsonObject;
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim().length
      ? value.trim()
      : null;
  }

  private readDecimal(value: unknown, fallback: Prisma.Decimal) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Prisma.Decimal(value);
    }

    if (typeof value === 'string' && value.trim().length) {
      return new Prisma.Decimal(value.trim());
    }

    return fallback;
  }

  private dedupePaymentMethods(methods: PaymentMethod[]) {
    return [...new Set(methods)];
  }

  private readBoolean(value: unknown, fallback: boolean) {
    return typeof value === 'boolean' ? value : fallback;
  }

  private resolveOptionalString(value: string | null | undefined) {
    if (value === undefined || value === null) {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length ? normalized : undefined;
  }

  private async ensureRestaurantWalletAccount(
    tenantId: string,
    restaurantId: string,
    currency = 'PKR',
  ) {
    return this.prisma.restaurantWalletAccount.upsert({
      where: { restaurantId },
      create: {
        tenantId,
        restaurantId,
        currency: currency.trim().toUpperCase(),
      },
      update: {},
    });
  }

  private normalizePayoutBankDetails(
    bankDetails: CreateRestaurantPayoutRequestDto['bankDetails'],
  ): Prisma.JsonObject {
    return {
      bankName: bankDetails.bankName.trim(),
      accountTitle: bankDetails.accountTitle.trim(),
      accountNumber: bankDetails.accountNumber.trim(),
      ...(bankDetails.iban?.trim() ? { iban: bankDetails.iban.trim() } : {}),
      ...(bankDetails.phone?.trim() ? { phone: bankDetails.phone.trim() } : {}),
    };
  }

  private serializeRestaurantPayoutRequest(request: {
    id: string;
    walletAccountId: string;
    tenantId: string;
    restaurantId: string;
    branchId: string | null;
    requestedBy: string | null;
    reviewedBy: string | null;
    paidBy: string | null;
    status: RestaurantPayoutRequestStatus;
    amount: Prisma.Decimal;
    currency: string;
    bankDetails: Prisma.JsonValue;
    note: string | null;
    rejectionReason: string | null;
    approvalNote: string | null;
    paymentReference: string | null;
    paidNote: string | null;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    paidAt: Date | null;
    walletTransactionId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...request,
      amount: Number(request.amount),
    };
  }

  private async creditRestaurantWalletForPayment(
    payment: {
      id: string;
      tenantId: string;
      restaurantId: string;
      branchId: string;
      orderId: string | null;
      paymentMethod: PaymentMethod;
      type: PaymentTransactionType;
      status: PaymentStatus;
      amount: Prisma.Decimal;
      currency: string;
    },
    actorId?: string,
  ) {
    if (
      payment.status !== PaymentStatus.PAID ||
      payment.type !== PaymentTransactionType.CHARGE ||
      !payment.orderId ||
      (
        [
          PaymentMethod.COD,
          PaymentMethod.CARD_ON_DELIVERY,
          PaymentMethod.WALLET,
        ] as PaymentMethod[]
      ).includes(payment.paymentMethod)
    ) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.restaurantWalletAccount.upsert({
        where: { restaurantId: payment.restaurantId },
        create: {
          tenantId: payment.tenantId,
          restaurantId: payment.restaurantId,
          currency: payment.currency,
        },
        update: {},
      });
      const existing = await tx.restaurantWalletTransaction.findUnique({
        where: { paymentTransactionId: payment.id },
        select: { id: true },
      });

      if (existing) {
        return;
      }

      const nextBalance = wallet.balance.plus(payment.amount);
      await tx.restaurantWalletAccount.update({
        where: { id: wallet.id },
        data: { balance: nextBalance },
      });
      await tx.restaurantWalletTransaction.create({
        data: {
          walletAccountId: wallet.id,
          tenantId: payment.tenantId,
          restaurantId: payment.restaurantId,
          branchId: payment.branchId,
          orderId: payment.orderId,
          paymentTransactionId: payment.id,
          type: RestaurantWalletTransactionType.ORDER_CREDIT,
          amount: payment.amount,
          balanceAfter: nextBalance,
          currency: payment.currency,
          note: 'Paid platform-collected order credited to restaurant wallet',
          createdBy: actorId,
        },
      });
    });
  }

  private async resolveRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): Promise<string | undefined> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return requestedRestaurantId;
    }

    if (user.role === UserRoleEnum.CUSTOMER) {
      if (!user.rid) {
        throw new ForbiddenException('Restaurant context is required');
      }

      if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
        throw new ForbiddenException(
          'You cannot access resources outside your restaurant',
        );
      }

      return user.rid;
    }

    return await this.assertAdminPaymentAccess(
      user,
      requestedRestaurantId,
      true,
    );
  }

  private async assertOrderAccess(
    user: AuthUserContext,
    restaurantId: string,
    customerId: string,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.role === UserRoleEnum.CUSTOMER) {
      if (user.uid !== customerId) {
        throw new ForbiddenException('Cross-customer access denied');
      }

      if (user.rid && user.rid !== restaurantId) {
        throw new ForbiddenException(
          'You cannot access resources outside your restaurant',
        );
      }

      return;
    }

    await this.assertAdminPaymentAccess(user, restaurantId, true);
  }

  private async assertAdminPaymentAccess(
    user: AuthUserContext,
    restaurantId?: string,
    allowBranchAdmin = false,
  ): Promise<string | undefined> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return restaurantId;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (restaurantId) {
        const restaurant = await this.prisma.restaurant.findFirst({
          where: { id: restaurantId, tenantId: user.tid, deletedAt: null },
          select: { id: true },
        });

        if (!restaurant) {
          throw new ForbiddenException(
            'You cannot access resources outside your tenant restaurants',
          );
        }
      }

      return restaurantId;
    }

    if (!(allowBranchAdmin && user.role === UserRoleEnum.BRANCH_ADMIN)) {
      throw new ForbiddenException('Insufficient permissions for payments');
    }

    if (!user.rid) {
      throw new ForbiddenException('Restaurant context is required');
    }

    if (restaurantId && restaurantId !== user.rid) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }

    return user.rid;
  }
}
