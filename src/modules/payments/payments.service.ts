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
import {
  buildPaginationMeta,
  resolveAvailablePaymentMethods,
} from '../../common/utils';
import { PrismaService } from '../../database';
import {
  AdminUpdatePaymentStatusDto,
  ConfigureGlobalPayoutProviderDto,
  CreateRestaurantPayoutRequestDto,
  CreateRestaurantPayoutProviderRequestDto,
  CreateRestaurantProviderPayoutDto,
  CreateRestaurantStripeTransferDto,
  CreatePaymentAttemptDto,
  CapturePaypalOrderDto,
  CreateSubscriptionPaymentAttemptDto,
  ListRestaurantPayoutRequestsDto,
  MarkRestaurantPayoutPaidDto,
  MarkSubscriptionManualPaidDto,
  PaypalPayoutEnvironment,
  RejectRestaurantPayoutProviderRequestDto,
  ListPaymentsDto,
  RefundPaymentDto,
  RestaurantPaymentManagementQueryDto,
  ReviewRestaurantPayoutRequestDto,
  ReviewRestaurantPayoutProviderRequestDto,
  UpdateRestaurantPayoutProviderConfigurationDto,
  RestaurantPayoutProvider,
  UpdateRestaurantPaymentMethodsDto,
  UpdateRestaurantStripeAccountDto,
  UpdatePaymentStatusDto,
  SendSubscriptionPaymentRequestDto,
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
import { MailerService } from '../mailer/mailer.service';
import { PackagePlansService } from '../package-plans/package-plans.service';
import { PaypalPayoutsService } from './paypal-payouts.service';
import { PayoutCredentialsService } from './payout-credentials.service';
import { PaypalOrdersService } from './paypal-orders.service';

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

type RestaurantPayoutProviderRequestStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED';

interface RestaurantPayoutProviderRequest {
  provider: RestaurantPayoutProvider;
  status: RestaurantPayoutProviderRequestStatus;
  publicDetails: Prisma.JsonObject;
  encryptedCredentials: string | null;
  note: string | null;
  requestedAt: string;
  requestedBy: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  rejectionReason: string | null;
}

interface RestaurantPayoutProviderConfiguration {
  provider: RestaurantPayoutProvider;
  enabled: boolean;
  publicDetails: Prisma.JsonObject;
  encryptedCredentials: string | null;
  approvedAt: string;
  approvedBy: string;
}

interface RestaurantPayoutProvidersSettings {
  requests: Partial<
    Record<RestaurantPayoutProvider, RestaurantPayoutProviderRequest>
  >;
  configurations: Partial<
    Record<RestaurantPayoutProvider, RestaurantPayoutProviderConfiguration>
  >;
}

interface GlobalPayoutProviderConfiguration {
  provider: RestaurantPayoutProvider;
  enabled: boolean;
  publicDetails: Prisma.JsonObject;
  encryptedCredentials: string;
  updatedAt: string;
  updatedBy: string;
}

interface GlobalPayoutProvidersSettings {
  configurations: Partial<
    Record<RestaurantPayoutProvider, GlobalPayoutProviderConfiguration>
  >;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly stripePaymentsService: StripePaymentsService,
    private readonly paypalPayoutsService: PaypalPayoutsService,
    private readonly payoutCredentialsService: PayoutCredentialsService,
    private readonly loyaltyWalletService?: LoyaltyWalletService,
    private readonly globalSettingsService?: GlobalSettingsService,
    private readonly mailerService?: MailerService,
    private readonly packagePlansService?: PackagePlansService,
    private readonly paypalOrdersService?: PaypalOrdersService,
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

  async sendSubscriptionPaymentRequest(
    user: AuthUserContext,
    subscriptionId: string,
    dto: SendSubscriptionPaymentRequestDto,
  ) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only super admins can send payment requests',
      );
    }

    const attempt = await this.createSubscriptionAttempt(user, subscriptionId, {
      currency: dto.currency,
      note: dto.note ?? 'Super admin payment request sent to owner',
    });
    const recipientEmail = await this.resolveSubscriptionPaymentRecipient(
      subscriptionId,
      dto.email,
    );
    const paymentLink = this.buildSubscriptionPaymentLink(
      dto.paymentUrl,
      subscriptionId,
      attempt.paymentSession.paymentIntentId,
    );
    let emailStatus: 'SENT' | 'SKIPPED' = 'SKIPPED';
    let emailReason: string | null = null;

    if (!recipientEmail) {
      emailReason = 'No owner or billing email is available';
    } else if (!this.mailerService) {
      emailReason = 'Mailer service is not configured';
    } else {
      await this.mailerService.sendEmail(
        recipientEmail,
        'DeliveryWays subscription payment request',
        this.buildSubscriptionPaymentRequestEmail({
          subscriptionId,
          paymentIntentId: attempt.paymentSession.paymentIntentId,
          paymentLink,
        }),
      );
      emailStatus = 'SENT';
    }

    const providerData = this.asJsonObject(
      attempt.data.transaction.providerData,
    );
    const updated = await this.paymentsRepository.updateStatus(
      attempt.data.transaction.id,
      {
        status: PaymentStatus.PENDING,
        providerRef: attempt.paymentSession.paymentIntentId,
        providerData: {
          ...providerData,
          paymentRequest: {
            sentBy: user.uid,
            sentAt: new Date().toISOString(),
            recipientEmail: recipientEmail ?? null,
            emailStatus,
            emailReason,
            paymentLink: paymentLink ?? null,
          },
        } as Prisma.InputJsonValue,
        note: dto.note ?? attempt.data.transaction.note ?? undefined,
      },
    );

    return {
      data: {
        subscriptionId,
        paymentStatus: attempt.data.paymentStatus,
        transaction: updated,
        email: {
          status: emailStatus,
          recipientEmail: recipientEmail ?? null,
          reason: emailReason,
        },
        paymentLink,
      },
      paymentSession: attempt.paymentSession,
      message:
        emailStatus === 'SENT'
          ? 'Subscription payment request sent successfully'
          : 'Subscription payment request created; email was skipped',
    };
  }

  async markSubscriptionManualPaid(
    user: AuthUserContext,
    subscriptionId: string,
    dto: MarkSubscriptionManualPaidDto,
  ) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only super admins can settle subscriptions',
      );
    }

    const manualSettlementMethods: readonly PaymentMethod[] = [
      PaymentMethod.BANK_TRANSFER,
      PaymentMethod.COD,
      PaymentMethod.CARD_ON_DELIVERY,
    ];

    if (!manualSettlementMethods.includes(dto.paymentMethod)) {
      throw new BadRequestException(
        'Manual settlement method is not supported',
      );
    }

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
        'Subscription restaurant context is required for manual settlement',
      );
    }

    if (subscription.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Subscription is already paid');
    }

    const plan = this.resolveSubscriptionPaymentPlan(subscription);
    const amount = this.calculateSubscriptionPaymentAmount(plan);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Subscription does not require payment');
    }

    const branchId = await this.resolveSubscriptionPaymentBranchId(
      subscription.tenantId,
      subscription.restaurantId,
    );
    const settledAt = new Date();
    const providerData = {
      target: 'TENANT_SUBSCRIPTION',
      subscriptionId: subscription.id,
      packagePlanId: subscription.packagePlanId,
      planName: plan.name,
      settlementType: 'MANUAL',
      manualReference: dto.paymentReference.trim(),
      receiptUrl: dto.receiptUrl?.trim() ?? null,
      settledBy: user.uid,
      settledAt: settledAt.toISOString(),
      subscriptionFeeAmount: Number(plan.planPrice),
      vatPercentage: Number(plan.vatPercentage),
      vatAmount: Number(amount.minus(plan.planPrice).toDecimalPlaces(2)),
    } as Prisma.InputJsonValue;

    const transaction = await this.prisma.$transaction(async (tx) => {
      const payment = await this.paymentsRepository.createUnchecked(
        {
          tenantId: subscription.tenantId,
          restaurantId: subscription.restaurantId!,
          branchId,
          paymentMethod: dto.paymentMethod,
          type: PaymentTransactionType.CHARGE,
          status: PaymentStatus.PAID,
          amount,
          currency: plan.currency.toUpperCase(),
          providerRef: dto.paymentReference.trim(),
          providerData,
          note: dto.note.trim(),
          processedAt: settledAt,
        },
        tx,
      );

      await tx.tenantSubscription.update({
        where: { id: subscription.id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          status: SubscriptionStatus.ACTIVE,
          updatedBy: user.uid,
        },
      });

      return payment;
    });

    return {
      data: {
        subscriptionId: subscription.id,
        paymentStatus: PaymentStatus.PAID,
        transaction,
      },
      message: 'Subscription marked as manually paid',
    };
  }

  async refundTenantSubscriptionForRejection(input: {
    actorId: string;
    subscriptionId: string;
    reason?: string;
  }) {
    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { id: input.subscriptionId },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        paymentStatus: true,
        status: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException('Tenant subscription not found');
    }

    if (!subscription.restaurantId) {
      throw new BadRequestException(
        'Subscription restaurant context is required for refund',
      );
    }

    const candidateCharges = await this.prisma.paymentTransaction.findMany({
      where: {
        tenantId: subscription.tenantId,
        restaurantId: subscription.restaurantId,
        orderId: null,
        type: PaymentTransactionType.CHARGE,
        status: PaymentStatus.PAID,
      },
      orderBy: { createdAt: 'desc' },
    });
    const subscriptionCharges = candidateCharges.filter((payment) => {
      const data = this.asJsonObject(payment.providerData);
      return (
        data.target === 'TENANT_SUBSCRIPTION' &&
        data.subscriptionId === subscription.id
      );
    });
    const existingRefunds = await this.prisma.paymentTransaction.findMany({
      where: {
        tenantId: subscription.tenantId,
        restaurantId: subscription.restaurantId,
        orderId: null,
        type: PaymentTransactionType.REFUND,
        status: PaymentStatus.REFUNDED,
      },
    });
    const refundedSourceIds = new Set(
      existingRefunds
        .map((refund) => {
          const data = this.asJsonObject(refund.providerData);
          return typeof data.sourcePaymentTransactionId === 'string'
            ? data.sourcePaymentTransactionId
            : null;
        })
        .filter((id): id is string => id !== null),
    );
    const refundCandidates = subscriptionCharges.filter(
      (charge) => !refundedSourceIds.has(charge.id),
    );

    const refundResults: Array<{
      sourcePaymentTransactionId: string;
      refundTransactionId: string;
      amount: number;
      currency: string;
    }> = [];

    for (const charge of refundCandidates) {
      let stripeRefund: Record<string, unknown> | undefined;
      if (charge.paymentMethod === PaymentMethod.STRIPE && charge.providerRef) {
        stripeRefund = (await this.stripePaymentsService.refundPaymentIntent(
          charge.providerRef,
          Number(charge.amount),
        )) as unknown as Record<string, unknown>;
      }

      const refundTransaction = await this.prisma.$transaction(async (tx) => {
        const created = await this.paymentsRepository.create(
          {
            tenant: { connect: { id: charge.tenantId } },
            restaurant: { connect: { id: charge.restaurantId } },
            branch: { connect: { id: charge.branchId } },
            paymentMethod: charge.paymentMethod,
            type: PaymentTransactionType.REFUND,
            status: PaymentStatus.REFUNDED,
            amount: charge.amount,
            currency: charge.currency,
            providerRef: charge.providerRef,
            providerData: {
              target: 'TENANT_SUBSCRIPTION_REFUND',
              subscriptionId: subscription.id,
              sourcePaymentTransactionId: charge.id,
              stripeRefund,
            } as Prisma.InputJsonValue,
            note:
              input.reason?.trim() ||
              'Business admin registration rejected by super admin',
            processedAt: new Date(),
          },
          tx,
        );

        await this.paymentsRepository.updateStatus(
          charge.id,
          {
            status: PaymentStatus.REFUNDED,
            processedAt: new Date(),
            note: input.reason,
          },
          tx,
        );

        return created;
      });

      refundResults.push({
        sourcePaymentTransactionId: charge.id,
        refundTransactionId: refundTransaction.id,
        amount: Number(charge.amount),
        currency: charge.currency,
      });
    }

    await this.prisma.tenantSubscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.CANCELLED,
        paymentStatus:
          refundResults.length > 0
            ? PaymentStatus.REFUNDED
            : subscription.paymentStatus,
        endsAt: new Date(),
        updatedBy: input.actorId,
        note:
          input.reason?.trim() ||
          'Business admin registration rejected by super admin',
      },
    });

    return {
      subscriptionId: subscription.id,
      refunded: refundResults.length > 0,
      refunds: refundResults,
      refundedAmount: refundResults.reduce((sum, item) => sum + item.amount, 0),
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

    if (
      paymentMethod !== PaymentMethod.STRIPE &&
      paymentMethod !== PaymentMethod.PAYPAL
    ) {
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

    if (paymentMethod === PaymentMethod.PAYPAL) {
      if (!this.paypalOrdersService) {
        throw new BadRequestException('PayPal checkout is unavailable');
      }
      const paypalOrder = await this.paypalOrdersService.createOrder({
        amount: Number(order.totalAmount),
        currency,
        paymentTransactionId: data.id,
        orderId: order.id,
        returnUrl: this.paypalOrdersService.getReturnUrl(order.id),
        cancelUrl: this.paypalOrdersService.getCancelUrl(order.id),
      });
      const updated = await this.paymentsRepository.updateStatus(data.id, {
        status: PaymentStatus.PENDING,
        providerRef: paypalOrder.id,
        providerData: {
          provider: 'paypal',
          paypalOrderId: paypalOrder.id,
          approvalUrl: paypalOrder.approvalUrl,
        } as Prisma.InputJsonValue,
        note: dto.note,
      });

      await this.notificationsService.notifyPaymentAttemptCreated(updated.id);

      return {
        data: updated,
        paymentSession: {
          provider: 'paypal',
          paypalOrderId: paypalOrder.id,
          approvalUrl: paypalOrder.approvalUrl,
        },
        message: 'PayPal order created successfully',
      };
    }

    await this.notificationsService.notifyPaymentAttemptCreated(data.id);

    return {
      data,
      message: 'Payment attempt created successfully',
    };
  }

  async capturePaypalOrder(
    user: AuthUserContext,
    orderId: string,
    dto: CapturePaypalOrderDto,
  ) {
    if (!this.paypalOrdersService) {
      throw new BadRequestException('PayPal checkout is unavailable');
    }
    const payment = await this.paymentsRepository.findByProviderRef(
      dto.paypalOrderId,
    );

    if (!payment || payment.orderId !== orderId || !payment.order) {
      throw new NotFoundException('PayPal payment attempt not found');
    }
    await this.assertOrderAccess(
      user,
      payment.order.restaurantId,
      payment.order.customerId,
    );

    if (payment.status === PaymentStatus.PAID) {
      return { data: payment, message: 'PayPal payment already captured' };
    }
    if (
      payment.paymentMethod !== PaymentMethod.PAYPAL ||
      payment.status !== PaymentStatus.PENDING
    ) {
      throw new BadRequestException('PayPal payment is not pending');
    }

    const captured = await this.paypalOrdersService.captureOrder({
      paypalOrderId: dto.paypalOrderId,
      paymentTransactionId: payment.id,
    });

    if (
      captured.status !== 'COMPLETED' ||
      captured.customId !== payment.id ||
      !captured.captureId ||
      !captured.amount ||
      !captured.currency ||
      !new Prisma.Decimal(captured.amount).equals(payment.amount) ||
      captured.currency.toUpperCase() !== payment.currency.toUpperCase()
    ) {
      throw new BadRequestException(
        'PayPal capture could not be verified against the order payment',
      );
    }

    const shouldPlaceOrder =
      payment.order.status === OrderStatus.PAYMENT_PENDING;
    const updated = await this.prisma.$transaction(async (tx) => {
      const paid = await this.paymentsRepository.updateStatus(
        payment.id,
        {
          status: PaymentStatus.PAID,
          providerRef: dto.paypalOrderId,
          providerData: captured.payload as Prisma.InputJsonValue,
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
      return paid;
    });

    await this.creditRestaurantWalletForPayment(
      { ...payment, status: PaymentStatus.PAID },
      'paypal:capture',
    );
    await this.loyaltyWalletService!.awardPointsForPaidOrder(
      orderId,
      payment.id,
      'paypal:capture',
    );
    await this.notificationsService.notifyPaymentStatusChanged(payment.id);
    if (shouldPlaceOrder) {
      await this.notificationsService.notifyOrderPlaced(orderId);
    }

    return { data: updated, message: 'PayPal payment captured successfully' };
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
    locale?: string,
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
        recipientEmail: dto.recipientEmail,
        buyerName: dto.buyerName ?? null,
        title: dto.title ?? null,
        message: dto.message ?? null,
        expiresAt: dto.expiresAt ?? null,
        locale: locale ?? null,
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
        recipientEmail: dto.recipientEmail,
      },
    });

    const updated = await this.paymentsRepository.updateStatus(data.id, {
      status: PaymentStatus.PENDING,
      providerRef: intent.id,
      providerData: {
        target: 'GUEST_GIFT_CARD_PURCHASE',
        buyerEmail: dto.buyerEmail,
        recipientEmail: dto.recipientEmail,
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

  private async resolveSubscriptionPaymentRecipient(
    subscriptionId: string,
    overrideEmail?: string,
  ) {
    if (overrideEmail?.trim()) {
      return overrideEmail.trim().toLowerCase();
    }

    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { id: subscriptionId },
      select: {
        tenantId: true,
        restaurant: { select: { supportContact: true } },
      },
    });

    if (!subscription) return null;

    const owner = await this.prisma.user.findFirst({
      where: {
        tenantId: subscription.tenantId,
        role: UserRoleEnum.BUSINESS_ADMIN,
        deletedAt: null,
      },
      select: { email: true },
      orderBy: { createdAt: 'asc' },
    });

    return (
      owner?.email ??
      this.readString(
        this.asJsonObject(subscription.restaurant?.supportContact).email,
      ) ??
      null
    );
  }

  private readSupportEmail(
    value: Prisma.JsonValue | null | undefined,
  ): string | null {
    const contact = this.asJsonObject(value);
    return this.readString(contact.email);
  }

  private buildSubscriptionPaymentLink(
    paymentUrl: string | undefined,
    subscriptionId: string,
    paymentIntentId: string,
  ) {
    if (!paymentUrl?.trim()) return null;

    const url = new URL(paymentUrl.trim());
    url.searchParams.set('subscriptionId', subscriptionId);
    url.searchParams.set('paymentIntentId', paymentIntentId);

    return url.toString();
  }

  private buildSubscriptionPaymentRequestEmail(input: {
    subscriptionId: string;
    paymentIntentId: string;
    paymentLink: string | null;
  }) {
    const lines = [
      'Hello,',
      '',
      'Your DeliveryWays subscription is waiting for payment.',
      `Subscription ID: ${input.subscriptionId}`,
      `Stripe payment intent: ${input.paymentIntentId}`,
    ];

    if (input.paymentLink) {
      lines.push('', `Pay online: ${input.paymentLink}`);
    }

    lines.push(
      '',
      'If you have already paid by bank transfer or cash, please share the receipt with DeliveryWays support so a super admin can settle it manually.',
      '',
      'DeliveryWays',
    );

    return lines.join('\n');
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
    this.assertSuperAdminPaymentConfigAccess(user);

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
    return this.createRestaurantProviderPayout(user, restaurantId, {
      provider: RestaurantPayoutProvider.STRIPE,
      amount: dto.amount,
      currency: dto.currency,
      description: dto.description,
      idempotencyKey:
        this.resolveOptionalString(dto.idempotencyKey) ??
        randomBytes(16).toString('hex'),
    });
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
    const configuredProviders = Object.values(
      this.readRestaurantPayoutProviders(restaurant.settings).configurations,
    ).some((configuration) => configuration?.enabled);
    const legacyStripe =
      this.resolveRestaurantPayoutProviderConfiguration(
        restaurant.settings,
        RestaurantPayoutProvider.STRIPE,
      )?.enabled ?? false;
    if (configuredProviders || legacyStripe) {
      throw new BadRequestException(
        'Manual bank payout requests are only available without an approved automated payout provider',
      );
    }
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

  async getRestaurantPayoutProviderRequests(
    user: AuthUserContext,
    restaurantId: string,
  ) {
    const restaurant = await this.requireRestaurantForPayments(
      user,
      restaurantId,
    );
    const settings = this.readRestaurantPayoutProviders(restaurant.settings);
    const stripe = this.resolveRestaurantPayoutProviderConfiguration(
      restaurant.settings,
      RestaurantPayoutProvider.STRIPE,
    );
    if (stripe && !settings.configurations.STRIPE) {
      settings.configurations.STRIPE = stripe;
    }

    return {
      data: this.serializeRestaurantPayoutProviders(settings),
      message: 'Restaurant payout provider requests fetched successfully',
    };
  }

  async getGlobalPayoutProviders(user: AuthUserContext) {
    this.assertSuperAdminPaymentConfigAccess(user);
    const settings = await this.readGlobalPayoutProviders();

    return {
      data: this.serializeGlobalPayoutProviders(settings),
      message: 'Global payout providers fetched successfully',
    };
  }

  async configureGlobalPayoutProvider(
    user: AuthUserContext,
    dto: ConfigureGlobalPayoutProviderDto,
  ) {
    this.assertSuperAdminPaymentConfigAccess(user);
    this.assertRestaurantPayoutProvider(dto.provider);

    const current = await this.readGlobalPayoutProviders();
    const existing = current.configurations[dto.provider];
    const credentials = this.buildGlobalPayoutCredentials(dto, existing);
    const now = new Date().toISOString();

    if (dto.provider === RestaurantPayoutProvider.PAYPAL) {
      await this.paypalPayoutsService.verifyCredentials({
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        recipientEmail: 'credential-verification@deliveryways.app',
        environment:
          credentials.environment === 'SANDBOX'
            ? PaypalPayoutEnvironment.SANDBOX
            : PaypalPayoutEnvironment.LIVE,
      });
    }

    const configuration: GlobalPayoutProviderConfiguration = {
      provider: dto.provider,
      enabled: dto.enabled ?? existing?.enabled ?? true,
      publicDetails: this.buildGlobalPayoutPublicDetails(dto, credentials),
      encryptedCredentials: this.payoutCredentialsService.encrypt(
        'GLOBAL',
        dto.provider,
        credentials,
      ),
      updatedAt: now,
      updatedBy: user.uid,
    };
    const next: GlobalPayoutProvidersSettings = {
      configurations: {
        ...current.configurations,
        [dto.provider]: configuration,
      },
    };

    if (!this.globalSettingsService) {
      throw new BadRequestException('Global settings service is unavailable');
    }
    await this.globalSettingsService.updatePayoutProviderSettings(
      user,
      next as unknown as Prisma.InputJsonValue,
    );

    return {
      data: this.serializeGlobalPayoutProviders(next),
      message: 'Global payout provider configured successfully',
    };
  }

  async configureRestaurantPayoutProvider(
    user: AuthUserContext,
    restaurantId: string,
    dto: CreateRestaurantPayoutProviderRequestDto,
  ) {
    this.assertSuperAdminPaymentConfigAccess(user);
    this.assertRestaurantPayoutProvider(dto.provider);

    const restaurant = await this.requireRestaurantForPayments(
      user,
      restaurantId,
    );
    const current = this.readRestaurantPayoutProviders(restaurant.settings);
    const request = this.buildRestaurantPayoutProviderRequest(
      restaurant.id,
      user.uid,
      dto,
    );
    const now = new Date().toISOString();
    const configuration: RestaurantPayoutProviderConfiguration = {
      provider: dto.provider,
      enabled: true,
      publicDetails: request.publicDetails,
      encryptedCredentials: request.encryptedCredentials,
      approvedAt: now,
      approvedBy: user.uid,
    };

    if (dto.provider === RestaurantPayoutProvider.PAYPAL) {
      await this.paypalPayoutsService.verifyCredentials(
        this.readPaypalCredentials(restaurant.id, configuration),
      );
    }

    const configuredRequest: RestaurantPayoutProviderRequest = {
      ...request,
      status: 'APPROVED',
      reviewedAt: now,
      reviewedBy: user.uid,
      reviewNote: request.note,
    };
    const nextSettings = this.writeRestaurantPayoutProviders(
      restaurant.settings,
      {
        ...current,
        requests: {
          ...current.requests,
          [dto.provider]: configuredRequest,
        },
        configurations: {
          ...current.configurations,
          [dto.provider]: configuration,
        },
      },
    );

    const settingsWithStripe =
      dto.provider === RestaurantPayoutProvider.STRIPE
        ? this.writeRestaurantStripeSettings(nextSettings, {
            ...this.readRestaurantStripeSettings(nextSettings),
            accountId: this.readString(request.publicDetails.accountId),
            payoutsEnabled: true,
            onboardingComplete: true,
            note: request.note,
            updatedAt: now,
            updatedBy: user.uid,
          })
        : nextSettings;

    await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { settings: settingsWithStripe as Prisma.InputJsonValue },
      select: { id: true },
    });

    return {
      data: this.serializeRestaurantPayoutProviders({
        requests: {
          ...current.requests,
          [dto.provider]: configuredRequest,
        },
        configurations: {
          ...current.configurations,
          [dto.provider]: configuration,
        },
      }),
      message: 'Payout provider configured successfully',
    };
  }

  async approveRestaurantPayoutProviderRequest(
    user: AuthUserContext,
    restaurantId: string,
    provider: RestaurantPayoutProvider,
    dto: ReviewRestaurantPayoutProviderRequestDto,
  ) {
    this.assertSuperAdminPaymentConfigAccess(user);
    this.assertRestaurantPayoutProvider(provider);

    const restaurant = await this.requireRestaurantForPayments(
      user,
      restaurantId,
    );
    const current = this.readRestaurantPayoutProviders(restaurant.settings);
    const request = current.requests[provider];

    if (!request || request.status !== 'REQUESTED') {
      throw new BadRequestException(
        'A pending payout provider request is required',
      );
    }

    const now = new Date().toISOString();
    const reviewedRequest: RestaurantPayoutProviderRequest = {
      ...request,
      status: 'APPROVED',
      reviewedAt: now,
      reviewedBy: user.uid,
      reviewNote: this.resolveOptionalString(dto.note) ?? null,
      rejectionReason: null,
    };
    const configuration: RestaurantPayoutProviderConfiguration = {
      provider,
      enabled: true,
      publicDetails: request.publicDetails,
      encryptedCredentials: request.encryptedCredentials,
      approvedAt: now,
      approvedBy: user.uid,
    };
    if (provider === RestaurantPayoutProvider.PAYPAL) {
      await this.paypalPayoutsService.verifyCredentials(
        this.readPaypalCredentials(restaurant.id, configuration),
      );
    }
    let nextSettings = this.writeRestaurantPayoutProviders(
      restaurant.settings,
      {
        requests: {
          ...current.requests,
          [provider]: reviewedRequest,
        },
        configurations: {
          ...current.configurations,
          [provider]: configuration,
        },
      },
    );

    if (provider === RestaurantPayoutProvider.STRIPE) {
      const accountId = this.readString(request.publicDetails.accountId);
      if (!accountId || !accountId.startsWith('acct_')) {
        throw new BadRequestException(
          'A valid Stripe connected account ID is required',
        );
      }
      const stripe = this.readRestaurantStripeSettings(nextSettings);
      nextSettings = this.writeRestaurantStripeSettings(nextSettings, {
        ...stripe,
        accountId,
        payoutsEnabled: true,
        onboardingComplete: true,
        note:
          this.resolveOptionalString(dto.note) ??
          stripe.note ??
          'Approved restaurant payout provider request',
        updatedAt: now,
        updatedBy: user.uid,
      });
    }

    await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { settings: nextSettings as Prisma.InputJsonValue },
      select: { id: true },
    });

    return {
      data: this.serializeRestaurantPayoutProviderRequest(reviewedRequest),
      message: 'Payout provider request approved successfully',
    };
  }

  async rejectRestaurantPayoutProviderRequest(
    user: AuthUserContext,
    restaurantId: string,
    provider: RestaurantPayoutProvider,
    dto: RejectRestaurantPayoutProviderRequestDto,
  ) {
    this.assertSuperAdminPaymentConfigAccess(user);
    this.assertRestaurantPayoutProvider(provider);

    const restaurant = await this.requireRestaurantForPayments(
      user,
      restaurantId,
    );
    const current = this.readRestaurantPayoutProviders(restaurant.settings);
    const request = current.requests[provider];

    if (!request || request.status !== 'REQUESTED') {
      throw new BadRequestException(
        'A pending payout provider request is required',
      );
    }

    const rejectedRequest: RestaurantPayoutProviderRequest = {
      ...request,
      status: 'REJECTED',
      reviewedAt: new Date().toISOString(),
      reviewedBy: user.uid,
      reviewNote: null,
      rejectionReason: dto.reason.trim(),
    };
    const nextSettings = this.writeRestaurantPayoutProviders(
      restaurant.settings,
      {
        ...current,
        requests: {
          ...current.requests,
          [provider]: rejectedRequest,
        },
      },
    );

    await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { settings: nextSettings as Prisma.InputJsonValue },
      select: { id: true },
    });

    return {
      data: this.serializeRestaurantPayoutProviderRequest(rejectedRequest),
      message: 'Payout provider request rejected successfully',
    };
  }

  async updateRestaurantPayoutProviderConfiguration(
    user: AuthUserContext,
    restaurantId: string,
    provider: RestaurantPayoutProvider,
    dto: UpdateRestaurantPayoutProviderConfigurationDto,
  ) {
    this.assertSuperAdminPaymentConfigAccess(user);
    this.assertRestaurantPayoutProvider(provider);

    const restaurant = await this.requireRestaurantForPayments(
      user,
      restaurantId,
    );
    const current = this.readRestaurantPayoutProviders(restaurant.settings);
    const configuration =
      current.configurations[provider] ??
      this.resolveRestaurantPayoutProviderConfiguration(
        restaurant.settings,
        provider,
      );

    if (!configuration) {
      throw new BadRequestException(
        `${provider} must be approved before it can be enabled`,
      );
    }

    const updatedConfiguration: RestaurantPayoutProviderConfiguration = {
      ...configuration,
      enabled: dto.enabled,
    };
    let nextSettings = this.writeRestaurantPayoutProviders(
      restaurant.settings,
      {
        ...current,
        configurations: {
          ...current.configurations,
          [provider]: updatedConfiguration,
        },
      },
    );

    if (provider === RestaurantPayoutProvider.STRIPE) {
      const stripe = this.readRestaurantStripeSettings(nextSettings);
      nextSettings = this.writeRestaurantStripeSettings(nextSettings, {
        ...stripe,
        payoutsEnabled: dto.enabled,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      });
    }

    await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { settings: nextSettings as Prisma.InputJsonValue },
      select: { id: true },
    });

    return {
      data: {
        provider: updatedConfiguration.provider,
        enabled: updatedConfiguration.enabled,
      },
      message: `${provider} payout provider ${dto.enabled ? 'enabled' : 'disabled'} successfully`,
    };
  }

  async createRestaurantProviderPayout(
    user: AuthUserContext,
    restaurantId: string,
    dto: CreateRestaurantProviderPayoutDto,
  ) {
    this.assertSuperAdminPaymentConfigAccess(user);
    const restaurant = await this.requireRestaurantForPayments(
      user,
      restaurantId,
    );
    const configuration = this.resolveRestaurantPayoutProviderConfiguration(
      restaurant.settings,
      dto.provider,
    );

    if (!configuration?.enabled) {
      throw new BadRequestException(
        `${dto.provider} payouts are not approved for this restaurant`,
      );
    }

    const wallet = await this.ensureRestaurantWalletAccount(
      restaurant.tenantId,
      restaurant.id,
      dto.currency ?? (await this.resolvePreferredCurrency(restaurant.id)),
    );
    const amount = new Prisma.Decimal(dto.amount).toDecimalPlaces(2);
    if (amount.greaterThan(wallet.balance)) {
      throw new BadRequestException('Payout amount exceeds wallet balance');
    }

    const idempotencyKey = dto.idempotencyKey.trim();
    const pendingReference = `AUTO:${dto.provider}:${idempotencyKey}`;
    let request = await this.prisma.restaurantPayoutRequest.findFirst({
      where: {
        restaurantId: restaurant.id,
        bankDetails: {
          path: ['idempotencyKey'],
          equals: pendingReference,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (request?.status === RestaurantPayoutRequestStatus.PAID) {
      return {
        data: this.serializeRestaurantPayoutRequest(request),
        message: 'Restaurant payout was already completed',
      };
    }

    if (!request) {
      request = await this.prisma.restaurantPayoutRequest.create({
        data: {
          walletAccountId: wallet.id,
          tenantId: restaurant.tenantId,
          restaurantId: restaurant.id,
          requestedBy: user.uid,
          reviewedBy: user.uid,
          status: RestaurantPayoutRequestStatus.APPROVED,
          amount,
          currency: (dto.currency ?? wallet.currency).trim().toUpperCase(),
          bankDetails: {
            provider: dto.provider,
            idempotencyKey: pendingReference,
            ...configuration.publicDetails,
          } as Prisma.InputJsonValue,
          note:
            this.resolveOptionalString(dto.description) ??
            `Automated ${dto.provider} payout`,
          approvalNote: 'Approved provider payout initiated by super admin',
          approvedAt: new Date(),
        },
      });
    }

    const description =
      this.resolveOptionalString(dto.description) ??
      `DeliveryWays restaurant payout ${restaurant.id}`;
    let providerReference: string;

    if (dto.provider === RestaurantPayoutProvider.STRIPE) {
      const accountId = this.readString(configuration.publicDetails.accountId);
      if (!accountId) {
        throw new BadRequestException('Approved Stripe account ID is missing');
      }
      const transfer = await this.stripePaymentsService.createTransfer({
        amount: Number(request.amount),
        currency: request.currency,
        destinationAccountId: accountId,
        description,
        idempotencyKey,
        metadata: {
          restaurantId: restaurant.id,
          tenantId: restaurant.tenantId,
          payoutRequestId: request.id,
          actorId: user.uid,
        },
      });
      providerReference = transfer.id;
    } else {
      const credentials = this.readPaypalCredentials(
        restaurant.id,
        configuration,
      );
      const payout = await this.paypalPayoutsService.createPayout({
        credentials,
        amount: Number(request.amount),
        currency: request.currency,
        description,
        idempotencyKey,
      });
      providerReference = payout.id;
    }

    const completion = await this.completeRestaurantPayoutRequest(
      user,
      request.id,
      providerReference,
      `Automated ${dto.provider} payout completed`,
    );
    if (completion.completed) {
      await this.persistSpecialPayoutInvoice(completion.data, user.uid);
    }

    return {
      data: this.serializeRestaurantPayoutRequest(completion.data),
      message: 'Restaurant provider payout completed successfully',
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
    const completion = await this.completeRestaurantPayoutRequest(
      user,
      id,
      this.resolveOptionalString(dto.paymentReference) ?? null,
      this.resolveOptionalString(dto.note) ??
        'Manual bank payout completed by super admin',
    );
    if (completion.completed) {
      await this.persistSpecialPayoutInvoice(completion.data, user.uid);
    }

    return {
      data: this.serializeRestaurantPayoutRequest(completion.data),
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
    if (user.role !== UserRoleEnum.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only Super Admin can update restaurant payment methods',
      );
    }

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

    if (!payment) {
      return;
    }

    if (payment.status === PaymentStatus.PAID) {
      if (
        this.readPaymentTarget(payment.providerData) ===
        'GUEST_GIFT_CARD_PURCHASE'
      ) {
        await this.sendGuestGiftCardEmail(payment);
      }
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
        const fulfilledPayment =
          await this.paymentsRepository.findByProviderRef(providerRef);
        if (fulfilledPayment) {
          await this.sendGuestGiftCardEmail(fulfilledPayment);
        }
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
            expiresAt: expiresAt.toISOString(),
          } as Prisma.InputJsonValue,
          processedAt: now,
        },
        tx,
      );
    });

    void paymentIntent;
  }

  private async sendGuestGiftCardEmail(payment: {
    id: string;
    amount: Prisma.Decimal;
    currency: string;
    providerRef: string | null;
    providerData: Prisma.JsonValue | null;
    processedAt?: Date | null;
  }) {
    const providerData = this.asJsonObject(payment.providerData);
    if (typeof providerData.giftCardEmailSentAt === 'string') {
      return;
    }

    const recipientEmail =
      typeof providerData.recipientEmail === 'string'
        ? providerData.recipientEmail.trim().toLowerCase()
        : '';
    const code =
      typeof providerData.giftCardCode === 'string'
        ? providerData.giftCardCode.trim()
        : '';
    if (!recipientEmail || !code) {
      throw new BadRequestException(
        'Fulfilled gift card recipient and code are required',
      );
    }
    if (!this.mailerService) {
      throw new BadRequestException('Gift card email service is unavailable');
    }

    const buyerName =
      typeof providerData.buyerName === 'string' &&
      providerData.buyerName.trim()
        ? providerData.buyerName.trim()
        : 'Someone';
    const buyerEmail =
      typeof providerData.buyerEmail === 'string'
        ? providerData.buyerEmail.trim()
        : '';
    const title =
      typeof providerData.title === 'string' && providerData.title.trim()
        ? providerData.title.trim()
        : 'Gift Card';
    const message =
      typeof providerData.message === 'string' && providerData.message.trim()
        ? providerData.message.trim()
        : '';
    const expiresAt =
      typeof providerData.expiresAt === 'string' &&
      providerData.expiresAt.trim()
        ? providerData.expiresAt.trim()
        : '';

    await this.mailerService.sendTransactionalEmail(recipientEmail, {
      template: 'giftCard',
      locale:
        typeof providerData.locale === 'string' ? providerData.locale : null,
      variables: {
        buyerName,
        buyerEmail,
        title,
        amount: Number(payment.amount).toFixed(2),
        currency: payment.currency,
        code,
        expiresAt,
        message,
      },
    });

    await this.paymentsRepository.updateStatus(payment.id, {
      status: PaymentStatus.PAID,
      providerRef: payment.providerRef ?? undefined,
      providerData: {
        ...providerData,
        giftCardEmailSentAt: new Date().toISOString(),
        giftCardEmailRecipient: recipientEmail,
      } as Prisma.InputJsonValue,
      processedAt: payment.processedAt ?? new Date(),
    });
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
    const globalMethods = await this.getGlobalPaymentMethods();
    const activeGlobalMethods = globalMethods
      .filter((method) => method.isActive)
      .map((method) => method.code);
    const availableMethods = resolveAvailablePaymentMethods({
      platformMethods: globalMethods.length > 0 ? activeGlobalMethods : null,
      restaurantSettings: order.restaurant.settings,
      branchSettings: order.branch.settings,
    });

    if (availableMethods.includes(paymentMethod)) {
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

  private readRestaurantPayoutProviders(
    settings: Prisma.JsonValue | null | undefined,
  ): RestaurantPayoutProvidersSettings {
    const payoutProviders = this.asJsonObject(
      this.readPath(settings, ['payments', 'payoutProviders']),
    );
    const requests = this.asJsonObject(payoutProviders.requests);
    const configurations = this.asJsonObject(payoutProviders.configurations);

    return {
      requests: Object.fromEntries(
        Object.values(RestaurantPayoutProvider)
          .map((provider) => {
            const request = this.parseRestaurantPayoutProviderRequest(
              provider,
              requests[provider],
            );
            return request ? [provider, request] : null;
          })
          .filter(
            (
              entry,
            ): entry is [
              RestaurantPayoutProvider,
              RestaurantPayoutProviderRequest,
            ] => entry !== null,
          ),
      ),
      configurations: Object.fromEntries(
        Object.values(RestaurantPayoutProvider)
          .map((provider) => {
            const configuration =
              this.parseRestaurantPayoutProviderConfiguration(
                provider,
                configurations[provider],
              );
            return configuration ? [provider, configuration] : null;
          })
          .filter(
            (
              entry,
            ): entry is [
              RestaurantPayoutProvider,
              RestaurantPayoutProviderConfiguration,
            ] => entry !== null,
          ),
      ),
    };
  }

  private writeRestaurantPayoutProviders(
    settings: Prisma.JsonValue | null | undefined,
    payoutProviderSettings: RestaurantPayoutProvidersSettings,
  ) {
    const root = this.asJsonObject(settings);
    const payments = this.asJsonObject(root.payments);

    return {
      ...root,
      payments: {
        ...payments,
        payoutProviders: {
          requests: payoutProviderSettings.requests,
          configurations: payoutProviderSettings.configurations,
        },
      },
    } as unknown as Prisma.JsonObject;
  }

  private parseRestaurantPayoutProviderRequest(
    provider: RestaurantPayoutProvider,
    value: unknown,
  ): RestaurantPayoutProviderRequest | null {
    const record = this.asJsonObject(value);
    const status = this.readString(record.status);
    const requestedAt = this.readString(record.requestedAt);
    const requestedBy = this.readString(record.requestedBy);

    if (
      !requestedAt ||
      !requestedBy ||
      !status ||
      !(['REQUESTED', 'APPROVED', 'REJECTED'] as const).includes(
        status as RestaurantPayoutProviderRequestStatus,
      )
    ) {
      return null;
    }

    return {
      provider,
      status: status as RestaurantPayoutProviderRequestStatus,
      publicDetails: this.asJsonObject(record.publicDetails),
      encryptedCredentials: this.readString(record.encryptedCredentials),
      note: this.readString(record.note),
      requestedAt,
      requestedBy,
      reviewedAt: this.readString(record.reviewedAt),
      reviewedBy: this.readString(record.reviewedBy),
      reviewNote: this.readString(record.reviewNote),
      rejectionReason: this.readString(record.rejectionReason),
    };
  }

  private parseRestaurantPayoutProviderConfiguration(
    provider: RestaurantPayoutProvider,
    value: unknown,
  ): RestaurantPayoutProviderConfiguration | null {
    const record = this.asJsonObject(value);
    const approvedAt = this.readString(record.approvedAt);
    const approvedBy = this.readString(record.approvedBy);

    if (!approvedAt || !approvedBy) {
      return null;
    }

    return {
      provider,
      enabled: this.readBoolean(record.enabled, false),
      publicDetails: this.asJsonObject(record.publicDetails),
      encryptedCredentials: this.readString(record.encryptedCredentials),
      approvedAt,
      approvedBy,
    };
  }

  private buildRestaurantPayoutProviderRequest(
    restaurantId: string,
    userId: string,
    dto: CreateRestaurantPayoutProviderRequestDto,
  ): RestaurantPayoutProviderRequest {
    const requestedAt = new Date().toISOString();

    if (dto.provider === RestaurantPayoutProvider.STRIPE) {
      const accountId = this.resolveOptionalString(dto.stripeAccountId);
      if (!accountId?.startsWith('acct_')) {
        throw new BadRequestException(
          'A valid Stripe connected account ID is required',
        );
      }

      return {
        provider: dto.provider,
        status: 'REQUESTED',
        publicDetails: { accountId },
        encryptedCredentials: null,
        note: this.resolveOptionalString(dto.note) ?? null,
        requestedAt,
        requestedBy: userId,
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null,
        rejectionReason: null,
      };
    }

    const clientId = this.resolveOptionalString(dto.paypalClientId);
    const clientSecret = this.resolveOptionalString(dto.paypalClientSecret);
    const recipientEmail = this.resolveOptionalString(dto.paypalRecipientEmail);
    const environment = dto.paypalEnvironment ?? PaypalPayoutEnvironment.LIVE;
    if (!clientId || !clientSecret || !recipientEmail) {
      throw new BadRequestException(
        'PayPal client ID, client secret, and recipient email are required',
      );
    }

    return {
      provider: dto.provider,
      status: 'REQUESTED',
      publicDetails: {
        clientIdLast4: clientId.slice(-4),
        recipientEmail,
        environment,
      },
      encryptedCredentials: this.payoutCredentialsService.encrypt(
        restaurantId,
        dto.provider,
        {
          clientId,
          clientSecret,
          recipientEmail,
          environment,
        },
      ),
      note: this.resolveOptionalString(dto.note) ?? null,
      requestedAt,
      requestedBy: userId,
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null,
      rejectionReason: null,
    };
  }

  private serializeRestaurantPayoutProviders(
    settings: RestaurantPayoutProvidersSettings,
  ) {
    return {
      requests: Object.values(settings.requests)
        .filter(
          (request): request is RestaurantPayoutProviderRequest =>
            request !== undefined,
        )
        .map((request) =>
          this.serializeRestaurantPayoutProviderRequest(request),
        ),
      configurations: Object.values(settings.configurations)
        .filter(
          (
            configuration,
          ): configuration is RestaurantPayoutProviderConfiguration =>
            configuration !== undefined,
        )
        .map((configuration) => ({
          provider: configuration.provider,
          enabled: configuration.enabled,
          publicDetails: configuration.publicDetails,
          credentialsConfigured: Boolean(
            configuration.encryptedCredentials ||
            configuration.provider === RestaurantPayoutProvider.STRIPE,
          ),
          approvedAt: configuration.approvedAt,
          approvedBy: configuration.approvedBy,
        })),
    };
  }

  private async readGlobalPayoutProviders(): Promise<GlobalPayoutProvidersSettings> {
    if (!this.globalSettingsService) {
      throw new BadRequestException('Global settings service is unavailable');
    }

    const stored = await this.globalSettingsService.getPayoutProviderSettings();
    const root = this.asJsonObject(stored);
    const configurations = this.asJsonObject(root.configurations);
    const result: GlobalPayoutProvidersSettings = { configurations: {} };

    for (const provider of Object.values(RestaurantPayoutProvider)) {
      const record = this.asJsonObject(configurations[provider]);
      const updatedAt = this.readString(record.updatedAt);
      const updatedBy = this.readString(record.updatedBy);
      const encryptedCredentials = this.readString(record.encryptedCredentials);
      if (!updatedAt || !updatedBy || !encryptedCredentials) {
        continue;
      }

      result.configurations[provider] = {
        provider,
        enabled: this.readBoolean(record.enabled, false),
        publicDetails: this.asJsonObject(record.publicDetails),
        encryptedCredentials,
        updatedAt,
        updatedBy,
      };
    }

    return result;
  }

  private buildGlobalPayoutCredentials(
    dto: ConfigureGlobalPayoutProviderDto,
    existing?: GlobalPayoutProviderConfiguration,
  ): Record<string, string> {
    const existingCredentials = existing
      ? this.payoutCredentialsService.decrypt(
          'GLOBAL',
          dto.provider,
          existing.encryptedCredentials,
        )
      : {};

    if (dto.provider === RestaurantPayoutProvider.STRIPE) {
      const secretKey =
        this.resolveOptionalString(dto.stripeSecretKey) ??
        this.readString(existingCredentials.secretKey);
      const publishableKey =
        this.resolveOptionalString(dto.stripePublishableKey) ??
        this.readString(existingCredentials.publishableKey);
      const webhookSecret =
        this.resolveOptionalString(dto.stripeWebhookSecret) ??
        this.readString(existingCredentials.webhookSecret);

      if (!secretKey?.startsWith('sk_') || !publishableKey?.startsWith('pk_')) {
        throw new BadRequestException(
          'Valid Stripe secret and publishable keys are required',
        );
      }
      if (webhookSecret && !webhookSecret.startsWith('whsec_')) {
        throw new BadRequestException('Stripe webhook secret is invalid');
      }

      return {
        secretKey,
        publishableKey,
        ...(webhookSecret ? { webhookSecret } : {}),
      };
    }

    const clientId =
      this.resolveOptionalString(dto.paypalClientId) ??
      this.readString(existingCredentials.clientId);
    const clientSecret =
      this.resolveOptionalString(dto.paypalClientSecret) ??
      this.readString(existingCredentials.clientSecret);
    const environment =
      dto.paypalEnvironment ??
      (this.readString(
        existingCredentials.environment,
      ) as PaypalPayoutEnvironment | null) ??
      PaypalPayoutEnvironment.LIVE;

    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'PayPal client ID and client secret are required',
      );
    }

    return { clientId, clientSecret, environment };
  }

  private buildGlobalPayoutPublicDetails(
    dto: ConfigureGlobalPayoutProviderDto,
    credentials: Record<string, string>,
  ): Prisma.JsonObject {
    const note = this.resolveOptionalString(dto.note) ?? null;

    if (dto.provider === RestaurantPayoutProvider.STRIPE) {
      return {
        secretKeyLast4: credentials.secretKey.slice(-4),
        publishableKeyLast4: credentials.publishableKey.slice(-4),
        webhookConfigured: Boolean(credentials.webhookSecret),
        note,
      };
    }

    return {
      clientIdLast4: credentials.clientId.slice(-4),
      environment: credentials.environment,
      note,
    };
  }

  private serializeGlobalPayoutProviders(
    settings: GlobalPayoutProvidersSettings,
  ) {
    return {
      configurations: Object.values(settings.configurations)
        .filter(
          (configuration): configuration is GlobalPayoutProviderConfiguration =>
            configuration !== undefined,
        )
        .map((configuration) => ({
          provider: configuration.provider,
          enabled: configuration.enabled,
          publicDetails: configuration.publicDetails,
          credentialsConfigured: true,
          updatedAt: configuration.updatedAt,
          updatedBy: configuration.updatedBy,
        })),
    };
  }

  private serializeRestaurantPayoutProviderRequest(
    request: RestaurantPayoutProviderRequest,
  ) {
    return {
      provider: request.provider,
      status: request.status,
      publicDetails: request.publicDetails,
      credentialsSubmitted: Boolean(
        request.encryptedCredentials ||
        request.provider === RestaurantPayoutProvider.STRIPE,
      ),
      note: request.note,
      requestedAt: request.requestedAt,
      requestedBy: request.requestedBy,
      reviewedAt: request.reviewedAt,
      reviewedBy: request.reviewedBy,
      reviewNote: request.reviewNote,
      rejectionReason: request.rejectionReason,
    };
  }

  private readPaypalCredentials(
    restaurantId: string,
    configuration: RestaurantPayoutProviderConfiguration,
  ) {
    if (!configuration.encryptedCredentials) {
      throw new BadRequestException('Approved PayPal credentials are missing');
    }
    const credentials = this.payoutCredentialsService.decrypt(
      restaurantId,
      RestaurantPayoutProvider.PAYPAL,
      configuration.encryptedCredentials,
    );
    const clientId = this.readString(credentials.clientId);
    const clientSecret = this.readString(credentials.clientSecret);
    const recipientEmail = this.readString(credentials.recipientEmail);
    const environment = this.readString(credentials.environment);

    if (
      !clientId ||
      !clientSecret ||
      !recipientEmail ||
      !environment ||
      !Object.values(PaypalPayoutEnvironment).includes(
        environment as PaypalPayoutEnvironment,
      )
    ) {
      throw new BadRequestException(
        'Approved PayPal credentials are incomplete',
      );
    }

    return {
      clientId,
      clientSecret,
      recipientEmail,
      environment: environment as PaypalPayoutEnvironment,
    };
  }

  private resolveRestaurantPayoutProviderConfiguration(
    settings: Prisma.JsonValue | null | undefined,
    provider: RestaurantPayoutProvider,
  ) {
    const configured =
      this.readRestaurantPayoutProviders(settings).configurations[provider];
    if (configured) {
      return configured;
    }

    if (provider !== RestaurantPayoutProvider.STRIPE) {
      return undefined;
    }

    const stripe = this.readRestaurantStripeSettings(settings);
    if (!stripe.accountId || !stripe.payoutsEnabled) {
      return undefined;
    }

    return {
      provider,
      enabled: true,
      publicDetails: { accountId: stripe.accountId },
      encryptedCredentials: null,
      approvedAt: stripe.updatedAt ?? new Date(0).toISOString(),
      approvedBy: stripe.updatedBy ?? 'legacy-superadmin-configuration',
    } satisfies RestaurantPayoutProviderConfiguration;
  }

  private assertRestaurantPayoutProvider(provider: RestaurantPayoutProvider) {
    if (!Object.values(RestaurantPayoutProvider).includes(provider)) {
      throw new BadRequestException('Unsupported payout provider');
    }
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

  private async completeRestaurantPayoutRequest(
    user: AuthUserContext,
    id: string,
    paymentReference: string | null,
    note: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.restaurantPayoutRequest.findUnique({
        where: { id },
        include: { walletAccount: true },
      });

      if (!request) {
        throw new NotFoundException('Restaurant payout request not found');
      }

      if (request.status === RestaurantPayoutRequestStatus.PAID) {
        return { data: request, completed: false };
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

      const existingTransaction =
        await tx.restaurantWalletTransaction.findUnique({
          where: { payoutRequestId: request.id },
        });
      if (existingTransaction) {
        const data = await tx.restaurantPayoutRequest.update({
          where: { id: request.id },
          data: {
            status: RestaurantPayoutRequestStatus.PAID,
            paidBy: user.uid,
            paidAt: request.paidAt ?? new Date(),
            paymentReference:
              paymentReference ?? request.paymentReference ?? undefined,
            paidNote: note,
            walletTransactionId: existingTransaction.id,
          },
        });
        return { data, completed: false };
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
          note,
          metadata: {
            paymentReference,
          } as Prisma.InputJsonValue,
          createdBy: user.uid,
        },
      });
      const data = await tx.restaurantPayoutRequest.update({
        where: { id: request.id },
        data: {
          status: RestaurantPayoutRequestStatus.PAID,
          paidBy: user.uid,
          paidAt: new Date(),
          paymentReference: paymentReference ?? undefined,
          paidNote: note,
          walletTransactionId: walletTransaction.id,
        },
      });

      return { data, completed: true };
    });
  }

  private async persistSpecialPayoutInvoice(
    data: {
      id: string;
      tenantId: string;
      restaurantId: string;
      amount: Prisma.Decimal;
      currency: string;
      paidAt: Date | null;
    },
    paidBy: string,
  ) {
    await this.packagePlansService?.persistSpecialPayoutInvoiceForPaidRequest({
      payoutRequestId: data.id,
      tenantId: data.tenantId,
      restaurantId: data.restaurantId,
      amount: data.amount,
      currency: data.currency,
      paidBy,
      paidAt: data.paidAt ?? new Date(),
    });
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

    if (this.isStaffActor(user)) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      const assignedRestaurantIds = new Set([
        ...(user.restaurantAccess?.restaurantIds ?? []),
        ...(user.rid ? [user.rid] : []),
      ]);
      const resolvedRestaurantId =
        restaurantId ??
        user.rid ??
        (assignedRestaurantIds.size === 1
          ? [...assignedRestaurantIds][0]
          : undefined);
      if (!resolvedRestaurantId) {
        throw new ForbiddenException('Restaurant context is required');
      }

      const hasAllRestaurantsAccess =
        user.restaurantAccess?.allRestaurants === true ||
        user.restaurantAccess?.hasAllRestaurantsAccess === true;
      if (
        !hasAllRestaurantsAccess &&
        !assignedRestaurantIds.has(resolvedRestaurantId)
      ) {
        throw new ForbiddenException(
          'You cannot access resources outside your assigned restaurants',
        );
      }

      const assignedRestaurant =
        await this.paymentsRepository.findRestaurantScope(
          resolvedRestaurantId,
          user.tid,
        );
      if (!assignedRestaurant) {
        throw new ForbiddenException(
          'You cannot access resources outside your assigned restaurants',
        );
      }

      return assignedRestaurant.id;
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

  private isStaffActor(user: AuthUserContext): boolean {
    return user.role === UserRoleEnum.STAFF || user.actorType === 'STAFF';
  }

  private assertSuperAdminPaymentConfigAccess(user: AuthUserContext) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only super admins can manage restaurant payment configuration',
      );
    }
  }
}
