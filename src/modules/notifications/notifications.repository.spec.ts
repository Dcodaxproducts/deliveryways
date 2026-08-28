import { NotificationsRepository } from './notifications.repository';
import {
  NotificationAudience,
  NotificationChannel,
  NotificationType,
  OrderStatus,
} from '@prisma/client';

describe('NotificationsRepository', () => {
  it('claims tenant pending orders atomically and returns only rows won by this caller', async () => {
    const claimedNotification = {
      id: 'notification-1',
      order: { id: 'order-1' },
    };
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 'notification-1' },
        { id: 'notification-2' },
      ])
      .mockResolvedValueOnce([claimedNotification]);
    const updateManyAndReturn = jest
      .fn()
      .mockResolvedValue([{ id: 'notification-1' }]);
    const transactionClient = {
      notification: { findMany, updateManyAndReturn },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
          callback(transactionClient),
      ),
    };
    const repository = new NotificationsRepository(prisma as never);

    const result = await repository.claimPendingOrderNotifications({
      userId: 'business-admin-1',
      tenantId: 'tenant-1',
    });

    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: {
        audience: NotificationAudience.ADMIN,
        channel: NotificationChannel.IN_APP,
        type: NotificationType.ORDER_PLACED,
        tenantId: 'tenant-1',
        recipientUserId: null,
        seenAt: null,
        order: {
          status: {
            in: [OrderStatus.PAYMENT_PENDING, OrderStatus.PLACED],
          },
        },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    expect(updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        id: { in: ['notification-1', 'notification-2'] },
        recipientUserId: null,
      },
      data: { recipientUserId: 'business-admin-1' },
      select: { id: true },
    });
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: { in: ['notification-1'] },
          recipientUserId: 'business-admin-1',
        },
      }),
    );
    expect(result).toEqual([claimedNotification]);
  });
});
