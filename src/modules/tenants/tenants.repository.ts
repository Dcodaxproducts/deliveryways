import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database';
import { QueryDto } from '../../common/dto';
import { PrismaTx } from '../../common/types';

@Injectable()
export class TenantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  transaction<T>(callback: (tx: PrismaTx) => Promise<T>) {
    return this.prisma.$transaction(callback);
  }

  async create(data: Prisma.TenantCreateInput, tx?: PrismaTx) {
    return this.client(tx).tenant.create({ data });
  }

  async findBySlug(slug: string) {
    return this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });
  }

  async findById(id: string) {
    return this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, slug: true, isActive: true, deletedAt: true },
    });
  }

  async findDetailsById(id: string) {
    return this.prisma.tenant.findUnique({
      where: { id },
      include: {
        owner: {
          select: { isApproved: true, isVerified: true },
        },
      },
    });
  }

  async list(query: QueryDto, withDeleted = false, includeInactive = false) {
    const where: Prisma.TenantWhereInput = {
      ...(withDeleted ? {} : { deletedAt: null }),
      ...(includeInactive ? {} : { isActive: true }),
      owner: {
        role: 'BUSINESS_ADMIN',
        ...(withDeleted ? {} : { deletedAt: null }),
        ...(includeInactive ? {} : { isActive: true }),
      },
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        where,
        include: {
          owner: {
            select: { isApproved: true, isVerified: true },
          },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return { items, total };
  }

  async update(id: string, data: Prisma.TenantUpdateInput, tx?: PrismaTx) {
    return this.client(tx).tenant.update({
      where: { id },
      data,
    });
  }

  async analytics(tenantId: string) {
    const [restaurantsCount, branchesCount, activeUsers] =
      await this.prisma.$transaction([
        this.prisma.restaurant.count({ where: { tenantId, deletedAt: null } }),
        this.prisma.branch.count({ where: { tenantId, deletedAt: null } }),
        this.prisma.user.count({
          where: { tenantId, deletedAt: null, isActive: true },
        }),
      ]);

    return {
      restaurantsCount,
      branchesCount,
      activeUsers,
    };
  }

  async getDeleteSummary(tenantId: string) {
    const [restaurants, branches, users, orders, coupons, transactions] =
      await this.prisma.$transaction([
        this.prisma.restaurant.count({ where: { tenantId } }),
        this.prisma.branch.count({ where: { tenantId } }),
        this.prisma.user.count({ where: { tenantId } }),
        this.prisma.order.count({ where: { tenantId } }),
        this.prisma.coupon.count({ where: { tenantId } }),
        this.prisma.paymentTransaction.count({ where: { tenantId } }),
      ]);

    return {
      restaurants,
      branches,
      users,
      orders,
      coupons,
      transactions,
    };
  }

  async forceDelete(tenantId: string, tx?: PrismaTx) {
    return this.client(tx).tenant.delete({
      where: { id: tenantId },
    });
  }

  async forceDeleteWithRelations(tenantId: string, tx: PrismaTx) {
    await tx.tenant.update({
      where: { id: tenantId },
      data: { owner: { disconnect: true } },
    });
    await tx.branch.updateMany({
      where: { tenantId },
      data: { managerId: null },
    });

    await tx.pushDeviceToken.deleteMany({ where: { tenantId } });
    await tx.contactSubmission.deleteMany({ where: { tenantId } });
    await tx.entityTranslation.deleteMany({ where: { tenantId } });
    await tx.generatedInvoice.deleteMany({ where: { tenantId } });
    await tx.notification.deleteMany({ where: { tenantId } });
    await tx.chatMessage.deleteMany({ where: { thread: { tenantId } } });
    await tx.chatThread.deleteMany({ where: { tenantId } });

    await tx.groupOrderItem.deleteMany({
      where: { session: { tenantId } },
    });
    await tx.groupOrderParticipant.deleteMany({
      where: { session: { tenantId } },
    });
    await tx.groupOrderSession.deleteMany({ where: { tenantId } });

    await tx.posOrderDraftItem.deleteMany({
      where: { draft: { tenantId } },
    });
    await tx.posOrderDraft.deleteMany({ where: { tenantId } });

    await tx.cartItem.deleteMany({ where: { cart: { tenantId } } });
    await tx.cart.deleteMany({ where: { tenantId } });

    await tx.couponUsage.deleteMany({
      where: {
        OR: [
          { coupon: { tenantId } },
          { customer: { tenantId } },
          { order: { tenantId } },
        ],
      },
    });

    await tx.walletTransaction.deleteMany({ where: { tenantId } });
    await tx.loyaltyTransaction.deleteMany({ where: { tenantId } });
    await tx.orderItem.deleteMany({ where: { order: { tenantId } } });
    await tx.order.deleteMany({ where: { tenantId } });
    await tx.paymentTransaction.deleteMany({ where: { tenantId } });

    await tx.walletAccount.deleteMany({ where: { tenantId } });
    await tx.restaurantPayoutRequest.deleteMany({ where: { tenantId } });
    await tx.restaurantWalletTransaction.deleteMany({ where: { tenantId } });
    await tx.restaurantWalletAccount.deleteMany({ where: { tenantId } });
    await tx.loyaltyAccount.deleteMany({ where: { tenantId } });
    await tx.loyaltyProgram.deleteMany({ where: { tenantId } });
    await tx.coupon.deleteMany({ where: { tenantId } });

    await tx.inventoryMovement.deleteMany({
      where: {
        OR: [
          { inventoryItem: { restaurant: { tenantId } } },
          { branch: { tenantId } },
          { createdBy: { tenantId } },
        ],
      },
    });
    await tx.menuItemRecipe.deleteMany({
      where: {
        OR: [
          { menuItem: { restaurant: { tenantId } } },
          { inventoryItem: { restaurant: { tenantId } } },
        ],
      },
    });
    await tx.inventoryItem.deleteMany({
      where: { restaurant: { tenantId } },
    });
    await tx.inventoryCategory.deleteMany({
      where: { restaurant: { tenantId } },
    });

    await tx.restaurantMenuCategory.deleteMany({
      where: { restaurantMenu: { restaurant: { tenantId } } },
    });
    await tx.restaurantMenuItem.deleteMany({
      where: { restaurantMenu: { restaurant: { tenantId } } },
    });
    await tx.menuCategoryVariation.deleteMany({
      where: { category: { restaurant: { tenantId } } },
    });
    await tx.menuItemVariationPriceOverride.deleteMany({
      where: { menuItem: { restaurant: { tenantId } } },
    });
    await tx.menuVariationModifierPriceOverride.deleteMany({
      where: { menuItem: { restaurant: { tenantId } } },
    });
    await tx.menuCategoryModifierGroup.deleteMany({
      where: { category: { restaurant: { tenantId } } },
    });
    await tx.menuItemModifierGroup.deleteMany({
      where: { menuItem: { restaurant: { tenantId } } },
    });
    await tx.menuItemModifierPriceOverride.deleteMany({
      where: { menuItem: { restaurant: { tenantId } } },
    });
    await tx.modifierGroupModifier.deleteMany({
      where: { modifierGroup: { restaurant: { tenantId } } },
    });
    await tx.branchMenuItemOverride.deleteMany({
      where: { branch: { tenantId } },
    });
    await tx.branchCategoryOverride.deleteMany({
      where: { branch: { tenantId } },
    });

    await tx.menuItem.deleteMany({ where: { restaurant: { tenantId } } });
    await tx.menuItemVariation.deleteMany({
      where: { restaurant: { tenantId } },
    });
    await tx.modifier.deleteMany({ where: { restaurant: { tenantId } } });
    await tx.modifierGroup.deleteMany({
      where: { restaurant: { tenantId } },
    });
    await tx.restaurantMenu.deleteMany({
      where: { restaurant: { tenantId } },
    });
    await tx.menuCategory.updateMany({
      where: { restaurant: { tenantId } },
      data: { parentCategoryId: null },
    });
    await tx.menuCategory.deleteMany({ where: { restaurant: { tenantId } } });

    await tx.deliveryman.deleteMany({ where: { tenantId } });
    await tx.staffUser.deleteMany({ where: { tenantId } });
    await tx.staffRole.deleteMany({ where: { tenantId } });
    await tx.profile.deleteMany({ where: { user: { tenantId } } });
    await tx.user.deleteMany({ where: { tenantId } });

    await tx.address.deleteMany({ where: { tenantId } });
    await tx.subscriptionDeduction.deleteMany({ where: { tenantId } });
    await tx.tenantSubscription.deleteMany({ where: { tenantId } });
    await tx.packagePlan.deleteMany({ where: { tenantId } });
    await tx.branch.deleteMany({ where: { tenantId } });
    await tx.restaurant.deleteMany({ where: { tenantId } });

    return tx.tenant.delete({ where: { id: tenantId } });
  }
}
