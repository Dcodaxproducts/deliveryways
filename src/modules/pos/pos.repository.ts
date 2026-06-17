import { Injectable } from '@nestjs/common';
import {
  OrderType,
  PaymentMethod,
  PosActorType,
  PosOrderDraftStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { QueryDto } from '../../common/dto';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';

@Injectable()
export class PosRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  readonly draftInclude = {
    restaurant: {
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        coverImage: true,
      },
    },
    branch: {
      select: { id: true, name: true, logoUrl: true, coverImage: true },
    },
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
    items: {
      orderBy: [{ createdAt: 'asc' }],
    },
  } satisfies Prisma.PosOrderDraftInclude;

  async findActiveBranch(branchId: string) {
    return this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null, isActive: true },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        name: true,
        coverImage: true,
        settings: true,
      },
    });
  }

  async findScopedCustomer(
    customerId: string,
    tenantId: string,
    restaurantId: string,
  ) {
    return this.prisma.user.findFirst({
      where: {
        id: customerId,
        tenantId,
        restaurantId,
        role: 'CUSTOMER',
        deletedAt: null,
        isActive: true,
      },
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
    });
  }

  async createDraft(
    data: {
      tenantId: string;
      restaurantId: string;
      branchId: string;
      createdByActorId: string;
      createdByActorType: PosActorType;
      customerId?: string;
      orderType: OrderType;
      paymentMethod?: PaymentMethod;
      guestName?: string;
      guestPhone?: string;
      tableLabel?: string;
      guestCount?: number;
      couponCode?: string;
      note?: string;
    },
    tx?: PrismaTx,
  ) {
    return this.client(tx).posOrderDraft.create({
      data,
      include: this.draftInclude,
    });
  }

  async listDrafts(
    tenantId: string | undefined,
    restaurantId: string | undefined,
    branchId: string | undefined,
    query: QueryDto & { status?: PosOrderDraftStatus; orderType?: OrderType },
  ) {
    const where: Prisma.PosOrderDraftWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(restaurantId ? { restaurantId } : {}),
      ...(branchId ? { branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.orderType ? { orderType: query.orderType } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.posOrderDraft.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
        include: this.draftInclude,
      }),
      this.prisma.posOrderDraft.count({ where }),
    ]);

    return { items, total };
  }

  async findDraftById(id: string) {
    return this.prisma.posOrderDraft.findUnique({
      where: { id },
      include: this.draftInclude,
    });
  }

  async updateDraft(
    id: string,
    data: Prisma.PosOrderDraftUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).posOrderDraft.update({
      where: { id },
      data,
      include: this.draftInclude,
    });
  }

  async findCustomerProfileMetadata(userId: string) {
    return this.prisma.profile.findUnique({
      where: { userId },
      select: { metadata: true },
    });
  }

  async upsertCustomerProfileMetadata(
    userId: string,
    metadata: Prisma.JsonObject,
    tx?: PrismaTx,
  ) {
    const existing = await this.client(tx).profile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (existing) {
      return this.client(tx).profile.update({
        where: { id: existing.id },
        data: { metadata },
      });
    }

    return this.client(tx).profile.create({
      data: {
        userId,
        firstName: 'Customer',
        lastName: 'Profile',
        metadata,
      },
    });
  }

  async createDraftItem(
    data: Prisma.PosOrderDraftItemCreateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).posOrderDraftItem.create({ data });
  }

  async updateDraftItem(
    itemId: string,
    data: Prisma.PosOrderDraftItemUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).posOrderDraftItem.update({
      where: { id: itemId },
      data,
    });
  }

  async deleteDraftItem(itemId: string, tx?: PrismaTx) {
    return this.client(tx).posOrderDraftItem.delete({ where: { id: itemId } });
  }

  async findDraftItemDetails(
    restaurantId: string,
    menuItemIds: string[],
    variationIds: string[],
  ) {
    const [menuItems, variations] = await this.prisma.$transaction([
      this.prisma.menuItem.findMany({
        where: { id: { in: menuItemIds }, restaurantId },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          imageUrl: true,
          basePrice: true,
          pricingMode: true,
          category: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
            },
          },
        },
      }),
      this.prisma.menuItemVariation.findMany({
        where: { id: { in: variationIds }, restaurantId },
        select: {
          id: true,
          name: true,
          price: true,
        },
      }),
    ]);

    return { menuItems, variations };
  }

  async findDraftItem(itemId: string, draftId: string) {
    return this.prisma.posOrderDraftItem.findFirst({
      where: { id: itemId, draftId },
      select: { id: true, draftId: true },
    });
  }
}
