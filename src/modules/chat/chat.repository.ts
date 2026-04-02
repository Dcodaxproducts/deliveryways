import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';
import { ListChatThreadsDto } from './dto';

@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  readonly threadInclude = {
    customer: {
      select: {
        id: true,
        email: true,
        isGuest: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
    },
    order: {
      select: {
        id: true,
        status: true,
        orderType: true,
        paymentStatus: true,
        totalAmount: true,
        createdAt: true,
      },
    },
    branch: {
      select: {
        id: true,
        name: true,
      },
    },
    assignedStaff: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        panelType: true,
      },
    },
    deliveryman: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
      },
    },
  } satisfies Prisma.ChatThreadInclude;

  readonly messageInclude = {
    senderUser: {
      select: {
        id: true,
        role: true,
        email: true,
        isGuest: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    },
    senderStaffUser: {
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        panelType: true,
      },
    },
    senderDeliveryman: {
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
      },
    },
  } satisfies Prisma.ChatMessageInclude;

  async createThread(data: Prisma.ChatThreadCreateInput, tx?: PrismaTx) {
    return this.client(tx).chatThread.create({
      data,
      include: this.threadInclude,
    });
  }

  async createMessage(data: Prisma.ChatMessageCreateInput, tx?: PrismaTx) {
    return this.client(tx).chatMessage.create({
      data,
      include: this.messageInclude,
    });
  }

  async findThreadById(id: string) {
    return this.prisma.chatThread.findUnique({
      where: { id },
      include: {
        ...this.threadInclude,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: this.messageInclude,
        },
      },
    });
  }

  async findOpenOrderThread(orderId: string, customerId: string) {
    return this.prisma.chatThread.findFirst({
      where: {
        orderId,
        customerId,
        status: {
          in: ['OPEN', 'IN_PROGRESS'],
        },
      },
      include: this.threadInclude,
    });
  }

  async findDeliveryThreadByOrder(orderId: string) {
    return this.prisma.chatThread.findFirst({
      where: {
        orderId,
        source: 'DELIVERY',
      },
      include: this.threadInclude,
    });
  }

  buildWhere(input: {
    query: ListChatThreadsDto;
    tenantId?: string;
    restaurantId?: string;
    branchId?: string;
    customerId?: string;
    deliverymanId?: string;
    allowAssignedStaffUserId?: boolean;
    unreadOnlyFor?: 'customer' | 'staff';
  }): Prisma.ChatThreadWhereInput {
    const {
      query,
      tenantId,
      restaurantId,
      branchId,
      customerId,
      deliverymanId,
      allowAssignedStaffUserId,
      unreadOnlyFor,
    } = input;

    const unreadCondition =
      unreadOnlyFor === 'customer'
        ? { customerUnreadCount: { gt: 0 } }
        : unreadOnlyFor === 'staff'
          ? { staffUnreadCount: { gt: 0 } }
          : {};

    return {
      ...(tenantId ? { tenantId } : {}),
      ...(restaurantId ? { restaurantId } : {}),
      ...(branchId ? { branchId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(deliverymanId ? { deliverymanId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(allowAssignedStaffUserId && query.assignedStaffUserId
        ? { assignedStaffUserId: query.assignedStaffUserId }
        : {}),
      ...(query.search
        ? {
            OR: [
              { id: { contains: query.search, mode: 'insensitive' } },
              { subject: { contains: query.search, mode: 'insensitive' } },
              {
                customer: {
                  email: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                customer: {
                  profile: {
                    OR: [
                      {
                        firstName: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                      {
                        lastName: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
      ...(query.unreadOnly ? unreadCondition : {}),
    };
  }

  async list(where: Prisma.ChatThreadWhereInput, query: ListChatThreadsDto) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.chatThread.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
        include: {
          ...this.threadInclude,
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: this.messageInclude,
          },
        },
      }),
      this.prisma.chatThread.count({ where }),
    ]);

    return { items, total };
  }

  async updateThread(
    id: string,
    data: Prisma.ChatThreadUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).chatThread.update({
      where: { id },
      data,
      include: this.threadInclude,
    });
  }

  async count(where: Prisma.ChatThreadWhereInput) {
    return this.prisma.chatThread.count({ where });
  }
}
