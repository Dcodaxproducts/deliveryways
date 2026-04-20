import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';
import { ListGroupOrdersDto } from './dto';

@Injectable()
export class GroupOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  readonly sessionInclude = {
    hostUser: {
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
    branch: {
      select: { id: true, name: true, logoUrl: true, coverImage: true },
    },
    restaurant: {
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        coverImage: true,
      },
    },
    deliveryAddress: {
      select: {
        id: true,
        street: true,
        area: true,
        city: true,
        state: true,
        country: true,
        lat: true,
        lng: true,
      },
    },
    finalOrder: {
      select: {
        id: true,
        status: true,
        orderType: true,
        paymentMethod: true,
        orderTime: true,
        subtotal: true,
        taxAmount: true,
        deliveryFee: true,
        discountAmount: true,
        totalAmount: true,
        paymentStatus: true,
      },
    },
    participants: {
      orderBy: [{ joinedAt: 'asc' }],
      include: {
        user: {
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
      },
    },
    items: {
      orderBy: [{ createdAt: 'asc' }],
    },
  } satisfies Prisma.GroupOrderSessionInclude;

  async createSession(
    data: Prisma.GroupOrderSessionCreateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).groupOrderSession.create({
      data,
      include: this.sessionInclude,
    });
  }

  async updateSession(
    id: string,
    data: Prisma.GroupOrderSessionUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).groupOrderSession.update({
      where: { id },
      data,
      include: this.sessionInclude,
    });
  }

  async findSessionById(id: string) {
    return this.prisma.groupOrderSession.findUnique({
      where: { id },
      include: this.sessionInclude,
    });
  }

  async findSessionByInviteCode(inviteCode: string) {
    return this.prisma.groupOrderSession.findUnique({
      where: { inviteCode },
      include: this.sessionInclude,
    });
  }

  async findActiveSessionByHost(hostUserId: string, now = new Date()) {
    return this.prisma.groupOrderSession.findFirst({
      where: {
        hostUserId,
        status: {
          in: ['OPEN', 'LOCKED'],
        },
        expiresAt: {
          gt: now,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: this.sessionInclude,
    });
  }

  async createParticipant(
    data: Prisma.GroupOrderParticipantCreateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).groupOrderParticipant.create({ data });
  }

  async updateParticipant(
    id: string,
    data: Prisma.GroupOrderParticipantUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).groupOrderParticipant.update({
      where: { id },
      data,
    });
  }

  async findParticipant(sessionId: string, userId: string) {
    return this.prisma.groupOrderParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async createItem(data: Prisma.GroupOrderItemCreateInput, tx?: PrismaTx) {
    return this.client(tx).groupOrderItem.create({ data });
  }

  async updateItem(
    id: string,
    data: Prisma.GroupOrderItemUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).groupOrderItem.update({ where: { id }, data });
  }

  async deleteItem(id: string, tx?: PrismaTx) {
    return this.client(tx).groupOrderItem.delete({ where: { id } });
  }

  async findItemById(id: string) {
    return this.prisma.groupOrderItem.findUnique({ where: { id } });
  }

  async listForUser(userId: string, query: ListGroupOrdersDto) {
    const where: Prisma.GroupOrderSessionWhereInput = {
      participants: {
        some: {
          userId,
          status: 'ACTIVE',
        },
      },
      ...(query.status ? { status: query.status } : {}),
    };

    return this.listByWhere(where, query);
  }

  async listForAdmin(
    scope: {
      tenantId?: string;
      restaurantId?: string;
    },
    query: ListGroupOrdersDto,
  ) {
    const where: Prisma.GroupOrderSessionWhereInput = {
      ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    return this.listByWhere(where, query);
  }

  private async listByWhere(
    where: Prisma.GroupOrderSessionWhereInput,
    query: ListGroupOrdersDto,
  ) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.groupOrderSession.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
        include: this.sessionInclude,
      }),
      this.prisma.groupOrderSession.count({ where }),
    ]);

    return { items, total };
  }

  async findActiveBranch(branchId: string) {
    return this.prisma.branch.findFirst({
      where: {
        id: branchId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        settings: true,
      },
    });
  }

  async findRestaurantMenuById(
    restaurantMenuId: string,
    restaurantId: string,
  ) {
    return this.prisma.restaurantMenu.findFirst({
      where: {
        id: restaurantMenuId,
        restaurantId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        isTimed: true,
        timingConfig: true,
      },
    });
  }

  async findRestaurantInTenant(restaurantId: string, tenantId: string) {
    return this.prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  async findOwnedAddress(addressId: string, tenantId: string, userId: string) {
    return this.prisma.address.findFirst({
      where: {
        id: addressId,
        tenantId,
        referenceId: userId,
        refType: 'USER',
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
  }

  async findMenuItemForSession(
    menuItemId: string,
    restaurantId: string,
    branchId: string,
  ) {
    return this.prisma.menuItem.findFirst({
      where: {
        id: menuItemId,
        restaurantId,
        deletedAt: null,
        isActive: true,
      },
      include: {
        variations: {
          where: { deletedAt: null, isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        branchOverrides: {
          where: { branchId },
          select: { priceOverride: true, isAvailable: true },
          take: 1,
        },
      },
    });
  }

  async findMenuItemsForResponse(
    menuItemIds: string[],
    restaurantId: string,
    branchId: string,
  ) {
    if (!menuItemIds.length) {
      return [];
    }

    return this.prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        restaurantId,
      },
      include: {
        category: {
          select: { id: true, name: true, imageUrl: true },
        },
        variations: {
          where: { deletedAt: null, isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        modifierLinks: {
          orderBy: [{ sortOrder: 'asc' }],
          include: {
            modifierGroup: {
              include: {
                modifiers: {
                  where: { deletedAt: null, isActive: true },
                  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                },
              },
            },
          },
        },
        branchOverrides: {
          where: { branchId },
          select: { priceOverride: true, isAvailable: true },
          take: 1,
        },
      },
    });
  }
}
