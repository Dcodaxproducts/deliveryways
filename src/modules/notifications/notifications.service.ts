import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationAudience,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaService } from '../../database';
import { MailerService } from '../mailer/mailer.service';
import { ListNotificationsDto } from './dto';
import { NotificationsRepository } from './notifications.repository';

const CUSTOMER_NOTIFICATION_TYPES: NotificationType[] = [
  NotificationType.ORDER_PLACED,
  NotificationType.ORDER_STATUS_CHANGED,
  NotificationType.ORDER_CANCELLED,
  NotificationType.PAYMENT_PAID,
  NotificationType.PAYMENT_FAILED,
  NotificationType.PAYMENT_CANCELLED,
  NotificationType.PAYMENT_REFUNDED,
];

const ADMIN_NOTIFICATION_TYPES: NotificationType[] = [
  NotificationType.ORDER_PLACED,
  NotificationType.ORDER_CANCELLED,
  NotificationType.TABLE_RESERVATION_CREATED,
  NotificationType.TABLE_RESERVATION_ACCEPTED,
  NotificationType.PAYMENT_PAID,
  NotificationType.PAYMENT_FAILED,
  NotificationType.PAYMENT_CANCELLED,
  NotificationType.PAYMENT_REFUNDED,
];

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsRepository: NotificationsRepository,
    private readonly mailerService: MailerService,
  ) {}

  async list(user: AuthUserContext, query: ListNotificationsDto) {
    const scope = this.resolveFeedScope(user, query);
    const where = this.notificationsRepository.buildWhere({
      audience: scope.audience,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
      recipientUserId: scope.recipientUserId,
      allowedTypes: scope.allowedTypes,
      query,
    });
    const { items, total } = await this.notificationsRepository.list(
      where,
      query,
    );

    return {
      data: items.map((item) => this.toFeedItem(item, scope.audience)),
      message: 'Notifications fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async summary(user: AuthUserContext, query: ListNotificationsDto) {
    const scope = this.resolveFeedScope(user, query);
    const where = this.notificationsRepository.buildWhere({
      audience: scope.audience,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
      recipientUserId: scope.recipientUserId,
      allowedTypes: scope.allowedTypes,
      query,
    });
    const summary = await this.notificationsRepository.countSummary(where);

    return {
      data: summary,
      message: 'Notification summary fetched successfully',
    };
  }

  async details(user: AuthUserContext, id: string) {
    const notification = await this.notificationsRepository.findById(id);

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    this.assertNotificationAccess(user, notification);

    return {
      data: this.toFeedItem(notification, notification.audience),
      message: 'Notification fetched successfully',
    };
  }

  async markSeen(user: AuthUserContext, id: string) {
    const notification = await this.notificationsRepository.findById(id);

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    this.assertNotificationAccess(user, notification);

    const data = await this.notificationsRepository.markSeen(id);

    return {
      data: {
        id: data.id,
        seenAt: data.seenAt,
        isSeen: !!data.seenAt,
      },
      message: 'Notification marked as seen successfully',
    };
  }

  async markAllSeen(user: AuthUserContext, query: ListNotificationsDto) {
    const scope = this.resolveFeedScope(user, query);
    const where = this.notificationsRepository.buildWhere({
      audience: scope.audience,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
      recipientUserId: scope.recipientUserId,
      allowedTypes: scope.allowedTypes,
      query,
    });
    const data = await this.notificationsRepository.markAllSeen(where);

    return {
      data: {
        count: data.count,
      },
      message: 'Notifications marked as seen successfully',
    };
  }

  async retry(user: AuthUserContext, id: string) {
    const notification = await this.notificationsRepository.findById(id);

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    this.assertNotificationAccess(user, notification);

    if (notification.channel !== NotificationChannel.EMAIL) {
      throw new ForbiddenException('Only email notifications can be retried');
    }

    if (!notification.recipientEmail) {
      throw new ForbiddenException('Notification has no email recipient');
    }

    const data = await this.dispatchNotification(notification);

    return {
      data,
      message: 'Notification retried successfully',
    };
  }

  async notifyOrderPlaced(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          include: {
            profile: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.createAndDispatchCustomerEmail({
      tenantId: order.tenantId,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      orderId: order.id,
      recipientUserId: order.customerId,
      recipientEmail: order.customer.email,
      type: NotificationType.ORDER_PLACED,
      subject: `Order ${order.id} placed successfully`,
      body: this.buildOrderPlacedBody(
        order.customer.profile?.firstName,
        order.id,
        order.branch.name,
        Number(order.totalAmount),
      ),
      payload: {
        orderId: order.id,
        branchName: order.branch.name,
        totalAmount: Number(order.totalAmount),
      },
    });

    await this.createAdminInAppNotification({
      tenantId: order.tenantId,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      orderId: order.id,
      type: NotificationType.ORDER_PLACED,
      subject: `New order ${order.id}`,
      body: `${order.branch.name} received a new order for PKR ${Number(order.totalAmount).toFixed(2)}.`,
      payload: {
        orderId: order.id,
        branchName: order.branch.name,
        totalAmount: Number(order.totalAmount),
        customerId: order.customerId,
      },
    });
  }

  async notifyOrderStatusChanged(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          include: {
            profile: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const type =
      order.status === 'CANCELLED'
        ? NotificationType.ORDER_CANCELLED
        : NotificationType.ORDER_STATUS_CHANGED;

    await this.createAndDispatchCustomerEmail({
      tenantId: order.tenantId,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      orderId: order.id,
      recipientUserId: order.customerId,
      recipientEmail: order.customer.email,
      type,
      subject: `Order ${order.id} is now ${order.status}`,
      body: this.buildOrderStatusBody(
        order.customer.profile?.firstName,
        order.id,
        order.branch.name,
        order.status,
      ),
      payload: {
        orderId: order.id,
        branchName: order.branch.name,
        status: order.status,
        paymentStatus: order.paymentStatus,
      },
    });

    if (type === NotificationType.ORDER_CANCELLED) {
      await this.createAdminInAppNotification({
        tenantId: order.tenantId,
        restaurantId: order.restaurantId,
        branchId: order.branchId,
        orderId: order.id,
        type,
        subject: `Order ${order.id} cancelled`,
        body: `${order.branch.name} order ${order.id} has been cancelled.`,
        payload: {
          orderId: order.id,
          branchName: order.branch.name,
          status: order.status,
          customerId: order.customerId,
        },
      });
    }
  }

  async notifyPaymentAttemptCreated(
    paymentTransactionId: string,
  ): Promise<void> {
    const payment = await this.prisma.paymentTransaction.findUnique({
      where: { id: paymentTransactionId },
      include: {
        order: {
          include: {
            customer: {
              include: {
                profile: true,
              },
            },
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    if (!payment.order || !payment.orderId) {
      return;
    }

    await this.createAndDispatchCustomerEmail({
      tenantId: payment.tenantId,
      restaurantId: payment.restaurantId,
      branchId: payment.branchId,
      orderId: payment.orderId,
      paymentTransactionId: payment.id,
      recipientUserId: payment.order.customerId,
      recipientEmail: payment.order.customer.email,
      type: NotificationType.PAYMENT_ATTEMPT_CREATED,
      subject: `Payment attempt created for order ${payment.orderId}`,
      body: this.buildPaymentBody(
        payment.order.customer.profile?.firstName,
        payment.orderId,
        payment.order.branch.name,
        'A new payment attempt has been created',
        Number(payment.amount),
        payment.currency,
      ),
      payload: {
        paymentTransactionId: payment.id,
        orderId: payment.orderId,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
      },
    });
  }

  async notifyPaymentStatusChanged(
    paymentTransactionId: string,
  ): Promise<void> {
    const payment = await this.prisma.paymentTransaction.findUnique({
      where: { id: paymentTransactionId },
      include: {
        order: {
          include: {
            customer: {
              include: {
                profile: true,
              },
            },
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    if (!payment.order || !payment.orderId) {
      return;
    }

    const type = this.mapPaymentType(payment.status);
    const summary = this.mapPaymentSummary(payment.status);

    await this.createAndDispatchCustomerEmail({
      tenantId: payment.tenantId,
      restaurantId: payment.restaurantId,
      branchId: payment.branchId,
      orderId: payment.orderId,
      paymentTransactionId: payment.id,
      recipientUserId: payment.order.customerId,
      recipientEmail: payment.order.customer.email,
      type,
      subject: `Payment update for order ${payment.orderId}: ${payment.status}`,
      body: this.buildPaymentBody(
        payment.order.customer.profile?.firstName,
        payment.orderId,
        payment.order.branch.name,
        summary,
        Number(payment.amount),
        payment.currency,
      ),
      payload: {
        paymentTransactionId: payment.id,
        orderId: payment.orderId,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
        type: payment.type,
      },
    });

    if (ADMIN_NOTIFICATION_TYPES.includes(type)) {
      await this.createAdminInAppNotification({
        tenantId: payment.tenantId,
        restaurantId: payment.restaurantId,
        branchId: payment.branchId,
        orderId: payment.orderId,
        paymentTransactionId: payment.id,
        type,
        subject: `Payment ${payment.status.toLowerCase()} for order ${payment.orderId}`,
        body: `${payment.order.branch.name} payment is now ${payment.status}. Amount: ${payment.currency} ${Number(payment.amount).toFixed(2)}.`,
        payload: {
          paymentTransactionId: payment.id,
          orderId: payment.orderId,
          amount: Number(payment.amount),
          currency: payment.currency,
          status: payment.status,
          paymentType: payment.type,
          customerId: payment.order.customerId,
        },
      });
    }
  }

  async notifyTableReservationAdmin(input: {
    tenantId: string;
    restaurantId: string;
    branchId: string;
    reservationId: string;
    branchName: string;
    customerId: string;
    customerName?: string | null;
    customerEmail?: string | null;
    reservationDate: string;
    guestCount: number;
    status: 'REQUESTED' | 'CONFIRMED';
  }): Promise<void> {
    const accepted = input.status === 'CONFIRMED';
    await this.createAdminInAppNotification({
      tenantId: input.tenantId,
      restaurantId: input.restaurantId,
      branchId: input.branchId,
      type: accepted
        ? NotificationType.TABLE_RESERVATION_ACCEPTED
        : NotificationType.TABLE_RESERVATION_CREATED,
      subject: accepted
        ? `Reservation auto-accepted at ${input.branchName}`
        : `New reservation request at ${input.branchName}`,
      body: `${input.customerName ?? input.customerEmail ?? 'Customer'} requested a table for ${input.guestCount} guest(s) at ${input.reservationDate}.`,
      payload: {
        reservationId: input.reservationId,
        branchId: input.branchId,
        branchName: input.branchName,
        customerId: input.customerId,
        customerEmail: input.customerEmail,
        reservationDate: input.reservationDate,
        guestCount: input.guestCount,
        status: input.status,
      },
    });
  }

  private async createAndDispatchCustomerEmail(input: {
    tenantId: string;
    restaurantId: string;
    branchId: string;
    orderId?: string;
    paymentTransactionId?: string;
    recipientUserId?: string;
    recipientEmail: string;
    type: NotificationType;
    subject: string;
    body: string;
    payload?: Record<string, unknown>;
  }) {
    const notification = await this.notificationsRepository.create({
      tenant: { connect: { id: input.tenantId } },
      restaurant: { connect: { id: input.restaurantId } },
      branch: { connect: { id: input.branchId } },
      order: input.orderId ? { connect: { id: input.orderId } } : undefined,
      paymentTransaction: input.paymentTransactionId
        ? { connect: { id: input.paymentTransactionId } }
        : undefined,
      recipientUser: input.recipientUserId
        ? { connect: { id: input.recipientUserId } }
        : undefined,
      recipientEmail: input.recipientEmail,
      audience: NotificationAudience.CUSTOMER,
      channel: NotificationChannel.EMAIL,
      type: input.type,
      subject: input.subject,
      body: input.body,
      payload: input.payload as Prisma.InputJsonValue | undefined,
    });

    return this.dispatchNotification(notification);
  }

  private async createAdminInAppNotification(input: {
    tenantId: string;
    restaurantId: string;
    branchId: string;
    orderId?: string;
    paymentTransactionId?: string;
    type: NotificationType;
    subject: string;
    body: string;
    payload?: Record<string, unknown>;
  }) {
    return this.notificationsRepository.create({
      tenant: { connect: { id: input.tenantId } },
      restaurant: { connect: { id: input.restaurantId } },
      branch: { connect: { id: input.branchId } },
      order: input.orderId ? { connect: { id: input.orderId } } : undefined,
      paymentTransaction: input.paymentTransactionId
        ? { connect: { id: input.paymentTransactionId } }
        : undefined,
      recipientEmail: null,
      audience: NotificationAudience.ADMIN,
      channel: NotificationChannel.IN_APP,
      status: NotificationStatus.SENT,
      sentAt: new Date(),
      type: input.type,
      subject: input.subject,
      body: input.body,
      payload: input.payload as Prisma.InputJsonValue | undefined,
    });
  }

  private async dispatchNotification(notification: {
    id: string;
    recipientEmail: string | null;
    subject: string;
    body: string;
  }) {
    if (!notification.recipientEmail) {
      throw new ForbiddenException('Notification has no email recipient');
    }

    try {
      await this.mailerService.sendEmail(
        notification.recipientEmail,
        notification.subject,
        notification.body,
      );

      return this.notificationsRepository.updateDelivery(notification.id, {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        failedAt: null,
        errorMessage: null,
      });
    } catch (error) {
      return this.notificationsRepository.updateDelivery(notification.id, {
        status: NotificationStatus.FAILED,
        sentAt: null,
        failedAt: new Date(),
        errorMessage:
          error instanceof Error ? error.message : 'Failed to deliver email',
      });
    }
  }

  private assertNotificationAccess(
    user: AuthUserContext,
    notification: {
      audience: NotificationAudience;
      restaurantId: string;
      branchId: string;
      recipientUserId: string | null;
    },
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (notification.audience === NotificationAudience.CUSTOMER) {
      if (user.role !== UserRoleEnum.CUSTOMER) {
        throw new ForbiddenException(
          'You do not have access to this notification',
        );
      }

      if (notification.recipientUserId !== user.uid) {
        throw new ForbiddenException(
          'You do not have access to this notification',
        );
      }

      return;
    }

    if (
      user.role === UserRoleEnum.CUSTOMER ||
      user.role === UserRoleEnum.STAFF
    ) {
      throw new ForbiddenException(
        'You do not have access to this notification',
      );
    }

    if (
      user.role === UserRoleEnum.BRANCH_ADMIN ||
      user.role === 'DELIVERYMAN'
    ) {
      if (user.bid && user.bid !== notification.branchId) {
        throw new ForbiddenException(
          'You do not have access to this notification',
        );
      }

      if (user.rid && user.rid !== notification.restaurantId) {
        throw new ForbiddenException(
          'You do not have access to this notification',
        );
      }

      return;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      return;
    }
  }

  private resolveFeedScope(user: AuthUserContext, query: ListNotificationsDto) {
    if (user.role === UserRoleEnum.CUSTOMER) {
      return {
        audience: NotificationAudience.CUSTOMER,
        restaurantId: user.rid,
        branchId: query.branchId,
        recipientUserId: user.uid,
        allowedTypes: CUSTOMER_NOTIFICATION_TYPES,
      };
    }

    if (user.role === UserRoleEnum.STAFF) {
      throw new ForbiddenException('Notification access is not available');
    }

    if (user.role === 'DELIVERYMAN') {
      if (!user.rid || !user.bid) {
        throw new ForbiddenException('Deliveryman scope is required');
      }

      return {
        audience: NotificationAudience.ADMIN,
        restaurantId: user.rid,
        branchId: user.bid,
        recipientUserId: undefined,
        allowedTypes: ADMIN_NOTIFICATION_TYPES,
      };
    }

    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return {
        audience: NotificationAudience.ADMIN,
        restaurantId: query.restaurantId,
        branchId: query.branchId,
        recipientUserId: undefined,
        allowedTypes: ADMIN_NOTIFICATION_TYPES,
      };
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.rid || !user.bid) {
        throw new ForbiddenException('Branch context is required');
      }

      return {
        audience: NotificationAudience.ADMIN,
        restaurantId: user.rid,
        branchId: user.bid,
        recipientUserId: undefined,
        allowedTypes: ADMIN_NOTIFICATION_TYPES,
      };
    }

    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    if (query.restaurantId) {
      return {
        audience: NotificationAudience.ADMIN,
        restaurantId: query.restaurantId,
        branchId: query.branchId,
        recipientUserId: undefined,
        allowedTypes: ADMIN_NOTIFICATION_TYPES,
      };
    }

    throw new ForbiddenException('restaurantId is required');
  }

  private toFeedItem(
    notification: {
      id: string;
      audience: NotificationAudience;
      type: NotificationType;
      subject: string;
      body: string;
      payload: Prisma.JsonValue | null;
      createdAt: Date;
      seenAt: Date | null;
      order?: {
        id: string;
        status: string;
        paymentStatus: string;
      } | null;
      paymentTransaction?: {
        id: string;
        status: string;
        type: string;
        amount: Prisma.Decimal;
        currency: string;
      } | null;
    },
    audience: NotificationAudience,
  ) {
    return {
      id: notification.id,
      audience,
      type: notification.type,
      title: notification.subject,
      message: notification.body,
      isSeen: !!notification.seenAt,
      seenAt: notification.seenAt,
      createdAt: notification.createdAt,
      order: notification.order
        ? {
            id: notification.order.id,
            status: notification.order.status,
            paymentStatus: notification.order.paymentStatus,
          }
        : null,
      paymentTransaction: notification.paymentTransaction
        ? {
            id: notification.paymentTransaction.id,
            status: notification.paymentTransaction.status,
            type: notification.paymentTransaction.type,
            amount: Number(notification.paymentTransaction.amount),
            currency: notification.paymentTransaction.currency,
          }
        : null,
      payload: notification.payload,
    };
  }

  private mapPaymentType(status: string): NotificationType {
    if (status === 'PAID') {
      return NotificationType.PAYMENT_PAID;
    }

    if (status === 'FAILED') {
      return NotificationType.PAYMENT_FAILED;
    }

    if (status === 'CANCELLED') {
      return NotificationType.PAYMENT_CANCELLED;
    }

    return NotificationType.PAYMENT_REFUNDED;
  }

  private mapPaymentSummary(status: string): string {
    if (status === 'PAID') {
      return 'Your payment has been marked as paid';
    }

    if (status === 'FAILED') {
      return 'Your payment attempt has failed';
    }

    if (status === 'CANCELLED') {
      return 'Your payment attempt has been cancelled';
    }

    return 'A refund has been processed for your payment';
  }

  private buildOrderPlacedBody(
    firstName: string | undefined,
    orderId: string,
    branchName: string,
    totalAmount: number,
  ): string {
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

    return `${greeting}\n\nYour order ${orderId} has been placed successfully at ${branchName}. Total payable amount: PKR ${totalAmount.toFixed(2)}.`;
  }

  private buildOrderStatusBody(
    firstName: string | undefined,
    orderId: string,
    branchName: string,
    status: string,
  ): string {
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

    return `${greeting}\n\nYour order ${orderId} at ${branchName} is now ${status}.`;
  }

  private buildPaymentBody(
    firstName: string | undefined,
    orderId: string,
    branchName: string,
    summary: string,
    amount: number,
    currency: string,
  ): string {
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

    return `${greeting}\n\n${summary} for order ${orderId} at ${branchName}. Amount: ${currency} ${amount.toFixed(2)}.`;
  }
}
