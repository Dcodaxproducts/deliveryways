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

  private resolveListOrderBy(
    query: ListMenuItemsDto,
  ): Prisma.MenuItemOrderByWithRelationInput[] {
    const direction = query.sortOrder.toLowerCase() as 'asc' | 'desc';

    if (query.sortBy === 'sortOrder') {
      return [{ sortOrder: direction }, { createdAt: 'desc' }];
    }

    return [
      { sortOrder: 'asc' },
      { [query.sortBy]: direction },
    ] as Prisma.MenuItemOrderByWithRelationInput[];
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
    const menuId = query.menuId ?? query.menu_id;
    const andFilters: Prisma.MenuItemWhereInput[] = [];

    if (query.categoryId) {
      andFilters.push({
        OR: [
          { categoryId: query.categoryId },
          { categoryLinks: { some: { menuCategoryId: query.categoryId } } },
        ],
      });
    }

    if (menuId) {
      andFilters.push({
        OR: [
          {
            menuLinks: {
              some: {
                restaurantMenuId: menuId,
                ...(query.includeInactive ? {} : { isActive: true }),
              },
            },
          },
          {
            category: {
              menuLinks: { some: { restaurantMenuId: menuId } },
            },
          },
          {
            categoryLinks: {
              some: {
                menuCategory: {
                  menuLinks: { some: { restaurantMenuId: menuId } },
                },
              },
            },
          },
        ],
      });
    }

    if (query.search) {
      andFilters.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { slug: { contains: query.search, mode: 'insensitive' } },
          { sku: { contains: query.search, mode: 'insensitive' } },
          {
            category: {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { slug: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          },
          {
            categoryLinks: {
              some: {
                menuCategory: {
                  OR: [
                    {
                      name: { contains: query.search, mode: 'insensitive' },
                    },
                    {
                      slug: { contains: query.search, mode: 'insensitive' },
                    },
                  ],
                },
              },
            },
          },
        ],
      });
    }

    const where: Prisma.MenuItemWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
      ...this.resolveActiveFilter(query),
      ...(query.supportsSplitPizza
        ? { dietaryFlags: { array_contains: ['__SPLIT_PIZZA_ENABLED__'] } }
        : {}),
      ...(andFilters.length ? { AND: andFilters } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.menuItem.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: this.resolveListOrderBy(query),
        include: {
          restaurant: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
              coverImage: true,
              settings: true,
              tenant: { select: { settings: true } },
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
                          modifier: {
                            include: {
                              category: true,
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
          categoryLinks: {
            orderBy: [{ sortOrder: 'asc' }],
            include: {
              menuCategory: {
                select: { id: true, name: true, slug: true, imageUrl: true },
              },
            },
          },
          cuisineLinks: {
            orderBy: [{ sortOrder: 'asc' }],
            include: {
              cuisine: {
                select: { id: true, name: true, slug: true, imageUrl: true },
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
                          category: true,
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
          modifierPriceOverrides: {
            include: {
              modifier: {
                include: {
                  itemPriceOverrides: true,
                  variationPriceOverrides: true,
                },
              },
            },
            orderBy: [{ modifier: { sortOrder: 'asc' } }],
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
            orderBy: [{ variation: { sortOrder: 'asc' } }],
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
        const itemVariations = item.variationPriceOverrides.length
          ? item.variationPriceOverrides.map((override) => ({
              ...override.variation,
              itemPriceOverrides: [override],
            }))
          : item.category.variationLinks.length
            ? item.category.variationLinks.map((link) => ({
                ...link.variation,
                sortOrder: link.sortOrder,
                isDefault: link.isDefault,
                isActive: link.isActive,
              }))
            : item.category.variations;
        const variations = this.resolveItemVariations(item.id, itemVariations);
        const modifiers = this.resolveItemModifiers(
          item.modifierPriceOverrides,
        );
        const modifierGroups = this.resolveItemModifierGroups(
          item.modifierLinks,
        );

        return {
          ...item,
          categories: item.categoryLinks.map((link) => link.menuCategory),
          categoryIds: item.categoryLinks.map((link) => link.menuCategoryId),
          cuisines: item.cuisineLinks.map((link) => link.cuisine),
          cuisineIds: item.cuisineLinks.map((link) => link.cuisineId),
          category: {
            ...item.category,
            variations,
          },
          variations,
          modifiers,
          modifierGroups,
          _count: {
            ...item._count,
            variations: variations.length,
            modifiers: modifiers.length,
            modifierGroups: modifierGroups.length,
          },
        };
      }),
      total,
    };
  }

  private resolveActiveFilter(query: ListMenuItemsDto) {
    if (query.inactive) {
      return { isActive: false };
    }

    if (query.all || query.includeInactive) {
      return {};
    }

    return { isActive: true };
  }

  private resolveItemModifiers(
    modifierPriceOverrides: Array<{
      priceDelta: Prisma.Decimal;
      isRequired: boolean;
      modifier: {
        id: string;
        name: string;
        priceDelta: Prisma.Decimal;
        sortOrder: number;
      };
    }>,
  ) {
    return modifierPriceOverrides.map((override) => ({
      id: override.modifier.id,
      name: override.modifier.name,
      priceDelta: override.priceDelta,
      isRequired: override.isRequired,
      sortOrder: override.modifier.sortOrder,
    }));
  }

  private resolveItemModifierGroups(
    modifierLinks: Array<{
      sortOrder: number;
      selectionType?: 'SINGLE' | 'MULTIPLE';
      minSelect?: number;
      maxSelect?: number;
      modifierGroup: {
        id: string;
        name: string;
        description: string | null;
        minSelect: number;
        maxSelect: number;
        isRequired: boolean;
        modifierLinks: Array<{
          sortOrder: number;
          modifier: {
            id: string;
            name: string;
            priceDelta: Prisma.Decimal;
            sortOrder: number;
            category?: {
              id: string;
              name: string;
              slug: string;
            };
          };
        }>;
      };
    }>,
  ) {
    return modifierLinks.map((link) => ({
      id: link.modifierGroup.id,
      name: link.modifierGroup.name,
      description: link.modifierGroup.description,
      selectionType: link.selectionType ?? 'SINGLE',
      minSelect: link.minSelect ?? link.modifierGroup.minSelect,
      maxSelect: link.maxSelect ?? link.modifierGroup.maxSelect,
      isRequired: (link.minSelect ?? link.modifierGroup.minSelect) > 0,
      sortOrder: link.sortOrder,
      modifiers: link.modifierGroup.modifierLinks.map((modifierLink) => ({
        id: modifierLink.modifier.id,
        name: modifierLink.modifier.name,
        priceDelta: modifierLink.modifier.priceDelta,
        sortOrder: modifierLink.sortOrder,
        category: modifierLink.modifier.category,
      })),
    }));
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

  deleteModifierPriceOverrides(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).menuItemModifierPriceOverride.deleteMany({
      where: { menuItemId },
    });
  }

  deleteVariationPriceOverrides(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).menuItemVariationPriceOverride.deleteMany({
      where: { menuItemId },
    });
  }

  deleteVariationModifierPriceOverrides(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).menuVariationModifierPriceOverride.deleteMany({
      where: { menuItemId },
    });
  }

  deleteCartItems(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).cartItem.deleteMany({
      where: { menuItemId },
    });
  }

  deleteGroupOrderItems(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).groupOrderItem.deleteMany({
      where: { menuItemId },
    });
  }

  deletePosDraftItems(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).posOrderDraftItem.deleteMany({
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
