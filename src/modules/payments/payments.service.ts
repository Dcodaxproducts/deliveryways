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
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaService } from '../../database';
import {
  CreatePaymentAttemptDto,
  ListPaymentsDto,
  RefundPaymentDto,
  UpdatePaymentStatusDto,
} from './dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsRepository } from './payments.repository';
import { LoyaltyWalletService } from '../loyalty-wallet/loyalty-wallet.service';
import { StripePaymentsService } from './stripe-payments.service';
import { CreateWalletTopUpDto } from '../customer-app/dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly stripePaymentsService: StripePaymentsService,
    private readonly loyaltyWalletService?: LoyaltyWalletService,
  ) {}

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
    const currency = dto.currency ?? this.stripePaymentsService.getDefaultCurrency();

    const existingPendingCharge =
      await this.paymentsRepository.findLatestPendingChargeByOrderId(order.id);

    const data = existingPendingCharge
      ? await this.paymentsRepository.updateStatus(existingPendingCharge.id, {
          status: PaymentStatus.PENDING,
          note: dto.note,
        })
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
    if (user.role === UserRoleEnum.CUSTOMER && user.uid !== context.customerId) {
      throw new ForbiddenException('Cross-customer access denied');
    }

    if (!context.branchId) {
      throw new BadRequestException('Customer branch context is required');
    }

    const currency = dto.currency ?? this.stripePaymentsService.getDefaultCurrency();
    const data = await this.paymentsRepository.createUnchecked({
      tenantId: context.tenantId,
      restaurantId: context.restaurantId,
      branchId: context.branchId,
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
      throw new BadRequestException('Wallet top-up transactions are not exposed here');
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
      throw new BadRequestException('Wallet top-up transactions cannot be marked paid here');
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
      throw new BadRequestException('Wallet top-up transactions cannot be failed here');
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
      throw new BadRequestException('Wallet top-up transactions cannot be cancelled here');
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
      throw new BadRequestException('Wallet top-up transactions cannot be refunded here');
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

    const refundedSoFar = await this.paymentsRepository.sumSuccessfulRefunds(
      orderId,
    );

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

  async handleStripeWebhook(rawBody: Buffer | string | undefined, signature?: string) {
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
    const payment = await this.paymentsRepository.findByProviderRef(providerRef);

    if (!payment || payment.status === PaymentStatus.PAID) {
      return;
    }

    if (!payment.orderId) {
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
    });

    await this.loyaltyWalletService!.awardPointsForPaidOrder(
      orderId,
      payment.id,
      'stripe:webhook',
    );
    await this.notificationsService.notifyPaymentStatusChanged(payment.id);
  }

  private async handleStripePaymentIntentFailed(
    paymentIntent: Record<string, unknown>,
    note: string,
    status: PaymentStatus = PaymentStatus.FAILED,
  ) {
    const providerRef = this.readStripeIntentId(paymentIntent);
    const payment = await this.paymentsRepository.findByProviderRef(providerRef);

    if (
      !payment ||
      payment.status === PaymentStatus.PAID ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      return;
    }

    if (!payment.orderId) {
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

      await this.paymentsRepository.updateOrderPaymentStatus(orderId, status, tx);

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
      throw new BadRequestException('Wallet top-up customer context is missing');
    }

    return {
      customerId,
      tenantId: payment.tenantId,
      restaurantId: payment.restaurantId,
      branchId: payment.branchId,
    };
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
