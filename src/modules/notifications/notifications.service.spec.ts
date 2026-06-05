import {
  NotificationAudience,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '@prisma/client';
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
  };
  let mailerService: {
    sendEmail: jest.Mock;
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
    };
    mailerService = {
      sendEmail: jest.fn(),
    };

    service = new NotificationsService(
      notificationsRepository as never,
      mailerService as never,
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

  it('lists admin notifications for deliveryman within own branch scope', async () => {
    notificationsRepository.list.mockResolvedValue({
      items: [
        {
          id: 'notification-branch-1',
          audience: NotificationAudience.ADMIN,
          type: NotificationType.ORDER_PLACED,
          subject: 'New branch order',
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
        audience: NotificationAudience.ADMIN,
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      }),
    );
    expect(result.data[0].audience).toBe(NotificationAudience.ADMIN);
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

  it('allows deliveryman to mark branch notification as seen', async () => {
    notificationsRepository.findById.mockResolvedValue({
      id: 'notification-branch-1',
      audience: NotificationAudience.ADMIN,
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      recipientUserId: null,
      recipientEmail: null,
      channel: NotificationChannel.IN_APP,
    });
    notificationsRepository.markSeen.mockResolvedValue({
      id: 'notification-branch-1',
      seenAt: new Date('2026-03-27T10:30:00.000Z'),
    });

    const result = await service.markSeen(
      {
        uid: 'dm-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: 'DELIVERYMAN',
      } as never,
      'notification-branch-1',
    );

    expect(result.data.id).toBe('notification-branch-1');
    expect(result.data.isSeen).toBe(true);
  });

  it('creates both customer email and admin in-app notification on order placed', async () => {
    notificationsRepository.findOrderForNotification.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      totalAmount: 450,
      paymentStatus: 'PENDING',
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
        id: 'notification-1',
        recipientEmail: 'customer@example.com',
        subject: 'Order order-1 placed successfully',
        body: 'body',
      })
      .mockResolvedValueOnce({
        id: 'admin-notification-1',
        recipientEmail: null,
        subject: 'New order order-1',
        body: 'body',
      });
    notificationsRepository.updateDelivery.mockResolvedValue({
      id: 'notification-1',
      status: NotificationStatus.SENT,
    });

    await service.notifyOrderPlaced('order-1');

    expect(notificationsRepository.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        audience: NotificationAudience.CUSTOMER,
        channel: NotificationChannel.EMAIL,
        type: NotificationType.ORDER_PLACED,
      }),
    );
    expect(notificationsRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        audience: NotificationAudience.ADMIN,
        channel: NotificationChannel.IN_APP,
        type: NotificationType.ORDER_PLACED,
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
