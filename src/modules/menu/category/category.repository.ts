import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database';
import { PrismaTx } from '../../../common/types';
import { ListMenuCategoriesDto } from './dto';

@Injectable()
export class MenuCategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  private resolveListOrderBy(
    query: ListMenuCategoriesDto,
  ): Prisma.MenuCategoryOrderByWithRelationInput[] {
    const direction = query.sortOrder.toLowerCase() as 'asc' | 'desc';

    if (query.sortBy === 'sortOrder') {
      return [{ sortOrder: direction }, { createdAt: 'desc' }];
    }

    return [
      { sortOrder: 'asc' },
      { [query.sortBy]: direction },
    ] as Prisma.MenuCategoryOrderByWithRelationInput[];
  }

  async create(data: Prisma.MenuCategoryCreateInput, tx?: PrismaTx) {
    return this.client(tx).menuCategory.create({ data });
  }

  async createMany(data: Prisma.MenuCategoryCreateManyInput[]) {
    return this.prisma.menuCategory.createMany({ data });
  }

  async findById(id: string) {
    return this.prisma.menuCategory.findUnique({ where: { id } });
  }

  async findDetailById(id: string) {
    return this.prisma.menuCategory.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            slug: true,
            sortOrder: true,
            isActive: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        items: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            slug: true,
            imageUrl: true,
            pricingMode: true,
            basePrice: true,
            isActive: true,
          },
          orderBy: [{ createdAt: 'asc' }],
        },
        variations: {
          where: { deletedAt: null },
          include: { itemPriceOverrides: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        variationLinks: {
          where: { isActive: true, variation: { deletedAt: null } },
          include: { variation: { include: { itemPriceOverrides: true } } },
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
        _count: { select: { children: true, items: true } },
      },
    });
  }

  async findByRestaurantAndSlug(
    restaurantId: string,
    slug: string,
    excludeId?: string,
  ) {
    return this.prisma.menuCategory.findFirst({
      where: {
        restaurantId,
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, deletedAt: true },
    });
  }

  async list(restaurantId: string | undefined, query: ListMenuCategoriesDto) {
    const where: Prisma.MenuCategoryWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
      ...(query.menuId || query.menu_id
        ? {
            OR: [
              {
                menuLinks: {
                  some: {
                    restaurantMenuId: query.menuId ?? query.menu_id,
                  },
                },
              },
              {
                items: {
                  some: {
                    deletedAt: null,
                    ...(query.includeInactive ? {} : { isActive: true }),
                    menuLinks: {
                      some: {
                        restaurantMenuId: query.menuId ?? query.menu_id,
                        ...(query.includeInactive ? {} : { isActive: true }),
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
      ...this.resolveActiveFilter(query),
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
      this.prisma.menuCategory.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: this.resolveListOrderBy(query),
        include: {
          parent: { select: { id: true, name: true } },
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
          variationLinks: {
            where: {
              ...(query.includeInactive ? {} : { isActive: true }),
              variation: { deletedAt: null },
            },
            include: { variation: true },
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
          _count: { select: { children: true, items: true } },
        },
      }),
      this.prisma.menuCategory.count({ where }),
    ]);

    return { items, total };
  }

  private resolveActiveFilter(query: ListMenuCategoriesDto) {
    if (query.inactive) {
      return { isActive: false };
    }

    if (query.all || query.includeInactive) {
      return {};
    }

    return { isActive: true };
  }

  async update(
    id: string,
    data: Prisma.MenuCategoryUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).menuCategory.update({ where: { id }, data });
  }

  async softDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).menuCategory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  countChildren(categoryId: string, tx?: PrismaTx) {
    return this.client(tx).menuCategory.count({
      where: { parentCategoryId: categoryId },
    });
  }

  countItems(categoryId: string, tx?: PrismaTx) {
    return this.client(tx).menuItem.count({
      where: {
        OR: [
          { categoryId },
          { categoryLinks: { some: { menuCategoryId: categoryId } } },
        ],
      },
    });
  }

  async findActiveItemIdsForCategory(categoryId: string, tx?: PrismaTx) {
    const items = await this.client(tx).menuItem.findMany({
      where: {
        deletedAt: null,
        OR: [
          { categoryId },
          { categoryLinks: { some: { menuCategoryId: categoryId } } },
        ],
      },
      select: { id: true },
    });

    return items.map((item) => item.id);
  }

  deleteCartItemsForMenuItems(menuItemIds: string[], tx?: PrismaTx) {
    return this.client(tx).cartItem.deleteMany({
      where: { menuItemId: { in: menuItemIds } },
    });
  }

  deleteGroupOrderItemsForMenuItems(menuItemIds: string[], tx?: PrismaTx) {
    return this.client(tx).groupOrderItem.deleteMany({
      where: { menuItemId: { in: menuItemIds } },
    });
  }

  deletePosDraftItemsForMenuItems(menuItemIds: string[], tx?: PrismaTx) {
    return this.client(tx).posOrderDraftItem.deleteMany({
      where: { menuItemId: { in: menuItemIds } },
    });
  }

  deleteMenuItemLinks(menuItemIds: string[], tx?: PrismaTx) {
    return this.client(tx).restaurantMenuItem.deleteMany({
      where: { menuItemId: { in: menuItemIds } },
    });
  }

  deleteMenuItemCategoryLinks(menuItemIds: string[], tx?: PrismaTx) {
    return this.client(tx).menuItemCategory.deleteMany({
      where: { menuItemId: { in: menuItemIds } },
    });
  }

  deleteMenuItemModifierLinks(menuItemIds: string[], tx?: PrismaTx) {
    return this.client(tx).menuItemModifierGroup.deleteMany({
      where: { menuItemId: { in: menuItemIds } },
    });
  }

  deleteMenuItemModifierPriceOverrides(menuItemIds: string[], tx?: PrismaTx) {
    return this.client(tx).menuItemModifierPriceOverride.deleteMany({
      where: { menuItemId: { in: menuItemIds } },
    });
  }

  deleteMenuItemVariationPriceOverrides(menuItemIds: string[], tx?: PrismaTx) {
    return this.client(tx).menuItemVariationPriceOverride.deleteMany({
      where: { menuItemId: { in: menuItemIds } },
    });
  }

  deleteMenuItemVariationModifierPriceOverrides(
    menuItemIds: string[],
    tx?: PrismaTx,
  ) {
    return this.client(tx).menuVariationModifierPriceOverride.deleteMany({
      where: { menuItemId: { in: menuItemIds } },
    });
  }

  deleteMenuItemBranchOverrides(menuItemIds: string[], tx?: PrismaTx) {
    return this.client(tx).branchMenuItemOverride.deleteMany({
      where: { menuItemId: { in: menuItemIds } },
    });
  }

  deleteMenuItemRecipes(menuItemIds: string[], tx?: PrismaTx) {
    return this.client(tx).menuItemRecipe.deleteMany({
      where: { menuItemId: { in: menuItemIds } },
    });
  }

  clearMenuItemCouponScopes(menuItemIds: string[], tx?: PrismaTx) {
    return this.client(tx).coupon.updateMany({
      where: { scopeMenuItemId: { in: menuItemIds } },
      data: { scopeMenuItemId: null },
    });
  }

  deleteMenuItemCouponScopeLinks(menuItemIds: string[], tx?: PrismaTx) {
    return this.client(tx).couponScopeMenuItem.deleteMany({
      where: { menuItemId: { in: menuItemIds } },
    });
  }

  softDeleteMenuItems(menuItemIds: string[], tx?: PrismaTx) {
    return this.client(tx).menuItem.updateMany({
      where: { id: { in: menuItemIds }, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  clearCouponScopes(categoryId: string, tx?: PrismaTx) {
    return this.client(tx).coupon.updateMany({
      where: { scopeCategoryId: categoryId },
      data: { scopeCategoryId: null },
    });
  }

  deleteBranchOverrides(categoryId: string, tx?: PrismaTx) {
    return this.client(tx).branchCategoryOverride.deleteMany({
      where: { menuCategoryId: categoryId },
    });
  }

  deleteMenuLinks(categoryId: string, tx?: PrismaTx) {
    return this.client(tx).restaurantMenuCategory.deleteMany({
      where: { menuCategoryId: categoryId },
    });
  }

  deleteModifierLinks(categoryId: string, tx?: PrismaTx) {
    return this.client(tx).menuCategoryModifierGroup.deleteMany({
      where: { categoryId },
    });
  }

  deleteCouponScopeLinks(categoryId: string, tx?: PrismaTx) {
    return this.client(tx).couponScopeCategory.deleteMany({
      where: { menuCategoryId: categoryId },
    });
  }

  deleteVariations(categoryId: string, tx?: PrismaTx) {
    return this.client(tx).menuCategoryVariation.deleteMany({
      where: { categoryId },
    });
  }

  clearDirectVariationCategory(categoryId: string, tx?: PrismaTx) {
    return this.client(tx).menuItemVariation.updateMany({
      where: { categoryId },
      data: { categoryId: null },
    });
  }

  hardDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).menuCategory.delete({ where: { id } });
  }
}
