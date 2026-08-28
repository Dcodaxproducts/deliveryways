import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationAudience,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { MailerService } from '../mailer/mailer.service';
import { GlobalSettingsService } from '../global-settings/global-settings.service';
import {
  ListNotificationsDto,
  RegisterPushTokenDto,
  UnregisterPushTokenDto,
} from './dto';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import { PushNotificationsService } from './push-notifications.service';

const CUSTOMER_NOTIFICATION_TYPES: NotificationType[] = [
  NotificationType.ORDER_PLACED,
  NotificationType.ORDER_STATUS_CHANGED,
  NotificationType.ORDER_CANCELLED,
  NotificationType.GROUP_ORDER_PARTICIPANT_COMPLETED,
  NotificationType.GROUP_ORDER_ALL_PARTICIPANTS_COMPLETED,
  NotificationType.TABLE_RESERVATION_CREATED,
  NotificationType.TABLE_RESERVATION_ACCEPTED,
  NotificationType.TABLE_RESERVATION_STATUS_CHANGED,
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
  NotificationType.TABLE_RESERVATION_STATUS_CHANGED,
  NotificationType.PAYMENT_FAILED,
  NotificationType.PAYMENT_CANCELLED,
  NotificationType.PAYMENT_REFUNDED,
];

const DELIVERYMAN_NOTIFICATION_TYPES: NotificationType[] = [
  NotificationType.ORDER_STATUS_CHANGED,
  NotificationType.ORDER_CANCELLED,
];

type OrderForNotification = NonNullable<
  Awaited<ReturnType<NotificationsRepository['findOrderForNotification']>>
>;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly mailerService: MailerService,
    private readonly pushNotificationsService: PushNotificationsService,
    private readonly globalSettingsService?: GlobalSettingsService,
    private readonly notificationsRealtimeService?: NotificationsRealtimeService,
  ) {}

  async list(user: AuthUserContext, query: ListNotificationsDto) {
    const scope = this.resolveFeedScope(user, query);
    const where = this.notificationsRepository.buildWhere({
      audience: scope.audience,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
      recipientUserId: scope.recipientUserId,
      deliverymanId: scope.deliverymanId,
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
      deliverymanId: scope.deliverymanId,
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
      deliverymanId: scope.deliverymanId,
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

  async claimPendingOrders(user: AuthUserContext, query: ListNotificationsDto) {
    const scope = this.resolveFeedScope(user, query);

    if (scope.audience !== NotificationAudience.ADMIN || !scope.restaurantId) {
      throw new ForbiddenException('Admin restaurant scope is required');
    }

    const notifications =
      await this.notificationsRepository.claimPendingOrderNotifications({
        userId: user.uid,
        restaurantId: scope.restaurantId,
        branchId: scope.branchId,
      });

    return {
      data: notifications.map((notification) =>
        this.toFeedItem(notification, NotificationAudience.ADMIN),
      ),
      message: 'Pending order notifications claimed successfully',
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

  async registerPushToken(user: AuthUserContext, dto: RegisterPushTokenDto) {
    const data = await this.notificationsRepository.upsertPushToken({
      token: dto.token,
      platform: dto.platform,
      tenantId: user.tid,
      restaurantId: user.rid,
      branchId: user.bid,
      userId: user.role === 'DELIVERYMAN' ? undefined : user.uid,
      deliverymanId: user.role === 'DELIVERYMAN' ? user.uid : undefined,
      deviceId: dto.deviceId,
      appPackageName: dto.appPackageName,
    });

    return {
      data: {
        id: data.id,
        platform: data.platform,
        appPackageName: data.appPackageName,
        isActive: data.isActive,
        lastSeenAt: data.lastSeenAt,
      },
      message: 'Push token registered successfully',
    };
  }

  async unregisterPushToken(
    user: AuthUserContext,
    dto: UnregisterPushTokenDto,
  ) {
    const data = await this.notificationsRepository.deactivatePushTokenForOwner(
      {
        token: dto.token,
        userId: user.role === 'DELIVERYMAN' ? undefined : user.uid,
        deliverymanId: user.role === 'DELIVERYMAN' ? user.uid : undefined,
      },
    );

    return {
      data: {
        count: data.count,
      },
      message: 'Push token removed successfully',
    };
  }

  async notifyGroupOrderParticipantCompleted(input: {
    tenantId: string;
    restaurantId: string;
    branchId: string;
    sessionId: string;
    hostUserId: string;
    participantUserId: string;
    participantName: string;
    allParticipantsCompleted: boolean;
  }) {
    await this.createCustomerInAppNotification({
      tenantId: input.tenantId,
      restaurantId: input.restaurantId,
      branchId: input.branchId,
      recipientUserId: input.hostUserId,
      type: NotificationType.GROUP_ORDER_PARTICIPANT_COMPLETED,
      subject: `${input.participantName} completed their group order`,
      body: `${input.participantName} has completed their group order selection.`,
      payload: {
        groupOrderSessionId: input.sessionId,
        participantUserId: input.participantUserId,
        participantName: input.participantName,
      },
    });

    if (!input.allParticipantsCompleted) {
      return;
    }

    await this.createCustomerInAppNotification({
      tenantId: input.tenantId,
      restaurantId: input.restaurantId,
      branchId: input.branchId,
      recipientUserId: input.hostUserId,
      type: NotificationType.GROUP_ORDER_ALL_PARTICIPANTS_COMPLETED,
      subject: 'All group order participants are done',
      body: 'All participants have completed their selections. You can now review and checkout the group order.',
      payload: {
        groupOrderSessionId: input.sessionId,
      },
    });
  }

  async notifyOrderPlaced(
    orderId: string,
    options: {
      source?: 'STOREFRONT' | 'POS';
      notifyRestaurant?: boolean;
    } = {},
  ): Promise<void> {
    const order =
      await this.notificationsRepository.findOrderForNotification(orderId);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const requiresOnlinePayment =
      order.paymentMethod === PaymentMethod.STRIPE ||
      order.paymentMethod === PaymentMethod.PAYPAL;
    if (
      requiresOnlinePayment &&
      (order.status === OrderStatus.PAYMENT_PENDING ||
        order.paymentStatus !== PaymentStatus.PAID)
    ) {
      return;
    }

    const currency =
      (await this.globalSettingsService?.getDefaultCurrencyCode()) ?? 'PKR';

    const restaurantLocale =
      await this.mailerService.resolveTransactionalLocale();
    const subjectPrefix = order.isScheduled
      ? restaurantLocale === 'de'
        ? 'VORBESTELLUNG'
        : 'PRE-ORDER'
      : restaurantLocale === 'de'
        ? 'SOFORT'
        : 'ASAP';
    const subject =
      restaurantLocale === 'de'
        ? `[${subjectPrefix}] Neue Bestellung ${order.id}`
        : `[${subjectPrefix}] New order ${order.id}`;
    const summaryBody =
      restaurantLocale === 'de'
        ? `${order.branch.name} hat eine neue Bestellung über ${Number(order.totalAmount).toFixed(2)} ${currency} erhalten.`
        : `${order.branch.name} received a new order for ${Number(order.totalAmount).toFixed(2)} ${currency}.`;
    const restaurantEmailBody = this.buildRestaurantOrderEmail(
      order,
      restaurantLocale,
      currency,
    );
    const customerRecipientEmail = this.resolveCustomerEmail(order.customer);
    const payload = {
      orderId: order.id,
      branchName: order.branch.name,
      totalAmount: Number(order.totalAmount),
      customerId: order.customerId,
    };
    if (options.notifyRestaurant !== false) {
      await this.createAdminInAppNotification({
        tenantId: order.tenantId,
        restaurantId: order.restaurantId,
        branchId: order.branchId,
        orderId: order.id,
        type: NotificationType.ORDER_PLACED,
        subject,
        body: summaryBody,
        payload,
      });
    }

    this.notificationsRealtimeService?.emitOrderCreated({
      id: order.id,
      status: order.status,
      tenantId: order.tenantId,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      orderType: order.orderType,
      paymentStatus: order.paymentStatus,
      totalAmount: Number(order.totalAmount),
      createdAt: order.createdAt,
      source: options.source ?? 'STOREFRONT',
    });

    const customerEmailTask = this.isDeliverableEmail(customerRecipientEmail)
      ? (async () => {
          const customerLocale =
            await this.mailerService.resolveTransactionalLocale(
              this.mailerService.resolveProfileLocale(
                order.customer.profile?.metadata,
              ),
            );
          const formatCustomerAmount = (value: unknown) =>
            new Intl.NumberFormat(customerLocale === 'de' ? 'de-DE' : 'en-GB', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(Number(value ?? 0));
          const customerEmail =
            await this.mailerService.renderTransactionalEmail({
              template: 'orderConfirmation',
              locale: customerLocale,
              variables: {
                customerName: order.customer.profile?.firstName ?? '',
                orderNumber: order.id,
                branchName: order.branch.name,
                orderType: this.localizeOrderType(
                  order.orderType,
                  customerLocale,
                ),
                items: (order.items ?? [])
                  .map(
                    (item) =>
                      `${item.quantity} × ${item.menuItemName}${item.variationName ? ` (${item.variationName})` : ''} — ${formatCustomerAmount(item.lineTotal)} ${currency}`,
                  )
                  .join('\n'),
                subtotal: formatCustomerAmount(order.subtotal),
                taxAmount: formatCustomerAmount(order.taxAmount),
                deliveryFee: formatCustomerAmount(order.deliveryFee),
                discountAmount: formatCustomerAmount(order.discountAmount),
                totalAmount: formatCustomerAmount(order.totalAmount),
                currency,
              },
            });
          const customerSubjectPrefix = order.isScheduled
            ? customerLocale === 'de'
              ? 'VORBESTELLUNG'
              : 'PRE-ORDER'
            : customerLocale === 'de'
              ? 'SOFORT'
              : 'ASAP';
          const scheduledFor = order.orderTime
            ? new Intl.DateTimeFormat(
                customerLocale === 'de' ? 'de-DE' : 'en-GB',
                { dateStyle: 'short', timeStyle: 'short' },
              ).format(order.orderTime)
            : null;
          const customerBanner = order.isScheduled
            ? `========== ${customerSubjectPrefix} ==========\n${customerLocale === 'de' ? 'Geplant für' : 'Scheduled for'}: ${scheduledFor ?? '-'}`
            : `========== ${customerSubjectPrefix} ==========`;
          const customerBody = [
            customerBanner,
            '',
            ...customerEmail.body.split('\n').filter((line) => {
              const normalizedLine = line.trim();
              if (/^(Steuern|Steuer|Tax):/i.test(normalizedLine)) {
                return false;
              }
              if (
                Number(order.deliveryFee ?? 0) === 0 &&
                /^(Liefergebühr|Delivery fee):/i.test(normalizedLine)
              ) {
                return false;
              }
              if (
                Number(order.discountAmount ?? 0) === 0 &&
                /^(Rabatt|Discount):/i.test(normalizedLine)
              ) {
                return false;
              }
              return true;
            }),
          ].join('\n');

          await this.createAndDispatchCustomerEmail({
            tenantId: order.tenantId,
            restaurantId: order.restaurantId,
            branchId: order.branchId,
            orderId: order.id,
            recipientUserId: order.customerId,
            recipientEmail: customerRecipientEmail,
            type: NotificationType.ORDER_PLACED,
            subject: `[${customerSubjectPrefix}] ${customerEmail.subject}`,
            body: customerBody,
            payload: {
              orderId: order.id,
              branchName: order.branch.name,
              totalAmount: Number(order.totalAmount),
            },
          });
        })()
      : null;
    const emailTasks: Array<Promise<unknown>> = customerEmailTask
      ? [customerEmailTask]
      : [];
    const restaurantEmail = this.resolveNewOrderRestaurantEmail(
      order.branch.settings,
      order.restaurant.settings,
    );

    const normalizedCustomerEmail = customerRecipientEmail.toLowerCase();
    const normalizedRestaurantEmail = restaurantEmail?.trim().toLowerCase();

    if (
      options.notifyRestaurant !== false &&
      restaurantEmail &&
      normalizedRestaurantEmail !== normalizedCustomerEmail
    ) {
      emailTasks.push(
        this.createAndDispatchAdminEmail({
          tenantId: order.tenantId,
          restaurantId: order.restaurantId,
          branchId: order.branchId,
          recipientEmail: restaurantEmail,
          type: NotificationType.ORDER_PLACED,
          subject,
          body: restaurantEmailBody,
          payload,
        }),
      );
    }

    void Promise.all(emailTasks).catch((error: unknown) => {
      this.logger.error(
        `Order ${order.id} email notification dispatch failed`,
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  async notifyOrderStatusChanged(orderId: string): Promise<void> {
    const order =
      await this.notificationsRepository.findOrderForNotification(orderId);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    this.notificationsRealtimeService?.emitOrderStatusUpdated?.({
      id: order.id,
      status: order.status,
      tenantId: order.tenantId,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      updatedAt: order.updatedAt,
    });

    if (!['PAYMENT_PENDING', 'PLACED'].includes(order.status)) {
      await this.notificationsRepository.markAllSeen({
        orderId: order.id,
        type: NotificationType.ORDER_PLACED,
      });
    }

    const type =
      order.status === 'CANCELLED'
        ? NotificationType.ORDER_CANCELLED
        : NotificationType.ORDER_STATUS_CHANGED;
    const customerLocale = await this.mailerService.resolveTransactionalLocale(
      this.mailerService.resolveProfileLocale(order.customer.profile?.metadata),
    );
    const customerEmail = await this.mailerService.renderTransactionalEmail({
      template: 'orderStatus',
      locale: customerLocale,
      variables: {
        customerName: order.customer.profile?.firstName ?? '',
        orderNumber: order.id,
        branchName: order.branch.name,
        status: this.localizeOrderStatus(order.status, customerLocale),
      },
    });

    await this.createAndDispatchCustomerEmail({
      tenantId: order.tenantId,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      orderId: order.id,
      recipientUserId: order.customerId,
      recipientEmail: this.resolveCustomerEmail(order.customer),
      type,
      subject: customerEmail.subject,
      body: customerEmail.body,
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

    if (order.deliverymanId) {
      await this.createDeliverymanInAppNotification({
        tenantId: order.tenantId,
        restaurantId: order.restaurantId,
        branchId: order.branchId,
        deliverymanId: order.deliverymanId,
        orderId: order.id,
        type,
        subject: `Order ${order.id} is now ${order.status}`,
        body: `${order.branch.name} order ${order.id} is now ${order.status}.`,
        payload: {
          orderId: order.id,
          branchName: order.branch.name,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalAmount: Number(order.totalAmount),
        },
      });
    }

    this.notificationsRealtimeService?.emitOrderUpdated({
      id: order.id,
      status: order.status,
      tenantId: order.tenantId,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      paymentStatus: order.paymentStatus,
      updatedAt: order.updatedAt,
    });
  }

  async notifyPaymentAttemptCreated(
    paymentTransactionId: string,
  ): Promise<void> {
    const payment =
      await this.notificationsRepository.findPaymentForNotification(
        paymentTransactionId,
      );

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    if (!payment.order || !payment.orderId) {
      return;
    }

    const customerLocale = await this.mailerService.resolveTransactionalLocale(
      this.mailerService.resolveProfileLocale(
        payment.order.customer.profile?.metadata,
      ),
    );
    const customerEmail = await this.mailerService.renderTransactionalEmail({
      template: 'paymentStatus',
      locale: customerLocale,
      variables: {
        customerName: payment.order.customer.profile?.firstName ?? '',
        orderNumber: payment.orderId,
        branchName: payment.order.branch.name,
        status: this.localizePaymentStatus('PENDING', customerLocale),
        amount: Number(payment.amount).toFixed(2),
        currency: payment.currency,
      },
    });
    await this.createAndDispatchCustomerEmail({
      tenantId: payment.tenantId,
      restaurantId: payment.restaurantId,
      branchId: payment.branchId,
      orderId: payment.orderId,
      paymentTransactionId: payment.id,
      recipientUserId: payment.order.customerId,
      recipientEmail: this.resolveCustomerEmail(payment.order.customer),
      type: NotificationType.PAYMENT_ATTEMPT_CREATED,
      subject: customerEmail.subject,
      body: customerEmail.body,
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
    const payment =
      await this.notificationsRepository.findPaymentForNotification(
        paymentTransactionId,
      );

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    if (!payment.order || !payment.orderId) {
      return;
    }

    const type = this.mapPaymentType(payment.status);
    const customerLocale = await this.mailerService.resolveTransactionalLocale(
      this.mailerService.resolveProfileLocale(
        payment.order.customer.profile?.metadata,
      ),
    );
    const customerEmail = await this.mailerService.renderTransactionalEmail({
      template: 'paymentStatus',
      locale: customerLocale,
      variables: {
        customerName: payment.order.customer.profile?.firstName ?? '',
        orderNumber: payment.orderId,
        branchName: payment.order.branch.name,
        status: this.localizePaymentStatus(payment.status, customerLocale),
        amount: Number(payment.amount).toFixed(2),
        currency: payment.currency,
      },
    });

    await this.createAndDispatchCustomerEmail({
      tenantId: payment.tenantId,
      restaurantId: payment.restaurantId,
      branchId: payment.branchId,
      orderId: payment.orderId,
      paymentTransactionId: payment.id,
      recipientUserId: payment.order.customerId,
      recipientEmail: this.resolveCustomerEmail(payment.order.customer),
      type,
      subject: customerEmail.subject,
      body: customerEmail.body,
      payload: {
        paymentTransactionId: payment.id,
        orderId: payment.orderId,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
        type: payment.type,
      },
    });

    this.notificationsRealtimeService?.emitOrderUpdated({
      id: payment.order.id,
      status: payment.order.status,
      tenantId: payment.tenantId,
      restaurantId: payment.order.restaurantId,
      branchId: payment.order.branchId,
      paymentStatus: payment.order.paymentStatus,
      updatedAt: payment.order.updatedAt,
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
    const type = accepted
      ? NotificationType.TABLE_RESERVATION_ACCEPTED
      : NotificationType.TABLE_RESERVATION_CREATED;
    const subject = accepted
      ? `Reservation auto-accepted at ${input.branchName}`
      : `New reservation request at ${input.branchName}`;
    const body = `${input.customerName ?? input.customerEmail ?? 'Customer'} requested a table for ${input.guestCount} guest(s) at ${input.reservationDate}.`;
    const payload = {
      reservationId: input.reservationId,
      branchId: input.branchId,
      branchName: input.branchName,
      customerId: input.customerId,
      customerEmail: input.customerEmail,
      reservationDate: input.reservationDate,
      guestCount: input.guestCount,
      status: input.status,
    };

    await this.createAdminInAppNotification({
      tenantId: input.tenantId,
      restaurantId: input.restaurantId,
      branchId: input.branchId,
      type,
      subject,
      body,
      payload,
    });

    const recipients =
      await this.notificationsRepository.listAdminEmailRecipients({
        restaurantId: input.restaurantId,
        branchId: input.branchId,
      });
    const uniqueRecipients = this.uniqueEmailRecipients(recipients);

    await Promise.all(
      uniqueRecipients.map((recipient) =>
        this.createAndDispatchAdminEmail({
          tenantId: input.tenantId,
          restaurantId: input.restaurantId,
          branchId: input.branchId,
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          type,
          subject,
          body,
          payload,
        }),
      ),
    );
  }

  async notifyTableReservationCustomer(input: {
    tenantId: string;
    restaurantId: string;
    branchId: string;
    reservationId: string;
    branchName: string;
    customerId: string;
    reservationDate: string;
    guestCount: number;
    status: string;
    source: 'CREATED' | 'STATUS_UPDATED';
  }): Promise<void> {
    const type =
      input.source === 'CREATED'
        ? input.status === 'CONFIRMED'
          ? NotificationType.TABLE_RESERVATION_ACCEPTED
          : NotificationType.TABLE_RESERVATION_CREATED
        : NotificationType.TABLE_RESERVATION_STATUS_CHANGED;
    const subject =
      input.source === 'CREATED'
        ? input.status === 'CONFIRMED'
          ? `Reservation confirmed at ${input.branchName}`
          : `Reservation requested at ${input.branchName}`
        : `Reservation status updated at ${input.branchName}`;
    const body =
      input.source === 'CREATED'
        ? `Your table reservation for ${input.guestCount} guest(s) at ${input.reservationDate} is ${input.status.toLowerCase()}.`
        : `Your table reservation for ${input.guestCount} guest(s) at ${input.reservationDate} is now ${input.status.toLowerCase()}.`;
    const payload = {
      reservationId: input.reservationId,
      branchId: input.branchId,
      branchName: input.branchName,
      reservationDate: input.reservationDate,
      guestCount: input.guestCount,
      status: input.status,
      source: input.source,
    };

    await this.createCustomerInAppNotification({
      tenantId: input.tenantId,
      restaurantId: input.restaurantId,
      branchId: input.branchId,
      recipientUserId: input.customerId,
      type,
      subject,
      body,
      payload,
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
    const notification = await this.notificationsRepository.create({
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

    await this.dispatchInAppPush(notification);

    return notification;
  }

  private async createCustomerInAppNotification(input: {
    tenantId: string;
    restaurantId: string;
    branchId: string;
    recipientUserId: string;
    type: NotificationType;
    subject: string;
    body: string;
    payload?: Record<string, unknown>;
  }) {
    const notification = await this.notificationsRepository.create({
      tenant: { connect: { id: input.tenantId } },
      restaurant: { connect: { id: input.restaurantId } },
      branch: { connect: { id: input.branchId } },
      recipientUser: { connect: { id: input.recipientUserId } },
      recipientEmail: null,
      audience: NotificationAudience.CUSTOMER,
      channel: NotificationChannel.IN_APP,
      status: NotificationStatus.SENT,
      sentAt: new Date(),
      type: input.type,
      subject: input.subject,
      body: input.body,
      payload: input.payload as Prisma.InputJsonValue | undefined,
    });

    await this.dispatchInAppPush(notification);

    return notification;
  }

  private async createDeliverymanInAppNotification(input: {
    tenantId: string;
    restaurantId: string;
    branchId: string;
    deliverymanId: string;
    orderId?: string;
    type: NotificationType;
    subject: string;
    body: string;
    payload?: Record<string, unknown>;
  }) {
    const notification = await this.notificationsRepository.create({
      tenant: { connect: { id: input.tenantId } },
      restaurant: { connect: { id: input.restaurantId } },
      branch: { connect: { id: input.branchId } },
      deliveryman: { connect: { id: input.deliverymanId } },
      order: input.orderId ? { connect: { id: input.orderId } } : undefined,
      recipientEmail: null,
      audience: NotificationAudience.DELIVERYMAN,
      channel: NotificationChannel.IN_APP,
      status: NotificationStatus.SENT,
      sentAt: new Date(),
      type: input.type,
      subject: input.subject,
      body: input.body,
      payload: input.payload as Prisma.InputJsonValue | undefined,
    });

    await this.dispatchInAppPush(notification);

    return notification;
  }

  private async createAndDispatchAdminEmail(input: {
    tenantId: string;
    restaurantId: string;
    branchId: string;
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
      recipientUser: input.recipientUserId
        ? { connect: { id: input.recipientUserId } }
        : undefined,
      recipientEmail: input.recipientEmail,
      audience: NotificationAudience.ADMIN,
      channel: NotificationChannel.EMAIL,
      type: input.type,
      subject: input.subject,
      body: input.body,
      payload: input.payload as Prisma.InputJsonValue | undefined,
    });

    return this.dispatchNotification(notification);
  }

  private uniqueEmailRecipients(
    recipients: Array<{ id: string; email: string }>,
  ) {
    const seen = new Set<string>();

    return recipients.filter((recipient) => {
      const emailKey = recipient.email.trim().toLowerCase();

      if (!emailKey || seen.has(emailKey)) {
        return false;
      }

      seen.add(emailKey);
      return true;
    });
  }

  private resolveNewOrderRestaurantEmail(
    branchSettings: Prisma.JsonValue | null,
    restaurantSettings: Prisma.JsonValue | null,
  ): string | null {
    return (
      this.readNewOrderEmail(branchSettings) ??
      this.readNewOrderEmail(restaurantSettings)
    );
  }

  private buildRestaurantOrderEmail(
    order: OrderForNotification,
    locale: 'de' | 'en',
    currency: string,
  ): string {
    const isGerman = locale === 'de';
    const label = (english: string, german: string) =>
      isGerman ? german : english;
    const money = (value: unknown) =>
      `${new Intl.NumberFormat('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(value ?? 0))} ${currency}`;
    const formatDate = (value: Date | null | undefined) =>
      value
        ? new Intl.DateTimeFormat(isGerman ? 'de-DE' : 'en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(value)
        : label('Not scheduled', 'Nicht vorbestellt');
    const customerLastName =
      order.customer.isGuest &&
      order.customer.profile?.lastName?.trim().toLowerCase() === 'customer'
        ? null
        : order.customer.profile?.lastName;
    const customerName = [order.customer.profile?.firstName, customerLastName]
      .filter(Boolean)
      .join(' ');
    const address = order.deliveryAddress
      ? [
          order.deliveryAddress.street,
          order.deliveryAddress.area,
          [order.deliveryAddress.postalCode, order.deliveryAddress.city]
            .filter(Boolean)
            .join(' '),
          order.deliveryAddress.state,
          order.deliveryAddress.country,
        ]
          .filter(Boolean)
          .join(', ')
      : label('Not provided', 'Nicht angegeben');
    const itemLines = (order.items ?? []).flatMap((item) => {
      const variation = item.variationName ? ` (${item.variationName})` : '';
      const modifiers = this.readModifierLines(item.snapshotModifiers);

      return [
        `${item.quantity} × ${item.menuItemName}${variation} — ${money(item.lineTotal)}`,
        ...modifiers.map((modifier) => `  + ${modifier}`),
        ...(item.note
          ? [
              `  ${label('Special instructions', 'Sonderwünsche')}: ${item.note}`,
            ]
          : []),
      ];
    });
    const feeLines = [
      {
        label: label('Subtotal', 'Zwischensumme'),
        value: order.subtotal,
        always: true,
      },
      {
        label: label('Delivery fee', 'Liefergebühr'),
        value: order.deliveryFee,
      },
      {
        label: label('Service charge', 'Servicegebühr'),
        value: order.serviceChargeAmount,
      },
      { label: label('Tip', 'Trinkgeld'), value: order.tipAmount },
      {
        label: label('Discount', 'Rabatt'),
        value: order.discountAmount,
        subtract: true,
      },
      {
        label: label('Loyalty discount', 'Treuerabatt'),
        value: order.loyaltyDiscountAmount,
        subtract: true,
      },
      {
        label: label('Wallet applied', 'Wallet-Guthaben'),
        value: order.walletAppliedAmount,
        subtract: true,
      },
    ]
      .filter((line) => line.always || Number(line.value ?? 0) !== 0)
      .map(
        (line) =>
          `${line.label}: ${line.subtract ? '-' : ''}${money(line.value)}`,
      );
    const fulfillmentBanner = order.isScheduled
      ? [
          `========== ${label('PRE-ORDER', 'VORBESTELLUNG')} ==========`,
          `${label('Scheduled for', 'Geplant für')}: ${formatDate(order.orderTime)}`,
          '',
        ]
      : [
          `========== ${label('ASAP / IMMEDIATE ORDER', 'SOFORTBESTELLUNG')} ==========`,
          '',
        ];

    return [
      ...fulfillmentBanner,
      `${label('New order', 'Neue Bestellung')} ${order.id}`,
      `${label('Branch', 'Filiale')}: ${order.branch.name}`,
      `${label('Order type', 'Bestellart')}: ${this.localizeOrderType(order.orderType, locale)}`,
      '',
      label('Customer details', 'Kundendaten'),
      `${label('Name', 'Name')}: ${customerName || label('Not provided', 'Nicht angegeben')}`,
      `${label('Email', 'E-Mail')}: ${this.resolveCustomerEmail(order.customer)}`,
      `${label('Phone', 'Telefon')}: ${order.customer.profile?.phone || label('Not provided', 'Nicht angegeben')}`,
      `${label('Delivery address', 'Lieferadresse')}: ${address}`,
      '',
      `${label('Order date and time', 'Bestelldatum und -zeit')}: ${formatDate(order.createdAt)}`,
      `${label('Pre-order date and time', 'Vorbestelldatum und -zeit')}: ${order.isScheduled ? formatDate(order.orderTime) : label('Not scheduled', 'Nicht vorbestellt')}`,
      '',
      label('Ordered items', 'Bestellte Artikel'),
      ...(itemLines.length
        ? itemLines
        : [
            label(
              'No item details available',
              'Keine Artikeldetails verfügbar',
            ),
          ]),
      '',
      ...feeLines,
      `${label('Total amount', 'Gesamtbetrag')}: ${money(order.totalAmount)}`,
      `${label('Payment method', 'Zahlungsart')}: ${this.localizePaymentMethod(order.paymentMethod, locale)}`,
      `${label('Payment status', 'Zahlungsstatus')}: ${order.paymentStatus}`,
      `${label('Note', 'Hinweis')}: ${order.customerNote || label('None', 'Keine')}`,
    ].join('\n');
  }

  private resolveCustomerEmail(customer: {
    email: string;
    isGuest: boolean;
    profile: { metadata: Prisma.JsonValue | null } | null;
  }): string {
    const accountEmail = customer.email.trim().toLowerCase();
    if (!customer.isGuest) {
      return accountEmail;
    }

    const metadata = customer.profile?.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return accountEmail;
    }

    const guestContact = (metadata as { guestContact?: unknown }).guestContact;
    if (
      !guestContact ||
      typeof guestContact !== 'object' ||
      Array.isArray(guestContact)
    ) {
      return accountEmail;
    }

    const email = (guestContact as { email?: unknown }).email;
    return typeof email === 'string' && email.trim()
      ? email.trim().toLowerCase()
      : accountEmail;
  }

  private isDeliverableEmail(email: string) {
    return !/@guest\.deliveryways?(?:\.local)?$/i.test(email.trim());
  }

  private readModifierLines(value: Prisma.JsonValue | null): string[] {
    const values = Array.isArray(value)
      ? value
      : value && typeof value === 'object'
        ? Object.values(value)
        : [];

    return values.flatMap((entry) => {
      if (Array.isArray(entry)) {
        return this.readModifierLines(entry);
      }

      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return [];
      }

      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      const quantity =
        typeof entry.quantity === 'number' && entry.quantity > 1
          ? ` × ${entry.quantity}`
          : '';
      const nested = Object.values(entry).flatMap((nestedValue) =>
        nestedValue && typeof nestedValue === 'object'
          ? this.readModifierLines(nestedValue as Prisma.JsonValue)
          : [],
      );

      return [...(name ? [`${name}${quantity}`] : []), ...nested];
    });
  }

  private readNewOrderEmail(settings: Prisma.JsonValue | null): string | null {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return null;
    }

    const notificationSettings = (
      settings as {
        notificationSettings?: unknown;
      }
    ).notificationSettings;
    if (
      !notificationSettings ||
      typeof notificationSettings !== 'object' ||
      Array.isArray(notificationSettings)
    ) {
      return null;
    }

    const config = notificationSettings as {
      emailAddress?: unknown;
      notificationTypes?: unknown;
    };
    const notificationTypes = config.notificationTypes;
    if (
      !notificationTypes ||
      typeof notificationTypes !== 'object' ||
      Array.isArray(notificationTypes)
    ) {
      return null;
    }

    const newOrder = (notificationTypes as { newOrder?: unknown }).newOrder;
    if (
      !newOrder ||
      typeof newOrder !== 'object' ||
      Array.isArray(newOrder) ||
      (newOrder as { email?: unknown }).email !== true
    ) {
      return null;
    }

    return typeof config.emailAddress === 'string' && config.emailAddress.trim()
      ? config.emailAddress.trim().toLowerCase()
      : null;
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

  private async dispatchInAppPush(notification: {
    id: string;
    audience: NotificationAudience;
    type: NotificationType;
    subject: string;
    body: string;
    payload: Prisma.JsonValue | null;
    restaurantId: string;
    branchId: string;
    recipientUserId?: string | null;
    deliverymanId?: string | null;
  }): Promise<void> {
    try {
      const tokenRows =
        await this.notificationsRepository.listPushTokensForNotification({
          audience: notification.audience,
          restaurantId: notification.restaurantId,
          branchId: notification.branchId,
          recipientUserId: notification.recipientUserId,
          deliverymanId: notification.deliverymanId,
        });
      const invalidTokens = await this.pushNotificationsService.sendToTokens({
        notificationId: notification.id,
        audience: notification.audience,
        type: notification.type,
        title: notification.subject,
        body: notification.body,
        payload: notification.payload,
        tokens: tokenRows.map((item) => item.token),
      });

      await Promise.all(
        invalidTokens.map((token) =>
          this.notificationsRepository.deactivatePushToken(token),
        ),
      );
    } catch (error) {
      this.logger.warn(
        error instanceof Error
          ? error.message
          : 'Failed to dispatch push notification',
      );
    }
  }

  private assertNotificationAccess(
    user: AuthUserContext,
    notification: {
      audience: NotificationAudience;
      restaurantId: string;
      branchId: string;
      recipientUserId: string | null;
      deliverymanId?: string | null;
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

    if (notification.audience === NotificationAudience.DELIVERYMAN) {
      if (user.role !== 'DELIVERYMAN') {
        throw new ForbiddenException(
          'You do not have access to this notification',
        );
      }

      if (notification.deliverymanId !== user.uid) {
        throw new ForbiddenException(
          'You do not have access to this notification',
        );
      }

      return;
    }

    if (user.role === UserRoleEnum.CUSTOMER) {
      throw new ForbiddenException(
        'You do not have access to this notification',
      );
    }

    if (this.isStaff(user)) {
      this.assertStaffNotificationScope(
        user,
        notification.restaurantId,
        notification.branchId,
      );
      return;
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

    if (this.isStaff(user)) {
      const restaurantId = query.restaurantId ?? user.rid;
      if (!restaurantId) {
        throw new ForbiddenException('restaurantId is required');
      }

      this.assertStaffNotificationScope(user, restaurantId, query.branchId);

      return {
        audience: NotificationAudience.ADMIN,
        restaurantId,
        branchId: query.branchId,
        recipientUserId: undefined,
        allowedTypes: ADMIN_NOTIFICATION_TYPES,
      };
    }

    if (user.role === 'DELIVERYMAN') {
      if (!user.rid || !user.bid) {
        throw new ForbiddenException('Deliveryman scope is required');
      }

      return {
        audience: NotificationAudience.DELIVERYMAN,
        restaurantId: user.rid,
        branchId: user.bid,
        recipientUserId: undefined,
        deliverymanId: user.uid,
        allowedTypes: DELIVERYMAN_NOTIFICATION_TYPES,
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

  private isStaff(user: AuthUserContext): boolean {
    return (
      user.role === UserRoleEnum.STAFF || user.actorType === UserRoleEnum.STAFF
    );
  }

  private assertStaffNotificationScope(
    user: AuthUserContext,
    restaurantId: string,
    branchId?: string,
  ): void {
    const access = user.restaurantAccess;
    const allRestaurants =
      access?.allRestaurants === true ||
      access?.hasAllRestaurantsAccess === true;
    const restaurantIds = access?.restaurantIds ?? [];
    const hasRestaurantAccess =
      allRestaurants ||
      user.rid === restaurantId ||
      restaurantIds.includes(restaurantId);

    if (!hasRestaurantAccess) {
      throw new ForbiddenException(
        'Staff account is not assigned to this restaurant',
      );
    }

    const branchIds = access?.branchIds ?? [];
    const restrictedBranchIds = user.bid
      ? Array.from(new Set([user.bid, ...branchIds]))
      : branchIds;
    if (
      restrictedBranchIds.length &&
      (!branchId || !restrictedBranchIds.includes(branchId))
    ) {
      throw new ForbiddenException(
        'Staff account is not assigned to this branch',
      );
    }
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

  private localizeOrderType(orderType: string, locale: 'de' | 'en'): string {
    if (locale === 'en') {
      return orderType === 'DINE_IN'
        ? 'Dine in'
        : orderType === 'DELIVERY'
          ? 'Delivery'
          : 'Pickup';
    }

    return orderType === 'DINE_IN'
      ? 'Vor Ort'
      : orderType === 'DELIVERY'
        ? 'Lieferung'
        : 'Abholung';
  }

  private localizePaymentMethod(
    paymentMethod: PaymentMethod,
    locale: 'de' | 'en',
  ): string {
    if (paymentMethod === PaymentMethod.COD) {
      return locale === 'de' ? 'BAR' : 'Cash';
    }

    if (paymentMethod === PaymentMethod.CARD_ON_DELIVERY) {
      return locale === 'de'
        ? 'Kartenzahlung bei Lieferung'
        : 'Card on delivery';
    }

    if (
      paymentMethod === PaymentMethod.STRIPE ||
      paymentMethod === PaymentMethod.PAYPAL ||
      paymentMethod === PaymentMethod.WALLET
    ) {
      return locale === 'de' ? 'Online bezahlt' : 'Online paid';
    }

    return paymentMethod;
  }

  private localizeOrderStatus(status: string, locale: 'de' | 'en'): string {
    const translations: Record<string, { de: string; en: string }> = {
      PLACED: { de: 'Bestellung aufgegeben', en: 'Placed' },
      CONFIRMED: { de: 'Bestätigt', en: 'Confirmed' },
      PREPARING: { de: 'In Zubereitung', en: 'Preparing' },
      READY: { de: 'Abholbereit', en: 'Ready' },
      OUT_FOR_DELIVERY: { de: 'Unterwegs', en: 'Out for delivery' },
      DELIVERED: { de: 'Geliefert', en: 'Delivered' },
      COMPLETED: { de: 'Abgeschlossen', en: 'Completed' },
      CANCELLED: { de: 'Storniert', en: 'Cancelled' },
    };
    return translations[status]?.[locale] ?? status;
  }

  private localizePaymentStatus(status: string, locale: 'de' | 'en'): string {
    const translations: Record<string, { de: string; en: string }> = {
      PENDING: { de: 'Ausstehend', en: 'Pending' },
      PAID: { de: 'Bezahlt', en: 'Paid' },
      FAILED: { de: 'Fehlgeschlagen', en: 'Failed' },
      CANCELLED: { de: 'Storniert', en: 'Cancelled' },
      REFUNDED: { de: 'Erstattet', en: 'Refunded' },
    };
    return translations[status]?.[locale] ?? status;
  }
}
