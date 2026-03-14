import { NotificationStatus, NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    order: { findUnique: jest.Mock };
    paymentTransaction: { findUnique: jest.Mock };
  };
  let notificationsRepository: {
    create: jest.Mock;
    updateDelivery: jest.Mock;
    list: jest.Mock;
    findById: jest.Mock;
  };
  let mailerService: {
    sendEmail: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      order: { findUnique: jest.fn() },
      paymentTransaction: { findUnique: jest.fn() },
    };
    notificationsRepository = {
      create: jest.fn(),
      updateDelivery: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
    };
    mailerService = {
      sendEmail: jest.fn(),
    };

    service = new NotificationsService(
      prisma as never,
      notificationsRepository as never,
      mailerService as never,
    );
  });

  it('creates and marks order placed notifications as sent', async () => {
    prisma.order.findUnique.mockResolvedValue({
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
    notificationsRepository.create.mockResolvedValue({
      id: 'notification-1',
      recipientEmail: 'customer@example.com',
      subject: 'Order order-1 placed successfully',
      body: 'body',
    });
    notificationsRepository.updateDelivery.mockResolvedValue({
      id: 'notification-1',
      status: NotificationStatus.SENT,
    });

    await service.notifyOrderPlaced('order-1');

    expect(notificationsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.ORDER_PLACED,
        recipientEmail: 'customer@example.com',
      }),
    );
    expect(mailerService.sendEmail).toHaveBeenCalledWith(
      'customer@example.com',
      'Order order-1 placed successfully',
      'body',
    );
    expect(notificationsRepository.updateDelivery).toHaveBeenCalledWith(
      'notification-1',
      expect.objectContaining({
        status: NotificationStatus.SENT,
      }),
    );
  });

  it('marks notification as failed when email sending throws', async () => {
    prisma.paymentTransaction.findUnique.mockResolvedValue({
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
    notificationsRepository.create.mockResolvedValue({
      id: 'notification-2',
      recipientEmail: 'customer@example.com',
      subject: 'Payment update for order order-1: FAILED',
      body: 'body',
    });
    notificationsRepository.updateDelivery.mockResolvedValue({
      id: 'notification-2',
      status: NotificationStatus.FAILED,
    });
    mailerService.sendEmail.mockRejectedValue(new Error('SMTP unavailable'));

    await service.notifyPaymentStatusChanged('payment-1');

    expect(notificationsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
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
});
