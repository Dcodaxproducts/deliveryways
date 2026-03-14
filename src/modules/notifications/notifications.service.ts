import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
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

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsRepository: NotificationsRepository,
    private readonly mailerService: MailerService,
  ) {}

  async list(user: AuthUserContext, query: ListNotificationsDto) {
    const restaurantId = this.resolveRestaurantId(user, query.restaurantId);
    const recipientUserId =
      user.role === UserRoleEnum.CUSTOMER ? user.uid : undefined;
    const { items, total } = await this.notificationsRepository.list(
      restaurantId,
      query,
      recipientUserId,
    );

    return {
      data: items,
      message: 'Notifications fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const notification = await this.notificationsRepository.findById(id);

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    this.assertNotificationAccess(user, notification);

    return {
      data: notification,
      message: 'Notification fetched successfully',
    };
  }

  async retry(user: AuthUserContext, id: string) {
    const notification = await this.notificationsRepository.findById(id);

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    this.assertNotificationAccess(user, notification);

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

    await this.createAndDispatch({
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

    await this.createAndDispatch({
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

    await this.createAndDispatch({
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

    const type = this.mapPaymentType(payment.status);
    const summary = this.mapPaymentSummary(payment.status);

    await this.createAndDispatch({
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
  }

  private async createAndDispatch(input: {
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
      channel: NotificationChannel.EMAIL,
      type: input.type,
      subject: input.subject,
      body: input.body,
      payload: input.payload as Prisma.InputJsonValue | undefined,
    });

    return this.dispatchNotification(notification);
  }

  private async dispatchNotification(notification: {
    id: string;
    recipientEmail: string;
    subject: string;
    body: string;
  }) {
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
      restaurantId: string;
      recipientUserId: string | null;
    },
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.role === UserRoleEnum.CUSTOMER) {
      if (notification.recipientUserId !== user.uid) {
        throw new ForbiddenException(
          'You do not have access to this notification',
        );
      }

      return;
    }

    if (user.rid !== notification.restaurantId) {
      throw new ForbiddenException(
        'You do not have access to this notification',
      );
    }
  }

  private resolveRestaurantId(
    user: AuthUserContext,
    restaurantId?: string,
  ): string | undefined {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return restaurantId;
    }

    if (user.role === UserRoleEnum.CUSTOMER) {
      if (!user.rid) {
        throw new ForbiddenException('Restaurant access is required');
      }

      if (restaurantId && restaurantId !== user.rid) {
        throw new ForbiddenException(
          'You do not have access to this restaurant',
        );
      }

      return user.rid;
    }

    if (!user.rid) {
      throw new ForbiddenException('Restaurant access is required');
    }

    if (restaurantId && restaurantId !== user.rid) {
      throw new ForbiddenException('You do not have access to this restaurant');
    }

    return user.rid;
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

    return `${greeting}\n\nYour order ${orderId} has been placed successfully at ${branchName}. Total payable amount: PKR ${totalAmount.toFixed(2)}.\n\nWe will keep you updated on the next status changes.`;
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
