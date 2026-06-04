import { Injectable } from '@nestjs/common';
import {
  Notification,
  NotificationAudience,
  NotificationStatus,
  NotificationType,
  Prisma,
  PrismaClient,
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
            status: true,
            paymentStatus: true,
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
        branch: {
          select: {
            id: true,
            name: true,
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
    allowedTypes?: NotificationType[];
    query: ListNotificationsDto;
  }): Prisma.NotificationWhereInput {
    const {
      audience,
      restaurantId,
      branchId,
      recipientUserId,
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
              status: true,
              paymentStatus: true,
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
}
