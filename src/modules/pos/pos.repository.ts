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
import { lockCartMenuItems } from '../../common/utils/cart-menu-lock.util';

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

  async updateOpenDraft(
    id: string,
    expectedUpdatedAt: Date,
    data: Prisma.PosOrderDraftUncheckedUpdateManyInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.posOrderDraft.updateMany({
        where: {
          id,
          status: PosOrderDraftStatus.OPEN,
          checkoutClaimToken: null,
          updatedAt: expectedUpdatedAt,
        },
        data: { ...data, updatedAt: new Date() },
      });
      if (updated.count !== 1) return null;
      return tx.posOrderDraft.findUnique({
        where: { id },
        include: this.draftInclude,
      });
    });
  }

  async createDraftItemIfOpen(
    draftId: string,
    expectedUpdatedAt: Date,
    data: Omit<Prisma.PosOrderDraftItemUncheckedCreateInput, 'draftId'>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.posOrderDraft.updateMany({
        where: {
          id: draftId,
          status: PosOrderDraftStatus.OPEN,
          checkoutClaimToken: null,
          updatedAt: expectedUpdatedAt,
        },
        data: { updatedAt: new Date() },
      });
      if (claimed.count !== 1) return null;
      return tx.posOrderDraftItem.create({ data: { ...data, draftId } });
    });
  }

  async updateDraftItemIfOpen(
    draftId: string,
    expectedUpdatedAt: Date,
    itemId: string,
    data: Prisma.PosOrderDraftItemUpdateManyMutationInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.posOrderDraft.updateMany({
        where: {
          id: draftId,
          status: PosOrderDraftStatus.OPEN,
          checkoutClaimToken: null,
          updatedAt: expectedUpdatedAt,
        },
        data: { updatedAt: new Date() },
      });
      if (claimed.count !== 1) return null;
      const updated = await tx.posOrderDraftItem.updateMany({
        where: { id: itemId, draftId },
        data,
      });
      return updated.count === 1;
    });
  }

  async deleteDraftItemIfOpen(
    draftId: string,
    expectedUpdatedAt: Date,
    itemId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.posOrderDraft.updateMany({
        where: {
          id: draftId,
          status: PosOrderDraftStatus.OPEN,
          checkoutClaimToken: null,
          updatedAt: expectedUpdatedAt,
        },
        data: { updatedAt: new Date() },
      });
      if (claimed.count !== 1) return null;
      const deleted = await tx.posOrderDraftItem.deleteMany({
        where: { id: itemId, draftId },
      });
      return deleted.count === 1;
    });
  }

  async claimCheckout(input: {
    id: string;
    tenantId: string;
    restaurantId: string;
    branchId: string;
    requestHash: string;
    claimToken: string;
    expectedUpdatedAt: Date;
    claimedAt: Date;
    leaseExpiresAt: Date;
    menuItemIds?: string[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      await lockCartMenuItems(tx, input.menuItemIds ?? []);
      const scope = {
        id: input.id,
        tenantId: input.tenantId,
        restaurantId: input.restaurantId,
        branchId: input.branchId,
      };
      const claimed = await tx.posOrderDraft.updateMany({
        where: {
          ...scope,
          OR: [
            {
              status: PosOrderDraftStatus.OPEN,
              checkoutClaimToken: null,
              updatedAt: input.expectedUpdatedAt,
            },
            {
              status: PosOrderDraftStatus.OPEN,
              checkoutRequestHash: input.requestHash,
              checkoutLeaseExpiresAt: { lte: input.claimedAt },
            },
          ],
        },
        data: {
          status: PosOrderDraftStatus.OPEN,
          checkoutRequestHash: input.requestHash,
          checkoutClaimToken: input.claimToken,
          checkoutClaimedAt: input.claimedAt,
          checkoutLeaseExpiresAt: input.leaseExpiresAt,
          checkoutAttempt: { increment: 1 },
        },
      });
      const draft = await tx.posOrderDraft.findFirst({
        where: scope,
        include: this.draftInclude,
      });
      if (!draft) return { state: 'MISSING' as const };
      if (claimed.count === 1) return { state: 'CLAIMED' as const, draft };
      if (
        draft.checkoutRequestHash &&
        draft.checkoutRequestHash !== input.requestHash
      ) {
        return { state: 'HASH_MISMATCH' as const, draft };
      }
      if (
        draft.status === PosOrderDraftStatus.CHECKED_OUT &&
        draft.finalOrderId
      ) {
        return { state: 'FINALIZED' as const, draft };
      }
      if (
        draft.status === PosOrderDraftStatus.OPEN &&
        draft.checkoutClaimToken
      ) {
        return { state: 'BUSY' as const, draft };
      }
      if (draft.status === PosOrderDraftStatus.CANCELLED) {
        return { state: 'CANCELLED' as const, draft };
      }
      return { state: 'RETRY' as const, draft };
    });
  }

  async finalizeCheckout(input: {
    id: string;
    tenantId: string;
    restaurantId: string;
    requestHash: string;
    claimToken: string;
    finalOrderId: string;
    checkedOutAt: Date;
  }) {
    const scope = {
      id: input.id,
      tenantId: input.tenantId,
      restaurantId: input.restaurantId,
    };
    const finalized = await this.prisma.posOrderDraft.updateMany({
      where: {
        ...scope,
        status: PosOrderDraftStatus.OPEN,
        checkoutRequestHash: input.requestHash,
        checkoutClaimToken: input.claimToken,
      },
      data: {
        status: PosOrderDraftStatus.CHECKED_OUT,
        finalOrderId: input.finalOrderId,
        checkedOutAt: input.checkedOutAt,
        checkoutClaimToken: null,
        checkoutLeaseExpiresAt: null,
      },
    });
    const draft = await this.prisma.posOrderDraft.findFirst({
      where: scope,
      include: this.draftInclude,
    });
    if (
      finalized.count === 1 ||
      (draft?.status === PosOrderDraftStatus.CHECKED_OUT &&
        draft.checkoutRequestHash === input.requestHash &&
        draft.finalOrderId === input.finalOrderId)
    ) {
      return draft;
    }
    return null;
  }

  async recoverFinalizedCheckout(input: {
    id: string;
    tenantId: string;
    restaurantId: string;
    requestHash: string;
    finalOrderId: string;
    checkedOutAt: Date;
  }) {
    await this.prisma.posOrderDraft.updateMany({
      where: {
        id: input.id,
        tenantId: input.tenantId,
        restaurantId: input.restaurantId,
        checkoutRequestHash: input.requestHash,
        status: PosOrderDraftStatus.OPEN,
      },
      data: {
        status: PosOrderDraftStatus.CHECKED_OUT,
        finalOrderId: input.finalOrderId,
        checkedOutAt: input.checkedOutAt,
        checkoutClaimToken: null,
        checkoutLeaseExpiresAt: null,
      },
    });
    return this.prisma.posOrderDraft.findFirst({
      where: {
        id: input.id,
        tenantId: input.tenantId,
        restaurantId: input.restaurantId,
        checkoutRequestHash: input.requestHash,
        status: PosOrderDraftStatus.CHECKED_OUT,
        finalOrderId: input.finalOrderId,
      },
      include: this.draftInclude,
    });
  }

  async releaseCheckoutClaim(input: {
    id: string;
    requestHash: string;
    claimToken: string;
  }) {
    return this.prisma.posOrderDraft.updateMany({
      where: {
        id: input.id,
        status: PosOrderDraftStatus.OPEN,
        checkoutRequestHash: input.requestHash,
        checkoutClaimToken: input.claimToken,
      },
      data: {
        status: PosOrderDraftStatus.OPEN,
        checkoutClaimToken: null,
        checkoutClaimedAt: null,
        checkoutLeaseExpiresAt: null,
      },
    });
  }

  async attachDraftCustomerIfMissing(id: string, customerId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.posOrderDraft.updateMany({
        where: { id, customerId: null },
        data: { customerId },
      });
      return tx.posOrderDraft.findUnique({
        where: { id },
        select: { customerId: true },
      });
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
