import { NotificationsRepository } from './notifications.repository';
import {
  NotificationAudience,
  NotificationChannel,
  NotificationType,
  OrderStatus,
  PushPlatform,
  UserRole,
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
        { id: 'notification-1', recipientUserId: null },
        { id: 'notification-2', recipientUserId: 'business-admin-1' },
      ])
      .mockResolvedValueOnce([
        claimedNotification,
        { id: 'notification-2', order: { id: 'order-2' } },
      ]);
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
        OR: [
          { recipientUserId: null },
          { recipientUserId: 'business-admin-1' },
        ],
        seenAt: null,
        order: {
          status: {
            in: [OrderStatus.PAYMENT_PENDING, OrderStatus.PLACED],
          },
        },
      },
      select: { id: true, recipientUserId: true },
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
          id: { in: ['notification-1', 'notification-2'] },
          recipientUserId: 'business-admin-1',
        },
      }),
    );
    expect(result).toEqual([
      claimedNotification,
      { id: 'notification-2', order: { id: 'order-2' } },
    ]);
  });

  it('selects tenant Business Admins and branch-scoped Branch Admins for admin push', async () => {
    const findUsers = jest
      .fn()
      .mockResolvedValue([
        { id: 'business-admin-1' },
        { id: 'branch-admin-1' },
      ]);
    const findTokens = jest
      .fn()
      .mockResolvedValue([
        { token: 'business-admin-token' },
        { token: 'branch-admin-token' },
      ]);
    const repository = new NotificationsRepository({
      user: { findMany: findUsers },
      pushDeviceToken: { findMany: findTokens },
    } as never);

    const result = await repository.listPushTokensForNotification({
      audience: NotificationAudience.ADMIN,
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });

    expect(findUsers).toHaveBeenCalledWith({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          {
            role: UserRole.BUSINESS_ADMIN,
            tenantId: 'tenant-1',
          },
          {
            role: UserRole.BRANCH_ADMIN,
            branchId: 'branch-1',
          },
        ],
      },
      select: { id: true },
    });
    expect(findTokens).toHaveBeenCalledWith({
      where: {
        userId: { in: ['business-admin-1', 'branch-admin-1'] },
        isActive: true,
        platform: PushPlatform.ANDROID,
      },
      select: { token: true },
    });
    expect(result).toEqual([
      { token: 'business-admin-token' },
      { token: 'branch-admin-token' },
    ]);
  });
});
