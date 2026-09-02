import { Injectable } from '@nestjs/common';
import {
  Notification,
  NotificationAudience,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  OrderStatus,
  Prisma,
  PrismaClient,
  PushPlatform,
  UserRole,
} from '@prisma/client';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';
import { ListNotificationsDto } from './dto';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.NotificationCreateInput, tx?: PrismaTx) {
    return this.client(tx).notification.create({
      data,
      include: {
        order: {
          select: {
            id: true,
            status: true,
            paymentStatus: true,
          },
        },
        paymentTransaction: {
          select: {
            id: true,
            status: true,
            type: true,
            amount: true,
            currency: true,
          },
        },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.notification.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            customerId: true,
            restaurantId: true,
            branchId: true,
            deliverymanId: true,
            status: true,
            paymentStatus: true,
            totalAmount: true,
          },
        },
        paymentTransaction: {
          select: {
            id: true,
            orderId: true,
            status: true,
            type: true,
            amount: true,
            currency: true,
          },
        },
      },
    });
  }

  async findOrderForNotification(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: {
          include: {
            profile: true,
          },
        },
        deliveryAddress: true,
        deliveryman: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            settings: true,
          },
        },
        restaurant: {
          select: {
            settings: true,
          },
        },
        items: {
          select: {
            menuItemName: true,
            variationName: true,
            unitPrice: true,
            quantity: true,
            lineTotal: true,
            note: true,
            snapshotModifiers: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  }

  async findPaymentForNotification(id: string) {
    return this.prisma.paymentTransaction.findUnique({
      where: { id },
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
  }

  buildWhere(input: {
    audience: NotificationAudience;
    restaurantId?: string;
    branchId?: string;
    recipientUserId?: string;
    deliverymanId?: string;
    allowedTypes?: NotificationType[];
    query: ListNotificationsDto;
  }): Prisma.NotificationWhereInput {
    const {
      audience,
      restaurantId,
      branchId,
      recipientUserId,
      deliverymanId,
      allowedTypes,
      query,
    } = input;

    return {
      audience,
      ...(restaurantId ? { restaurantId } : {}),
      ...(branchId ? { branchId } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.paymentTransactionId
        ? { paymentTransactionId: query.paymentTransactionId }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(recipientUserId ? { recipientUserId } : {}),
      ...(deliverymanId ? { deliverymanId } : {}),
      ...(allowedTypes?.length ? { type: { in: allowedTypes } } : {}),
      ...(query.seen === undefined
        ? {}
        : query.seen
          ? { seenAt: { not: null } }
          : { seenAt: null }),
      ...(query.search
        ? {
            OR: [
              {
                recipientEmail: { contains: query.search, mode: 'insensitive' },
              },
              { subject: { contains: query.search, mode: 'insensitive' } },
              { body: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  async list(
    where: Prisma.NotificationWhereInput,
    query: ListNotificationsDto,
  ) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
        include: {
          order: {
            select: {
              id: true,
              customerId: true,
              restaurantId: true,
              branchId: true,
              deliverymanId: true,
              status: true,
              paymentStatus: true,
              totalAmount: true,
            },
          },
          paymentTransaction: {
            select: {
              id: true,
              orderId: true,
              status: true,
              type: true,
              amount: true,
              currency: true,
            },
          },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { items, total };
  }

  async countSummary(where: Prisma.NotificationWhereInput) {
    const [total, unseen] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, seenAt: null } }),
    ]);

    return {
      total,
      unseen,
      seen: total - unseen,
    };
  }

  async markSeen(id: string, tx?: PrismaTx) {
    return this.client(tx).notification.update({
      where: { id },
      data: {
        seenAt: new Date(),
      },
    });
  }

  async markAllSeen(where: Prisma.NotificationWhereInput, tx?: PrismaTx) {
    return this.client(tx).notification.updateMany({
      where: {
        ...where,
        seenAt: null,
      },
      data: {
        seenAt: new Date(),
      },
    });
  }

  async claimPendingOrderNotifications(input: {
    userId: string;
    tenantId: string;
    restaurantId?: string;
    branchId?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const candidates = await tx.notification.findMany({
        where: {
          audience: NotificationAudience.ADMIN,
          channel: NotificationChannel.IN_APP,
          type: NotificationType.ORDER_PLACED,
          tenantId: input.tenantId,
          ...(input.restaurantId ? { restaurantId: input.restaurantId } : {}),
          ...(input.branchId ? { branchId: input.branchId } : {}),
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
      const ids = candidates.map(({ id }) => id);

      if (!ids.length) return [];

      const claimed = await tx.notification.updateManyAndReturn({
        where: { id: { in: ids }, recipientUserId: null },
        data: { recipientUserId: input.userId },
        select: { id: true },
      });
      const claimedIds = claimed.map(({ id }) => id);

      if (!claimedIds.length) return [];

      return tx.notification.findMany({
        where: { id: { in: claimedIds }, recipientUserId: input.userId },
        include: {
          order: {
            select: {
              id: true,
              tenantId: true,
              customerId: true,
              restaurantId: true,
              branchId: true,
              deliverymanId: true,
              status: true,
              paymentStatus: true,
              totalAmount: true,
            },
          },
          paymentTransaction: {
            select: {
              id: true,
              orderId: true,
              status: true,
              type: true,
              amount: true,
              currency: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  async updateDelivery(
    id: string,
    payload: {
      status: NotificationStatus;
      sentAt?: Date | null;
      failedAt?: Date | null;
      errorMessage?: string | null;
    },
    tx?: PrismaTx,
  ): Promise<Notification> {
    return this.client(tx).notification.update({
      where: { id },
      data: {
        status: payload.status,
        sentAt: payload.sentAt,
        failedAt: payload.failedAt,
        errorMessage: payload.errorMessage,
      },
    });
  }

  async listAdminEmailRecipients(input: {
    restaurantId: string;
    branchId: string;
  }) {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          {
            role: UserRole.BUSINESS_ADMIN,
            restaurantId: input.restaurantId,
          },
          {
            role: UserRole.BRANCH_ADMIN,
            branchId: input.branchId,
          },
        ],
      },
      select: {
        id: true,
        email: true,
      },
    });
  }

  async upsertPushToken(input: {
    token: string;
    platform: PushPlatform;
    tenantId?: string;
    restaurantId?: string;
    branchId?: string;
    userId?: string;
    deliverymanId?: string;
    deviceId?: string;
    appPackageName?: string;
  }) {
    return this.prisma.pushDeviceToken.upsert({
      where: { token: input.token },
      create: {
        token: input.token,
        platform: input.platform,
        tenantId: input.tenantId,
        restaurantId: input.restaurantId,
        branchId: input.branchId,
        userId: input.userId,
        deliverymanId: input.deliverymanId,
        deviceId: input.deviceId,
        appPackageName: input.appPackageName,
        isActive: true,
        lastSeenAt: new Date(),
      },
      update: {
        platform: input.platform,
        tenantId: input.tenantId,
        restaurantId: input.restaurantId,
        branchId: input.branchId,
        userId: input.userId,
        deliverymanId: input.deliverymanId,
        deviceId: input.deviceId,
        appPackageName: input.appPackageName,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });
  }

  async deactivatePushToken(token: string) {
    return this.prisma.pushDeviceToken.updateMany({
      where: { token },
      data: {
        isActive: false,
      },
    });
  }

  async deactivatePushTokenForOwner(input: {
    token: string;
    userId?: string;
    deliverymanId?: string;
  }) {
    return this.prisma.pushDeviceToken.updateMany({
      where: {
        token: input.token,
        ...(input.deliverymanId
          ? { deliverymanId: input.deliverymanId }
          : { userId: input.userId }),
      },
      data: {
        isActive: false,
      },
    });
  }

  async listPushTokensForNotification(input: {
    audience: NotificationAudience;
    tenantId: string;
    restaurantId: string;
    branchId: string;
    recipientUserId?: string | null;
    deliverymanId?: string | null;
  }) {
    if (input.audience === NotificationAudience.CUSTOMER) {
      if (!input.recipientUserId) {
        return [];
      }

      return this.prisma.pushDeviceToken.findMany({
        where: {
          userId: input.recipientUserId,
          isActive: true,
          platform: PushPlatform.ANDROID,
        },
        select: { token: true },
      });
    }

    if (input.audience === NotificationAudience.DELIVERYMAN) {
      if (!input.deliverymanId) {
        return [];
      }

      return this.prisma.pushDeviceToken.findMany({
        where: {
          deliverymanId: input.deliverymanId,
          isActive: true,
          platform: PushPlatform.ANDROID,
        },
        select: { token: true },
      });
    }

    const adminUsers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          {
            role: UserRole.BUSINESS_ADMIN,
            tenantId: input.tenantId,
          },
          {
            role: UserRole.BRANCH_ADMIN,
            branchId: input.branchId,
          },
        ],
      },
      select: {
        id: true,
      },
    });
    const adminUserIds = adminUsers.map((user) => user.id);

    if (!adminUserIds.length) {
      return [];
    }

    return this.prisma.pushDeviceToken.findMany({
      where: {
        userId: { in: adminUserIds },
        isActive: true,
        platform: PushPlatform.ANDROID,
      },
      select: { token: true },
    });
  }
}
