import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database';
import { PrismaTx } from '../../../common/types';
import { ListMenuItemsDto } from './dto';

@Injectable()
export class MenuItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.MenuItemCreateInput, tx?: PrismaTx) {
    return this.client(tx).menuItem.create({ data });
  }

  async createMany(data: Prisma.MenuItemCreateManyInput[]) {
    return this.prisma.menuItem.createMany({ data });
  }

  async findById(id: string) {
    return this.prisma.menuItem.findUnique({ where: { id } });
  }

  async findByRestaurantAndSlug(
    restaurantId: string,
    slug: string,
    excludeId?: string,
  ) {
    return this.prisma.menuItem.findFirst({
      where: {
        restaurantId,
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, deletedAt: true },
    });
  }

  async findByRestaurantAndSku(
    restaurantId: string,
    sku: string,
    excludeId?: string,
  ) {
    return this.prisma.menuItem.findFirst({
      where: {
        restaurantId,
        sku,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, deletedAt: true },
    });
  }

  async list(restaurantId: string | undefined, query: ListMenuItemsDto) {
    const where: Prisma.MenuItemWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.menuId || query.menu_id
        ? {
            OR: [
              {
                menuLinks: {
                  some: {
                    restaurantMenuId: query.menuId ?? query.menu_id,
                    ...(query.includeInactive ? {} : { isActive: true }),
                  },
                },
              },
              {
                category: {
                  menuLinks: {
                    some: {
                      restaurantMenuId: query.menuId ?? query.menu_id,
                    },
                  },
                },
              },
            ],
          }
        : {}),
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.menuItem.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [
          { sortOrder: 'asc' },
          { [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc' },
        ],
        include: {
          restaurant: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
              coverImage: true,
              settings: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
              imageUrl: true,
              items: {
                where: {
                  deletedAt: null,
                  ...(query.includeInactive ? {} : { isActive: true }),
                },
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              },
              variations: {
                where: {
                  deletedAt: null,
                  ...(query.includeInactive ? {} : { isActive: true }),
                },
                include: {
                  modifierPriceOverrides: true,
                  itemPriceOverrides: true,
                },
                orderBy: { sortOrder: 'asc' },
              },
              variationLinks: {
                where: { ...(query.includeInactive ? {} : { isActive: true }) },
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
              menuLinks: {
                orderBy: [{ sortOrder: 'asc' }],
                include: {
                  restaurantMenu: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                      isActive: true,
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
                        orderBy: [
                          { sortOrder: 'asc' },
                          { modifier: { createdAt: 'asc' } },
                        ],
                        include: {
                          modifier: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          menuLinks: {
            where: { ...(query.includeInactive ? {} : { isActive: true }) },
            orderBy: [{ sortOrder: 'asc' }],
            include: {
              restaurantMenu: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  isActive: true,
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
                      modifier: { deletedAt: null },
                    },
                    include: {
                      modifier: {
                        include: {
                          itemPriceOverrides: true,
                          variationPriceOverrides: true,
                        },
                      },
                    },
                    orderBy: { sortOrder: 'asc' },
                  },
                },
              },
            },
          },
          _count: {
            select: {
              modifierLinks: true,
              menuLinks: true,
            },
          },
        },
      }),
      this.prisma.menuItem.count({ where }),
    ]);

    return {
      items: items.map((item) => {
        const categoryVariations = item.category.variationLinks.length
          ? item.category.variationLinks.map((link) => ({
              ...link.variation,
              sortOrder: link.sortOrder,
              isDefault: link.isDefault,
              isActive: link.isActive,
            }))
          : item.category.variations;
        const variations = this.resolveItemVariations(
          item.id,
          categoryVariations,
        );

        return {
          ...item,
          category: {
            ...item.category,
            variations,
          },
          variations,
          _count: {
            ...item._count,
            variations: variations.length,
          },
        };
      }),
      total,
    };
  }

  private resolveItemVariations(
    menuItemId: string,
    variations: Array<{
      price: Prisma.Decimal;
      itemPriceOverrides?: Array<{
        menuItemId: string;
        price: Prisma.Decimal;
        pickupPrice: Prisma.Decimal | null;
        displayText: string | null;
      }>;
    }>,
  ) {
    return variations.map((variation) => {
      const override = variation.itemPriceOverrides?.find(
        (itemOverride) => itemOverride.menuItemId === menuItemId,
      );

      return {
        ...variation,
        price: override?.price ?? variation.price,
        pickupPrice: override?.pickupPrice ?? null,
        displayText: override?.displayText ?? null,
      };
    });
  }

  async update(id: string, data: Prisma.MenuItemUpdateInput, tx?: PrismaTx) {
    return this.client(tx).menuItem.update({ where: { id }, data });
  }

  async softDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).menuItem.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  countOrderItems(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).orderItem.count({
      where: { menuItemId },
    });
  }

  deleteMenuLinks(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).restaurantMenuItem.deleteMany({
      where: { menuItemId },
    });
  }

  deleteModifierLinks(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).menuItemModifierGroup.deleteMany({
      where: { menuItemId },
    });
  }

  deleteBranchOverrides(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).branchMenuItemOverride.deleteMany({
      where: { menuItemId },
    });
  }

  deleteRecipes(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).menuItemRecipe.deleteMany({
      where: { menuItemId },
    });
  }

  clearCouponScopes(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).coupon.updateMany({
      where: { scopeMenuItemId: menuItemId },
      data: { scopeMenuItemId: null },
    });
  }

  hardDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).menuItem.delete({ where: { id } });
  }
}
