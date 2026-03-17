import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';

@Injectable()
export class CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  async findByCustomerId(customerId: string) {
    return this.prisma.cart.findUnique({
      where: { customerId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async create(data: Prisma.CartCreateInput, tx?: PrismaTx) {
    return this.client(tx).cart.create({
      data,
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async update(id: string, data: Prisma.CartUpdateInput, tx?: PrismaTx) {
    return this.client(tx).cart.update({
      where: { id },
      data,
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async deleteByCustomerId(customerId: string, tx?: PrismaTx) {
    return this.client(tx).cart.delete({
      where: { customerId },
    });
  }

  async createItem(data: Prisma.CartItemCreateInput, tx?: PrismaTx) {
    return this.client(tx).cartItem.create({ data });
  }

  async updateItem(
    id: string,
    data: Prisma.CartItemUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).cartItem.update({ where: { id }, data });
  }

  async deleteItem(id: string, tx?: PrismaTx) {
    return this.client(tx).cartItem.delete({ where: { id } });
  }

  async findItemByIdForCustomer(itemId: string, customerId: string) {
    return this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cart: {
          customerId,
        },
      },
      include: {
        cart: {
          include: {
            items: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
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
      },
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

  async findMenuItemForCart(
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
          where: {
            deletedAt: null,
            isActive: true,
          },
        },
        modifierLinks: {
          include: {
            modifierGroup: {
              include: {
                modifiers: {
                  where: {
                    deletedAt: null,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
        branchOverrides: {
          where: {
            branchId,
          },
        },
      },
    });
  }
}
