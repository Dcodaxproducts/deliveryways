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

  async findActiveCustomer(
    customerId: string,
    tenantId?: string,
    restaurantId?: string,
  ) {
    return this.prisma.user.findFirst({
      where: {
        id: customerId,
        ...(tenantId ? { tenantId } : {}),
        ...(restaurantId ? { restaurantId } : {}),
        role: 'CUSTOMER',
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

  async findRestaurantMenuById(restaurantMenuId: string, restaurantId: string) {
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
        items: {
          where: { isActive: true },
          select: { menuItemId: true },
        },
        categories: {
          select: { menuCategoryId: true },
        },
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
    const item = await this.prisma.menuItem.findFirst({
      where: {
        id: menuItemId,
        restaurantId,
        deletedAt: null,
        isActive: true,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            items: {
              where: {
                deletedAt: null,
                isActive: true,
              },
              select: {
                id: true,
                name: true,
                slug: true,
              },
              orderBy: [{ createdAt: 'asc' }],
            },
            variations: {
              where: {
                deletedAt: null,
                isActive: true,
              },
              include: {
                modifierPriceOverrides: true,
                itemPriceOverrides: true,
              },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
            variationLinks: {
              where: {
                isActive: true,
                variation: { deletedAt: null, isActive: true },
              },
              include: {
                variation: {
                  include: {
                    modifierPriceOverrides: true,
                    itemPriceOverrides: true,
                  },
                },
              },
              orderBy: [{ sortOrder: 'asc' }],
            },
            modifierLinks: {
              orderBy: [{ sortOrder: 'asc' }],
              include: {
                modifierGroup: {
                  include: {
                    modifierLinks: {
                      where: {
                        modifier: {
                          deletedAt: null,
                          isActive: true,
                        },
                      },
                      include: {
                        modifier: {
                          include: {
                            itemPriceOverrides: true,
                            variationPriceOverrides: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        modifierLinks: {
          include: {
            modifierGroup: {
              include: {
                modifierLinks: {
                  where: {
                    modifier: {
                      deletedAt: null,
                      isActive: true,
                    },
                  },
                  include: {
                    modifier: {
                      include: {
                        itemPriceOverrides: true,
                        variationPriceOverrides: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        modifierPriceOverrides: {
          include: {
            modifier: {
              include: {
                itemPriceOverrides: true,
                variationPriceOverrides: true,
              },
            },
          },
        },
        variationPriceOverrides: {
          include: {
            variation: {
              include: {
                modifierPriceOverrides: true,
                itemPriceOverrides: true,
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

    return item
      ? {
          ...item,
          variations: item.variationPriceOverrides.length
            ? this.resolveItemVariations(item.id, item.variationPriceOverrides)
            : this.resolveCategoryVariations(item.category),
        }
      : null;
  }

  async findSplitSectionItems(
    menuItemIds: string[],
    restaurantId: string,
    branchId: string,
    categoryId: string,
  ) {
    if (!menuItemIds.length) {
      return [];
    }

    const items = await this.prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        restaurantId,
        categoryId,
        deletedAt: null,
        isActive: true,
      },
      include: {
        modifierLinks: {
          include: {
            modifierGroup: {
              include: {
                modifierLinks: {
                  where: {
                    modifier: {
                      deletedAt: null,
                      isActive: true,
                    },
                  },
                  include: {
                    modifier: {
                      include: {
                        itemPriceOverrides: true,
                        variationPriceOverrides: true,
                      },
                    },
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
        category: {
          select: {
            id: true,
            variations: {
              where: {
                deletedAt: null,
                isActive: true,
              },
              include: {
                itemPriceOverrides: true,
              },
            },
            variationLinks: {
              where: {
                isActive: true,
                variation: { deletedAt: null, isActive: true },
              },
              include: { variation: { include: { itemPriceOverrides: true } } },
              orderBy: [{ sortOrder: 'asc' }],
            },
            modifierLinks: {
              orderBy: [{ sortOrder: 'asc' }],
              include: {
                modifierGroup: {
                  include: {
                    modifierLinks: {
                      where: {
                        modifier: {
                          deletedAt: null,
                          isActive: true,
                        },
                      },
                      include: {
                        modifier: {
                          include: {
                            itemPriceOverrides: true,
                            variationPriceOverrides: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return items;
  }

  async findMenuItemsForResponse(
    menuItemIds: string[],
    restaurantId: string,
    branchId: string,
  ) {
    if (!menuItemIds.length) {
      return [];
    }

    const items = await this.prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        restaurantId,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            items: {
              where: {
                deletedAt: null,
                isActive: true,
              },
              select: {
                id: true,
                name: true,
                slug: true,
              },
              orderBy: [{ createdAt: 'asc' }],
            },
            variations: {
              where: {
                deletedAt: null,
                isActive: true,
              },
              include: {
                modifierPriceOverrides: true,
                itemPriceOverrides: true,
              },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
            variationLinks: {
              where: {
                isActive: true,
                variation: { deletedAt: null, isActive: true },
              },
              include: {
                variation: {
                  include: {
                    modifierPriceOverrides: true,
                    itemPriceOverrides: true,
                  },
                },
              },
              orderBy: [{ sortOrder: 'asc' }],
            },
            modifierLinks: {
              orderBy: [{ sortOrder: 'asc' }],
              include: {
                modifierGroup: {
                  include: {
                    modifierLinks: {
                      where: {
                        modifier: { deletedAt: null, isActive: true },
                      },
                      include: {
                        modifier: {
                          include: {
                            itemPriceOverrides: true,
                            variationPriceOverrides: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        modifierLinks: {
          orderBy: [{ sortOrder: 'asc' }],
          include: {
            modifierGroup: {
              include: {
                modifierLinks: {
                  where: {
                    modifier: { deletedAt: null, isActive: true },
                  },
                  include: {
                    modifier: {
                      include: {
                        itemPriceOverrides: true,
                        variationPriceOverrides: true,
                      },
                    },
                  },
                  orderBy: [
                    { sortOrder: 'asc' },
                    { modifier: { createdAt: 'asc' } },
                  ],
                },
              },
            },
          },
        },
        modifierPriceOverrides: {
          include: {
            modifier: {
              include: {
                itemPriceOverrides: true,
                variationPriceOverrides: true,
              },
            },
          },
        },
        variationPriceOverrides: {
          include: {
            variation: {
              include: {
                modifierPriceOverrides: true,
                itemPriceOverrides: true,
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

    return items.map((item) => ({
      ...item,
      variations: item.variationPriceOverrides.length
        ? this.resolveItemVariations(item.id, item.variationPriceOverrides)
        : this.resolveCategoryVariations(item.category),
    }));
  }
  private resolveItemVariations(
    menuItemId: string,
    overrides: Array<{
      price: Prisma.Decimal;
      pickupPrice?: Prisma.Decimal | null;
      displayText?: string | null;
      variation: {
        id: string;
        name: string;
        description?: string | null;
        price: Prisma.Decimal;
        itemPriceOverrides?: Array<{
          menuItemId: string;
          price: Prisma.Decimal;
          pickupPrice?: Prisma.Decimal | null;
          displayText?: string | null;
        }>;
      };
    }>,
  ) {
    return overrides.map((override) => ({
      ...override.variation,
      price: override.price,
      pickupPrice: override.pickupPrice ?? null,
      displayText: override.displayText ?? null,
      itemPriceOverrides: [{ ...override, menuItemId }],
    }));
  }

  private resolveCategoryVariations(category: {
    variations: Array<{
      id: string;
      name: string;
      description?: string | null;
      price: Prisma.Decimal;
      itemPriceOverrides?: Array<{
        menuItemId: string;
        price: Prisma.Decimal;
        pickupPrice?: Prisma.Decimal | null;
        displayText?: string | null;
      }>;
    }>;
    variationLinks?: Array<{
      sortOrder: number;
      isDefault: boolean;
      isActive: boolean;
      variation: {
        id: string;
        name: string;
        description?: string | null;
        price: Prisma.Decimal;
        itemPriceOverrides?: Array<{
          menuItemId: string;
          price: Prisma.Decimal;
          pickupPrice?: Prisma.Decimal | null;
          displayText?: string | null;
        }>;
      };
    }>;
  }) {
    return category.variationLinks?.length
      ? category.variationLinks.map((link) => ({
          ...link.variation,
          sortOrder: link.sortOrder,
          isDefault: link.isDefault,
          isActive: link.isActive,
        }))
      : category.variations;
  }
}
