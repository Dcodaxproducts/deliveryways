import {
  NotificationAudience,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  PushPlatform,
} from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationsRepository: {
    create: jest.Mock;
    updateDelivery: jest.Mock;
    list: jest.Mock;
    findById: jest.Mock;
    findOrderForNotification: jest.Mock;
    findPaymentForNotification: jest.Mock;
    buildWhere: jest.Mock;
    countSummary: jest.Mock;
    markSeen: jest.Mock;
    markAllSeen: jest.Mock;
    listAdminEmailRecipients: jest.Mock;
    upsertPushToken: jest.Mock;
    deactivatePushToken: jest.Mock;
    deactivatePushTokenForOwner: jest.Mock;
    listPushTokensForNotification: jest.Mock;
  };
  let mailerService: {
    sendEmail: jest.Mock;
  };
  let pushNotificationsService: {
    sendToTokens: jest.Mock;
  };
  let notificationsRealtimeService: {
    emitOrderCreated: jest.Mock;
  };

  beforeEach(() => {
    notificationsRepository = {
      create: jest.fn(),
      updateDelivery: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
      findOrderForNotification: jest.fn(),
      findPaymentForNotification: jest.fn(),
      buildWhere: jest
        .fn()
        .mockImplementation((input: Record<string, unknown>) => ({ ...input })),
      countSummary: jest.fn(),
      markSeen: jest.fn(),
      markAllSeen: jest.fn(),
      listAdminEmailRecipients: jest.fn(),
      upsertPushToken: jest.fn(),
      deactivatePushToken: jest.fn(),
      deactivatePushTokenForOwner: jest.fn(),
      listPushTokensForNotification: jest.fn().mockResolvedValue([]),
    };
    mailerService = {
      sendEmail: jest.fn(),
    };
    pushNotificationsService = {
      sendToTokens: jest.fn().mockResolvedValue([]),
    };
    notificationsRealtimeService = {
      emitOrderCreated: jest.fn(),
    };

    service = new NotificationsService(
      notificationsRepository as never,
      mailerService as never,
      pushNotificationsService as never,
      undefined,
      notificationsRealtimeService as never,
    );
  });

  it('lists simplified customer notifications for the logged-in customer only', async () => {
    notificationsRepository.list.mockResolvedValue({
      items: [
        {
          id: 'notification-1',
          audience: NotificationAudience.CUSTOMER,
          type: NotificationType.ORDER_PLACED,
          subject: 'Order placed',
          body: 'Your order was placed',
          payload: { orderId: 'order-1' },
          seenAt: null,
          createdAt: new Date('2026-03-27T10:00:00.000Z'),
          order: {
            id: 'order-1',
            status: 'PENDING',
            paymentStatus: 'PENDING',
          },
          paymentTransaction: null,
        },
      ],
      total: 1,
    });

    const result = await service.list(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        role: 'CUSTOMER',
      } as never,
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(notificationsRepository.buildWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: NotificationAudience.CUSTOMER,
        restaurantId: 'restaurant-1',
        recipientUserId: 'customer-1',
      }),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'notification-1',
        audience: NotificationAudience.CUSTOMER,
        title: 'Order placed',
        message: 'Your order was placed',
        isSeen: false,
      }),
    );
  });

  it('returns summary counts for admin feed', async () => {
    notificationsRepository.countSummary.mockResolvedValue({
      total: 5,
      unseen: 3,
      seen: 2,
    });

    const result = await service.summary(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      {
        restaurantId: 'restaurant-1',
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(notificationsRepository.buildWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: NotificationAudience.ADMIN,
        restaurantId: 'restaurant-1',
      }),
    );
    expect(result.data).toEqual({ total: 5, unseen: 3, seen: 2 });
  });

  it('returns admin notifications for staff within assigned restaurant scope', async () => {
    notificationsRepository.countSummary.mockResolvedValue({
      total: 2,
      unseen: 1,
      seen: 1,
    });

    const result = await service.summary(
      {
        uid: 'staff-1',
        role: 'STAFF',
        actorType: 'STAFF',
        restaurantAccess: {
          restaurantIds: ['restaurant-1'],
          branchIds: [],
        },
      } as never,
      {
        restaurantId: 'restaurant-1',
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(notificationsRepository.buildWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: NotificationAudience.ADMIN,
        restaurantId: 'restaurant-1',
      }),
    );
    expect(result.data.unseen).toBe(1);
  });

  it('returns admin notifications for staff with one directly assigned restaurant', async () => {
    notificationsRepository.countSummary.mockResolvedValue({
      total: 1,
      unseen: 1,
      seen: 0,
    });

    const result = await service.summary(
      {
        uid: 'staff-1',
        role: 'STAFF',
        actorType: 'STAFF',
        rid: 'restaurant-1',
        restaurantAccess: null,
      } as never,
      {
        restaurantId: 'restaurant-1',
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(result.data.unseen).toBe(1);
  });

  it('denies staff notifications outside assigned restaurant scope', async () => {
    await expect(
      service.summary(
        {
          uid: 'staff-1',
          role: 'STAFF',
          actorType: 'STAFF',
          restaurantAccess: {
            restaurantIds: ['restaurant-1'],
            branchIds: [],
          },
        } as never,
        {
          restaurantId: 'restaurant-2',
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lists deliveryman notifications for the logged-in deliveryman', async () => {
    notificationsRepository.list.mockResolvedValue({
      items: [
        {
          id: 'notification-deliveryman-1',
          audience: NotificationAudience.DELIVERYMAN,
          type: NotificationType.ORDER_STATUS_CHANGED,
          subject: 'Order assigned',
          body: 'Order assigned in your branch',
          payload: { orderId: 'order-1' },
          seenAt: null,
          createdAt: new Date('2026-03-27T10:00:00.000Z'),
          order: {
            id: 'order-1',
            status: 'OUT_FOR_DELIVERY',
            paymentStatus: 'PAID',
          },
          paymentTransaction: null,
        },
      ],
      total: 1,
    });

    const result = await service.list(
      {
        uid: 'dm-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: 'DELIVERYMAN',
      } as never,
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(notificationsRepository.buildWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: NotificationAudience.DELIVERYMAN,
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        deliverymanId: 'dm-1',
      }),
    );
    expect(result.data[0].audience).toBe(NotificationAudience.DELIVERYMAN);
  });

  it('marks a notification as seen', async () => {
    notificationsRepository.findById.mockResolvedValue({
      id: 'notification-1',
      audience: NotificationAudience.CUSTOMER,
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      recipientUserId: 'customer-1',
      recipientEmail: 'customer@example.com',
      channel: NotificationChannel.EMAIL,
    });
    notificationsRepository.markSeen.mockResolvedValue({
      id: 'notification-1',
      seenAt: new Date('2026-03-27T10:30:00.000Z'),
    });

    const result = await service.markSeen(
      {
        uid: 'customer-1',
        rid: 'restaurant-1',
        role: 'CUSTOMER',
      } as never,
      'notification-1',
    );

    expect(result.data).toEqual({
      id: 'notification-1',
      seenAt: new Date('2026-03-27T10:30:00.000Z'),
      isSeen: true,
    });
  });

  it('allows deliveryman to mark own notification as seen', async () => {
    notificationsRepository.findById.mockResolvedValue({
      id: 'notification-deliveryman-1',
      audience: NotificationAudience.DELIVERYMAN,
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      recipientUserId: null,
      deliverymanId: 'dm-1',
      recipientEmail: null,
      channel: NotificationChannel.IN_APP,
    });
    notificationsRepository.markSeen.mockResolvedValue({
      id: 'notification-deliveryman-1',
      seenAt: new Date('2026-03-27T10:30:00.000Z'),
    });

    const result = await service.markSeen(
      {
        uid: 'dm-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: 'DELIVERYMAN',
      } as never,
      'notification-deliveryman-1',
    );

    expect(result.data.id).toBe('notification-deliveryman-1');
    expect(result.data.isSeen).toBe(true);
  });

  it('registers deliveryman push token under the logged-in deliveryman', async () => {
    notificationsRepository.upsertPushToken.mockResolvedValue({
      id: 'push-token-1',
      platform: PushPlatform.ANDROID,
      appPackageName: 'com.dcodax.deliveryway_driver',
      isActive: true,
      lastSeenAt: new Date('2026-06-18T10:00:00.000Z'),
    });

    const result = await service.registerPushToken(
      {
        uid: 'dm-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: 'DELIVERYMAN',
      } as never,
      {
        token: 'fcm-token',
        platform: PushPlatform.ANDROID,
        appPackageName: 'com.dcodax.deliveryway_driver',
      },
    );

    expect(notificationsRepository.upsertPushToken).toHaveBeenCalledWith({
      token: 'fcm-token',
      platform: PushPlatform.ANDROID,
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      userId: undefined,
      deliverymanId: 'dm-1',
      deviceId: undefined,
      appPackageName: 'com.dcodax.deliveryway_driver',
    });
    expect(result.data).toEqual(
      expect.objectContaining({
        id: 'push-token-1',
        platform: PushPlatform.ANDROID,
        isActive: true,
      }),
    );
  });

  it('unregisters only the logged-in user push token', async () => {
    notificationsRepository.deactivatePushTokenForOwner.mockResolvedValue({
      count: 1,
    });

    const result = await service.unregisterPushToken(
      {
        uid: 'customer-1',
        role: 'CUSTOMER',
      } as never,
      {
        token: 'fcm-token',
      },
    );

    expect(
      notificationsRepository.deactivatePushTokenForOwner,
    ).toHaveBeenCalledWith({
      token: 'fcm-token',
      userId: 'customer-1',
      deliverymanId: undefined,
    });
    expect(result.data.count).toBe(1);
  });

  it('creates both customer email and admin in-app notification on order placed', async () => {
    notificationsRepository.findOrderForNotification.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      status: 'PLACED',
      orderType: 'DELIVERY',
      totalAmount: 450,
      paymentStatus: 'PENDING',
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
      customer: {
        email: 'customer@example.com',
        profile: {
          firstName: 'Bilal',
        },
      },
      branch: {
        id: 'branch-1',
        name: 'Main Branch',
        settings: null,
      },
      restaurant: {
        settings: {
          notificationSettings: {
            emailAddress: ' Orders@Restaurant.Example ',
            notificationTypes: {
              newOrder: {
                email: true,
              },
            },
          },
        },
      },
    });
    notificationsRepository.create
      .mockResolvedValueOnce({
        id: 'admin-notification-1',
        recipientEmail: null,
        subject: 'New order order-1',
        body: 'body',
      })
      .mockResolvedValueOnce({
        id: 'notification-1',
        recipientEmail: 'customer@example.com',
        subject: 'Order order-1 placed successfully',
        body: 'body',
      })
      .mockResolvedValueOnce({
        id: 'restaurant-email-1',
        recipientEmail: 'orders@restaurant.example',
        subject: 'New order order-1',
        body: 'body',
      });
    notificationsRepository.updateDelivery.mockResolvedValue({
      id: 'notification-1',
      status: NotificationStatus.SENT,
    });

    await service.notifyOrderPlaced('order-1');
    await Promise.resolve();

    expect(notificationsRepository.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        audience: NotificationAudience.ADMIN,
        channel: NotificationChannel.IN_APP,
        type: NotificationType.ORDER_PLACED,
      }),
    );
    expect(notificationsRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        audience: NotificationAudience.CUSTOMER,
        channel: NotificationChannel.EMAIL,
        type: NotificationType.ORDER_PLACED,
      }),
    );
    expect(notificationsRepository.create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        audience: NotificationAudience.ADMIN,
        channel: NotificationChannel.EMAIL,
        recipientEmail: 'orders@restaurant.example',
        type: NotificationType.ORDER_PLACED,
      }),
    );
    expect(mailerService.sendEmail).toHaveBeenCalledTimes(2);
    expect(notificationsRealtimeService.emitOrderCreated).toHaveBeenCalledWith({
      id: 'order-1',
      status: 'PLACED',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      orderType: 'DELIVERY',
      paymentStatus: 'PENDING',
      totalAmount: 450,
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
    });
  });

  it('returns from order placement notification without waiting for SMTP', async () => {
    let finishEmail: (() => void) | undefined;
    const delayedEmail = new Promise<void>((resolve) => {
      finishEmail = resolve;
    });
    mailerService.sendEmail.mockReturnValue(delayedEmail);
    notificationsRepository.findOrderForNotification.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      status: 'PLACED',
      orderType: 'DELIVERY',
      totalAmount: 450,
      paymentStatus: 'PENDING',
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
      customer: {
        email: 'customer@example.com',
        profile: { firstName: 'Bilal' },
      },
      branch: {
        id: 'branch-1',
        name: 'Main Branch',
        settings: null,
      },
      restaurant: { settings: null },
    });
    notificationsRepository.create
      .mockResolvedValueOnce({
        id: 'admin-notification-1',
        recipientEmail: null,
        subject: 'New order order-1',
        body: 'body',
      })
      .mockResolvedValueOnce({
        id: 'customer-notification-1',
        recipientEmail: 'customer@example.com',
        subject: 'Order order-1 placed successfully',
        body: 'body',
      });

    await expect(service.notifyOrderPlaced('order-1')).resolves.toBeUndefined();
    expect(notificationsRealtimeService.emitOrderCreated).toHaveBeenCalled();

    finishEmail?.();
    await delayedEmail;
  });

  it('prefers the branch new-order email over the restaurant fallback', async () => {
    notificationsRepository.findOrderForNotification.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      status: 'PLACED',
      orderType: 'DELIVERY',
      totalAmount: 450,
      paymentStatus: 'PENDING',
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
      customer: {
        email: 'customer@example.com',
        profile: { firstName: 'Bilal' },
      },
      branch: {
        id: 'branch-1',
        name: 'Main Branch',
        settings: {
          notificationSettings: {
            emailAddress: ' Branch@Restaurant.Example ',
            notificationTypes: { newOrder: { email: true } },
          },
        },
      },
      restaurant: {
        settings: {
          notificationSettings: {
            emailAddress: 'restaurant@example.com',
            notificationTypes: { newOrder: { email: true } },
          },
        },
      },
    });
    notificationsRepository.create.mockImplementation(
      (input: { recipientEmail?: string | null }) =>
        Promise.resolve({
          id: `notification-${input.recipientEmail ?? 'admin'}`,
          recipientEmail: input.recipientEmail ?? null,
          subject: 'subject',
          body: 'body',
        }),
    );
    notificationsRepository.updateDelivery.mockResolvedValue({});
    mailerService.sendEmail.mockResolvedValue(undefined);

    await service.notifyOrderPlaced('order-1');
    await Promise.resolve();

    expect(notificationsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: NotificationAudience.ADMIN,
        channel: NotificationChannel.EMAIL,
        recipientEmail: 'branch@restaurant.example',
      }),
    );
  });

  it('falls back to restaurant email when branch new-order email is disabled', async () => {
    notificationsRepository.findOrderForNotification.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      status: 'PLACED',
      orderType: 'DELIVERY',
      totalAmount: 450,
      paymentStatus: 'PENDING',
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
      customer: {
        email: 'customer@example.com',
        profile: { firstName: 'Bilal' },
      },
      branch: {
        id: 'branch-1',
        name: 'Main Branch',
        settings: {
          notificationSettings: {
            emailAddress: 'branch@example.com',
            notificationTypes: { newOrder: { email: false } },
          },
        },
      },
      restaurant: {
        settings: {
          notificationSettings: {
            emailAddress: 'restaurant@example.com',
            notificationTypes: { newOrder: { email: true } },
          },
        },
      },
    });
    notificationsRepository.create.mockImplementation(
      (input: { recipientEmail?: string | null }) =>
        Promise.resolve({
          id: `notification-${input.recipientEmail ?? 'admin'}`,
          recipientEmail: input.recipientEmail ?? null,
          subject: 'subject',
          body: 'body',
        }),
    );
    notificationsRepository.updateDelivery.mockResolvedValue({});
    mailerService.sendEmail.mockResolvedValue(undefined);

    await service.notifyOrderPlaced('order-1');
    await Promise.resolve();

    expect(notificationsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: NotificationAudience.ADMIN,
        channel: NotificationChannel.EMAIL,
        recipientEmail: 'restaurant@example.com',
      }),
    );
  });

  it('creates deliveryman in-app notification when assigned order status changes', async () => {
    notificationsRepository.findOrderForNotification.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      deliverymanId: 'dm-1',
      totalAmount: 450,
      status: 'OUT_FOR_DELIVERY',
      paymentStatus: 'PAID',
      customer: {
        email: 'customer@example.com',
        profile: {
          firstName: 'Bilal',
        },
      },
      branch: {
        id: 'branch-1',
        name: 'Main Branch',
      },
    });
    notificationsRepository.create
      .mockResolvedValueOnce({
        id: 'customer-notification-1',
        recipientEmail: 'customer@example.com',
        subject: 'Order order-1 is now OUT_FOR_DELIVERY',
        body: 'body',
      })
      .mockResolvedValueOnce({
        id: 'deliveryman-notification-1',
        audience: NotificationAudience.DELIVERYMAN,
        type: NotificationType.ORDER_STATUS_CHANGED,
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        deliverymanId: 'dm-1',
        recipientUserId: null,
        recipientEmail: null,
        subject: 'Order order-1 is now OUT_FOR_DELIVERY',
        body: 'body',
        payload: { orderId: 'order-1' },
      });
    notificationsRepository.updateDelivery.mockResolvedValue({
      id: 'customer-notification-1',
      status: NotificationStatus.SENT,
    });
    notificationsRepository.listPushTokensForNotification.mockResolvedValue([
      { token: 'fcm-token-1' },
    ]);

    await service.notifyOrderStatusChanged('order-1');

    expect(notificationsRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        audience: NotificationAudience.DELIVERYMAN,
        channel: NotificationChannel.IN_APP,
        type: NotificationType.ORDER_STATUS_CHANGED,
        deliveryman: { connect: { id: 'dm-1' } },
      }),
    );
    expect(pushNotificationsService.sendToTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: 'deliveryman-notification-1',
        audience: NotificationAudience.DELIVERYMAN,
        tokens: ['fcm-token-1'],
      }),
    );
  });

  it('marks notification as failed when email sending throws', async () => {
    notificationsRepository.findPaymentForNotification.mockResolvedValue({
      id: 'payment-1',
      orderId: 'order-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      amount: 600,
      currency: 'PKR',
      status: 'FAILED',
      type: 'CHARGE',
      order: {
        customerId: 'user-1',
        customer: {
          email: 'customer@example.com',
          profile: {
            firstName: 'Bilal',
          },
        },
        branch: {
          id: 'branch-1',
          name: 'Main Branch',
        },
      },
    });
    notificationsRepository.create
      .mockResolvedValueOnce({
        id: 'notification-2',
        recipientEmail: 'customer@example.com',
        subject: 'Payment update for order order-1: FAILED',
        body: 'body',
      })
      .mockResolvedValueOnce({
        id: 'admin-notification-2',
        recipientEmail: null,
        subject: 'Payment failed for order order-1',
        body: 'body',
      });
    notificationsRepository.updateDelivery.mockResolvedValue({
      id: 'notification-2',
      status: NotificationStatus.FAILED,
    });
    mailerService.sendEmail.mockRejectedValue(new Error('SMTP unavailable'));

    await service.notifyPaymentStatusChanged('payment-1');

    expect(notificationsRepository.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        audience: NotificationAudience.CUSTOMER,
        type: NotificationType.PAYMENT_FAILED,
      }),
    );
    expect(notificationsRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        audience: NotificationAudience.ADMIN,
        channel: NotificationChannel.IN_APP,
        type: NotificationType.PAYMENT_FAILED,
      }),
    );
    expect(notificationsRepository.updateDelivery).toHaveBeenCalledWith(
      'notification-2',
      expect.objectContaining({
        status: NotificationStatus.FAILED,
        errorMessage: 'SMTP unavailable',
      }),
    );
  });

  it('creates admin in-app and email notifications on table reservation request', async () => {
    notificationsRepository.listAdminEmailRecipients.mockResolvedValue([
      {
        id: 'business-admin-1',
        email: 'admin@example.com',
      },
      {
        id: 'branch-admin-1',
        email: 'branch@example.com',
      },
      {
        id: 'duplicate-admin-1',
        email: 'ADMIN@example.com',
      },
    ]);
    notificationsRepository.create
      .mockResolvedValueOnce({
        id: 'admin-in-app-1',
        recipientEmail: null,
        subject: 'New reservation request at Main Branch',
        body: 'body',
      })
      .mockResolvedValueOnce({
        id: 'admin-email-1',
        recipientEmail: 'admin@example.com',
        subject: 'New reservation request at Main Branch',
        body: 'body',
      })
      .mockResolvedValueOnce({
        id: 'admin-email-2',
        recipientEmail: 'branch@example.com',
        subject: 'New reservation request at Main Branch',
        body: 'body',
      });
    notificationsRepository.updateDelivery.mockResolvedValue({
      status: NotificationStatus.SENT,
    });

    await service.notifyTableReservationAdmin({
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      reservationId: 'reservation-1',
      branchName: 'Main Branch',
      customerId: 'customer-1',
      customerName: 'Bilal Shah',
      customerEmail: 'customer@example.com',
      reservationDate: '2099-03-30T19:30:00.000Z',
      guestCount: 4,
      status: 'REQUESTED',
    });

    expect(
      notificationsRepository.listAdminEmailRecipients,
    ).toHaveBeenCalledWith({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });
    expect(notificationsRepository.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        audience: NotificationAudience.ADMIN,
        channel: NotificationChannel.IN_APP,
        type: NotificationType.TABLE_RESERVATION_CREATED,
      }),
    );
    expect(notificationsRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        audience: NotificationAudience.ADMIN,
        channel: NotificationChannel.EMAIL,
        recipientEmail: 'admin@example.com',
        type: NotificationType.TABLE_RESERVATION_CREATED,
      }),
    );
    expect(notificationsRepository.create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        audience: NotificationAudience.ADMIN,
        channel: NotificationChannel.EMAIL,
        recipientEmail: 'branch@example.com',
        type: NotificationType.TABLE_RESERVATION_CREATED,
      }),
    );
    expect(mailerService.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('creates customer in-app notification when table reservation status changes', async () => {
    notificationsRepository.create.mockResolvedValue({
      id: 'customer-in-app-1',
      recipientEmail: null,
      subject: 'Reservation status updated at Main Branch',
      body: 'body',
    });

    await service.notifyTableReservationCustomer({
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      reservationId: 'reservation-1',
      branchName: 'Main Branch',
      customerId: 'customer-1',
      reservationDate: '2099-03-30T19:30:00.000Z',
      guestCount: 4,
      status: 'CONFIRMED',
      source: 'STATUS_UPDATED',
    });

    expect(notificationsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: NotificationAudience.CUSTOMER,
        channel: NotificationChannel.IN_APP,
        type: NotificationType.TABLE_RESERVATION_STATUS_CHANGED,
        recipientUser: { connect: { id: 'customer-1' } },
        status: NotificationStatus.SENT,
        payload: {
          reservationId: 'reservation-1',
          branchId: 'branch-1',
          branchName: 'Main Branch',
          reservationDate: '2099-03-30T19:30:00.000Z',
          guestCount: 4,
          status: 'CONFIRMED',
          source: 'STATUS_UPDATED',
        },
      }),
    );
    expect(mailerService.sendEmail).not.toHaveBeenCalled();
  });
});
